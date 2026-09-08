// Workspace invitations: Pending → Accepted | Expired | Revoked.
//
// An invitation is the only way an identity is allowed to come into being
// (see auth.mjs) and the only way a membership is granted after bootstrap.
// The raw token travels in one email and is never stored: the row keeps a
// SHA-256 of it, so a database read cannot be turned into an acceptance.
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { schema } from './db.mjs';
import { ACTIVITY, activityValues, activityForMutation } from './activity.mjs';
import { isRole, normalizeEmail } from './membership.mjs';

import { invitationContact, acceptInvitationMembership } from './client-invitation-acceptance.mjs';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function base64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 256 bits from the platform CSPRNG, base64url so it survives a URL as-is.
export function generateInvitationToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashInvitationToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token)));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{40,64}$/;

export function isTokenShaped(token) {
  return TOKEN_SHAPE.test(String(token || ''));
}

const isExpired = (invitation, now) => Date.parse(invitation.expiresAt) <= now.getTime();

// drizzle wraps database errors; the constraint name is on the cause.
const isUniqueViolation = (err) => /UNIQUE/i.test(`${err?.message || ''} ${err?.cause?.message || ''}`);

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function cleanName(raw) {
  const name = String(raw || '').replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return name || null;
}

async function findPendingRow(db, workspaceId, email) {
  const rows = await db
    .select()
    .from(schema.workspaceInvitations)
    .where(and(
      eq(schema.workspaceInvitations.workspaceId, workspaceId),
      eq(schema.workspaceInvitations.email, email),
      eq(schema.workspaceInvitations.status, 'pending'),
    ))
    .limit(1);
  return rows[0] || null;
}

async function markExpired(db, invitation, now) {
  const iso = now.toISOString();
  const table = schema.workspaceInvitations;
  const condition = and(eq(table.workspaceId, invitation.workspaceId), eq(table.id, invitation.id),
    eq(table.status, 'pending'), eq(table.tokenHash, invitation.tokenHash), sql`${table.expiresAt} <= ${iso}`);
  const [, rows] = await db.batch([
    activityForMutation(db, table, condition, {
      workspaceId: invitation.workspaceId, eventType: ACTIVITY.INVITATION_EXPIRED,
      subjectType: 'invitation', subjectId: invitation.id, clientId: invitation.clientId, occurredAt: iso,
    }),
    db.update(table).set({ status: 'expired', updatedAt: iso }).where(condition).returning(),
  ]);
  return rows[0] || await findInvitationById(db, { workspaceId: invitation.workspaceId, invitationId: invitation.id });
}

// Any pending, unexpired invitation for an address, across workspaces. This
// is what lets an invited person create an identity and what keeps everyone
// else out.
export async function findPendingInvitationForEmail(db, email, now = new Date()) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const rows = await db
    .select()
    .from(schema.workspaceInvitations)
    .where(and(
      eq(schema.workspaceInvitations.email, normalized),
      eq(schema.workspaceInvitations.status, 'pending'),
      gt(schema.workspaceInvitations.expiresAt, now.toISOString()),
    ))
    .orderBy(asc(schema.workspaceInvitations.createdAt))
    .limit(1);
  return rows[0] || null;
}

async function membershipForEmail(db, workspaceId, email) {
  const rows = await db
    .select({ id: schema.workspaceMemberships.id, status: schema.workspaceMemberships.status, role: schema.workspaceMemberships.role, userId: schema.workspaceMemberships.userId })
    .from(schema.workspaceMemberships)
    .innerJoin(schema.user, eq(schema.user.id, schema.workspaceMemberships.userId))
    .where(and(eq(schema.workspaceMemberships.workspaceId, workspaceId), eq(schema.user.email, email)))
    .limit(1);
  return rows[0] || null;
}

