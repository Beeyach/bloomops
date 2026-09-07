// The invitation lifecycle against the real schema: tied to one address,
// hashed token, expiry, revocation, one acceptance, rotation on resend, and
// exactly one membership at the end of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb, run, one, all } from './_bloomops-db.mjs';
import { runBootstrap } from '../lib/bloomops/bootstrap.mjs';
import {
  INVITATION_TTL_MS,
  acceptInvitation,
  createInvitation,
  findPendingInvitationForEmail,
  hashInvitationToken,
  listInvitations,
  lookupInvitation,
  resendInvitation,
  revokeInvitation,
} from '../lib/bloomops/invitations.mjs';
import { resolveWorkspaceAccess } from '../lib/bloomops/membership.mjs';

const BOOT = {
  workspaceName: 'Test Agency',
  owner: { email: 'owner@example.com' },
  admin: { email: 'admin@example.com' },
};

async function setup() {
  const t = testDb();
  await runBootstrap(t.d1, BOOT);
  const ws = one(t.raw, 'SELECT * FROM workspaces');
  const owner = one(t.raw, "SELECT m.* FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE u.email = 'owner@example.com'");
  return { ...t, ws, owner };
}

// A signed-in identity for the invited address (what Better Auth creates
// on the first magic-link click), created directly because these tests are
// about invitations, not links.
function identity(raw, email, id = `u_${email.split('@')[0]}`) {
  run(raw, 'INSERT INTO user (id, name, email, email_verified) VALUES (?, ?, ?, 1)', id, email.split('@')[0], email);
  return { id, email };
}

const memberships = (raw, wsId) => all(raw, 'SELECT m.role, m.status, u.email FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE m.workspace_id = ? ORDER BY u.email', wsId);
const events = (raw, type) => all(raw, 'SELECT * FROM activity_events WHERE event_type = ? ORDER BY occurred_at', type);

test('an invitation stores only a hash of its token, tied to the normalised address', async () => {
  const t = await setup();
  const r = await createInvitation(t.db, { workspaceId: t.ws.id, email: '  Jamie@Example.COM ', role: 'team_member', inviteeName: 'Jamie', invitedByMembershipId: t.owner.id });
  assert.ok(r.ok);
  assert.match(r.token, /^[A-Za-z0-9_-]{43}$/, '256 bits, base64url');
  const row = one(t.raw, 'SELECT * FROM workspace_invitations');
  assert.equal(row.email, 'jamie@example.com');
  assert.equal(row.status, 'pending');
  assert.equal(row.token_hash, await hashInvitationToken(r.token));
  assert.notEqual(row.token_hash, r.token);
  assert.equal(row.invitee_name, 'Jamie');
  assert.equal(row.invited_by_membership_id, t.owner.id);
  assert.ok(Date.parse(row.expires_at) - Date.parse(row.created_at) === INVITATION_TTL_MS);
  assert.equal(events(t.raw, 'INVITATION_SENT').length, 1);
  assert.equal(JSON.stringify(all(t.raw, 'SELECT * FROM workspace_invitations')).includes(r.token), false);
});

test('invalid inputs are refused before anything is written', async () => {
  const t = await setup();
  assert.equal((await createInvitation(t.db, { workspaceId: t.ws.id, email: 'not-an-email', role: 'client' })).reason, 'invalid_email');
  assert.equal((await createInvitation(t.db, { workspaceId: t.ws.id, email: 'a@b.co', role: 'superuser' })).reason, 'invalid_role');
  assert.equal((await createInvitation(t.db, { workspaceId: t.ws.id, email: 'a@b.co', role: 'client' })).reason, 'client_required');
  assert.equal((await createInvitation(t.db, { workspaceId: t.ws.id, email: 'a@b.co', role: 'team_member', clientId: 'c1' })).reason, 'client_not_allowed');
  assert.equal((await createInvitation(t.db, { workspaceId: t.ws.id, email: 'owner@example.com', role: 'admin' })).reason, 'already_member');
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM workspace_invitations').n, 0);
});

