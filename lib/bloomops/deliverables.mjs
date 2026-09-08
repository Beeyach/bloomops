// B4 owns output records, never an Action or parent lifecycle. Reads and
// committing batches both recheck live Project scope and child visibility.
import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { activityForMutation } from './activity.mjs';
import { newId, validateDate } from './clients.mjs';
import { authorizeProject } from './projects.mjs';
import { projectAssignmentCondition, projectReadCondition } from './project-access.mjs';
import { deliverableReadCondition, loadDeliverableResource } from './deliverable-access.mjs';
import { DELIVERABLE_DETAIL_FIELDS, DELIVERABLE_LIMIT, DELIVERABLE_PORTAL_STATUS_LABELS, DELIVERABLE_STATUSES, DELIVERABLE_TRANSITIONS } from './deliverable-values.mjs';

const d = schema.deliverables, p = schema.projects, a = schema.activityEvents;
const invalid = errors => ({ ok: false, reason: 'invalid', errors });
const conflict = () => ({ ok: false, reason: 'conflict' });
const missing = () => ({ ok: false, reason: 'not_found' });
const success = (deliverableId, unchanged = false) => ({ ok: true, deliverableId, ...(unchanged ? { unchanged: true } : {}) });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const revision = value => Number.isSafeInteger(value) && value >= 1;
const has = (input, key) => Object.prototype.hasOwnProperty.call(input, key);
const joined = (db, selection) => db.select(selection).from(d).innerJoin(p, and(eq(p.workspaceId, d.workspaceId), eq(p.id, d.projectId)));
const internalFields = { id: d.id, projectId: d.projectId, title: d.title, clientLabel: d.clientLabel, description: d.description,
  status: d.status, visibility: d.visibility, targetDate: d.targetDate, deliveredAt: d.deliveredAt, revision: d.revision,
  createdAt: d.createdAt, updatedAt: d.updatedAt };

export async function getDeliverable(db, actor, projectId, deliverableId) {
  const [row] = await joined(db, internalFields).where(and(deliverableReadCondition(actor), eq(d.projectId, String(projectId)), eq(d.id, String(deliverableId)))).limit(1);
  return row || null;
}

export async function listDeliverables(db, actor, projectId) {
  const items = await joined(db, internalFields).where(and(deliverableReadCondition(actor), eq(d.projectId, String(projectId))))
    .orderBy(asc(d.createdAt), asc(d.id)).limit(DELIVERABLE_LIMIT);
  return { items };
}

// Each portal list belongs to one Project and is bounded, just like the
// internal list. A left join distinguishes an authorized empty Project from
// a hidden parent. Internal title/description are never even selected.
export async function portalDeliverables(db, actor, projectId) {
  const rows = await db.select({ id: d.id, label: sql`coalesce(${d.clientLabel}, 'Deliverable')`, status: d.status,
    targetDate: d.targetDate, deliveredAt: d.deliveredAt }).from(p)
    .leftJoin(d, and(eq(d.workspaceId, p.workspaceId), eq(d.projectId, p.id), eq(d.visibility, 'client')))
    .where(and(projectReadCondition(actor, { portal: true }), eq(p.id, String(projectId))))
    .orderBy(asc(d.createdAt), asc(d.id)).limit(DELIVERABLE_LIMIT);
  if (!rows.length) return null;
  return { items: rows.filter(row => row.id).map(({ status, ...row }) => ({ ...row, statusLabel: DELIVERABLE_PORTAL_STATUS_LABELS[status] })) };
}

