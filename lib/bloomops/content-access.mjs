import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { INTERNAL_ROLES } from './authorization.mjs';
import { liveProjectActor } from './project-access.mjs';

// Existing Client/Service assignments only. No Content owner, Department,
// Project or Action predicate participates in this scope.
export function contentAssignmentCondition(actor, clientId, serviceId) {
  return sql`(EXISTS (SELECT 1 FROM client_assignments ca WHERE ca.workspace_id=${actor?.workspaceId || ''}
    AND ca.client_id=${clientId} AND ca.membership_id=${actor?.membershipId || ''})
    OR (${serviceId} IS NOT NULL AND EXISTS (SELECT 1 FROM service_assignments sa
    WHERE sa.workspace_id=${actor?.workspaceId || ''} AND sa.service_engagement_id=${serviceId}
    AND sa.membership_id=${actor?.membershipId || ''})))`;
}

export function contentParentCondition(actor, clientId, serviceId, visibility = 'internal') {
  if (!actor?.scope || !INTERNAL_ROLES.includes(actor.role)) return sql`0`;
  const assigned = contentAssignmentCondition(actor, clientId, serviceId);
  return and(liveProjectActor(actor),
    sql`EXISTS (SELECT 1 FROM bloomops_clients cc WHERE cc.workspace_id=${actor.workspaceId} AND cc.id=${clientId})`,
    sql`(${serviceId} IS NULL OR EXISTS (SELECT 1 FROM service_engagements se
      JOIN service_types st ON st.id=se.service_type_id AND st.workspace_id=se.workspace_id
      JOIN departments dept ON dept.id=st.department_id AND dept.workspace_id=st.workspace_id
      WHERE se.workspace_id=${actor.workspaceId} AND se.client_id=${clientId} AND se.id=${serviceId} AND dept.slug='social'))`,
    actor.role === 'team_member' ? assigned : sql`1`,
    ['owner', 'admin'].includes(actor.role) ? sql`1` : sql`(${visibility} IN ('internal','client') OR (${visibility}='restricted' AND ${assigned}))`);
}

export function contentReadCondition(actor) {
  const c = schema.contentItems;
  return and(eq(c.workspaceId, actor?.workspaceId || ''), contentParentCondition(actor, c.clientId, c.serviceEngagementId, c.visibility));
}

export async function loadContentParentResource(db, actor, clientId, serviceEngagementId = null) {
  const c = schema.clients;
  const [row] = await db.select({ id: c.id, workspaceId: c.workspaceId }).from(c)
    .where(and(eq(c.id, String(clientId)), contentParentCondition(actor, String(clientId), serviceEngagementId))).limit(1);
  return row ? { type: 'content_parent', id: serviceEngagementId || row.id, workspaceId: row.workspaceId,
    clientId: row.id, serviceEngagementId, visibility: 'internal' } : null;
}

export async function loadContentResource(db, actor, contentId) {
  const c = schema.contentItems;
  const [row] = await db.select({ id: c.id, workspaceId: c.workspaceId, clientId: c.clientId, serviceEngagementId: c.serviceEngagementId,
    visibility: c.visibility }).from(c).where(and(contentReadCondition(actor), eq(c.id, String(contentId)))).limit(1);
  // The query already proved this acting membership's exact restricted grant.
  return row ? { ...row, type: 'content', visibility: row.visibility === 'restricted' ? 'restricted' : 'internal',
    restrictedToMembershipIds: row.visibility === 'restricted' ? [actor.membershipId] : [] } : null;
}