test('accepting with the matching address creates exactly one active membership with the invited role', async () => {
  const t = await setup();
  const r = await createInvitation(t.db, { workspaceId: t.ws.id, email: 'pm@example.com', role: 'project_manager', invitedByMembershipId: t.owner.id });
  const user = identity(t.raw, 'pm@example.com');
  const before = await lookupInvitation(t.db, r.token);
  assert.equal(before.state, 'pending');
  assert.equal(before.workspace.name, 'Test Agency');
  assert.equal(before.invitation.role, 'project_manager');

  const accepted = await acceptInvitation(t.db, { token: r.token, user });
  assert.ok(accepted.ok, JSON.stringify(accepted));
  assert.equal(accepted.created, true);
  assert.equal(accepted.membership.role, 'project_manager');
  assert.equal(accepted.membership.status, 'active');
  assert.equal(accepted.membership.invitedByMembershipId, t.owner.id);
  assert.ok(accepted.membership.joinedAt);

  const inv = one(t.raw, 'SELECT * FROM workspace_invitations');
  assert.equal(inv.status, 'accepted');
  assert.equal(inv.accepted_membership_id, accepted.membership.id);
  assert.ok(inv.accepted_at);
  assert.deepEqual(memberships(t.raw, t.ws.id).map((m) => `${m.email}:${m.role}:${m.status}`), [
    'admin@example.com:admin:active',
    'owner@example.com:owner:active',
    'pm@example.com:project_manager:active',
  ]);
  assert.equal(events(t.raw, 'INVITATION_ACCEPTED').length, 1);
  assert.equal(events(t.raw, 'MEMBERSHIP_CREATED').filter((e) => e.subject_id === accepted.membership.id).length, 1);
  const access = await resolveWorkspaceAccess(t.db, user.id);
  assert.equal(access.membership.role, 'project_manager');
});

test('the wrong signed-in address cannot accept somebody else\'s invitation', async () => {
  const t = await setup();
  const r = await createInvitation(t.db, { workspaceId: t.ws.id, email: 'right@example.com', role: 'team_member' });
  const wrong = identity(t.raw, 'wrong@example.com');
  const result = await acceptInvitation(t.db, { token: r.token, user: wrong });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'email_mismatch');
  assert.equal(one(t.raw, 'SELECT status FROM workspace_invitations').status, 'pending', 'the invitation is untouched');
  assert.equal(memberships(t.raw, t.ws.id).length, 2);
  assert.equal(await resolveWorkspaceAccess(t.db, wrong.id), null);
  // A different capitalisation of the right address is the same person.
  const right = identity(t.raw, 'Right@Example.com', 'u_right');
  const ok = await acceptInvitation(t.db, { token: r.token, user: right });
  assert.ok(ok.ok);
});

test('an expired invitation cannot be accepted and is marked expired', async () => {
  const t = await setup();
  const created = new Date('2026-01-01T00:00:00.000Z');
  const r = await createInvitation(t.db, { workspaceId: t.ws.id, email: 'slow@example.com', role: 'team_member', now: created });
  const user = identity(t.raw, 'slow@example.com');
  const justBefore = new Date(created.getTime() + INVITATION_TTL_MS - 1000);
  assert.equal((await lookupInvitation(t.db, r.token, { now: justBefore })).state, 'pending');
  const late = new Date(created.getTime() + INVITATION_TTL_MS);
  const result = await acceptInvitation(t.db, { token: r.token, user, now: late });
  assert.equal(result.reason, 'expired');
  assert.equal(one(t.raw, 'SELECT status FROM workspace_invitations').status, 'expired');
  assert.equal(memberships(t.raw, t.ws.id).length, 2);
  assert.equal(events(t.raw, 'INVITATION_EXPIRED').length, 1);
  assert.equal(await findPendingInvitationForEmail(t.db, 'slow@example.com', late), null, 'an expired invitation no longer lets an identity be created');
});

test('a revoked invitation cannot be accepted', async () => {
  const t = await setup();
  const r = await createInvitation(t.db, { workspaceId: t.ws.id, email: 'gone@example.com', role: 'team_member' });
  const revoked = await revokeInvitation(t.db, { workspaceId: t.ws.id, invitationId: r.invitation.id, actorMembershipId: t.owner.id });
  assert.ok(revoked.ok);
  assert.equal(revoked.invitation.status, 'revoked');
  assert.ok(revoked.invitation.revokedAt);
  const user = identity(t.raw, 'gone@example.com');
  assert.equal((await acceptInvitation(t.db, { token: r.token, user })).reason, 'revoked');
  assert.equal((await lookupInvitation(t.db, r.token)).state, 'revoked');
  assert.equal(memberships(t.raw, t.ws.id).length, 2);
  assert.equal((await revokeInvitation(t.db, { workspaceId: t.ws.id, invitationId: r.invitation.id })).reason, 'revoked', 'revoking twice is refused, not repeated');
  assert.equal((await resendInvitation(t.db, { workspaceId: t.ws.id, invitationId: r.invitation.id })).reason, 'revoked');
  assert.equal(events(t.raw, 'INVITATION_REVOKED').length, 1);
});

