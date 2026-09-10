import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { evaluate } from './authorization.mjs';
import { activityForMutation } from './activity.mjs';
import { newId, validateDate } from './clients.mjs';
import { authorizeProject } from './projects.mjs';
import { projectAssignmentCondition, projectReadCondition } from './project-access.mjs';
import { milestoneReadCondition } from './milestone-access.mjs';
import { actionReadCondition, actionWriteCondition, dependencyBlockedCondition, loadActionResource } from './action-access.mjs';
import { ACTION_DETAIL_FIELDS, ACTION_FILTER_FIELDS, ACTION_LIMIT, ACTION_PRIORITIES, ACTION_STATUSES, ACTION_TRANSITIONS, ACTION_VIEWS, ACTION_WAITING_TYPES, actionCalendarDay } from './action-values.mjs';

const a = schema.actions, p = schema.projects, c = schema.clients, e = schema.activityEvents;
const member = schema.workspaceMemberships, person = schema.user, m = schema.milestones;
export const actionInvalid = errors => ({ ok: false, reason: 'invalid', errors });
export const actionConflict = () => ({ ok: false, reason: 'conflict' });
export const actionSuccess = (actionId, unchanged = false) => ({ ok: true, actionId, ...(unchanged ? { unchanged: true } : {}) });
export const actionRevision = value => Number.isSafeInteger(value) && value >= 1;
const missing = () => ({ ok: false, reason: 'not_found' });
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const has = (input, key) => Object.prototype.hasOwnProperty.call(input, key);
const textControl = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;
const joined = (db, selection) => db.select(selection).from(a)
  .innerJoin(p, and(eq(p.workspaceId, a.workspaceId), eq(p.id, a.projectId)))
  .innerJoin(c, and(eq(c.workspaceId, p.workspaceId), eq(c.id, p.clientId)))
  .leftJoin(schema.serviceEngagements, and(eq(schema.serviceEngagements.workspaceId, p.workspaceId), eq(schema.serviceEngagements.id, p.serviceEngagementId)))
  .leftJoin(schema.serviceTypes, and(eq(schema.serviceTypes.workspaceId, p.workspaceId), eq(schema.serviceTypes.id, schema.serviceEngagements.serviceTypeId)))
  .leftJoin(schema.departments, and(eq(schema.departments.workspaceId, p.workspaceId), eq(schema.departments.id, sql`coalesce(${schema.serviceTypes.departmentId}, ${p.departmentId})`)));

async function readAction(db, actor, id) {
  const [row] = await joined(db, { action: a }).where(and(actionReadCondition(actor), eq(a.id, String(id)))).limit(1);
  return row?.action || null;
}

export async function authorizeAction(db, actor, actionId, permission = 'action.view') {
  const resource = await loadActionResource(db, actor, actionId);
  if (!resource) return missing();
  const decision = evaluate(actor, { action: permission, resource });
  if (!decision.allowed) return { ok: false, reason: decision.outcome };
  const action = await readAction(db, actor, actionId);
  return action ? { ok: true, action, resource } : missing();
}

// Explicit internal DTO. No raw row, creation key, membership directory or
// full parent record crosses the API / server-component boundary.
const selection = actor => ({ id: a.id, title: a.title, description: a.description, status: a.status, priority: a.priority,
  assigneeMembershipId: a.assigneeMembershipId, assigneeName: person.name, assigneeActive: sql`${member.status}='active' AND ${member.role} IN ('owner','admin','project_manager','team_member')`,
  dueDate: a.dueDate, waitingType: a.waitingType, waitingReason: a.waitingReason, visibility: a.visibility,
  revision: a.revision, completedAt: a.completedAt, createdAt: a.createdAt, updatedAt: a.updatedAt,
  projectId: p.id, projectName: p.name, clientId: c.id, clientName: c.name, timezone: c.timezone,
  serviceEngagementId: p.serviceEngagementId, serviceName: schema.serviceTypes.name,
  departmentId: schema.departments.id, departmentName: schema.departments.name,
  canOpenProject: projectReadCondition(actor), dependencyBlocked: dependencyBlockedCondition(),
  // A linked Milestone does not itself grant access to that Milestone.
  milestoneId: m.id, milestoneName: m.name,
});
const dtoQuery = (db, actor) => joined(db, selection(actor))
  .leftJoin(member, and(eq(member.workspaceId, a.workspaceId), eq(member.id, a.assigneeMembershipId)))
  .leftJoin(person, eq(person.id, member.userId))
  .leftJoin(m, and(eq(m.id, a.milestoneId), milestoneReadCondition(actor)));
