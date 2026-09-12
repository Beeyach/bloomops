// Internal setup only. No request path or automatic bootstrap invokes this.
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { INTERNAL_ROLES, roleCapabilities } from './authorization.mjs';
import { liveProjectActor } from './project-access.mjs';
import { encodeSystemsBlueprintDefinition } from './systems-blueprint-definition.mjs';
import { GHL_BUILD_BLUEPRINT_V1 } from './systems-blueprint-defaults.mjs';

const t = schema.templates, v = schema.templateVersions;
const b = schema.serviceTypeBlueprintBindings, st = schema.serviceTypes;
const failure = reason => ({ ok: false, reason });
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 200 && !value.includes('\0');
const revision = value => Number.isSafeInteger(value) && value >= 1;
const isoTime = now => now instanceof Date && Number.isFinite(now.getTime()) ? now.toISOString() : null;
const DEFAULT_SLUG = 'ghl-build';

// Reuse role policy, but query explicit grants live at each read/write boundary.
// Cached actor capabilities are deliberately not a committing authority source.
function managementCondition(actor) {
  if (!actor || !INTERNAL_ROLES.includes(actor.role)) return sql`0`;
  const capability = roleCapabilities(actor.role).has('templates.manage') ? sql`1`
    : sql`EXISTS (SELECT 1 FROM member_capabilities mc WHERE mc.workspace_id=${actor.workspaceId}
      AND mc.membership_id=${actor.membershipId} AND mc.capability='templates.manage')`;
  return and(liveProjectActor(actor), capability);
}

async function authorized(db, actor) {
  if (!actor || !id(actor.workspaceId) || !id(actor.membershipId) || !id(actor.userId)) return false;
  const rows = await db.select({ id: schema.workspaces.id }).from(schema.workspaces)
    .where(and(eq(schema.workspaces.id, actor.workspaceId), managementCondition(actor))).limit(1);
  return rows.length === 1;
}

function insertFrom(db, table, values, source, condition) {
  const selected = Object.fromEntries(Object.keys(getTableColumns(table))
    .filter(key => Object.hasOwn(values, key)).map(key => [key, sql`${values[key]}`.as(key)]));
  return db.insert(table).select(db.select(selected).from(source).where(condition));
}

function serviceCondition(actor, serviceTypeId) {
  return and(eq(st.workspaceId, actor.workspaceId), eq(st.id, serviceTypeId), eq(st.active, true),
    managementCondition(actor), sql`EXISTS (SELECT 1 FROM departments d
      WHERE d.workspace_id=${st.workspaceId} AND d.id=${st.departmentId} AND d.slug='systems' AND d.active=1)`);
}

async function defaultSnapshot(db, actor) {
  const rows = await db.select({ template: t, version: v }).from(t)
    .leftJoin(v, and(eq(v.workspaceId, t.workspaceId), eq(v.templateId, t.id)))
    .where(and(eq(t.workspaceId, actor.workspaceId), eq(t.kind, 'systems'),
      eq(t.slug, DEFAULT_SLUG), managementCondition(actor))).limit(2);
  return rows.length ? { template: rows[0].template, versions: rows.map(row => row.version).filter(Boolean) } : null;
}

export async function provisionGhlBlueprint(db, { actor, now = new Date() } = {}) {
  if (!await authorized(db, actor)) return failure('forbidden');
  const iso = isoTime(now);
  if (!iso) return failure('invalid');
  const encoded = await encodeSystemsBlueprintDefinition(GHL_BUILD_BLUEPRINT_V1);
  const templateId = crypto.randomUUID(), versionId = crypto.randomUUID();
  const ownTemplate = and(eq(t.workspaceId, actor.workspaceId), eq(t.id, templateId), eq(t.kind, 'systems'), managementCondition(actor));
  // Every dependent write uses this batch's fresh identities. A reserved slug
  // collision never adopts, publishes or repairs somebody else's Template.
  await db.batch([
    insertFrom(db, t, { id: templateId, workspaceId: actor.workspaceId, kind: 'systems', name: 'GHL build',
      slug: DEFAULT_SLUG, description: null, active: 1, createdAt: iso, updatedAt: iso }, schema.workspaces,
    and(eq(schema.workspaces.id, actor.workspaceId), managementCondition(actor),
      sql`NOT EXISTS (SELECT 1 FROM templates existing WHERE existing.workspace_id=${actor.workspaceId}
        AND existing.kind='systems' AND existing.slug=${DEFAULT_SLUG})`)),
    insertFrom(db, v, { id: versionId, workspaceId: actor.workspaceId, templateId, versionNumber: 1,
      status: 'draft', definitionJson: encoded.definitionJson, definitionHash: encoded.definitionHash,
      notes: null, createdByMembershipId: actor.membershipId, publishedAt: null, createdAt: iso, updatedAt: iso }, t, ownTemplate),
    db.update(v).set({ status: 'published', publishedAt: iso, updatedAt: iso })
      .where(and(eq(v.workspaceId, actor.workspaceId), eq(v.id, versionId), eq(v.templateId, templateId),
        eq(v.status, 'draft'), managementCondition(actor))),
  ]);
  if (!await authorized(db, actor)) return failure('forbidden');
  const final = await defaultSnapshot(db, actor);
  const version = final?.versions[0];
  if (!final?.template.active || final.versions.length !== 1 || version?.versionNumber !== 1
      || version.status !== 'published' || !id(version.publishedAt)
      || version.definitionJson !== encoded.definitionJson || version.definitionHash !== encoded.definitionHash) return failure('conflict');
  return { ok: true, templateId: final.template.id, versionId: version.id, unchanged: final.template.id !== templateId };
}