// Create (or, when one is already pending for this address, rotate) the
// usable invitation. Returns the raw token exactly once, for the email.
export async function createInvitation(db, { workspaceId, email, role, clientId = null, contactId = null, deliveryClaim = null, inviteeName = null, invitedByMembershipId = null, now = new Date() }) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { ok: false, reason: 'invalid_email' };
  if (!isRole(role)) return { ok: false, reason: 'invalid_role' };
  if (role === 'client' && !clientId) return { ok: false, reason: 'client_required' };
  if (role !== 'client' && clientId) return { ok: false, reason: 'client_not_allowed' };
  if (contactId) {
    const c = schema.clientContacts;
    const contact = (await db.select().from(c).where(and(eq(c.workspaceId, workspaceId), eq(c.clientId, clientId || ''), eq(c.id, contactId))).limit(1))[0];
    if (role !== 'client' || !contact || normalizeEmail(contact.email) !== normalized) return { ok: false, reason: 'conflict' };
  }
  const existing = await membershipForEmail(db, workspaceId, normalized);
  if (existing && existing.status === 'active' && !(contactId && existing.role === 'client')) return { ok: false, reason: 'already_member' };
  if (contactId && existing) {
    if (existing.role !== 'client') return { ok: false, reason: 'conflict' };
    const links = await db.select({ clientId: schema.clientContacts.clientId }).from(schema.clientContacts).where(and(eq(schema.clientContacts.workspaceId, workspaceId), eq(schema.clientContacts.userId, existing.userId)));
    if (links.some(link => link.clientId !== clientId)) return { ok: false, reason: 'conflict' };
  }

  const pending = await findPendingRow(db, workspaceId, normalized);
  if (pending) {
    const linked = await invitationContact(db, workspaceId, pending.id);
    // Activation cannot take over an unrelated invitation, and generic
    // invitation management cannot retarget an activation's contact.
    if ((contactId && (pending.role !== role || pending.clientId !== clientId || !linked || linked.contactId !== contactId)) || (linked && linked.contactId !== contactId)) return { ok: false, reason: 'conflict' };
    const rotated = await rotateInvitation(db, pending, { role, clientId, inviteeName, invitedByMembershipId, now, deliveryClaim });
    return { ...rotated, resent: true };
  }

  const token = generateInvitationToken();
  const iso = now.toISOString();
  const values = {
    id: crypto.randomUUID(),
    workspaceId,
    email: normalized,
    role,
    status: 'pending',
    tokenHash: deliveryClaim ? sql`CASE WHEN ${deliveryClaimGuard(workspaceId, deliveryClaim)} THEN ${await hashInvitationToken(token)} ELSE NULL END` : await hashInvitationToken(token),
    inviteeName: cleanName(inviteeName),
    clientId: clientId || null,
    invitedByMembershipId,
    expiresAt: new Date(now.getTime() + INVITATION_TTL_MS).toISOString(),
    createdAt: iso,
    updatedAt: iso,
  };
  try {
    const writes = [db.insert(schema.workspaceInvitations).values(values)];
    if (contactId) writes.push(db.insert(schema.clientInvitationContacts).values({ workspaceId, clientId, contactId, invitationId: values.id, createdAt: iso }));
    writes.push(db.insert(schema.activityEvents).values(activityValues({
      workspaceId, eventType: ACTIVITY.INVITATION_SENT, subjectType: 'invitation', subjectId: values.id,
      actorMembershipId: invitedByMembershipId, clientId: clientId || null, metadata: { role }, occurredAt: iso,
    })));
    await db.batch(writes);
  } catch (err) {
    if (isUniqueViolation(err) || /FOREIGN KEY|NOT NULL constraint failed: workspace_invitations.token_hash/i.test(`${err?.message} ${err?.cause?.message}`)) return { ok: false, reason: 'conflict' };
    throw err;
  }
  return { ok: true, invitation: await findInvitationById(db, { workspaceId, invitationId: values.id }), token };
}

function deliveryClaimGuard(workspaceId, claim) {
  return sql`EXISTS (SELECT 1 FROM client_activations WHERE id = ${claim.activationId} AND workspace_id = ${workspaceId} AND delivery_attempt_id = ${claim.attemptId} AND delivery_status = 'sending')`;
}

async function rotateInvitation(db, pending, { role = pending.role, clientId = pending.clientId, inviteeName = pending.inviteeName, invitedByMembershipId = pending.invitedByMembershipId, now, deliveryClaim = null }) {
  const token = generateInvitationToken();
  const iso = now.toISOString();
  const table = schema.workspaceInvitations;
  const condition = and(eq(table.workspaceId, pending.workspaceId), eq(table.id, pending.id),
    eq(table.status, 'pending'), eq(table.tokenHash, pending.tokenHash),
    deliveryClaim ? deliveryClaimGuard(pending.workspaceId, deliveryClaim) : sql`NOT EXISTS (SELECT 1 FROM client_invitation_contacts WHERE invitation_id=${pending.id})`);
  const [, rows] = await db.batch([
    activityForMutation(db, table, condition, {
      workspaceId: pending.workspaceId, eventType: ACTIVITY.INVITATION_RESENT,
      subjectType: 'invitation', subjectId: pending.id, actorMembershipId: invitedByMembershipId ?? null,
      clientId: clientId || null, metadata: { role }, occurredAt: iso,
    }),
    db
    .update(schema.workspaceInvitations)
    .set({
      tokenHash: await hashInvitationToken(token),
      role,
      clientId: clientId || null,
      inviteeName: cleanName(inviteeName) ?? pending.inviteeName,
      invitedByMembershipId: invitedByMembershipId ?? pending.invitedByMembershipId,
      expiresAt: new Date(now.getTime() + INVITATION_TTL_MS).toISOString(),
      updatedAt: iso,
    })
    .where(condition)
    .returning(),
  ]);
  if (!rows[0]) return { ok: false, reason: 'conflict' };
  return { ok: true, invitation: rows[0], token };
}