const dto = (row, now) => {
  const { canOpenProject, timezone, ...fields } = row;
  return { ...fields, assigneeActive: Boolean(row.assigneeActive), dependencyBlocked: Boolean(row.dependencyBlocked),
    projectHref: canOpenProject ? `/work/projects/${row.projectId}` : null,
    overdue: Boolean(row.dueDate && row.dueDate < actionCalendarDay(now, timezone) && !['done', 'cancelled'].includes(row.status) && !row.dependencyBlocked) };
};

export async function getAction(db, actor, actionId, { now = new Date() } = {}) {
  const [row] = await dtoQuery(db, actor).where(and(actionReadCondition(actor), eq(a.id, String(actionId)))).limit(1);
  return row ? dto(row, now) : null;
}

export function normalizeActionFilters(input = {}) {
  if (!object(input) || Object.keys(input).some(key => ![...ACTION_FILTER_FIELDS, 'view', 'page'].includes(key))) return actionInvalid({ filters: 'Choose the available Action filters.' });
  const filters = {};
  for (const key of ACTION_FILTER_FIELDS) if (input[key] != null && input[key] !== '' && input[key] !== 'all') {
    if (typeof input[key] !== 'string' || input[key].length > 120 || /[\x00-\x1f\x7f]/.test(input[key])) return actionInvalid({ filters: 'Choose a valid filter.' });
    filters[key] = input[key];
  }
  if ((filters.status && !ACTION_STATUSES.includes(filters.status)) || (filters.priority && !ACTION_PRIORITIES.includes(filters.priority))) return actionInvalid({ filters: 'Choose a status or priority from the list.' });
  const view = input.view || 'mine', page = Number(input.page || 1);
  if (!ACTION_VIEWS.includes(view) || !Number.isSafeInteger(page) || page < 1 || page > 100000) return actionInvalid({ filters: 'Choose a valid view or page.' });
  return { ok: true, filters, view, page };
}

const filterCondition = filters => and(...Object.entries(filters).map(([key, value]) => eq({ clientId: p.clientId, departmentId: schema.departments.id,
  serviceEngagementId: p.serviceEngagementId, projectId: a.projectId, assigneeMembershipId: a.assigneeMembershipId, status: a.status, priority: a.priority }[key], value)));

// Home and Project summaries use the same Client-day and view predicates as
// Work. The timezone map is one binding, never an expanded assignment list.
export function actionTodayCondition(now, zones, timezone = c.timezone) {
  const days = JSON.stringify(Object.fromEntries(zones.filter(row => row.timezone).map(row => [row.timezone, actionCalendarDay(now, row.timezone)])));
  return sql`coalesce((SELECT value FROM json_each(${days}) WHERE key=${timezone}), ${actionCalendarDay(now)})`;
}

export const openActionCondition = () => sql`${a.status} NOT IN ('done','cancelled')`;

export function actionViewCondition(actor, view, today) {
  const open = openActionCondition();
  const views = { mine: eq(a.assigneeMembershipId, actor.membershipId), today: and(open, sql`${a.dueDate}=${today}`),
    upcoming: and(open, sql`${a.dueDate}>${today}`), waiting: eq(a.status, 'waiting'), review: eq(a.status, 'review'),
    overdue: and(open, sql`${a.dueDate}<${today}`, sql`NOT ${dependencyBlockedCondition()}`), all: sql`1` };
  return views[view] || sql`0`;
}

// Server composition may share this read only for the same actor + filters.
export async function readableActionToday(db, actor, now, filters = {}) {
  const zones = await joined(db, { timezone: c.timezone }).where(and(actionReadCondition(actor), filterCondition(filters))).groupBy(c.timezone);
  return actionTodayCondition(now, zones);
}

