import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { INTERNAL_ROLES } from './authorization.mjs';
import { liveProjectActor, projectAssignmentCondition, projectReadCondition } from './project-access.mjs';

// Used with a joined Project. An active Team Member's current assignment is
// a grant to this Action only, including restricted work. It does not change
// projectReadCondition, Milestone access, or any parent/ sibling permission.
export function actionReadCondition(actor, table = schema.actions) {
  const p = schema.projects;
  if (!actor?.scope || !INTERNAL_ROLES.includes(actor.role)) return sql`0`;
  const own = actor.role === 'team_member' ? eq(table.assigneeMembershipId, actor.membershipId) : sql`0`;
  const visibility = ['owner', 'admin'].includes(actor.role) ? sql`1`
    : sql`(${table.visibility}='internal' OR ${own} OR ${projectAssignmentCondition(actor)})`;
  return and(eq(table.workspaceId, actor.workspaceId), eq(table.workspaceId, p.workspaceId), eq(table.projectId, p.id),
    liveProjectActor(actor), sql`(${projectReadCondition(actor)} OR ${own})`, visibility);
}

// Correlated form for conditional writes and activity queries.
export const readableAction = (actor, table = schema.actions) => sql`EXISTS
  (SELECT 1 FROM projects WHERE projects.id=${table.projectId} AND ${actionReadCondition(actor, table)})`;

export function actionWriteCondition(actor, table = schema.actions, { progress = false } = {}) {
  if (['owner', 'admin', 'project_manager'].includes(actor?.role)) return readableAction(actor, table);
  return progress && actor?.role === 'team_member'
    ? and(readableAction(actor, table), eq(table.assigneeMembershipId, actor.membershipId)) : sql`0`;
}

export async function loadActionResource(db, actor, actionId, { projectId = null } = {}) {
  const a = schema.actions, p = schema.projects;
  const [row] = await db.select({ id: a.id, workspaceId: a.workspaceId, projectId: a.projectId,
    assigneeMembershipId: a.assigneeMembershipId, visibility: a.visibility, parentVisibility: p.visibility,
    clientId: p.clientId, serviceEngagementId: p.serviceEngagementId,
    explicitlyAssigned: projectAssignmentCondition(actor) }).from(a)
    .innerJoin(p, and(eq(p.workspaceId, a.workspaceId), eq(p.id, a.projectId)))
    .where(and(actionReadCondition(actor), eq(a.id, String(actionId)), projectId ? eq(a.projectId, String(projectId)) : undefined)).limit(1);
  if (!row) return null;
  const { parentVisibility, explicitlyAssigned, ...resource } = row;
  return { ...resource, type: 'action', visibility: row.visibility === 'restricted' || parentVisibility === 'restricted' ? 'restricted' : 'internal',
    restrictedToMembershipIds: explicitlyAssigned || (actor.role === 'team_member' && row.assigneeMembershipId === actor.membershipId) ? [actor.membershipId] : [] };
}

// Hidden prerequisites still block work, but their ids, titles, counts and
// graph never need to be serialized to explain that derived boolean.
export const dependencyBlockedCondition = (table = schema.actions) => sql`EXISTS (
  SELECT 1 FROM action_dependencies edge JOIN actions prerequisite
    ON prerequisite.workspace_id=edge.workspace_id AND prerequisite.project_id=edge.project_id AND prerequisite.id=edge.depends_on_action_id
  WHERE edge.workspace_id=${table.workspaceId} AND edge.project_id=${table.projectId} AND edge.action_id=${table.id} AND prerequisite.status<>'done')`;
