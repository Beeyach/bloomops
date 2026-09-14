// Milestones own only their lifecycle. All authority is checked again in
// committing SQL; no mutation writes a Project, Client, Service or onboarding.
import { inArray, and, asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { activityForMutation, activityValues } from './activity.mjs';
import { newId, validateDate } from './clients.mjs';
import { authorizeProject } from './projects.mjs';
import { projectAssignmentCondition, projectReadCondition } from './project-access.mjs';
import { loadMilestoneResource, milestoneReadCondition } from './milestone-access.mjs';
import { MILESTONE_DETAIL_FIELDS, MILESTONE_LIMIT, MILESTONE_STATUSES, MILESTONE_STATUS_LABELS, MILESTONE_TRANSITIONS, milestoneProgress } from './milestone-values.mjs';

const m = schema.milestones, p = schema.projects, a = schema.activityEvents;
const invalid = errors => ({ ok: false, reason: 'invalid', errors });
const conflict = () => ({ ok: false, reason: 'conflict' });
const missing = () => ({ ok: false, reason: 'not_found' });
const success = (milestoneId, unchanged = false) => ({ ok: true, milestoneId, ...(unchanged ? { unchanged: true } : {}) });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const revision = value => Number.isSafeInteger(value) && value >= 1;
const has = (input, key) => Object.prototype.hasOwnProperty.call(input, key);
const joinParent = db => db.select({ milestone: m }).from(m).innerJoin(p, and(eq(p.workspaceId, m.workspaceId), eq(p.id, m.projectId)));
const parentReadable = actor => sql`EXISTS (SELECT 1 FROM projects WHERE ${p.id}=${m.projectId} AND ${milestoneReadCondition(actor)})`;

export async function getMilestone(db, actor, projectId, milestoneId) {
  const [row] = await joinParent(db).where(and(milestoneReadCondition(actor), eq(m.projectId, String(projectId)), eq(m.id, String(milestoneId)))).limit(1);
  return row?.milestone || null;
}

export async function listMilestones(db, actor, projectId) {
  const rows = await joinParent(db).where(and(milestoneReadCondition(actor), eq(m.projectId, String(projectId))))
    .orderBy(asc(m.position), asc(m.id));
  const items = rows.map(row => row.milestone);
  return { items, progress: milestoneProgress(items) };
}

// Left join retains an authorized empty Project, but never a hidden parent.
// The query selects only safe presentation fields. Grouping ids and raw
// status are consumed here, not serialized as Milestone fields to a Client.
export async function portalMilestoneSummaries(db, actor, { projectId = null, projectIds = null } = {}) {
  if (Array.isArray(projectIds) && !projectIds.length) return {};
  const rows = await db.select({ projectId: p.id, id: m.id, label: sql`coalesce(${m.clientLabel}, ${m.name})`,
    status: m.status, targetDate: m.targetDate, completedAt: m.completedAt })
    .from(p).leftJoin(m, and(eq(m.projectId, p.id), eq(m.workspaceId, p.workspaceId), eq(m.visibility, 'client')))
    .where(and(projectReadCondition(actor, { portal: true }), projectId ? eq(p.id, String(projectId)) : undefined, Array.isArray(projectIds) ? inArray(p.id, projectIds) : undefined))
    .orderBy(asc(p.id), asc(m.position), asc(m.id));
  const groups = new Map();
  for (const { projectId: parentId, ...row } of rows) {
    if (!groups.has(parentId)) groups.set(parentId, []);
    if (row.id) groups.get(parentId).push(row);
  }
  return Object.fromEntries([...groups].map(([id, items]) => [id, {
    items: items.map(({ status, ...row }) => ({ ...row, statusLabel: MILESTONE_STATUS_LABELS[status] })),
    progress: milestoneProgress(items),
  }]));
}

export async function portalMilestones(db, actor, projectId) {
  return (await portalMilestoneSummaries(db, actor, { projectId }))[projectId] || null;
}

function normalize(input, current = null) {
  if (!object(input) || Object.keys(input).some(key => !MILESTONE_DETAIL_FIELDS.includes(key))) return invalid({ form: 'Only milestone details can be changed here.' });
  const errors = {}, patch = {};
  for (const key of ['name', 'clientLabel']) if (!current || has(input, key)) {
    const value = input[key];
    if (value != null && typeof value !== 'string') errors[key] = 'Enter text.';
    else {
      const text = value?.trim() || null;
      if (key === 'name' && !text) errors[key] = 'Enter a milestone name.';
      else if (text && (text.length > 120 || /[\x00-\x1f\x7f]/.test(text))) errors[key] = 'Use 120 characters or fewer, without control characters.';
      else patch[key] = text;
    }
  }
  for (const key of ['startDate', 'targetDate']) if (!current || has(input, key)) {
    const checked = input[key] == null || typeof input[key] === 'string' ? validateDate(input[key], key === 'startDate' ? 'the start date' : 'the target date') : { ok: false, message: 'Choose a valid date.' };
    if (!checked.ok) errors[key] = checked.message;
    else patch[key] = checked.value;
  }
  if (!current || has(input, 'visibility')) {
    if (!schema.VISIBILITIES.includes(input.visibility ?? 'internal')) errors.visibility = 'Choose a visibility from the list.';
    else patch.visibility = input.visibility ?? 'internal';
  }
  const final = { ...current, ...patch };
  if (final.startDate && final.targetDate && final.targetDate < final.startDate) errors.targetDate = 'The target date cannot be before the start date.';
  return Object.keys(errors).length ? invalid(errors) : { ok: true, patch };
}

function event(actor, project, milestone, eventType, metadata, now) {
  return { workspaceId: actor.workspaceId, actorMembershipId: actor.membershipId, actorUserId: actor.userId,
    clientId: project.clientId, serviceEngagementId: project.serviceEngagementId,
    subjectType: 'milestone', subjectId: milestone.id, eventType,
    metadata: { milestoneName: milestone.name, ...metadata }, occurredAt: now.toISOString() };
}

function restrictedGuard(actor, visibility) {
  return visibility === 'restricted' && !['owner', 'admin'].includes(actor.role) ? projectAssignmentCondition(actor) : sql`1`;
}

export async function authorizeMilestone(db, actor, projectId, milestoneId, action = 'milestone.view') {
  const resource = await loadMilestoneResource(db, actor, projectId, milestoneId);
  if (!resource) return missing();
  const decision = evaluate(actor, { action, resource });
  if (!decision.allowed) return { ok: false, reason: decision.outcome };
  const milestone = await getMilestone(db, actor, projectId, milestoneId);
  return milestone ? { ok: true, milestone, resource } : missing();
}

export async function createMilestone(db, { actor, projectId, input, requestId, now = new Date() }) {
  const access = await authorizeProject(db, actor, projectId, 'milestone.manage');
  if (!access.ok) return access;
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return invalid({ form: 'Refresh the form before creating this milestone.' });
  const normalized = normalize(input);
  if (!normalized.ok) return normalized;
  const { patch } = normalized;
  const retry = async () => {
    const [row] = await db.select({ id: m.id, metadata: a.metadataJson }).from(m)
      .innerJoin(p, and(eq(p.workspaceId, m.workspaceId), eq(p.id, m.projectId)))
      .innerJoin(a, and(eq(a.workspaceId, m.workspaceId), eq(a.subjectId, m.id), eq(a.subjectType, 'milestone'), eq(a.eventType, 'MILESTONE_CREATED')))
      .where(and(milestoneReadCondition(actor), eq(m.projectId, String(projectId)), eq(m.creationRequestId, requestId))).limit(1);
    if (!row) return conflict();
    const original = JSON.parse(row.metadata).details;
    return MILESTONE_DETAIL_FIELDS.every(key => original[key] === patch[key]) ? success(row.id, true) : conflict();
  };
  const id = newId(), iso = now.toISOString();
  const values = { id, workspaceId: actor.workspaceId, projectId: String(projectId), creationRequestId: requestId,
    ...patch, status: 'upcoming', completedAt: null, waitingReason: null, revision: 1, createdAt: iso, updatedAt: iso };
  const count = sql`(SELECT count(*) FROM milestones WHERE project_id=${String(projectId)})`;
  const condition = and(eq(p.id, String(projectId)), projectReadCondition(actor), restrictedGuard(actor, patch.visibility), sql`${count}<${MILESTONE_LIMIT}`);
  const selection = Object.fromEntries(Object.keys(getTableColumns(m)).map(key => [key,
    (key === 'position' ? sql`(SELECT coalesce(max(position), -1)+1 FROM milestones WHERE project_id=${String(projectId)})` : sql`${values[key]}`).as(key)]));
  const results = await db.batch([
    db.insert(m).select(db.select(selection).from(p).where(condition))
      .onConflictDoNothing({ target: [m.workspaceId, m.projectId, m.creationRequestId] }).returning({ id: m.id }),
    // The server's new opaque id belongs only to this attempt. A concurrent
    // request-key loser cannot match it or append another creation event.
    activityForMutation(db, m, eq(m.id, id), event(actor, access.project, values, 'MILESTONE_CREATED', { details: patch }, now)),
  ]);
  if (results[0].length) return success(id);
  const retried = await retry();
  if (retried.ok) return retried;
  // No count or hidden-row identity is returned with a refused creation.
  return conflict();
}

async function applyPatch(db, actor, milestone, resource, patch, type, metadata, now) {
  const condition = and(eq(m.workspaceId, actor.workspaceId), eq(m.projectId, milestone.projectId), eq(m.id, milestone.id),
    eq(m.revision, milestone.revision), parentReadable(actor),
    sql`EXISTS (SELECT 1 FROM projects WHERE ${p.id}=${m.projectId} AND ${restrictedGuard(actor, patch.visibility)})`);
  const results = await db.batch([
    activityForMutation(db, m, condition, event(actor, resource, milestone, type, metadata, now)),
    db.update(m).set({ ...patch, revision: sql`${m.revision}+1`, updatedAt: now.toISOString() }).where(condition).returning({ id: m.id }),
  ]);
  if (results[1].length) return success(milestone.id);
  const fresh = await getMilestone(db, actor, milestone.projectId, milestone.id);
  return fresh && Object.entries(patch).every(([key, value]) => key === 'completedAt' && patch.status === 'completed' ? Boolean(fresh.completedAt) : fresh[key] === value)
    ? success(milestone.id, true) : conflict();
}

export async function updateMilestone(db, { actor, projectId, milestoneId, input, expectedRevision, now = new Date() }) {
  const access = await authorizeMilestone(db, actor, projectId, milestoneId, 'milestone.manage');
  if (!access.ok) return access;
  if (!revision(expectedRevision)) return invalid({ form: 'Refresh this milestone before saving.' });
  const normalized = normalize(input, access.milestone);
  if (!normalized.ok) return normalized;
  const patch = Object.fromEntries(Object.entries(normalized.patch).filter(([key, value]) => access.milestone[key] !== value));
  if (!Object.keys(patch).length) return success(milestoneId, true);
  if (expectedRevision !== access.milestone.revision) return conflict();
  return applyPatch(db, actor, access.milestone, access.resource, patch, 'MILESTONE_DETAILS_UPDATED', { fields: Object.keys(patch) }, now);
}

export async function transitionMilestone(db, { actor, projectId, milestoneId, toStatus, reason = null, expectedRevision, now = new Date() }) {
  const access = await authorizeMilestone(db, actor, projectId, milestoneId, 'milestone.manage');
  if (!access.ok) return access;
  if (!revision(expectedRevision)) return invalid({ form: 'Refresh this milestone before changing its status.' });
  if (!MILESTONE_STATUSES.includes(toStatus)) return invalid({ toStatus: 'Choose a status from the list.' });
  const waitingReason = toStatus === 'waiting' && typeof reason === 'string' ? reason.trim() : null;
  if (toStatus === 'waiting' && (!waitingReason || waitingReason.length > 1000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(waitingReason))) return invalid({ reason: 'Explain what or whom this milestone is waiting on, in 1000 characters or fewer.' });
  const current = access.milestone;
  if (current.status === toStatus) return current.waitingReason === waitingReason ? success(milestoneId, true) : conflict();
  if (expectedRevision !== current.revision) return conflict();
  if (!MILESTONE_TRANSITIONS[current.status].includes(toStatus)) return { ok: false, reason: 'invalid_transition' };
  return applyPatch(db, actor, current, access.resource,
    { status: toStatus, waitingReason, completedAt: toStatus === 'completed' ? now.toISOString() : null },
    'MILESTONE_STATUS_CHANGED', { from: current.status, to: toStatus }, now);
}

// Reorder the complete READABLE set. Hidden rows keep their slots and are
// absent from the request, counts and event metadata. All readable revisions
// are compared under the write lock, so status/reorder races cannot overwrite.
export async function reorderMilestones(db, { actor, projectId, orderedIds, expected, now = new Date() }) {
  const access = await authorizeProject(db, actor, projectId, 'milestone.manage');
  if (!access.ok) return access;
  if (!Array.isArray(orderedIds) || !Array.isArray(expected) || orderedIds.length < 1 || orderedIds.length > MILESTONE_LIMIT || orderedIds.length !== expected.length
    || orderedIds.some(id => typeof id !== 'string' || !id || id.length > 120) || new Set(orderedIds).size !== orderedIds.length
    || expected.some(row => !object(row) || Object.keys(row).some(key => !['id', 'revision'].includes(key)) || !orderedIds.includes(row.id) || !revision(row.revision))
    || new Set(expected.map(row => row.id)).size !== expected.length) return invalid({ order: 'Include each displayed milestone exactly once.' });
  const { items } = await listMilestones(db, actor, projectId);
  if (orderedIds.some(id => !items.some(item => item.id === id))) return missing();
  if (orderedIds.length !== items.length) return invalid({ order: 'Include each displayed milestone exactly once. Refresh the project.' });
  if (items.every((item, index) => item.id === orderedIds[index])) return { ok: true, unchanged: true };
  if (items.some(item => expected.find(row => row.id === item.id).revision !== item.revision)) return conflict();
  const snapshot = JSON.stringify(expected);
  const readableSet = and(milestoneReadCondition(actor), eq(m.projectId, String(projectId)));
  const unchangedSet = sql`(SELECT count(*) FROM milestones JOIN projects ON projects.id=milestones.project_id WHERE ${readableSet})=${expected.length}
    AND NOT EXISTS (SELECT 1 FROM milestones JOIN projects ON projects.id=milestones.project_id WHERE ${readableSet}
      AND NOT EXISTS (SELECT 1 FROM json_each(${snapshot}) expected_row WHERE json_extract(expected_row.value,'$.id')=milestones.id AND json_extract(expected_row.value,'$.revision')=milestones.revision))`;
  const anchor = items.find((item, index) => item.id !== orderedIds[index]);
  const receiptId = newId(), iso = now.toISOString();
  const receipt = { id: receiptId, ...activityValues(event(actor, access.project, anchor, 'MILESTONE_ORDER_CHANGED', {}, now)), createdAt: iso };
  const receiptExists = sql`EXISTS (SELECT 1 FROM activity_events WHERE id=${receiptId})`;
  const slots = JSON.stringify(orderedIds.map((id, index) => ({ id, position: items[index].position })));
  const selected = and(eq(m.workspaceId, actor.workspaceId), eq(m.projectId, String(projectId)), receiptExists,
    sql`${m.id} IN (SELECT json_extract(value,'$.id') FROM json_each(${slots}))`);
  // First park the selected rows above the entire Project's current range.
  // One constant offset is read before this UPDATE (not a changing MAX in a
  // correlated per-row expression), avoiding SQLite's immediate unique checks.
  const maxPosition = sql`(SELECT max(position)+1 FROM milestones WHERE project_id=${String(projectId)})`;
  const results = await db.batch([
    db.insert(a).select(db.select(Object.fromEntries(Object.entries(receipt).map(([key, value]) => [key, sql`${value}`.as(key)])))
      .from(p).where(and(eq(p.id, String(projectId)), projectReadCondition(actor), unchangedSet))),
    db.update(m).set({ position: sql`${m.position} + ${maxPosition}` }).where(selected),
    db.update(m).set({ position: sql`(SELECT json_extract(value,'$.position') FROM json_each(${slots}) WHERE json_extract(value,'$.id')=${m.id})`,
      revision: sql`${m.revision}+1`, updatedAt: iso }).where(selected).returning({ id: m.id }),
  ]);
  if (results[2].length === items.length) return { ok: true };
  const fresh = (await listMilestones(db, actor, projectId)).items;
  return fresh.length === orderedIds.length && fresh.every((item, index) => item.id === orderedIds[index]) ? { ok: true, unchanged: true } : conflict();
}
