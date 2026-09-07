// A8 provides generation primitives, not activation. Nothing here changes a
// client/service lifecycle, records activation activity, or invites anyone.
import { and, eq, inArray, ne } from 'drizzle-orm';
import { schema } from './db.mjs';
import { canonicalJson, hashDefinitionJson, OnboardingError } from './onboarding-definition.mjs';
import { compileOnboardingPlan, requiredCategories } from './onboarding-compiler.mjs';
import { constraintMatches, currentPublishedVersion, failure, getOnboardingVersion } from './onboarding-templates.mjs';

async function clientExists(db, workspaceId, clientId) {
  if (!workspaceId || !clientId) return false;
  const c = schema.clients;
  return (await db.select({ id: c.id }).from(c).where(and(eq(c.workspaceId, workspaceId), eq(c.id, clientId))).limit(1)).length === 1;
}
// A bounded selection keeps the IN query below D1's 100 bound parameters.
async function selectedServices(db, workspaceId, clientId, serviceIds) {
  if (!Array.isArray(serviceIds) || serviceIds.length > 50 || serviceIds.some((id) => typeof id !== 'string' || !id)) throw new OnboardingError('invalid_plan');
  const ids = [...new Set(serviceIds)];
  if (!ids.length) return [];
  const s = schema.serviceEngagements;
  const t = schema.serviceTypes;
  const rows = await db.select({ id: s.id, workspaceId: s.workspaceId, clientId: s.clientId, serviceTypeSlug: t.slug }).from(s)
    .innerJoin(t, and(eq(t.id, s.serviceTypeId), eq(t.workspaceId, s.workspaceId)))
    .where(and(eq(s.workspaceId, workspaceId), eq(s.clientId, clientId), inArray(s.id, ids)));
  if (rows.length !== ids.length) throw new OnboardingError('not_found');
  return rows;
}
async function verifySnapshotHash(source) {
  if (await hashDefinitionJson(source.definitionJson) !== source.definitionHash) throw new OnboardingError('invalid_definition');
}
export async function prepareOnboardingPlan(db, { workspaceId, clientId, serviceEngagementIds = [] }) {
  if (!await clientExists(db, workspaceId, clientId)) return failure('not_found');
  try {
    const services = await selectedServices(db, workspaceId, clientId, serviceEngagementIds);
    const snapshots = [];
    for (const category of requiredCategories(services)) {
      const source = await currentPublishedVersion(db, workspaceId, category);
      if (!source) return failure('missing_published_template');
      await verifySnapshotHash(source);
      snapshots.push(source);
    }
    return { ok: true, plan: compileOnboardingPlan({ workspaceId, clientId, services, snapshots }) };
  } catch (e) {
    if (e instanceof OnboardingError) return failure(e.reason);
    throw e;
  }
}
async function openInstance(db, workspaceId, clientId) {
  const i = schema.onboardingInstances;
  return (await db.select({ id: i.id }).from(i).where(and(eq(i.workspaceId, workspaceId), eq(i.clientId, clientId), ne(i.status, 'complete'))).limit(1))[0] || null;
}
const existingResult = (existing) => ({ ok: false, reason: 'existing_open_instance', instanceId: existing.id });

export async function persistOnboardingPlan(db, { workspaceId, clientId, plan, now = new Date() }) {
  if (!await clientExists(db, workspaceId, clientId)) return failure('not_found');
  if (!plan || plan.workspaceId !== workspaceId || plan.clientId !== clientId) return failure('not_found');
  const existing = await openInstance(db, workspaceId, clientId);
  if (existing) return existingResult(existing);
  let verified;
  try {
    // Never trust caller-edited fields or service/provenance ids. Recompile
    // the exact immutable source versions against this client's real services
    // and compare the entire plan before writing. Retired sources are valid:
    // publication may have advanced since the original compile.
    if (!Array.isArray(plan.sourceTemplateVersions) || plan.sourceTemplateVersions.length > 5) return failure('invalid_plan');
    const services = await selectedServices(db, workspaceId, clientId, plan.selectedServiceIds);
    const snapshots = [];
    for (const id of plan.sourceTemplateVersions) {
      if (typeof id !== 'string') return failure('invalid_plan');
      const source = await getOnboardingVersion(db, workspaceId, id);
      if (!source) return failure('not_found');
      await verifySnapshotHash(source);
      snapshots.push(source);
    }
    verified = compileOnboardingPlan({ workspaceId, clientId, snapshots, services });
    if (canonicalJson(verified) !== canonicalJson(plan)) return failure('invalid_plan');
  } catch (e) {
    if (e instanceof OnboardingError) return failure(e.reason);
    throw e;
  }
  const instanceId = crypto.randomUUID();
  const iso = now.toISOString();
  const statements = [db.insert(schema.onboardingInstances).values({
    id: instanceId, workspaceId, clientId, templateVersionId: null, status: 'not_started', createdAt: iso, updatedAt: iso,
  })];
  for (const templateVersionId of verified.sourceTemplateVersions) statements.push(db.insert(schema.onboardingInstanceTemplates).values({
    workspaceId, onboardingInstanceId: instanceId, templateVersionId, createdAt: iso,
  }));
  for (const { serviceEngagementIds, ...item } of verified.items) {
    const itemId = crypto.randomUUID();
    statements.push(db.insert(schema.onboardingItems).values({
      ...item, id: itemId, workspaceId, onboardingInstanceId: instanceId, status: 'pending', createdAt: iso, updatedAt: iso,
    }));
    for (const serviceEngagementId of serviceEngagementIds) statements.push(db.insert(schema.onboardingItemServices).values({
      workspaceId, onboardingItemId: itemId, serviceEngagementId, createdAt: iso,
    }));
  }
  try {
    // One implicit D1 transaction, with bounded individual statements (also
    // below D1's per-statement parameter limit). Never split this batch.
    await db.batch(statements);
    return { ok: true, instanceId };
  } catch (e) {
    if (!constraintMatches(e, /UNIQUE constraint failed: onboarding_instances.client_id/)) throw e;
    const winner = await openInstance(db, workspaceId, clientId);
    return winner ? existingResult(winner) : failure('generation_conflict');
  }
}