test('an accepted invitation cannot be accepted again, and a retry by the same person is idempotent', async () => {
  const t = await setup();
  const r = await createInvitation(t.db, { workspaceId: t.ws.id, email: 'once@example.com', role: 'team_member' });
  const user = identity(t.raw, 'once@example.com');
  const first = await acceptInvitation(t.db, { token: r.token, user });
  assert.ok(first.ok);
  const retry = await acceptInvitation(t.db, { token: r.token, user });
  assert.ok(retry.ok);
  assert.equal(retry.alreadyAccepted, true);
  assert.equal(retry.membership.id, first.membership.id);
  assert.equal(memberships(t.raw, t.ws.id).filter((m) => m.email === 'once@example.com').length, 1);
  assert.equal(events(t.raw, 'INVITATION_ACCEPTED').length, 1, 'the retry recorded nothing new');

  const impostor = identity(t.raw, 'once@example.com'.replace('once', 'twice'));
  assert.equal((await acceptInvitation(t.db, { token: r.token, user: impostor })).reason, 'accepted');
  assert.equal((await resendInvitation(t.db, { workspaceId: t.ws.id, invitationId: r.invitation.id })).reason, 'accepted');
});

test('resending rotates the token: the old link dies, the new one works, one row stays pending', async () => {
  const t = await setup();
  const first = await createInvitation(t.db, { workspaceId: t.ws.id, email: 'again@example.com', role: 'team_member' });
  const second = await resendInvitation(t.db, { workspaceId: t.ws.id, invitationId: first.invitation.id, actorMembershipId: t.owner.id });
  assert.ok(second.ok);
  assert.equal(second.resent, true);
  assert.notEqual(second.token, first.token);
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM workspace_invitations').n, 1, 'rotated in place');
  assert.equal((await lookupInvitation(t.db, first.token)).state, 'invalid', 'the previous token no longer resolves');
  assert.equal((await lookupInvitation(t.db, second.token)).state, 'pending');
  const user = identity(t.raw, 'again@example.com');
  assert.equal((await acceptInvitation(t.db, { token: first.token, user })).reason, 'invalid');
  assert.ok((await acceptInvitation(t.db, { token: second.token, user })).ok);
  assert.equal(events(t.raw, 'INVITATION_RESENT').length, 1);
});

test('inviting an address that already has a pending invitation resends instead of duplicating', async () => {
  const t = await setup();
  const a = await createInvitation(t.db, { workspaceId: t.ws.id, email: 'dup@example.com', role: 'team_member' });
  const b = await createInvitation(t.db, { workspaceId: t.ws.id, email: 'DUP@example.com', role: 'project_manager', inviteeName: 'Dup' });
  assert.ok(b.ok);
  assert.equal(b.resent, true);
  assert.equal(b.invitation.id, a.invitation.id);
  assert.equal(b.invitation.role, 'project_manager', 'the latest role wins');
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM workspace_invitations').n, 1);
  assert.equal((await lookupInvitation(t.db, a.token)).state, 'invalid');
  // The database itself refuses a second pending row for the same address.
  assert.throws(
    () => run(t.raw, "INSERT INTO workspace_invitations (workspace_id, email, role, status, token_hash, expires_at) VALUES (?, 'dup@example.com', 'client', 'pending', 'h2', '2099-01-01T00:00:00.000Z')", t.ws.id),
    /UNIQUE/,
  );
});

test('an expired invitation can be resent as a fresh one', async () => {
  const t = await setup();
  const created = new Date('2026-01-01T00:00:00.000Z');
  const first = await createInvitation(t.db, { workspaceId: t.ws.id, email: 'later@example.com', role: 'team_member', now: created });
  assert.ok(first.ok);
  const late = new Date(created.getTime() + INVITATION_TTL_MS + 1);
  const again = await resendInvitation(t.db, { workspaceId: t.ws.id, invitationId: first.invitation.id, now: late });
  assert.ok(again.ok, JSON.stringify(again));
  assert.notEqual(again.invitation.id, first.invitation.id, 'a new row replaces the expired one');
  const rows = all(t.raw, 'SELECT status FROM workspace_invitations ORDER BY created_at').map((x) => x.status);
  assert.deepEqual(rows, ['expired', 'pending']);
});

