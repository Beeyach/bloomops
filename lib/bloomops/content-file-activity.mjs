import { and, desc, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { contentFileReadCondition } from './content-file-access.mjs';

// Separate bounded query keeps the combined Client history below D1's bind
// limit. No R2 probes, hidden counts, stale filename grants, or client history.
export async function contentFileActivityRows(db, actor, { clientId = null, contentId = null, limit = 60, orderById = false } = {}) {
  const a = schema.activityEvents, f = schema.assets, m = schema.workspaceMemberships, u = schema.user;
  return db.select({ id: a.id, eventType: a.eventType, metadataJson: a.metadataJson, occurredAt: a.occurredAt,
    actorMembershipId: a.actorMembershipId, actorName: u.name, actorEmail: u.email, order: sql`activity_events.rowid` }).from(a)
    .innerJoin(f, and(eq(f.workspaceId, a.workspaceId), eq(f.id, a.subjectId), eq(a.subjectType, 'file')))
    .leftJoin(m, and(eq(m.id, a.actorMembershipId), eq(m.workspaceId, a.workspaceId))).leftJoin(u, eq(u.id, m.userId))
    .where(and(eq(a.workspaceId, actor?.workspaceId || ''), clientId ? eq(a.clientId, String(clientId)) : undefined,
      contentFileReadCondition(actor, { contentId, clientAggregate: Boolean(clientId) })))
    .orderBy(desc(a.occurredAt), orderById ? desc(a.id) : sql`activity_events.rowid DESC`).limit(Math.min(orderById ? 61 : 60, Math.max(1, limit)));
}