export async function listActions(db, actor, input = {}, { now = new Date(), limit = ACTION_LIMIT, today: suppliedToday } = {}) {
  const normalized = normalizeActionFilters(input);
  if (!normalized.ok) return normalized;
  const { filters, view, page } = normalized;
  if (!evaluate(actor, { action: 'action.list' }).allowed) return { ok: false, reason: 'forbidden' };
  // One JSON binding for the distinct Client timezones keeps relational scope
  // queries below D1's parameter limit even with hundreds of assignments.
  // Only date-filtered views use the SQL timezone map. Every returned Action
  // still derives its overdue flag from its own Client timezone in dto().
  const today = ['overdue', 'today', 'upcoming'].includes(view)
    ? await (suppliedToday ?? readableActionToday(db, actor, now, filters))
    : actionTodayCondition(now, []);
  // Only trusted server composition chooses a smaller page. HTTP query fields
  // and the default 200-row Work pagination contract remain unchanged.
  const cap = Math.max(1, Math.min(Number.isSafeInteger(limit) ? limit : ACTION_LIMIT, ACTION_LIMIT));
  const rows = await dtoQuery(db, actor).where(and(actionReadCondition(actor), filterCondition(filters), actionViewCondition(actor, view, today)))
    .orderBy(sql`${a.dueDate} IS NULL`, asc(a.dueDate), sql`CASE ${a.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`, asc(a.id))
    .limit(cap + 1).offset((page - 1) * cap);
  return { ok: true, items: rows.slice(0, cap).map(row => dto(row, now)), hasMore: rows.length > cap, page };
}

// Facets come only from currently readable Actions, including Action-only
// assignments; they never expose an unrelated Client or team directory.
export async function actionFilterOptions(db, actor) {
  const facets = { clientId: [p.clientId, c.name], projectId: [p.id, p.name],
    departmentId: [schema.departments.id, schema.departments.name], serviceEngagementId: [p.serviceEngagementId, schema.serviceTypes.name],
    assigneeMembershipId: [a.assigneeMembershipId, person.name] };
  const entries = await Promise.all(Object.entries(facets).map(async ([key, [id, name]]) => {
    const rows = await joined(db, { id, name }).leftJoin(member, and(eq(member.workspaceId, a.workspaceId), eq(member.id, a.assigneeMembershipId)))
      .leftJoin(person, eq(person.id, member.userId))
      .where(and(actionReadCondition(actor), sql`${id} IS NOT NULL`)).groupBy(id, name).orderBy(asc(name), asc(id)).limit(ACTION_LIMIT + 1);
    return [key, { items: rows.slice(0, ACTION_LIMIT), hasMore: rows.length > ACTION_LIMIT }];
  }));
  return Object.fromEntries(entries);
}

function normalize(input, current = null) {
  if (!object(input) || Object.keys(input).some(key => !ACTION_DETAIL_FIELDS.includes(key))) return actionInvalid({ form: 'Only Action details can be changed here.' });
  const errors = {}, patch = {};
  for (const [key, max] of [['title', 120], ['description', 5000]]) if (!current || has(input, key)) {
    const value = input[key];
    if (value != null && typeof value !== 'string') errors[key] = 'Enter text.';
    else {
      const text = value?.trim() || null;
      if (key === 'title' && !text) errors[key] = 'Enter an Action title.';
      else if (text && (text.length > max || (key === 'title' ? /[\x00-\x1f\x7f]/ : textControl).test(text))) errors[key] = `Use ${max} characters or fewer, without control characters.`;
      else patch[key] = text;
    }
  }
  for (const [key, values, fallback] of [['priority', ACTION_PRIORITIES, 'normal'], ['visibility', ['internal', 'restricted'], 'internal']]) if (!current || has(input, key)) {
    if (!values.includes(input[key] ?? fallback)) errors[key] = 'Choose an option from the list.';
    else patch[key] = input[key] ?? fallback;
  }
  if (!current || has(input, 'dueDate')) {
    const checked = input.dueDate == null || typeof input.dueDate === 'string' ? validateDate(input.dueDate, 'the due date') : { ok: false, message: 'Choose a valid date.' };
    if (!checked.ok) errors.dueDate = checked.message; else patch.dueDate = checked.value;
  }
  for (const key of ['assigneeMembershipId', 'milestoneId']) if (!current || has(input, key)) {
    const value = input[key];
    if (value != null && (typeof value !== 'string' || value.length > 120 || /[\x00-\x1f\x7f]/.test(value))) errors[key] = 'Choose an option from the list.';
    else patch[key] = value || null;
  }
  return Object.keys(errors).length ? actionInvalid(errors) : { ok: true, patch };
}

