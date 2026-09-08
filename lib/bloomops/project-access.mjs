// SQL counterpart of A4 Project scope. The live membership, workspace,
// assignments, contact link and visibility are checked by the query that
// reads or writes the Project, including when a previously loaded actor is
// stale. EXISTS keeps large assignment scopes below D1's bind limit.
import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { ACTIONS, INTERNAL_ROLES } from './authorization.mjs';

export function liveProjectActor(actor) {
  if (!actor || actor.status !== 'active' || !actor.workspaceId || !actor.membershipId || !actor.userId) return sql`0`;
  return sql`EXISTS (SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id
    WHERE m.workspace_id=${actor.workspaceId} AND m.id=${actor.membershipId} AND m.user_id=${actor.userId}
    AND m.role=${actor.role} AND m.status='active' AND w.status='active')`;
}

export function projectAssignmentCondition(actor) {
  const p = schema.projects;
  return sql`EXISTS (SELECT 1 FROM project_assignments pa WHERE pa.workspace_id=${p.workspaceId}
    AND pa.project_id=${p.id} AND pa.membership_id=${actor?.membershipId || ''})`;
}

export function projectReadCondition(actor, { portal = false } = {}) {
  const p = schema.projects;
  if (!actor || !actor.scope || (portal ? actor.role !== 'client' : !INTERNAL_ROLES.includes(actor.role))) return sql`0`;
  const ownAssignment = projectAssignmentCondition(actor);
  let scope;
  if (actor.role === 'client') {
    scope = sql`EXISTS (SELECT 1 FROM client_contacts cc WHERE cc.workspace_id=${p.workspaceId}
      AND cc.client_id=${p.clientId} AND cc.user_id=${actor.userId})`;
  } else if (ACTIONS['project.manage'].roles.includes(actor.role)) scope = sql`1`;
  else scope = sql`(${ownAssignment} OR EXISTS (SELECT 1 FROM client_assignments ca
    WHERE ca.workspace_id=${p.workspaceId} AND ca.client_id=${p.clientId} AND ca.membership_id=${actor.membershipId})
    OR EXISTS (SELECT 1 FROM service_assignments sa WHERE sa.workspace_id=${p.workspaceId}
    AND sa.service_engagement_id=${p.serviceEngagementId} AND sa.membership_id=${actor.membershipId}))`;
  const visibility = portal ? eq(p.visibility, 'client') : ['owner', 'admin'].includes(actor.role)
    ? sql`1` : sql`(${p.visibility} IN ('internal','client') OR (${p.visibility}='restricted' AND ${ownAssignment}))`;
  return and(eq(p.workspaceId, actor.workspaceId), liveProjectActor(actor), scope, visibility);
}

export function projectResource(project, restrictedToMembershipIds = [], { internal = false } = {}) {
  if (!project) return null;
  return { type: 'project', id: project.id, workspaceId: project.workspaceId, clientId: project.clientId,
    serviceEngagementId: project.serviceEngagementId, visibility: internal && project.visibility === 'client' ? 'internal' : project.visibility,
    restrictedToMembershipIds };
}

export async function loadProjectResource(db, actor, projectId, { portal = false } = {}) {
  const p = schema.projects;
  const [project] = await db.select().from(p).where(and(projectReadCondition(actor, { portal }), eq(p.id, String(projectId)))).limit(1);
  if (!project) return null;
  const a = schema.projectAssignments;
  const members = project.visibility === 'restricted' ? await db.select({ id: a.membershipId }).from(a)
    .where(and(eq(a.workspaceId, actor.workspaceId), eq(a.projectId, project.id))) : [];
  return projectResource(project, members.map((m) => m.id), { internal: !portal });
}