test('client-scoped invitations keep their client, and the client must belong to the same workspace', async () => {
  const t = await setup();
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES ('c_james', ?, 'James', 'james')", t.ws.id);
  run(t.raw, "INSERT INTO workspaces (id, name, slug) VALUES ('ws_other', 'Other', 'other')");
  run(t.raw, "INSERT INTO bloomops_clients (id, workspace_id, name, slug) VALUES ('c_other', 'ws_other', 'Other Client', 'other-client')");

  assert.equal((await createInvitation(t.db, { workspaceId: t.ws.id, email: 'james@example.com', role: 'client', clientId: 'c_other' })).reason, 'conflict', 'foreign clients are refused without raw database text');
  const r = await createInvitation(t.db, { workspaceId: t.ws.id, email: 'james@example.com', role: 'client', clientId: 'c_james' });
  assert.ok(r.ok);
  assert.equal(r.invitation.clientId, 'c_james');
  const user = identity(t.raw, 'james@example.com');
  const accepted = await acceptInvitation(t.db, { token: r.token, user });
  assert.ok(accepted.ok);
  assert.equal(accepted.membership.role, 'client');
  assert.equal(accepted.invitation.clientId, 'c_james');
  const ev = events(t.raw, 'INVITATION_ACCEPTED')[0];
  assert.equal(ev.client_id, 'c_james');
  assert.equal(ev.workspace_id, t.ws.id);
});

test('accepting reactivates a removed membership rather than creating a second one', async () => {
  const t = await setup();
  const user = identity(t.raw, 'back@example.com');
  run(t.raw, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, removed_at) VALUES ('m_back', ?, ?, 'team_member', 'removed', '2026-01-01T00:00:00.000Z')", t.ws.id, user.id);
  const r = await createInvitation(t.db, { workspaceId: t.ws.id, email: 'back@example.com', role: 'project_manager' });
  assert.ok(r.ok, 'a removed member can be invited again');
  const accepted = await acceptInvitation(t.db, { token: r.token, user });
  assert.ok(accepted.ok);
  assert.equal(accepted.created, false);
  assert.equal(accepted.membership.id, 'm_back');
  assert.equal(accepted.membership.status, 'active');
  assert.equal(accepted.membership.role, 'project_manager');
  assert.equal(accepted.membership.removedAt, null);
  assert.equal(memberships(t.raw, t.ws.id).filter((m) => m.email === 'back@example.com').length, 1);
  assert.equal(events(t.raw, 'MEMBERSHIP_ACTIVATED').length, 1);
});

test('invitations are scoped to their workspace', async () => {
  const t = await setup();
  run(t.raw, "INSERT INTO workspaces (id, name, slug) VALUES ('ws_b', 'Agency B', 'agency-b')");
  const a = await createInvitation(t.db, { workspaceId: t.ws.id, email: 'shared@example.com', role: 'team_member' });
  const b2 = await createInvitation(t.db, { workspaceId: 'ws_b', email: 'shared@example.com', role: 'admin' });
  assert.ok(b2.ok, 'the same address may hold a pending invitation in each workspace');
  assert.equal((await listInvitations(t.db, t.ws.id)).length, 1);
  assert.equal((await listInvitations(t.db, 'ws_b')).length, 1);
  assert.equal((await revokeInvitation(t.db, { workspaceId: 'ws_b', invitationId: a.invitation.id })).reason, 'not_found', 'workspace B cannot touch workspace A\'s invitation');
  assert.equal((await resendInvitation(t.db, { workspaceId: 'ws_b', invitationId: a.invitation.id })).reason, 'not_found');
  const user = identity(t.raw, 'shared@example.com');
  const acceptedA = await acceptInvitation(t.db, { token: a.token, user });
  assert.ok(acceptedA.ok);
  assert.equal(acceptedA.workspace.id, t.ws.id);
  assert.equal(acceptedA.membership.workspaceId, t.ws.id);
  assert.equal(memberships(t.raw, 'ws_b').length, 0, 'nothing leaked into workspace B');
  const listed = await listInvitations(t.db, t.ws.id);
  assert.ok(listed.every((row) => !('tokenHash' in row)), 'listings never carry the hash');
});