export function actionEvent(actor, resource, action, eventType, metadata, now) {
  return { workspaceId: actor.workspaceId, actorMembershipId: actor.membershipId, actorUserId: actor.userId,
    clientId: resource.clientId, serviceEngagementId: resource.serviceEngagementId,
    subjectType: 'action', subjectId: action.id, eventType,
    metadata: { actionTitle: action.title, ...metadata }, occurredAt: now.toISOString() };
}

const assigneeGuard = (actor, id) => id ? sql`EXISTS (SELECT 1 FROM workspace_memberships WHERE workspace_id=${actor.workspaceId}
  AND id=${id} AND status='active' AND role IN ('owner','admin','project_manager','team_member'))` : sql`1`;
const restrictedGuard = (actor, visibility) => visibility === 'restricted' && !['owner', 'admin'].includes(actor.role) ? projectAssignmentCondition(actor) : sql`1`;
const milestoneGuard = (actor, id, projectId) => id ? sql`EXISTS (SELECT 1 FROM milestones JOIN projects ON projects.id=milestones.project_id
  WHERE milestones.id=${id} AND milestones.project_id=${projectId} AND ${milestoneReadCondition(actor)})` : sql`1`;

async function validateReferences(db, actor, projectId, patch) {
  if (patch.assigneeMembershipId) {
    const [row] = await db.select({ id: member.id }).from(member).where(and(eq(member.id, patch.assigneeMembershipId), assigneeGuard(actor, patch.assigneeMembershipId))).limit(1);
    if (!row) return missing();
  }
  if (patch.milestoneId) {
    const [row] = await db.select({ id: m.id }).from(m).innerJoin(p, eq(p.id, m.projectId))
      .where(and(eq(m.id, patch.milestoneId), eq(m.projectId, projectId), milestoneReadCondition(actor))).limit(1);
    if (!row) return missing();
  }
  return { ok: true };
}

export async function createAction(db, { actor, projectId, input, requestId, now = new Date() }) {
  const access = await authorizeProject(db, actor, projectId, 'action.manage');
  if (!access.ok) return access;
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) return actionInvalid({ form: 'Refresh the form before creating this Action.' });
  const normalized = normalize(input);
  if (!normalized.ok) return normalized;
  const { patch } = normalized;
  const retry = async () => {
    const [row] = await joined(db, { id: a.id, metadata: e.metadataJson })
      .innerJoin(e, and(eq(e.workspaceId, a.workspaceId), eq(e.subjectId, a.id), eq(e.subjectType, 'action'), eq(e.eventType, 'ACTION_CREATED')))
      .where(and(actionReadCondition(actor), eq(a.projectId, String(projectId)), eq(a.creationRequestId, requestId))).limit(1);
    if (!row) return null;
    const initial = JSON.parse(row.metadata).details;
    return ACTION_DETAIL_FIELDS.every(key => initial[key] === patch[key]) ? actionSuccess(row.id, true) : actionConflict();
  };
  const previous = await retry();
  if (previous) return previous;
  const references = await validateReferences(db, actor, String(projectId), patch);
  if (!references.ok) return references;
  const id = newId(), iso = now.toISOString();
  const values = { id, workspaceId: actor.workspaceId, projectId: String(projectId), creationRequestId: requestId, ...patch,
    status: 'to_do', waitingType: null, waitingReason: null, completedAt: null, revision: 1, createdAt: iso, updatedAt: iso };
  const condition = and(eq(p.id, String(projectId)), projectReadCondition(actor), restrictedGuard(actor, patch.visibility),
    assigneeGuard(actor, patch.assigneeMembershipId), milestoneGuard(actor, patch.milestoneId, String(projectId)),
    sql`(SELECT count(*) FROM actions WHERE workspace_id=${actor.workspaceId} AND project_id=${String(projectId)})<${ACTION_LIMIT}`);
  const selected = Object.fromEntries(Object.keys(getTableColumns(a)).map(key => [key, sql`${values[key]}`.as(key)]));
  const results = await db.batch([
    db.insert(a).select(db.select(selected).from(p).where(condition)).onConflictDoNothing({ target: [a.workspaceId, a.projectId, a.creationRequestId] }).returning({ id: a.id }),
    activityForMutation(db, a, eq(a.id, id), actionEvent(actor, access.project, values, 'ACTION_CREATED', { details: patch }, now)),
  ]);
  return results[0].length ? actionSuccess(id) : (await retry()) || actionConflict();
}

