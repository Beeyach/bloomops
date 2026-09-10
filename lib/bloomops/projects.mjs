// Projects Core. Every mutation checks live authority and stored revision in
// the same D1 batch as its semantic events. Parents stay fixed in B1; status,
// health and responsibility are independent, and no Client/Service is written.
import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { ACTIONS, evaluate, loadInternalClientResource } from './authorization.mjs';
import { activityForMutation } from './activity.mjs';
import { newId, validateDate } from './clients.mjs';
import { liveProjectActor, loadProjectResource, projectAssignmentCondition, projectReadCondition } from './project-access.mjs';
import { PROJECT_STATUSES, PROJECT_HEALTHS, PROJECT_STATUS_LABELS, PROJECT_HEALTH_LABELS, PROJECT_TRANSITIONS, PROJECT_DETAIL_FIELDS } from './project-values.mjs';

const p = schema.projects;
const has = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);
const invalid = (errors) => ({ ok: false, reason: 'invalid', errors });
const conflict = () => ({ ok: false, reason: 'conflict' });
const object = (input) => input && typeof input === 'object' && !Array.isArray(input);
const validRevision = (value) => Number.isSafeInteger(value) && value >= 1;

function textValue(value, label, { required = false, max = 120, multiline = false } = {}) {
  if (value == null || value === '') return required ? { error: `Enter ${label}.` } : { value: null };
  if (typeof value !== 'string') return { error: `Enter ${label} as text.` };
  const text = value.trim();
  if (!text) return required ? { error: `Enter ${label}.` } : { value: null };
  if (text.length > max || (multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(text)) return { error: `Use ${max} characters or fewer for ${label}, without control characters.` };
  return { value: text };
}

export function projectMemberCondition(workspaceId, membershipId) {
  return sql`EXISTS (SELECT 1 FROM workspace_memberships pm WHERE pm.workspace_id=${workspaceId}
    AND pm.id=${membershipId} AND pm.status='active' AND pm.role IN ('owner','admin','project_manager','team_member'))`;
}

const departmentCondition = (workspaceId, departmentId) => sql`EXISTS (SELECT 1 FROM departments d
  WHERE d.workspace_id=${workspaceId} AND d.id=${departmentId} AND d.active=1)`;

const joined = (db, selection) => db.select(selection).from(p)
  .innerJoin(schema.clients, and(eq(schema.clients.workspaceId, p.workspaceId), eq(schema.clients.id, p.clientId)))
  .leftJoin(schema.serviceEngagements, and(eq(schema.serviceEngagements.workspaceId, p.workspaceId), eq(schema.serviceEngagements.id, p.serviceEngagementId)))
  .leftJoin(schema.serviceTypes, and(eq(schema.serviceTypes.workspaceId, p.workspaceId), eq(schema.serviceTypes.id, schema.serviceEngagements.serviceTypeId)))
  .leftJoin(schema.departments, and(eq(schema.departments.workspaceId, p.workspaceId), eq(schema.departments.id, sql`coalesce(${schema.serviceTypes.departmentId}, ${p.departmentId})`)))
  .leftJoin(schema.workspaceMemberships, and(eq(schema.workspaceMemberships.workspaceId, p.workspaceId), eq(schema.workspaceMemberships.id, p.ownerMembershipId)))
  .leftJoin(schema.user, eq(schema.user.id, schema.workspaceMemberships.userId));

const columns = () => ({ project: p, clientName: schema.clients.name, serviceName: schema.serviceTypes.name,
  departmentName: schema.departments.name, ownerName: schema.user.name, ownerEmail: schema.user.email,
  ownerStatus: schema.workspaceMemberships.status, ownerRole: schema.workspaceMemberships.role });
const decorate = ({ project, ...context }) => ({ ...project, clientName: context.clientName, serviceName: context.serviceName,
  departmentName: context.departmentName, statusLabel: PROJECT_STATUS_LABELS[project.status], healthLabel: PROJECT_HEALTH_LABELS[project.health],
  ownerName: context.ownerName || context.ownerEmail || null, ownerActive: context.ownerStatus === 'active' && ['owner', 'admin', 'project_manager', 'team_member'].includes(context.ownerRole) });

export async function listProjects(db, actor, { clientId = null, status = 'all', limit = 200 } = {}) {
  const cap = Math.max(1, Math.min(Number.isSafeInteger(limit) ? limit : 200, 200));
  const rows = await joined(db, columns()).where(and(projectReadCondition(actor),
    clientId ? eq(p.clientId, String(clientId)) : undefined, PROJECT_STATUSES.includes(status) ? eq(p.status, status) : undefined))
    .orderBy(sql`${p.targetDate} IS NULL`, asc(p.targetDate), asc(p.name), asc(p.id)).limit(cap + 1);
  return { items: rows.slice(0, cap).map(decorate), hasMore: rows.length > cap };
}

export async function getProject(db, actor, projectId) {
  const rows = await joined(db, columns()).where(and(projectReadCondition(actor), eq(p.id, String(projectId)))).limit(1);
  return rows[0] ? decorate(rows[0]) : null;
}

// This query deliberately never selects owners, assignments, health, reasons,
// revision or Service/Department/provenance IDs for a Client.
export async function portalProjects(db, actor, { projectId = null } = {}) {
  const rows = await db.select({ id: p.id, label: sql`coalesce(${p.clientLabel}, ${p.name})`, status: p.status,
    targetDate: p.targetDate, completedAt: p.completedAt, clientId: p.clientId, clientName: schema.clients.name })
    .from(p).innerJoin(schema.clients, and(eq(schema.clients.workspaceId, p.workspaceId), eq(schema.clients.id, p.clientId)))
    .where(and(projectReadCondition(actor, { portal: true }), projectId ? eq(p.id, String(projectId)) : undefined))
    .orderBy(asc(schema.clients.name), asc(p.name), asc(p.id));
  return rows.map(({ status, ...row }) => ({ ...row, statusLabel: PROJECT_STATUS_LABELS[status] }));
}

export async function projectOptions(db, actor, { clientId = null } = {}) {
  if (!actor || !ACTIONS['project.create'].roles.includes(actor.role)) return null;
  const c = schema.clients, s = schema.serviceEngagements, t = schema.serviceTypes, d = schema.departments;
  const m = schema.workspaceMemberships;
  const [clients, services, departments, members] = await Promise.all([
    db.select({ id: c.id, name: c.name }).from(c).where(and(eq(c.workspaceId, actor.workspaceId),
      liveProjectActor(actor), clientId ? eq(c.id, String(clientId)) : undefined)).orderBy(c.name).limit(200),
    db.select({ id: s.id, clientId: s.clientId, name: t.name }).from(s)
    .innerJoin(t, and(eq(t.workspaceId, s.workspaceId), eq(t.id, s.serviceTypeId)))
    .where(and(eq(s.workspaceId, actor.workspaceId), liveProjectActor(actor), sql`${s.status} NOT IN ('completed','cancelled')`,
      clientId ? eq(s.clientId, String(clientId)) : undefined)).orderBy(t.name),
    db.select({ id: d.id, name: d.name }).from(d)
      .where(and(eq(d.workspaceId, actor.workspaceId), eq(d.active, true), liveProjectActor(actor))).orderBy(d.position),
    db.select({ membershipId: m.id, name: schema.user.name, role: m.role }).from(m)
    .innerJoin(schema.user, eq(schema.user.id, m.userId)).where(and(eq(m.workspaceId, actor.workspaceId),
      eq(m.status, 'active'), sql`${m.role} IN ('owner','admin','project_manager','team_member')`, liveProjectActor(actor))).orderBy(schema.user.name),
  ]);
  return { clients, services, departments, members,
    canRestrict: ['owner', 'admin'].includes(actor.role) };
}

async function normalizeDetails(db, actor, input, current = null) {
  if (!object(input)) return invalid({ form: 'Enter a valid JSON object.' });
  const errors = {}, patch = {}, guards = [];
  const read = (key, result) => { if (result.error) errors[key] = result.error; else patch[key] = result.value; };
  for (const key of ['name', 'clientLabel']) if (!current || has(input, key)) read(key, textValue(input[key], key === 'name' ? 'a project name' : 'the client-facing label', { required: key === 'name' }));
  for (const key of ['startDate', 'targetDate']) if (!current || has(input, key)) {
    const value = input[key];
    const checked = value == null || typeof value === 'string' ? validateDate(value, key === 'startDate' ? 'the start date' : 'the target date') : { ok: false, message: 'Choose a valid date.' };
    read(key, checked.ok ? { value: checked.value } : { error: checked.message });
  }
  for (const [key, values, fallback] of [['health', PROJECT_HEALTHS, 'on_track'], ['visibility', schema.VISIBILITIES, 'internal']]) {
    if (!current || has(input, key)) {
      const value = input[key] ?? fallback;
      if (!values.includes(value)) errors[key] = `Choose ${key} from the list.`;
      else patch[key] = value;
    }
  }
  for (const key of ['ownerMembershipId', 'departmentId']) if (!current || has(input, key)) {
    const checked = textValue(input[key], key === 'departmentId' ? 'a department' : 'an owner');
    read(key, checked);
    if (!checked.error && checked.value && checked.value !== current?.[key]) {
      const guard = key === 'ownerMembershipId' ? projectMemberCondition(actor.workspaceId, checked.value) : departmentCondition(actor.workspaceId, checked.value);
      const rows = await db.select({ id: schema.workspaces.id }).from(schema.workspaces).where(and(eq(schema.workspaces.id, actor.workspaceId), guard));
      if (!rows.length) errors[key] = 'Choose an active workspace member or department from the list.';
      else guards.push(guard);
    }
  }
  const final = { ...current, ...patch };
  if (final.startDate && final.targetDate && final.targetDate < final.startDate) errors.targetDate = 'The target date cannot be before the start date.';
  if ((current?.serviceEngagementId || input.serviceEngagementId) && final.departmentId) errors.departmentId = 'The department comes from this project’s service.';
  if (patch.visibility === 'restricted' && current?.visibility !== 'restricted' && !['owner', 'admin'].includes(actor.role)) {
    if (!current) errors.visibility = 'An Owner or Admin can create restricted projects.';
    else guards.push(projectAssignmentCondition(actor));
  }
  return Object.keys(errors).length ? invalid(errors) : { ok: true, patch, guards };
}

export function projectEvent(actor, project, eventType, metadata, now = new Date()) {
  return { workspaceId: actor.workspaceId, actorMembershipId: actor.membershipId, actorUserId: actor.userId,
    clientId: project.clientId, serviceEngagementId: project.serviceEngagementId || null,
    subjectType: 'project', subjectId: project.id, eventType,
    metadata: { projectName: project.name, ...metadata }, occurredAt: now.toISOString() };
}

export async function authorizeProject(db, actor, projectId, action) {
  const resource = await loadProjectResource(db, actor, projectId);
  if (!resource) return { ok: false, reason: 'not_found' };
  if (!evaluate(actor, { action, resource }).allowed) return { ok: false, reason: 'forbidden' };
  const project = await getProject(db, actor, projectId);
  return project ? { ok: true, project, resource } : { ok: false, reason: 'not_found' };
}

export async function createProject(db, { actor, clientId, input, now = new Date() }) {
  const resource = actor && await loadInternalClientResource(db, actor.workspaceId, clientId);
  if (!resource) return { ok: false, reason: 'not_found' };
  if (!evaluate(actor, { action: 'project.create', resource }).allowed) return { ok: false, reason: 'forbidden' };
  const normalized = await normalizeDetails(db, actor, input);
  if (!normalized.ok) return normalized;
  const service = textValue(input.serviceEngagementId, 'a service');
  if (service.error) return invalid({ serviceEngagementId: service.error });
  const guards = normalized.guards;
  if (service.value) {
    const s = schema.serviceEngagements;
    const guard = sql`EXISTS (SELECT 1 FROM service_engagements se WHERE se.workspace_id=${actor.workspaceId}
      AND se.client_id=${String(clientId)} AND se.id=${service.value} AND se.status NOT IN ('completed','cancelled'))`;
    const [match] = await db.select({ id: s.id }).from(s).where(and(eq(s.id, service.value), guard)).limit(1);
    if (!match) return invalid({ serviceEngagementId: 'Choose an open service belonging to this client.' });
    guards.push(guard);
  }
  const id = newId(), iso = now.toISOString();
  const values = { id, workspaceId: actor.workspaceId, clientId: String(clientId), serviceEngagementId: service.value,
    ...normalized.patch, status: 'planned', completedAt: null, statusReason: null, revision: 1, createdAt: iso, updatedAt: iso };
  const condition = and(eq(schema.clients.workspaceId, actor.workspaceId), eq(schema.clients.id, String(clientId)), liveProjectActor(actor), ...guards);
  const rows = await db.batch([
    db.insert(p).select(db.select(Object.fromEntries(Object.keys(getTableColumns(p)).map((key) => [key, sql`${values[key]}`.as(key)])))
      .from(schema.clients).where(condition)).returning({ id: p.id }),
    activityForMutation(db, p, eq(p.id, id), projectEvent(actor, values, 'PROJECT_CREATED', {}, now)),
  ]);
  return rows[0].length ? { ok: true, projectId: id } : conflict();
}

async function applyProjectPatch(db, actor, project, patch, guards, events, now) {
  const condition = and(eq(p.id, project.id), eq(p.revision, project.revision), projectReadCondition(actor), ...guards);
  const writes = events.map(([type, metadata]) => activityForMutation(db, p, condition, projectEvent(actor, project, type, metadata, now)));
  writes.push(db.update(p).set({ ...patch, revision: sql`${p.revision}+1`, updatedAt: now.toISOString() }).where(condition).returning({ id: p.id }));
  const results = await db.batch(writes);
  if (results.at(-1).length) return { ok: true, projectId: project.id };
  const fresh = await getProject(db, actor, project.id);
  // Concurrent completion requests each propose their own timestamp. The
  // winner owns that fact; an identical losing transition accepts it.
  return fresh && Object.entries(patch).every(([key, value]) =>
    key === 'completedAt' && patch.status === 'completed' ? Boolean(fresh.completedAt) : fresh[key] === value)
    ? { ok: true, projectId: project.id, unchanged: true } : conflict();
}

export async function updateProject(db, { actor, projectId, input, expectedRevision, now = new Date() }) {
  const access = await authorizeProject(db, actor, projectId, 'project.manage');
  if (!access.ok) return access;
  const current = access.project;
  if (!validRevision(expectedRevision)) return invalid({ form: 'Refresh this project before saving.' });
  if (['status', 'completedAt', 'statusReason', 'clientId', 'serviceEngagementId', 'workspaceId', 'revision'].some((key) => has(input, key))) return invalid({ form: 'Use the project’s status control; its client and service stay fixed.' });
  const normalized = await normalizeDetails(db, actor, input, current);
  if (!normalized.ok) return normalized;
  const patch = Object.fromEntries(Object.entries(normalized.patch).filter(([key, value]) => value !== current[key]));
  if (!Object.keys(patch).length) return { ok: true, projectId, unchanged: true };
  if (expectedRevision !== current.revision) return conflict();
  const events = [], fields = PROJECT_DETAIL_FIELDS.filter((key) => has(patch, key));
  if (fields.length) events.push(['PROJECT_DETAILS_UPDATED', { fields }]);
  if (has(patch, 'health')) events.push(['PROJECT_HEALTH_CHANGED', { from: current.health, to: patch.health }]);
  if (has(patch, 'ownerMembershipId')) events.push(['PROJECT_OWNER_CHANGED', { assigned: Boolean(patch.ownerMembershipId) }]);
  return applyProjectPatch(db, actor, current, patch, normalized.guards, events, now);
}

export async function transitionProject(db, { actor, projectId, toStatus, reason = null, expectedRevision, now = new Date() }) {
  const access = await authorizeProject(db, actor, projectId, 'project.manage');
  if (!access.ok) return access;
  const current = access.project;
  if (!validRevision(expectedRevision)) return invalid({ form: 'Refresh this project before changing its status.' });
  if (!PROJECT_STATUSES.includes(toStatus)) return invalid({ toStatus: 'Choose a status from the list.' });
  const checked = ['waiting', 'blocked'].includes(toStatus) ? textValue(reason, toStatus === 'waiting' ? 'what or whom the project is waiting on' : 'what is blocking the project', { required: true, max: 1000, multiline: true }) : { value: null };
  if (checked.error) return invalid({ reason: checked.error });
  if (current.status === toStatus) return current.statusReason === checked.value ? { ok: true, projectId, unchanged: true } : conflict();
  if (expectedRevision !== current.revision) return conflict();
  if (!PROJECT_TRANSITIONS[current.status].includes(toStatus)) return { ok: false, reason: 'invalid_transition' };
  return applyProjectPatch(db, actor, current, { status: toStatus, statusReason: checked.value,
    completedAt: toStatus === 'completed' ? now.toISOString() : current.completedAt }, [],
    [['PROJECT_STATUS_CHANGED', { from: current.status, to: toStatus }]], now);
}
