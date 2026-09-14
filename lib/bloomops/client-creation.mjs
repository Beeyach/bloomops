import { and, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { ACTIONS } from './authorization.mjs';
import { REQUEST_ID } from './workspaces.mjs';

// This predicate runs in the statement that reads or creates the record.
// Cached route authorization cannot survive a revoked membership/workspace.
export function clientCreationAuthority({ workspaceId, actorMembershipId, actorUserId }) {
  if (!workspaceId || !actorMembershipId || !actorUserId) return sql`0`;
  return sql`EXISTS (SELECT 1 FROM workspace_memberships m JOIN workspaces w ON w.id=m.workspace_id
    WHERE m.id=${actorMembershipId} AND m.user_id=${actorUserId} AND m.workspace_id=${workspaceId}
    AND m.status='active' AND w.status='active'
    AND m.role IN (SELECT value FROM json_each(${JSON.stringify(ACTIONS['client.create'].roles)})))`;
}

export async function clientCreationFingerprint(fields) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(fields)));
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}

export async function findClientCreation(db, context, requestId) {
  const r = schema.clientCreationReceipts, c = schema.clients;
  return (await db.select({ clientId: c.id, slug: c.slug, fingerprint: r.fingerprint, userId: r.userId })
    .from(r).innerJoin(c, and(eq(c.workspaceId, r.workspaceId), eq(c.id, r.clientId)))
    .where(and(eq(r.workspaceId, context.workspaceId), eq(r.requestId, requestId), clientCreationAuthority(context))).limit(1))[0];
}

// One read checks current authority and the original creation identity. No
// draft fields are sent to the server or returned from browser storage here.
export async function readClientCreationRecovery(db, actor, input) {
  if (!actor || !input || input.userId !== actor.userId || input.workspaceId !== actor.workspaceId) return { status: 403 };
  if (Array.isArray(input) || Object.keys(input).some(k => !['userId', 'workspaceId', 'requestId'].includes(k))
    || typeof input.requestId !== 'string' || !REQUEST_ID.test(input.requestId)) return { status: 400 };
  const w = schema.workspaces, r = schema.clientCreationReceipts, c = schema.clients;
  const [row] = await db.select({ workspaceId: w.id, clientId: c.id, name: c.name })
    .from(w).leftJoin(r, and(eq(r.workspaceId, w.id), eq(r.requestId, input.requestId), eq(r.userId, actor.userId)))
    .leftJoin(c, and(eq(c.workspaceId, r.workspaceId), eq(c.id, r.clientId)))
    .where(and(eq(w.id, actor.workspaceId), clientCreationAuthority({ workspaceId: actor.workspaceId, actorMembershipId: actor.membershipId, actorUserId: actor.userId }))).limit(1);
  return row ? { status: 200, userId: actor.userId, workspaceId: actor.workspaceId, requestId: input.requestId,
    client: row.clientId ? { id: row.clientId, name: row.name } : null } : { status: 404 };
}
