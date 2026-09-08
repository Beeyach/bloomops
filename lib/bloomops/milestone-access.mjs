import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { projectAssignmentCondition, projectReadCondition } from './project-access.mjs';

// Used only with a joined projects table. Parent scope and visibility always
// cap the child, including for previously loaded actors and old activity.
export function milestoneReadCondition(actor, { portal = false } = {}) {
  const m = schema.milestones;
  const visible = portal ? eq(m.visibility, 'client') : ['owner', 'admin'].includes(actor?.role)
    ? sql`1` : sql`(${m.visibility} IN ('internal','client') OR (${m.visibility}='restricted' AND ${projectAssignmentCondition(actor)}))`;
  return and(eq(m.workspaceId, schema.projects.workspaceId), eq(m.projectId, schema.projects.id), projectReadCondition(actor, { portal }), visible);
}

export async function loadMilestoneResource(db, actor, projectId, milestoneId, { portal = false } = {}) {
  const m = schema.milestones, p = schema.projects, a = schema.projectAssignments;
  const [row] = await db.select({ id: m.id, workspaceId: m.workspaceId, projectId: m.projectId,
    visibility: m.visibility, parentVisibility: p.visibility, clientId: p.clientId, serviceEngagementId: p.serviceEngagementId })
    .from(m).innerJoin(p, and(eq(p.workspaceId, m.workspaceId), eq(p.id, m.projectId)))
    .where(and(milestoneReadCondition(actor, { portal }), eq(m.projectId, String(projectId)), eq(m.id, String(milestoneId)))).limit(1);
  if (!row) return null;
  const restricted = row.visibility === 'restricted' || row.parentVisibility === 'restricted';
  const members = restricted ? await db.select({ id: a.membershipId }).from(a)
    .where(and(eq(a.workspaceId, row.workspaceId), eq(a.projectId, row.projectId))) : [];
  const { parentVisibility, ...resource } = row;
  return { ...resource, type: 'milestone', visibility: restricted ? 'restricted' : portal ? 'client' : 'internal',
    restrictedToMembershipIds: members.map(member => member.id) };
}