function normalize(input, current = null) {
  if (!object(input) || Object.keys(input).some(key => !DELIVERABLE_DETAIL_FIELDS.includes(key))) return invalid({ form: 'Only Deliverable details can be changed here.' });
  const errors = {}, patch = {};
  for (const [key, max] of [['title', 120], ['clientLabel', 120], ['description', 5000]]) if (!current || has(input, key)) {
    const value = input[key];
    if (value != null && typeof value !== 'string') errors[key] = 'Enter text.';
    else {
      const text = value?.trim() || null;
      const controls = key === 'description' ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/;
      if (key === 'title' && !text) errors[key] = 'Enter a Deliverable title.';
      else if (text && (text.length > max || controls.test(text))) errors[key] = `Use ${max} characters or fewer, without control characters.`;
      else patch[key] = text;
    }
  }
  if (!current || has(input, 'targetDate')) {
    const checked = input.targetDate == null || typeof input.targetDate === 'string' ? validateDate(input.targetDate, 'the target date') : { ok: false, message: 'Choose a valid date.' };
    if (!checked.ok) errors.targetDate = checked.message; else patch.targetDate = checked.value;
  }
  if (!current || has(input, 'visibility')) {
    if (!schema.VISIBILITIES.includes(input.visibility ?? 'internal')) errors.visibility = 'Choose a visibility from the list.';
    else patch.visibility = input.visibility ?? 'internal';
  }
  return Object.keys(errors).length ? invalid(errors) : { ok: true, patch };
}

function event(actor, resource, deliverable, eventType, metadata, now) {
  return { workspaceId: actor.workspaceId, actorMembershipId: actor.membershipId, actorUserId: actor.userId,
    clientId: resource.clientId, serviceEngagementId: resource.serviceEngagementId,
    subjectType: 'deliverable', subjectId: deliverable.id, eventType,
    metadata: { deliverableTitle: deliverable.title, ...metadata }, occurredAt: now.toISOString() };
}

const restrictedGuard = (actor, visibility) => visibility === 'restricted' && !['owner', 'admin'].includes(actor.role) ? projectAssignmentCondition(actor) : sql`1`;
const writable = (actor, visibility) => ['owner', 'admin', 'project_manager'].includes(actor?.role)
  ? sql`EXISTS (SELECT 1 FROM projects WHERE projects.id=${d.projectId} AND ${deliverableReadCondition(actor)} AND ${restrictedGuard(actor, visibility)})` : sql`0`;

export async function authorizeDeliverable(db, actor, projectId, deliverableId, action = 'deliverable.view') {
  const resource = await loadDeliverableResource(db, actor, projectId, deliverableId);
  if (!resource) return missing();
  const decision = evaluate(actor, { action, resource });
  if (!decision.allowed) return { ok: false, reason: decision.outcome };
  const deliverable = await getDeliverable(db, actor, projectId, deliverableId);
  return deliverable ? { ok: true, deliverable, resource } : missing();
}

export async function createDeliverable(db, { actor, projectId, input, requestId, now = new Date() }) {
  const access = await authorizeProject(db, actor, projectId, 'deliverable.manage');
  if (!access.ok) return access;
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return invalid({ form: 'Refresh the form before creating this Deliverable.' });
  const normalized = normalize(input);
  if (!normalized.ok) return normalized;
  const { patch } = normalized;
  const retry = async () => {
    const [row] = await joined(db, { id: d.id, metadata: a.metadataJson })
      .innerJoin(a, and(eq(a.workspaceId, d.workspaceId), eq(a.subjectId, d.id), eq(a.subjectType, 'deliverable'), eq(a.eventType, 'DELIVERABLE_CREATED')))
      .where(and(deliverableReadCondition(actor), eq(d.projectId, String(projectId)), eq(d.creationRequestId, requestId))).limit(1);
    if (!row) return null;
    const initial = JSON.parse(row.metadata).details;
    return DELIVERABLE_DETAIL_FIELDS.every(key => initial[key] === patch[key]) ? success(row.id, true) : conflict();
  };
  const previous = await retry();
  if (previous) return previous;
  const id = newId(), iso = now.toISOString();
  const values = { id, workspaceId: actor.workspaceId, projectId: String(projectId), creationRequestId: requestId, ...patch,
    status: 'planned', deliveredAt: null, revision: 1, createdAt: iso, updatedAt: iso };
  const condition = and(eq(p.id, String(projectId)), projectReadCondition(actor), restrictedGuard(actor, patch.visibility),
    sql`(SELECT count(*) FROM deliverables WHERE workspace_id=${actor.workspaceId} AND project_id=${String(projectId)})<${DELIVERABLE_LIMIT}`);
  const selected = Object.fromEntries(Object.keys(getTableColumns(d)).map(key => [key, sql`${values[key]}`.as(key)]));
  const results = await db.batch([
    db.insert(d).select(db.select(selected).from(p).where(condition)).onConflictDoNothing({ target: [d.workspaceId, d.projectId, d.creationRequestId] }).returning({ id: d.id }),
    activityForMutation(db, d, eq(d.id, id), event(actor, access.project, values, 'DELIVERABLE_CREATED', { details: patch }, now)),
  ]);
  return results[0].length ? success(id) : (await retry()) || conflict();
}

