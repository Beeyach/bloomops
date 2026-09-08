import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { newId } from './clients.mjs';
import { validateAssignee, validateAssignmentRole } from './assignments.mjs';
import { activityForMutation } from './activity.mjs';
import { authorizeProject, projectEvent, projectMemberCondition } from './projects.mjs';
import { projectReadCondition } from './project-access.mjs';

const a = schema.projectAssignments, p = schema.projects;
const conflict = () => ({ ok: false, reason: 'conflict' });
const rowCondition = (actor, projectId, assignmentId) => and(eq(a.workspaceId, actor.workspaceId), eq(a.projectId, projectId), eq(a.id, assignmentId));
const parentCondition = (actor, project) => sql`EXISTS (SELECT 1 FROM projects WHERE ${p.id}=${project.id}
  AND ${p.revision}=${project.revision} AND ${projectReadCondition(actor)})`;

export async function listProjectAssignments(db, actor, projectId) {
  const m = schema.workspaceMemberships, u = schema.user;
  return db.select({ id: a.id, membershipId: a.membershipId, assignmentRole: a.assignmentRole,
    name: u.name, status: m.status, role: m.role }).from(a)
    .innerJoin(p, and(eq(p.workspaceId, a.workspaceId), eq(p.id, a.projectId)))
    .innerJoin(m, and(eq(m.workspaceId, a.workspaceId), eq(m.id, a.membershipId)))
    .innerJoin(u, eq(u.id, m.userId))
    .where(and(eq(a.projectId, String(projectId)), projectReadCondition(actor))).orderBy(a.assignmentRole, u.name, a.id);
}

export async function addProjectAssignment(db, { actor, projectId, membershipId, assignmentRole = 'member', now = new Date() }) {
  const access = await authorizeProject(db, actor, projectId, 'project.assign');
  if (!access.ok) return access;
  if (typeof membershipId !== 'string' || membershipId.length > 120) return { ok: false, reason: 'invalid', errors: { membershipId: 'Choose someone from the list.' } };
  const role = validateAssignmentRole(assignmentRole);
  if (!role.ok) return { ok: false, reason: 'invalid', errors: { assignmentRole: role.message } };
  const person = await validateAssignee(db, actor.workspaceId, membershipId);
  if (!person.ok) return { ok: false, reason: 'invalid', errors: { membershipId: person.message } };
  const existing = await db.select().from(a).where(and(eq(a.workspaceId, actor.workspaceId), eq(a.projectId, projectId), eq(a.membershipId, membershipId))).limit(1);
  if (existing[0]) return updateProjectAssignment(db, { actor, projectId, assignmentId: existing[0].id, assignmentRole: role.value, now });
  const id = newId(), iso = now.toISOString();
  const values = { id, workspaceId: actor.workspaceId, projectId, membershipId, assignmentRole: role.value, createdAt: iso };
  const condition = and(eq(p.id, projectId), eq(p.revision, access.project.revision), projectReadCondition(actor),
    projectMemberCondition(actor.workspaceId, membershipId), sql`NOT EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.project_id=${projectId} AND pa.membership_id=${membershipId})`);
  const results = await db.batch([
    db.insert(a).select(db.select(Object.fromEntries(Object.entries(values).map(([key, value]) => [key, sql`${value}`.as(key)]))).from(p).where(condition)).returning({ id: a.id }),
    activityForMutation(db, a, eq(a.id, id), projectEvent(actor, access.project, 'PROJECT_ASSIGNMENT_ADDED', { memberName: person.value.name, assignmentRole: role.value }, now)),
  ]);
  if (results[0].length) return { ok: true, assignmentId: id, created: true };
  const rows = await listProjectAssignments(db, actor, projectId);
  const winner = rows.find((r) => r.membershipId === membershipId && r.assignmentRole === role.value);
  return winner ? { ok: true, assignmentId: winner.id, unchanged: true } : conflict();
}

export async function updateProjectAssignment(db, { actor, projectId, assignmentId, assignmentRole, now = new Date() }) {
  const access = await authorizeProject(db, actor, projectId, 'project.assign');
  if (!access.ok) return access;
  const role = validateAssignmentRole(assignmentRole);
  if (!role.ok) return { ok: false, reason: 'invalid', errors: { assignmentRole: role.message } };
  const assignment = (await listProjectAssignments(db, actor, projectId)).find((r) => r.id === assignmentId);
  if (!assignment) return { ok: false, reason: 'not_found' };
  if (assignment.assignmentRole === role.value) return { ok: true, assignmentId, unchanged: true };
  const condition = and(rowCondition(actor, projectId, assignmentId), eq(a.assignmentRole, assignment.assignmentRole), parentCondition(actor, access.project));
  const [, rows] = await db.batch([
    activityForMutation(db, a, condition, projectEvent(actor, access.project, 'PROJECT_ASSIGNMENT_UPDATED', { memberName: assignment.name, from: assignment.assignmentRole, to: role.value }, now)),
    db.update(a).set({ assignmentRole: role.value }).where(condition).returning({ id: a.id }),
  ]);
  if (rows.length) return { ok: true, assignmentId };
  const fresh = (await listProjectAssignments(db, actor, projectId)).find((r) => r.id === assignmentId);
  return fresh?.assignmentRole === role.value ? { ok: true, assignmentId, unchanged: true } : conflict();
}

export async function removeProjectAssignment(db, { actor, projectId, assignmentId, now = new Date() }) {
  const access = await authorizeProject(db, actor, projectId, 'project.assign');
  if (!access.ok) return access;
  const assignment = (await listProjectAssignments(db, actor, projectId)).find((r) => r.id === assignmentId);
  if (!assignment) return { ok: true, unchanged: true };
  const condition = and(rowCondition(actor, projectId, assignmentId), eq(a.assignmentRole, assignment.assignmentRole), parentCondition(actor, access.project));
  const [, rows] = await db.batch([
    activityForMutation(db, a, condition, projectEvent(actor, access.project, 'PROJECT_ASSIGNMENT_REMOVED', { memberName: assignment.name }, now)),
    db.delete(a).where(condition).returning({ id: a.id }),
  ]);
  if (rows.length) return { ok: true };
  const freshAccess = await authorizeProject(db, actor, projectId, 'project.assign');
  if (!freshAccess.ok) return freshAccess;
  const fresh = (await listProjectAssignments(db, actor, projectId)).find((r) => r.id === assignmentId);
  return !fresh ? { ok: true, unchanged: true } : conflict();
}
