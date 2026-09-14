import { and, asc, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { baseActor, evaluate, loadActor, loadInternalClientResource } from './authorization.mjs';
import { resolveWorkspaceAccess } from './membership.mjs';
import { attachPreview, previewViewerCondition } from './preview-policy.mjs';

// Always reload both principals. A contact name/email alone is not a portal
// identity, and a narrower project/service grant never grants client preview.
export async function clientPreviewContacts(db, viewer, clientId) {
  const access = viewer && await resolveWorkspaceAccess(db, viewer.userId, { workspaceId: viewer.workspaceId });
  if (!access || access.membership.id !== viewer.membershipId) return null;
  viewer = await loadActor(db, access);
  const resource = await loadInternalClientResource(db, viewer.workspaceId, String(clientId));
  if (!resource || !evaluate(viewer, { action: 'client.view', resource }).allowed) return null;
  const cc = schema.clientContacts, m = schema.workspaceMemberships;
  const contacts = await db.select({ id: cc.id, name: cc.name, email: cc.email, userId: cc.userId, membershipId: m.id })
    .from(cc).innerJoin(m, and(eq(m.workspaceId, cc.workspaceId), eq(m.userId, cc.userId)))
    .where(and(previewViewerCondition(viewer, String(clientId)), eq(cc.workspaceId, viewer.workspaceId), eq(cc.clientId, String(clientId)), eq(m.role, 'client'), eq(m.status, 'active')))
    .orderBy(asc(cc.name), asc(cc.id));
  if (!await db.get(sql`SELECT 1 AS ok WHERE ${previewViewerCondition(viewer, String(clientId))}`)) return null;
  return { viewer, contacts };
}

export async function createClientPreview(db, viewer, clientId, contactId) {
  if (!viewer || !clientId || !contactId) return null;
  const cc = schema.clientContacts, m = schema.workspaceMemberships;
  // One current query proves both principals and the exact durable contact.
  // This also keeps the visible preview's periodic access check inexpensive.
  const [row] = await db.select({ id: cc.id, name: cc.name, email: cc.email,
    membershipId: m.id, userId: m.userId, role: m.role, status: m.status })
    .from(cc).innerJoin(m, and(eq(m.workspaceId, cc.workspaceId), eq(m.userId, cc.userId)))
    .where(and(previewViewerCondition(viewer, String(clientId)), eq(cc.workspaceId, viewer.workspaceId),
      eq(cc.clientId, String(clientId)), eq(cc.id, String(contactId)), eq(m.role, 'client'), eq(m.status, 'active'))).limit(1);
  if (!row) return null;
  const principal = baseActor({ workspace: { id: viewer.workspaceId },
    membership: { id: row.membershipId, userId: row.userId, role: row.role, status: row.status } });
  // Real Client actors have no capabilities. The preview's contact scope is
  // deliberately limited to the one client proved by the query above.
  principal.capabilities = new Set();
  const actor = attachPreview(principal, { viewer, clientId: String(clientId), contactId: String(contactId) });
  return { actor, contact: { id: row.id, name: row.name, email: row.email } };
}