async function applyPatch(db, actor, access, patch, type, metadata, now) {
  const current = access.deliverable;
  const condition = and(eq(d.workspaceId, actor.workspaceId), eq(d.projectId, current.projectId), eq(d.id, current.id),
    eq(d.revision, current.revision), writable(actor, patch.visibility));
  const results = await db.batch([
    activityForMutation(db, d, condition, event(actor, access.resource, current, type, metadata, now)),
    db.update(d).set({ ...patch, revision: sql`${d.revision}+1`, updatedAt: now.toISOString() }).where(condition).returning({ id: d.id }),
  ]);
  if (results[1].length) return success(current.id);
  const fresh = await authorizeDeliverable(db, actor, current.projectId, current.id, 'deliverable.manage');
  return fresh.ok && Object.entries(patch).every(([key, value]) => key === 'deliveredAt' && patch.status === 'delivered' ? Boolean(fresh.deliverable.deliveredAt) : fresh.deliverable[key] === value)
    ? success(current.id, true) : conflict();
}

export async function updateDeliverable(db, { actor, projectId, deliverableId, input, expectedRevision, now = new Date() }) {
  const access = await authorizeDeliverable(db, actor, projectId, deliverableId, 'deliverable.manage');
  if (!access.ok) return access;
  if (!revision(expectedRevision)) return invalid({ form: 'Refresh this Deliverable before saving.' });
  const normalized = normalize(input, access.deliverable);
  if (!normalized.ok) return normalized;
  const patch = Object.fromEntries(Object.entries(normalized.patch).filter(([key, value]) => access.deliverable[key] !== value));
  if (!Object.keys(patch).length) return success(deliverableId, true);
  if (expectedRevision !== access.deliverable.revision) return conflict();
  return applyPatch(db, actor, access, patch, 'DELIVERABLE_DETAILS_UPDATED', { fields: Object.keys(patch) }, now);
}

export async function transitionDeliverable(db, { actor, projectId, deliverableId, toStatus, expectedRevision, now = new Date() }) {
  const access = await authorizeDeliverable(db, actor, projectId, deliverableId, 'deliverable.manage');
  if (!access.ok) return access;
  if (!revision(expectedRevision)) return invalid({ form: 'Refresh this Deliverable before changing its status.' });
  if (!DELIVERABLE_STATUSES.includes(toStatus)) return invalid({ toStatus: 'Choose a status from the list.' });
  const current = access.deliverable;
  if (current.status === toStatus) return success(deliverableId, true);
  if (expectedRevision !== current.revision) return conflict();
  if (!DELIVERABLE_TRANSITIONS[current.status].includes(toStatus)) return { ok: false, reason: 'invalid_transition' };
  return applyPatch(db, actor, access, { status: toStatus, deliveredAt: toStatus === 'delivered' ? now.toISOString() : null },
    'DELIVERABLE_STATUS_CHANGED', { from: current.status, to: toStatus }, now);
}