// Resend: a pending invitation gets a new token and a new expiry, and the
// old token stops working. An expired one is replaced by a fresh row.
// Revoked and accepted invitations stay as they are.
export async function resendInvitation(db, { workspaceId, invitationId, actorMembershipId = null, now = new Date() }) {
  const current = await findInvitationById(db, { workspaceId, invitationId });
  if (!current) return { ok: false, reason: 'not_found' };
  if (await invitationContact(db, workspaceId, current.id)) return { ok: false, reason: 'activation_managed' };
  let status = current.status;
  if (status === 'pending' && isExpired(current, now)) {
    await markExpired(db, current, now);
    status = 'expired';
  }
  if (status === 'pending') {
    return { ...(await rotateInvitation(db, current, { invitedByMembershipId: actorMembershipId ?? current.invitedByMembershipId, now })), resent: true };
  }
  if (status === 'expired') {
    return createInvitation(db, {
      workspaceId,
      email: current.email,
      role: current.role,
      clientId: current.clientId,
      inviteeName: current.inviteeName,
      invitedByMembershipId: actorMembershipId ?? current.invitedByMembershipId,
      now,
    });
  }
  return { ok: false, reason: status };
}

export async function revokeInvitation(db, { workspaceId, invitationId, actorMembershipId = null, now = new Date() }) {
  const current = await findInvitationById(db, { workspaceId, invitationId });
  if (!current) return { ok: false, reason: 'not_found' };
  if (await invitationContact(db, workspaceId, current.id)) return { ok: false, reason: 'activation_managed' };
  if (current.status !== 'pending') return { ok: false, reason: current.status };
  const iso = now.toISOString();
  const table = schema.workspaceInvitations;
  const condition = and(eq(table.workspaceId, workspaceId), eq(table.id, current.id), eq(table.status, 'pending'), eq(table.tokenHash, current.tokenHash),
    sql`NOT EXISTS (SELECT 1 FROM client_invitation_contacts WHERE invitation_id=${current.id})`);
  const [, rows] = await db.batch([
    activityForMutation(db, table, condition, {
      workspaceId, eventType: ACTIVITY.INVITATION_REVOKED, subjectType: 'invitation', subjectId: current.id,
      actorMembershipId, clientId: current.clientId, occurredAt: iso,
    }),
    db.update(table).set({ status: 'revoked', revokedAt: iso, updatedAt: iso }).where(condition).returning(),
  ]);
  if (!rows[0]) return { ok: false, reason: 'conflict' };
  return { ok: true, invitation: rows[0] };
}

export async function findInvitationById(db, { workspaceId, invitationId }) {
  const rows = await db
    .select()
    .from(schema.workspaceInvitations)
    .where(and(eq(schema.workspaceInvitations.workspaceId, workspaceId), eq(schema.workspaceInvitations.id, invitationId)))
    .limit(1);
  return rows[0] || null;
}

export async function listInvitations(db, workspaceId) {
  return db
    .select({
      id: schema.workspaceInvitations.id,
      email: schema.workspaceInvitations.email,
      role: schema.workspaceInvitations.role,
      status: schema.workspaceInvitations.status,
      inviteeName: schema.workspaceInvitations.inviteeName,
      clientId: schema.workspaceInvitations.clientId,
      invitedByMembershipId: schema.workspaceInvitations.invitedByMembershipId,
      acceptedMembershipId: schema.workspaceInvitations.acceptedMembershipId,
      expiresAt: schema.workspaceInvitations.expiresAt,
      acceptedAt: schema.workspaceInvitations.acceptedAt,
      revokedAt: schema.workspaceInvitations.revokedAt,
      createdAt: schema.workspaceInvitations.createdAt,
      updatedAt: schema.workspaceInvitations.updatedAt,
    })
    .from(schema.workspaceInvitations)
    .where(eq(schema.workspaceInvitations.workspaceId, workspaceId))
    .orderBy(desc(schema.workspaceInvitations.createdAt));
}

// What a link holder may learn before signing in: whether the link is
// usable, and which workspace and role it is for. Never the address.
export async function lookupInvitation(db, token, { now = new Date() } = {}) {
  if (!isTokenShaped(token)) return { state: 'invalid' };
  const tokenHash = await hashInvitationToken(token);
  const rows = await db
    .select({ invitation: schema.workspaceInvitations, workspace: schema.workspaces })
    .from(schema.workspaceInvitations)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceInvitations.workspaceId))
    .where(eq(schema.workspaceInvitations.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return { state: 'invalid' };
  let { invitation } = row;
  if (invitation.status === 'pending' && isExpired(invitation, now)) invitation = await markExpired(db, invitation, now);
  if (!invitation || invitation.tokenHash !== tokenHash) return { state: 'invalid' };
  return { state: invitation.status, invitation, workspace: row.workspace };
}

// The same transaction boundary protects generic and contact-bound acceptance.
export async function acceptInvitation(db, { token, user, now = new Date() }) {
  if (!user?.id) return { ok: false, reason: 'unauthenticated' };
  const looked = await lookupInvitation(db, token, { now });
  if (looked.state === 'invalid') return { ok: false, reason: 'invalid' };
  const { invitation, workspace } = looked;
  const link = await invitationContact(db, workspace.id, invitation.id);
  return acceptInvitationMembership(db, { invitation, workspace, link, user, now });
}
