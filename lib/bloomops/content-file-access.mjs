import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { contentReadCondition, contentAssignmentCondition } from './content-access.mjs';
import { liveProjectActor } from './project-access.mjs';

const c = schema.contentItems, f = schema.assets, l = schema.contentAssetLinks;

// C4's narrow portal exception. Neither workflow context nor editorial fields
// become client-safe. Reuse this live predicate at every storage boundary.
export function recordingRequestCondition(actor) {
  if (!actor?.scope || actor.role !== 'client') return sql`0`;
  return and(eq(c.workspaceId, actor.workspaceId), liveProjectActor(actor), eq(c.visibility, 'client'),
    eq(c.recordingRequired, true), eq(c.stage, 'waiting_for_recording'),
    sql`EXISTS (SELECT 1 FROM bloomops_clients cc JOIN client_contacts contact
      ON contact.workspace_id=cc.workspace_id AND contact.client_id=cc.id
      WHERE cc.workspace_id=${c.workspaceId} AND cc.id=${c.clientId} AND contact.user_id=${actor.userId})`,
    sql`(${c.serviceEngagementId} IS NULL OR EXISTS (SELECT 1 FROM service_engagements se
      JOIN service_types st ON st.workspace_id=se.workspace_id AND st.id=se.service_type_id
      JOIN departments dept ON dept.workspace_id=st.workspace_id AND dept.id=st.department_id
      WHERE se.workspace_id=${c.workspaceId} AND se.client_id=${c.clientId}
      AND se.id=${c.serviceEngagementId} AND dept.slug='social'))`);
}

export function contentFileVisibilityCondition(actor, visibility = f.visibility) {
  if (['owner', 'admin'].includes(actor?.role)) return sql`1`;
  if (actor?.role === 'client') return sql`${visibility}='client'`;
  return sql`(${visibility} IN ('internal','client') OR (${visibility}='restricted' AND ${contentAssignmentCondition(actor, c.clientId, c.serviceEngagementId)}))`;
}

export function contentFileReadCondition(actor, { contentId = null, portal = false, ready = false, includeArchived = false, upload = false } = {}) {
  if (!actor?.scope || (portal ? actor.role !== 'client' : actor.role === 'client')) return sql`0`;
  return and(eq(f.workspaceId, actor.workspaceId), ready ? eq(f.status, 'ready') : undefined,
    includeArchived ? undefined : sql`${f.status}<>'archived'`,
    // A Client can recover only their own request, not impersonate a teammate.
    portal && upload ? eq(f.uploaderMembershipId, actor.membershipId) : undefined,
    sql`EXISTS (SELECT 1 FROM content_asset_links JOIN content_items
      ON ${c.workspaceId}=${l.workspaceId} AND ${c.id}=${l.contentId}
      WHERE ${l.assetId}=${f.id} AND ${l.workspaceId}=${f.workspaceId}
      AND ${contentId === null ? sql`1` : eq(l.contentId, String(contentId))}
      AND ${portal ? and(eq(l.purpose, 'recording'), recordingRequestCondition(actor)) : contentReadCondition(actor)}
      AND ${contentFileVisibilityCondition(actor)})`);
}

export async function loadRecordingResource(db, actor, contentId) {
  const [row] = await db.select({ id: c.id, workspaceId: c.workspaceId, clientId: c.clientId, serviceEngagementId: c.serviceEngagementId })
    .from(c).where(and(eq(c.id, String(contentId)), recordingRequestCondition(actor))).limit(1);
  return row ? { ...row, type: 'recording_request', visibility: 'client' } : null;
}