export async function getSystemsBlueprintBinding(db, { actor, serviceTypeId } = {}) {
  if (!await authorized(db, actor)) return failure('forbidden');
  if (!id(serviceTypeId)) return failure('invalid');
  // Read the binding and its current service/actor eligibility together.
  // An inaccessible Service Type cannot look like an available empty binding.
  const [row] = await db.select({ binding: b }).from(st)
    .leftJoin(b, and(eq(b.workspaceId, st.workspaceId), eq(b.serviceTypeId, st.id)))
    .where(serviceCondition(actor, serviceTypeId)).limit(1);
  return row ? { ok: true, binding: row.binding } : failure('not_found');
}

export async function saveSystemsBlueprintBinding(db, { actor, serviceTypeId, templateId, enabled,
  expectedBinding, now = new Date() } = {}) {
  if (!await authorized(db, actor)) return failure('forbidden');
  const expectedValid = expectedBinding === null || (expectedBinding && typeof expectedBinding === 'object'
    && !Array.isArray(expectedBinding) && Object.keys(expectedBinding).length === 2
    && id(expectedBinding.id) && revision(expectedBinding.revision));
  const iso = isoTime(now);
  if (!id(serviceTypeId) || !id(templateId) || typeof enabled !== 'boolean' || !expectedValid || !iso) return failure('invalid');
  const found = await getSystemsBlueprintBinding(db, { actor, serviceTypeId });
  if (!found.ok) return found;
  const current = found.binding;
  if (expectedBinding === null ? current !== null : !current || current.id !== expectedBinding.id
      || current.revision !== expectedBinding.revision) return failure('conflict');
  const target = sql`EXISTS (SELECT 1 FROM templates target WHERE target.workspace_id=${actor.workspaceId}
    AND target.id=${templateId} AND target.kind='systems')`;
  const [validTarget] = await db.select({ id: st.id }).from(st)
    .where(and(serviceCondition(actor, serviceTypeId), target)).limit(1);
  if (!validTarget) return failure('not_found');
  if (current?.templateId === templateId && current.enabled === enabled) {
    // A current read is the linearization point for a no-op; no attribution or
    // revision is rewritten. A changed binding since preflight must conflict.
    const fresh = await getSystemsBlueprintBinding(db, { actor, serviceTypeId });
    return fresh.ok && fresh.binding?.id === current.id && fresh.binding.revision === current.revision
      ? { ok: true, binding: fresh.binding, unchanged: true } : failure('conflict');
  }
  let rows;
  if (!current) {
    rows = await insertFrom(db, b, { id: crypto.randomUUID(), workspaceId: actor.workspaceId, serviceTypeId,
      templateId, enabled: enabled ? 1 : 0, revision: 1, createdByMembershipId: actor.membershipId,
      updatedByMembershipId: actor.membershipId, createdAt: iso, updatedAt: iso }, st,
    and(serviceCondition(actor, serviceTypeId), target, sql`NOT EXISTS (SELECT 1 FROM service_type_blueprint_bindings existing
      WHERE existing.workspace_id=${actor.workspaceId} AND existing.service_type_id=${serviceTypeId})`)).returning();
  } else {
    if (current.revision === Number.MAX_SAFE_INTEGER) return failure('conflict');
    const liveService = sql`EXISTS (SELECT 1 FROM service_types s JOIN departments d
      ON d.workspace_id=s.workspace_id AND d.id=s.department_id WHERE s.workspace_id=${actor.workspaceId}
      AND s.id=${serviceTypeId} AND s.active=1 AND d.slug='systems' AND d.active=1)`;
    rows = await db.update(b).set({ templateId, enabled, revision: current.revision + 1,
      updatedByMembershipId: actor.membershipId, updatedAt: iso }).where(and(eq(b.workspaceId, actor.workspaceId),
      eq(b.serviceTypeId, serviceTypeId), eq(b.id, current.id), eq(b.revision, current.revision),
      managementCondition(actor), liveService, target)).returning();
  }
  return rows.length === 1 ? { ok: true, binding: rows[0], unchanged: false } : failure('conflict');
}
