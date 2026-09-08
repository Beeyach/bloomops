// Workspace membership: the BloomOps side of "who is this person here".
//
// Better Auth answers "who is this" (identity, session). Every answer to
// "what may they touch" starts from an ACTIVE membership row in a workspace,
// resolved fresh on every request from these functions. A membership that is
// suspended or removed stops authorising immediately, whatever the state of
// the identity session cookie, because nothing here caches the answer.
import { and, asc, eq, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { ACTIVITY, activityForMutation } from './activity.mjs';

export const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  project_manager: 'Project Manager',
  team_member: 'Team Member',
  client: 'Client',
};

export const MEMBERSHIP_STATUS_LABELS = {
  invited: 'Invited',
  active: 'Active',
  suspended: 'Suspended',
  removed: 'Removed',
};

const EMAIL_SHAPE = /^[^\s@'"<>()[\],;:\\]+@[^\s@'"<>()[\],;:\\]+\.[^\s@'"<>()[\],;:\\]+$/;

// One canonical spelling per address: trimmed and lower-cased. Better Auth
// lower-cases on its side too, so the invitation, the identity, and the
// membership all agree. Returns null for anything that is not an address.
export function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (email.length < 6 || email.length > 254 || !EMAIL_SHAPE.test(email)) return null;
  return email;
}

export function isRole(role) {
  return schema.WORKSPACE_ROLES.includes(role);
}

// The inherited prospecting routes still branch on the two-value role their
// access codes carried. Owners and admins are the people who used to hold an
// admin code; everybody else is a user there.
export function legacyRole(role) {
  return role === 'owner' || role === 'admin' ? 'admin' : 'user';
}

export async function findUserByEmail(db, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const rows = await db.select().from(schema.user).where(eq(schema.user.email, normalized)).limit(1);
  return rows[0] || null;
}

// The workspace a signed-in user is acting in. Only ACTIVE memberships of
// ACTIVE workspaces count. With one workspace per person in Release A the
// earliest active membership is the one; a workspace switcher can pass
// workspaceId later without changing callers.
export async function resolveWorkspaceAccess(db, userId, { workspaceId = null } = {}) {
  if (!userId) return null;
  const conditions = [
    eq(schema.workspaceMemberships.userId, userId),
    eq(schema.workspaceMemberships.status, 'active'),
    eq(schema.workspaces.status, 'active'),
  ];
  if (workspaceId) conditions.push(eq(schema.workspaceMemberships.workspaceId, workspaceId));
  const rows = await db
    .select({ membership: schema.workspaceMemberships, workspace: schema.workspaces })
    .from(schema.workspaceMemberships)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMemberships.workspaceId))
    .where(and(...conditions))
    .orderBy(asc(schema.workspaceMemberships.createdAt), asc(schema.workspaceMemberships.id))
    .limit(1);
  return rows[0] || null;
}

export async function listWorkspaceMembers(db, workspaceId) {
  return db
    .select({
      id: schema.workspaceMemberships.id,
      role: schema.workspaceMemberships.role,
      status: schema.workspaceMemberships.status,
      joinedAt: schema.workspaceMemberships.joinedAt,
      suspendedAt: schema.workspaceMemberships.suspendedAt,
      removedAt: schema.workspaceMemberships.removedAt,
      createdAt: schema.workspaceMemberships.createdAt,
      userId: schema.user.id,
      name: schema.user.name,
      email: schema.user.email,
    })
    .from(schema.workspaceMemberships)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMemberships.userId))
    .where(eq(schema.workspaceMemberships.workspaceId, workspaceId))
    .orderBy(asc(schema.workspaceMemberships.createdAt), asc(schema.workspaceMemberships.id));
}

export async function findMembership(db, { workspaceId, membershipId }) {
  const rows = await db
    .select()
    .from(schema.workspaceMemberships)
    .where(and(eq(schema.workspaceMemberships.workspaceId, workspaceId), eq(schema.workspaceMemberships.id, membershipId)))
    .limit(1);
  return rows[0] || null;
}

async function countActiveOwners(db, workspaceId) {
  const rows = await db
    .select({ id: schema.workspaceMemberships.id })
    .from(schema.workspaceMemberships)
    .where(and(
      eq(schema.workspaceMemberships.workspaceId, workspaceId),
      eq(schema.workspaceMemberships.role, 'owner'),
      eq(schema.workspaceMemberships.status, 'active'),
    ));
  return rows.length;
}

// Move one membership between active, suspended, and removed.
//
// - suspended and removed both revoke workspace authorisation on the next
//   request; removed is terminal here (a removed person comes back through a
//   fresh invitation, which reactivates the same row)
// - nobody may change their own membership
// - the last active owner cannot be suspended or removed, so a workspace can
//   never lock everybody out
export async function setMembershipStatus(db, { workspaceId, membershipId, status, actorMembership, now = new Date() }) {
  if (!['active', 'suspended', 'removed'].includes(status)) return { ok: false, reason: 'invalid_status' };
  const target = await findMembership(db, { workspaceId, membershipId });
  if (!target) return { ok: false, reason: 'not_found' };
  if (actorMembership && actorMembership.id === target.id) return { ok: false, reason: 'self' };
  if (target.status === status) return { ok: true, membership: target, unchanged: true };
  if (target.status === 'removed') return { ok: false, reason: 'removed' };
  if (target.status === 'invited' && status !== 'removed') return { ok: false, reason: 'not_joined' };
  if (target.role === 'owner' && target.status === 'active' && status !== 'active') {
    if ((await countActiveOwners(db, workspaceId)) <= 1) return { ok: false, reason: 'last_owner' };
  }
  const iso = now.toISOString();
  const patch = { status, updatedAt: iso };
  let eventType;
  if (status === 'suspended') {
    patch.suspendedAt = iso;
    eventType = ACTIVITY.MEMBERSHIP_SUSPENDED;
  } else if (status === 'active') {
    patch.suspendedAt = null;
    eventType = ACTIVITY.MEMBERSHIP_REINSTATED;
  } else {
    patch.removedAt = iso;
    eventType = ACTIVITY.MEMBERSHIP_REMOVED;
  }
  const table = schema.workspaceMemberships;
  // The owner count must be checked under the write lock, not only above.
  const ownerSafe = status === 'active' ? sql`1` : sql`(${table.role}<>'owner' OR ${table.status}<>'active' OR
    (SELECT count(*) FROM workspace_memberships WHERE workspace_id=${workspaceId} AND role='owner' AND status='active')>1)`;
  const condition = and(eq(table.id, target.id), eq(table.workspaceId, workspaceId), eq(table.status, target.status), ownerSafe);
  const [, rows] = await db.batch([
    activityForMutation(db, table, condition, {
      workspaceId, eventType, subjectType: 'membership', subjectId: target.id,
      actorMembershipId: actorMembership?.id || null, actorUserId: actorMembership?.userId || null,
      metadata: { from: target.status, to: status, role: target.role }, occurredAt: iso,
    }),
    db.update(table).set(patch).where(condition).returning(),
  ]);
  if (!rows[0]) return { ok: false, reason: 'conflict' };
  return { ok: true, membership: rows[0] };
}
