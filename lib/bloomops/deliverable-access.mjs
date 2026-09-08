import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { projectAssignmentCondition, projectReadCondition } from './project-access.mjs';

// A Deliverable never creates scope: its Project caps every child read,
// including previously loaded actors and historical activity projections.
export function deliverableReadCondition(actor, { portal = false } = {}) {
  const d = schema.deliverables;
  const visible = portal ? eq(d.visibility, 'client') : ['owner', 'admin'].includes(actor?.role)
    ? sql`1` : sql`(${d.visibility} IN ('internal','client') OR (${d.visibility}='restricted' AND ${projectAssignmentCondition(actor)}))`;
  return and(eq(d.workspaceId, schema.projects.workspaceId), eq(d.projectId, schema.projects.id), projectReadCondition(actor, { portal }), visible);
}

export async function loadDeliverableResource(db, actor, projectId, deliverableId, { portal = false } = {}) {
  const d = schema.deliverables, p = schema.projects, a = schema.projectAssignments;
  const [row] = await db.select({ id: d.id, workspaceId: d.workspaceId, projectId: d.projectId,
    visibility: d.visibility, parentVisibility: p.visibility, clientId: p.clientId, serviceEngagementId: p.serviceEngagementId })
    .from(d).innerJoin(p, and(eq(p.workspaceId, d.workspaceId), eq(p.id, d.projectId)))
    .where(and(deliverableReadCondition(actor, { portal }), eq(d.projectId, String(projectId)), eq(d.id, String(deliverableId)))).limit(1);
  if (!row) return null;
  const restricted = row.visibility === 'restricted' || row.parentVisibility === 'restricted';
  const members = restricted ? await db.select({ id: a.membershipId }).from(a)
    .where(and(eq(a.workspaceId, row.workspaceId), eq(a.projectId, row.projectId))) : [];
  const { parentVisibility, ...resource } = row;
  return { ...resource, type: 'deliverable', visibility: restricted ? 'restricted' : portal ? 'client' : 'internal',
    restrictedToMembershipIds: members.map(member => member.id) };
}