async function applyPatch(db, actor, access, patch, events, now, { progress = false } = {}) {
  const current = access.action;
  const condition = and(eq(a.workspaceId, actor.workspaceId), eq(a.id, current.id), eq(a.revision, current.revision), actionWriteCondition(actor, a, { progress }),
    assigneeGuard(actor, patch.assigneeMembershipId), milestoneGuard(actor, patch.milestoneId, current.projectId),
    sql`EXISTS (SELECT 1 FROM projects WHERE projects.id=${a.projectId} AND ${restrictedGuard(actor, patch.visibility)})`);
  const results = await db.batch([
    ...events.map(([type, metadata]) => activityForMutation(db, a, condition, actionEvent(actor, access.resource, current, type, metadata, now))),
    db.update(a).set({ ...patch, revision: sql`${a.revision}+1`, updatedAt: now.toISOString() }).where(condition).returning({ id: a.id }),
  ]);
  if (results.at(-1).length) return actionSuccess(current.id);
  // Re-authorize the same mutation, not merely a read, before converging a
  // loser. Reassignment must revoke a Team Member's progress permission too.
  const fresh = await authorizeAction(db, actor, current.id, progress ? 'action.progress' : 'action.manage');
  return fresh.ok && Object.entries(patch).every(([key, value]) => key === 'completedAt' && patch.status === 'done' ? Boolean(fresh.action.completedAt) : fresh.action[key] === value)
    ? actionSuccess(current.id, true) : actionConflict();
}

export async function updateAction(db, { actor, actionId, input, expectedRevision, now = new Date() }) {
  const access = await authorizeAction(db, actor, actionId, 'action.manage');
  if (!access.ok) return access;
  if (!actionRevision(expectedRevision)) return actionInvalid({ form: 'Refresh this Action before saving.' });
  const normalized = normalize(input, access.action);
  if (!normalized.ok) return normalized;
  const patch = Object.fromEntries(Object.entries(normalized.patch).filter(([key, value]) => access.action[key] !== value));
  if (!Object.keys(patch).length) return actionSuccess(actionId, true);
  if (expectedRevision !== access.action.revision) return actionConflict();
  const references = await validateReferences(db, actor, access.action.projectId, patch);
  if (!references.ok) return references;
  const events = [], fields = Object.keys(patch).filter(key => key !== 'assigneeMembershipId');
  if (fields.length) events.push(['ACTION_DETAILS_UPDATED', { fields }]);
  if (has(patch, 'assigneeMembershipId')) events.push(['ACTION_ASSIGNEE_CHANGED', { assigned: Boolean(patch.assigneeMembershipId) }]);
  return applyPatch(db, actor, access, patch, events, now);
}

export async function transitionAction(db, { actor, actionId, toStatus, waitingType = null, waitingReason = null, expectedRevision, now = new Date() }) {
  const access = await authorizeAction(db, actor, actionId, 'action.progress');
  if (!access.ok) return access;
  if (!actionRevision(expectedRevision)) return actionInvalid({ form: 'Refresh this Action before changing its status.' });
  if (!ACTION_STATUSES.includes(toStatus)) return actionInvalid({ toStatus: 'Choose a status from the list.' });
  const reason = toStatus === 'waiting' && typeof waitingReason === 'string' ? waitingReason.trim() : null;
  const type = toStatus === 'waiting' ? waitingType : null;
  if (toStatus === 'waiting' && (!ACTION_WAITING_TYPES.includes(type) || !reason || reason.length > 1000 || textControl.test(reason))) return actionInvalid({ waitingReason: 'Choose whom or what this Action is waiting on and explain it in 1000 characters or fewer.' });
  const current = access.action;
  if (current.status === toStatus) return current.waitingType === type && current.waitingReason === reason ? actionSuccess(actionId, true) : actionConflict();
  if (expectedRevision !== current.revision) return actionConflict();
  if (!ACTION_TRANSITIONS[current.status].includes(toStatus)) return { ok: false, reason: 'invalid_transition' };
  return applyPatch(db, actor, access, { status: toStatus, waitingType: type, waitingReason: reason, completedAt: toStatus === 'done' ? now.toISOString() : null },
    [['ACTION_STATUS_CHANGED', { from: current.status, to: toStatus }]], now, { progress: true });
}
