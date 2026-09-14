// Server-only domain engine; no route exposes these definitions. A9 must
// authorize its actor/client/services before orchestration. These primitives
// still enforce workspace and resource ownership on every database lookup.
import { and, asc, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { encodeOnboardingDefinition, OnboardingError, ONBOARDING_CATEGORIES } from './onboarding-definition.mjs';

const t = schema.templates;
const v = schema.templateVersions;
export const failure = (reason) => ({ ok: false, reason });
export function constraintMatches(error, pattern) {
  for (let e = error; e; e = e.cause) if (pattern.test(String(e.message))) return true;
  return false;
}
export async function listOnboardingTemplates(db, workspaceId) {
  if (!workspaceId) return [];
  return db.select().from(t).where(and(eq(t.workspaceId, workspaceId), eq(t.kind, 'onboarding'))).orderBy(asc(t.slug));
}
export async function getOnboardingTemplate(db, workspaceId, templateId) {
  if (!workspaceId || !templateId) return null;
  return (await db.select().from(t).where(and(eq(t.workspaceId, workspaceId), eq(t.id, templateId), eq(t.kind, 'onboarding'))).limit(1))[0] || null;
}
export async function getOnboardingVersion(db, workspaceId, versionId) {
  if (!workspaceId || !versionId) return null;
  const rows = await db.select({ version: v, template: t }).from(v)
    .innerJoin(t, and(eq(t.id, v.templateId), eq(t.workspaceId, v.workspaceId)))
    .where(and(eq(v.workspaceId, workspaceId), eq(v.id, versionId), eq(t.kind, 'onboarding'))).limit(1);
  return rows[0] ? { ...rows[0].version, slug: rows[0].template.slug, active: rows[0].template.active } : null;
}
// Callers with live authority can attach a trusted SQL condition to the source read.
export async function currentPublishedVersion(db, workspaceId, slug, accessCondition = undefined) {
  if (!workspaceId || !ONBOARDING_CATEGORIES.includes(slug)) return null;
  const rows = await db.select({ version: v }).from(v)
    .innerJoin(t, and(eq(t.id, v.templateId), eq(t.workspaceId, v.workspaceId)))
    .where(and(eq(v.workspaceId, workspaceId), eq(t.kind, 'onboarding'), eq(t.slug, slug), eq(t.active, true), eq(v.status, 'published'), accessCondition)).limit(1);
  return rows[0] ? { ...rows[0].version, slug, active: true } : null;
}
export async function createOnboardingVersion(db, { workspaceId, templateId, definition, notes = null, createdByMembershipId = null, now = new Date() }) {
  const template = await getOnboardingTemplate(db, workspaceId, templateId);
  if (!template) return failure('not_found');
  let encoded;
  try { encoded = await encodeOnboardingDefinition(definition); } catch (e) {
    if (e instanceof OnboardingError) return failure(e.reason);
    throw e;
  }
  if (encoded.definition.category !== template.slug || (notes != null && (typeof notes !== 'string' || notes.length > 2000))) return failure('invalid_definition');
  if (createdByMembershipId) {
    const m = schema.workspaceMemberships;
    const found = await db.select({ id: m.id }).from(m).where(and(eq(m.workspaceId, workspaceId), eq(m.id, createdByMembershipId), eq(m.status, 'active'))).limit(1);
    if (!found.length) return failure('not_found');
  }
  const iso = now.toISOString();
  try {
    // MAX+1 is evaluated inside the INSERT, under the database write lock,
    // not in a pre-read. Competing inserts serialize and get distinct numbers.
    const [version] = await db.insert(v).values({
      workspaceId, templateId,
      versionNumber: sql`(SELECT coalesce(max(version_number), 0) + 1 FROM template_versions WHERE workspace_id = ${workspaceId} AND template_id = ${templateId})`,
      status: 'draft', definitionJson: encoded.definitionJson, definitionHash: encoded.definitionHash,
      notes, createdByMembershipId, createdAt: iso, updatedAt: iso,
    }).returning();
    return { ok: true, version };
  } catch (e) {
    if (constraintMatches(e, /UNIQUE constraint failed: template_versions.template_id, template_versions.version_number/)) return failure('version_conflict');
    throw e;
  }
}
export async function publishOnboardingVersion(db, { workspaceId, versionId, now = new Date() }) {
  const target = await getOnboardingVersion(db, workspaceId, versionId);
  if (!target) return failure('not_found');
  if (target.status === 'retired') return failure('invalid_transition');
  if (target.status === 'published') return { ok: true, unchanged: true, versionId };
  // Check even stored definitions before publication (e.g. operator-imported
  // rows). A malformed draft must never displace a valid current version.
  try {
    const encoded = await encodeOnboardingDefinition(JSON.parse(target.definitionJson));
    if (encoded.definition.category !== target.slug || encoded.definitionJson !== target.definitionJson || encoded.definitionHash !== target.definitionHash) return failure('invalid_definition');
  } catch (e) {
    if (e instanceof OnboardingError || e instanceof SyntaxError) return failure('invalid_definition');
    throw e;
  }
  const iso = now.toISOString();
  // The draft guard belongs on retirement too. If another publisher used
  // this target after our read, this batch must not retire their publication.
  const stillDraft = sql`EXISTS (SELECT 1 FROM template_versions target WHERE target.workspace_id = ${workspaceId} AND target.id = ${versionId} AND target.status = 'draft')`;
  await db.batch([
    db.update(v).set({ status: 'retired', updatedAt: iso }).where(and(eq(v.workspaceId, workspaceId), eq(v.templateId, target.templateId), eq(v.status, 'published'), stillDraft)),
    db.update(v).set({ status: 'published', publishedAt: iso, updatedAt: iso }).where(and(eq(v.workspaceId, workspaceId), eq(v.id, versionId), eq(v.status, 'draft'))),
  ]);
  const final = await getOnboardingVersion(db, workspaceId, versionId);
  return final?.status === 'published' ? { ok: true, versionId } : failure('invalid_transition');
}
