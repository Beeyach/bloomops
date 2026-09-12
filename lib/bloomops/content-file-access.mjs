import { internalContentReadCondition, internalContentWriteCondition, adsContentParentCondition } from './content-internal-access.mjs';
import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { contentReadCondition, contentAssignmentCondition, contentClientReadCondition } from './content-access.mjs';

const c = schema.contentItems, f = schema.assets, l = schema.contentAssetLinks;

// C4's narrow portal exception. Neither workflow context nor editorial fields
// become client-safe. Reuse this live predicate at every storage boundary.
export function recordingRequestCondition(actor) {
  return and(contentClientReadCondition(actor), eq(c.recordingRequired, true), eq(c.stage, 'waiting_for_recording'));
}

export function contentFileVisibilityCondition(actor, visibility = f.visibility) {
  const social=['owner','admin'].includes(actor?.role)?sql`1`:actor?.role==='client'?sql`${visibility}='client'`:
    sql`(${visibility} IN ('internal','client') OR (${visibility}='restricted' AND ${contentAssignmentCondition(actor,c.clientId,c.serviceEngagementId)}))`;
  return sql`((${c.productionArea}='social' AND ${social}) OR (${c.productionArea}='ads' AND ${adsContentParentCondition(actor,visibility)}))`;
}

export function contentFileReadCondition(actor, { contentId = null, portal = false, ready = false, includeArchived = false, upload = false, write = false, clientAggregate = false } = {}) {
  if (!actor?.scope || (portal ? actor.role !== 'client' : actor.role === 'client')) return sql`0`;
  return and(eq(f.workspaceId, actor.workspaceId), ready ? eq(f.status, 'ready') : undefined,
    includeArchived ? undefined : sql`${f.status}<>'archived'`,
    // A Client can recover only their own request, not impersonate a teammate.
    portal && upload ? eq(f.uploaderMembershipId, actor.membershipId) : undefined,
    sql`EXISTS (SELECT 1 FROM content_asset_links JOIN content_items
      ON ${c.workspaceId}=${l.workspaceId} AND ${c.id}=${l.contentId}
      WHERE ${l.assetId}=${f.id} AND ${l.workspaceId}=${f.workspaceId}
      AND ${contentId === null ? sql`1` : eq(l.contentId, String(contentId))}
      AND ${portal ? and(eq(l.purpose, 'recording'), recordingRequestCondition(actor)) : (write?internalContentWriteCondition(actor):internalContentReadCondition(actor))}
      AND (${c.productionArea}='social' OR (${l.purpose}='asset' AND ${f.visibility} IN ('internal','restricted')))
      AND ${!clientAggregate || ['owner','admin','project_manager'].includes(actor.role) ? sql`1` : sql`(${c.productionArea}='social' OR EXISTS (SELECT 1 FROM client_assignments ca WHERE ca.workspace_id=${c.workspaceId} AND ca.client_id=${c.clientId} AND ca.membership_id=${actor.membershipId}))`}
      AND ${contentFileVisibilityCondition(actor)})`);
}

export async function loadRecordingResource(db, actor, contentId) {
  const [row] = await db.select({ id: c.id, workspaceId: c.workspaceId, clientId: c.clientId, serviceEngagementId: c.serviceEngagementId })
    .from(c).where(and(eq(c.id, String(contentId)), recordingRequestCondition(actor))).limit(1);
  return row ? { ...row, type: 'recording_request', visibility: 'client' } : null;
}
