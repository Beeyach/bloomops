// Membership, bootstrap, and request access: roles persist, a valid identity
// without an active membership is denied, suspension and removal revoke
// access, the bootstrap is idempotent, and workspaces stay isolated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb, testAuth, run, one, all, APP_URL } from './_bloomops-db.mjs';
import { assessReport, bootstrapInput, bootstrapPlan, maskEmail, runBootstrap, slugify } from '../lib/bloomops/bootstrap.mjs';
import {
  ROLE_LABELS,
  canManageMembers,
  legacyRole,
  listWorkspaceMembers,
  normalizeEmail,
  resolveWorkspaceAccess,
  setMembershipStatus,
} from '../lib/bloomops/membership.mjs';
import { getAccess, getAccessOrProblem, requireAccess, requireIdentity } from '../lib/bloomops/access.mjs';
import { getWorkspace } from '../lib/workspace.mjs';
import * as schema from '../lib/bloomops/schema.mjs';

const BOOT = {
  workspaceName: "Ellen's Agency",
  owner: { email: 'Owner@Example.com', name: 'Ellen Example' },
  admin: { email: 'admin@example.com', name: 'Ary Example' },
};

function snapshot(raw) {
  return JSON.stringify({
    workspaces: all(raw, 'SELECT id, name, slug, status FROM workspaces ORDER BY id'),
    users: all(raw, 'SELECT id, name, email, email_verified FROM user ORDER BY email'),
    memberships: all(raw, 'SELECT id, workspace_id, user_id, role, status FROM workspace_memberships ORDER BY id'),
    events: all(raw, 'SELECT id, event_type, subject_type, subject_id FROM activity_events ORDER BY id'),
  });
}

// ── bootstrap ────────────────────────────────────────────────────────────

test('bootstrap validates its inputs and never guesses an address', () => {
  assert.throws(() => bootstrapInput({ workspaceName: 'X', owner: { email: 'a@b.co' }, admin: { email: '' } }), /Admin email/);
  assert.throws(() => bootstrapInput({ workspaceName: 'X', owner: { email: 'not an email' }, admin: { email: 'a@b.co' } }), /Owner email/);
  assert.throws(() => bootstrapInput({ workspaceName: '', owner: { email: 'a@b.co' }, admin: { email: 'c@d.co' } }), /Workspace name/);
  assert.throws(() => bootstrapInput({ workspaceName: 'X', owner: { email: 'same@b.co' }, admin: { email: 'Same@B.co' } }), /different people/);
  assert.throws(() => bootstrapInput({ workspaceName: 'X', workspaceSlug: 'Bad Slug!', owner: { email: 'a@b.co' }, admin: { email: 'c@d.co' } }), /slug/);
  const ok = bootstrapInput(BOOT);
  assert.equal(ok.workspaceSlug, 'ellen-s-agency');
  assert.equal(ok.owner.email, 'owner@example.com');
  assert.equal(slugify('  BloomOps Staging!! '), 'bloomops-staging');
  assert.equal(maskEmail('ellen@example.com'), 'e***@example.com');
});

test('the bootstrap plan is literal SQL with quotes escaped and no control characters', () => {
  const plan = bootstrapPlan({ workspaceName: "O'Brien & Co", owner: { email: 'obrien@example.com', name: "Pat O'Brien" }, admin: { email: 'admin@example.com', name: 'A' } });
  assert.ok(plan.statements.every((s) => s.endsWith(';')));
  assert.ok(plan.statements.some((s) => s.includes("'O''Brien & Co'")));
  assert.ok(plan.statements.some((s) => s.includes("'Pat O''Brien'")));
  assert.throws(() => bootstrapPlan({ workspaceName: 'X', owner: { email: "o'brien@example.com" }, admin: { email: 'admin@example.com' } }), /Owner email/, 'quotes in an address are refused, never escaped');
  assert.throws(() => bootstrapPlan({ workspaceName: 'X\u0000Y', owner: { email: 'a@b.co' }, admin: { email: 'c@d.co' } }), /control characters/);
  assert.equal(plan.statements.filter((s) => /NOT EXISTS/.test(s)).length, plan.statements.length, 'every statement is guarded');
});

test('bootstrap creates one workspace, two identities, Owner and Admin memberships, and is idempotent', async () => {
  const t = testDb();
  const first = await runBootstrap(t.d1, BOOT);
  assert.equal(first.report.ok, true);
  assert.deepEqual(first.report.memberships.map((m) => `${m.label}:${m.role}:${m.status}`), ['Owner:owner:active', 'Admin:admin:active']);
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM workspaces').n, 1);
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM user').n, 2);
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM workspace_memberships').n, 2);
  assert.equal(one(t.raw, "SELECT COUNT(*) AS n FROM activity_events WHERE event_type = 'WORKSPACE_CREATED'").n, 1);
  assert.equal(one(t.raw, "SELECT COUNT(*) AS n FROM activity_events WHERE event_type = 'MEMBERSHIP_CREATED'").n, 2);
  assert.equal(one(t.raw, 'SELECT name FROM workspaces').name, "Ellen's Agency");
  assert.equal(one(t.raw, "SELECT name FROM user WHERE email = 'owner@example.com'").name, 'Ellen Example');
  assert.equal(one(t.raw, "SELECT email_verified FROM user WHERE email = 'owner@example.com'").email_verified, 0, 'nothing is verified until the person clicks a link');

  const before = snapshot(t.raw);
  const second = await runBootstrap(t.d1, BOOT);
  assert.equal(second.report.ok, true);
  assert.equal(snapshot(t.raw), before, 'a second run changes nothing');
  const third = await runBootstrap(t.d1, { ...BOOT, owner: { email: 'OWNER@example.com', name: 'Renamed' } });
  assert.equal(third.report.ok, true);
  assert.equal(snapshot(t.raw), before, 'different casing and a new name do not create or rewrite anything');
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM workspace_memberships').n, 2, 'no duplicate Owner or Admin');
});

test('bootstrap never rewrites an existing membership and reports the difference', async () => {
  const t = testDb();
  await runBootstrap(t.d1, BOOT);
  run(t.raw, "UPDATE workspace_memberships SET role = 'team_member' WHERE user_id = (SELECT id FROM user WHERE email = 'admin@example.com')");
  const again = await runBootstrap(t.d1, BOOT);
  assert.equal(again.report.ok, false);
  const admin = again.report.memberships.find((m) => m.label === 'Admin');
  assert.equal(admin.role, 'team_member');
  assert.equal(admin.expectedRole, 'admin');
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM workspace_memberships').n, 2);
  assert.deepEqual(assessReport(bootstrapInput(BOOT), []).memberships.map((m) => m.role), [null, null]);
});

test('bootstrap identities can be invited nowhere else and gain nothing in a second workspace', async () => {
  const t = testDb();
  await runBootstrap(t.d1, BOOT);
  await runBootstrap(t.d1, { workspaceName: 'Second Agency', owner: { email: 'second-owner@example.com' }, admin: { email: 'second-admin@example.com' } });
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM workspaces').n, 2);
  const ellen = one(t.raw, "SELECT id FROM user WHERE email = 'owner@example.com'");
  const access = await resolveWorkspaceAccess(t.db, ellen.id);
  assert.equal(access.workspace.slug, 'ellen-s-agency');
  assert.equal(await resolveWorkspaceAccess(t.db, ellen.id, { workspaceId: one(t.raw, "SELECT id FROM workspaces WHERE slug = 'second-agency'").id }), null);
});

// ── membership ───────────────────────────────────────────────────────────

test('roles are persisted exactly as the five BloomOps roles and nothing else', async () => {
  const t = testDb();
  await runBootstrap(t.d1, BOOT);
  const ws = one(t.raw, 'SELECT id FROM workspaces');
  assert.deepEqual(schema.WORKSPACE_ROLES, ['owner', 'admin', 'project_manager', 'team_member', 'client']);
  assert.deepEqual(Object.keys(ROLE_LABELS), schema.WORKSPACE_ROLES);
  assert.deepEqual(schema.MEMBERSHIP_STATUSES, ['invited', 'active', 'suspended', 'removed']);
  assert.deepEqual(schema.INVITATION_STATUSES, ['pending', 'accepted', 'expired', 'revoked']);
  for (const [i, role] of schema.WORKSPACE_ROLES.entries()) {
    run(t.raw, 'INSERT INTO user (id, name, email) VALUES (?, ?, ?)', `u${i}`, role, `role-${role}@example.com`);
    run(t.raw, 'INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status) VALUES (?, ?, ?, ?, ?)', `m${i}`, ws.id, `u${i}`, role, 'active');
    const access = await resolveWorkspaceAccess(t.db, `u${i}`);
    assert.equal(access.membership.role, role);
    assert.equal(legacyRole(role), role === 'owner' || role === 'admin' ? 'admin' : 'user');
    assert.equal(canManageMembers(access.membership), role === 'owner' || role === 'admin');
  }
  assert.throws(() => run(t.raw, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role) VALUES ('bad', ?, 'u0', 'superuser')", ws.id), /CHECK/);
  assert.throws(() => run(t.raw, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status) VALUES ('bad', ?, 'u0', 'client', 'banned')", ws.id), /CHECK/);
  const listed = await listWorkspaceMembers(t.db, ws.id);
  assert.equal(listed.length, 7);
  assert.ok(listed.every((m) => m.email && m.role && m.status));
});

test('normalised email is the identity key', () => {
  assert.equal(normalizeEmail('  Ellen@Example.COM '), 'ellen@example.com');
  assert.equal(normalizeEmail('nope'), null);
  assert.equal(normalizeEmail("o'brien@example.com"), null, 'quotes are refused rather than escaped into SQL');
  assert.equal(normalizeEmail(''), null);
});

test('suspend, reinstate, remove: transitions, guards, and history', async () => {
  const t = testDb();
  await runBootstrap(t.d1, BOOT);
  const ws = one(t.raw, 'SELECT id FROM workspaces');
  const owner = one(t.raw, "SELECT m.* FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE u.email = 'owner@example.com'");
  const admin = one(t.raw, "SELECT m.* FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE u.email = 'admin@example.com'");
  const actor = { id: owner.id, userId: owner.user_id, role: 'owner', status: 'active' };

  assert.equal((await setMembershipStatus(t.db, { workspaceId: ws.id, membershipId: owner.id, status: 'suspended', actorMembership: actor })).reason, 'self');
  assert.equal((await setMembershipStatus(t.db, { workspaceId: ws.id, membershipId: owner.id, status: 'removed', actorMembership: { id: admin.id, userId: admin.user_id } })).reason, 'last_owner');
  assert.equal((await setMembershipStatus(t.db, { workspaceId: ws.id, membershipId: admin.id, status: 'banned', actorMembership: actor })).reason, 'invalid_status');
  assert.equal((await setMembershipStatus(t.db, { workspaceId: 'ws_nope', membershipId: admin.id, status: 'suspended', actorMembership: actor })).reason, 'not_found');

  const s = await setMembershipStatus(t.db, { workspaceId: ws.id, membershipId: admin.id, status: 'suspended', actorMembership: actor });
  assert.ok(s.ok);
  assert.equal(s.membership.status, 'suspended');
  assert.ok(s.membership.suspendedAt);
  assert.equal(await resolveWorkspaceAccess(t.db, admin.user_id), null, 'suspended: no access');

  const r = await setMembershipStatus(t.db, { workspaceId: ws.id, membershipId: admin.id, status: 'active', actorMembership: actor });
  assert.ok(r.ok);
  assert.equal(r.membership.suspendedAt, null);
  assert.equal((await resolveWorkspaceAccess(t.db, admin.user_id)).membership.role, 'admin', 'reinstated with the same role');

  const rm = await setMembershipStatus(t.db, { workspaceId: ws.id, membershipId: admin.id, status: 'removed', actorMembership: actor });
  assert.ok(rm.ok);
  assert.equal(await resolveWorkspaceAccess(t.db, admin.user_id), null, 'removed: no access');
  assert.equal((await setMembershipStatus(t.db, { workspaceId: ws.id, membershipId: admin.id, status: 'active', actorMembership: actor })).reason, 'removed', 'removed is terminal without a new invitation');

  const types = all(t.raw, 'SELECT event_type FROM activity_events ORDER BY occurred_at, id').map((e) => e.event_type);
  assert.deepEqual(types.filter((x) => x.startsWith('MEMBERSHIP_')).slice(2), ['MEMBERSHIP_SUSPENDED', 'MEMBERSHIP_REINSTATED', 'MEMBERSHIP_REMOVED']);
  assert.throws(() => run(t.raw, "DELETE FROM activity_events"), /immutable|abort|constraint/i, 'history cannot be erased');
});

test('an identity with no membership, a suspended one, or a removed one is denied by requireAccess and getWorkspace', async () => {
  const t = testAuth();
  await runBootstrap(t.d1, BOOT);
  const ws = one(t.raw, 'SELECT id FROM workspaces');
  const owner = one(t.raw, "SELECT m.* FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE u.email = 'owner@example.com'");

  // A person with an identity and no membership: seeded directly, the way a
  // deleted-then-orphaned identity would look.
  run(t.raw, "INSERT INTO user (id, name, email, email_verified) VALUES ('u_orphan', 'Orphan', 'orphan@example.com', 1)");
  const orphan = await t.signIn('orphan@example.com');
  const req = (cookie, method = 'GET') => new Request(`${APP_URL}/api/bloomops/me`, { method, headers: { cookie, ...(method === 'GET' ? {} : { origin: APP_URL }) } });

  const denied = await requireAccess(req(orphan.cookie), { env: t.env });
  assert.equal(denied.response.status, 403);
  assert.equal((await denied.response.json()).error, 'This account has no active workspace access.');
  const identityOnly = await requireIdentity(req(orphan.cookie), { env: t.env });
  assert.ok(identityOnly.access, 'identity alone is enough for the invitation-acceptance route');
  assert.equal(await getWorkspace(req(orphan.cookie), { env: t.env }), null, 'the inherited routes see nobody');

  const anonymous = await requireAccess(req(''), { env: t.env });
  assert.equal(anonymous.response.status, 401);
  assert.equal(await getWorkspace(req(''), { env: t.env }), null);

  const admin = await t.signIn('admin@example.com');
  const ok = await requireAccess(req(admin.cookie), { manageMembers: true, env: t.env });
  assert.equal(ok.access.membership.role, 'admin');
  const legacy = await getWorkspace(req(admin.cookie), { env: t.env });
  assert.equal(legacy.workspace, 'ellen-s-agency');
  assert.equal(legacy.role, 'admin');
  assert.equal(legacy.membershipRole, 'admin');

  await setMembershipStatus(t.db, { workspaceId: ws.id, membershipId: ok.access.membership.id, status: 'suspended', actorMembership: { id: owner.id, userId: owner.user_id } });
  assert.equal((await requireAccess(req(admin.cookie), { env: t.env })).response.status, 403, 'suspended: 403 on the very next request');
  assert.equal(await getWorkspace(req(admin.cookie), { env: t.env }), null);
  assert.ok(await t.session(admin.cookie), 'while the identity session is still valid');

  await setMembershipStatus(t.db, { workspaceId: ws.id, membershipId: ok.access.membership.id, status: 'active', actorMembership: { id: owner.id, userId: owner.user_id } });
  await setMembershipStatus(t.db, { workspaceId: ws.id, membershipId: ok.access.membership.id, status: 'removed', actorMembership: { id: owner.id, userId: owner.user_id } });
  assert.equal((await requireAccess(req(admin.cookie), { env: t.env })).response.status, 403, 'removed: 403');

  const cross = await requireAccess(req(orphan.cookie, 'POST'), { env: t.env });
  assert.equal(cross.response.status, 403);
});

test('server components can hand over Next\'s read-only headers object', async () => {
  const t = testAuth();
  await runBootstrap(t.d1, BOOT);
  const { cookie } = await t.signIn('owner@example.com');
  // Next's headers() is an adapter, not a Headers instance: get and forEach only.
  const store = new Map([['cookie', cookie], ['host', 'localhost:3000']]);
  const readOnly = { get: (k) => store.get(k) ?? null, forEach: (fn) => store.forEach((v, k) => fn(v, k)) };
  const access = await getAccess(readOnly, { env: t.env });
  assert.equal(access?.membership?.role, 'owner');
  const getOnly = { get: (k) => store.get(k) ?? null };
  assert.equal((await getAccess(getOnly, { env: t.env }))?.membership?.role, 'owner');
  // On the server-component path the forwarded protocol reads https even on
  // a loopback host; the cookie was set under the plain-http name and must
  // still be found.
  const forwarded = new Headers({ cookie, host: 'localhost:3000', 'x-forwarded-proto': 'https' });
  assert.equal((await getAccess(forwarded, { env: t.env }))?.membership?.role, 'owner');
  assert.equal(await getAccess({ get: () => null }, { env: t.env }), null);
});

test('an unconfigured deployment answers 503 on routes and "not configured" on pages, never 500 and never a session', async () => {
  const t = testAuth();
  await runBootstrap(t.d1, BOOT);
  const { cookie } = await t.signIn('owner@example.com');
  const unconfigured = { BLOOMOPS_ENV: 'staging', BLOOMOPS_APP_URL: 'https://staging.example', DB: t.d1 };
  const req = new Request('https://staging.example/api/bloomops/me', { headers: { cookie } });
  const denied = await requireAccess(req, { env: unconfigured });
  assert.equal(denied.response.status, 503);
  assert.deepEqual(await denied.response.json(), { error: 'Authentication is not configured on this deployment.' });
  assert.equal((await requireIdentity(req, { env: unconfigured })).response.status, 503);
  assert.deepEqual(await getAccessOrProblem(req, { env: unconfigured }), { access: null, configured: false });
  assert.equal(await getWorkspace(req, { env: unconfigured }), null);
  await assert.rejects(() => getAccess(req, { env: unconfigured }), /BLOOMOPS_AUTH_SECRET/, 'the raw call still throws the configuration error');
  // Any other failure still surfaces.
  await assert.rejects(() => getAccessOrProblem(req, { env: { ...t.env, DB: null } }), /D1 binding/);
});

test('a team member cannot manage members, and a cross-site origin is refused on writes', async () => {
  const t = testAuth();
  await runBootstrap(t.d1, BOOT);
  const ws = one(t.raw, 'SELECT id FROM workspaces');
  run(t.raw, "INSERT INTO user (id, name, email, email_verified) VALUES ('u_tm', 'TM', 'tm@example.com', 1)");
  run(t.raw, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status) VALUES ('m_tm', ?, 'u_tm', 'team_member', 'active')", ws.id);
  const tm = await t.signIn('tm@example.com');
  const read = await requireAccess(new Request(`${APP_URL}/api/bloomops/me`, { headers: { cookie: tm.cookie } }), { env: t.env });
  assert.equal(read.access.membership.role, 'team_member');
  const manage = await requireAccess(new Request(`${APP_URL}/api/bloomops/invitations`, { method: 'POST', headers: { cookie: tm.cookie, origin: APP_URL } }), { manageMembers: true, env: t.env });
  assert.equal(manage.response.status, 403);
  const owner = await t.signIn('owner@example.com');
  const foreign = await requireAccess(new Request(`${APP_URL}/api/bloomops/invitations`, { method: 'POST', headers: { cookie: owner.cookie, origin: 'https://evil.example' } }), { manageMembers: true, env: t.env });
  assert.equal(foreign.response.status, 403);
  const same = await requireAccess(new Request(`${APP_URL}/api/bloomops/invitations`, { method: 'POST', headers: { cookie: owner.cookie, origin: APP_URL } }), { manageMembers: true, env: t.env });
  assert.ok(same.access);
});

// ── isolation ────────────────────────────────────────────────────────────

test('workspace isolation holds across memberships, invitations, and activity', async () => {
  const t = testDb();
  await runBootstrap(t.d1, BOOT);
  await runBootstrap(t.d1, { workspaceName: 'Agency B', owner: { email: 'b-owner@example.com' }, admin: { email: 'b-admin@example.com' } });
  const a = one(t.raw, "SELECT id FROM workspaces WHERE slug = 'ellen-s-agency'");
  const b = one(t.raw, "SELECT id FROM workspaces WHERE slug = 'agency-b'");
  const aOwner = one(t.raw, "SELECT m.* FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE u.email = 'owner@example.com'");
  const bOwner = one(t.raw, "SELECT m.* FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE u.email = 'b-owner@example.com'");

  // B's owner cannot suspend A's owner: the membership is not in B.
  assert.equal((await setMembershipStatus(t.db, { workspaceId: b.id, membershipId: aOwner.id, status: 'suspended', actorMembership: bOwner })).reason, 'not_found');
  assert.equal((await listWorkspaceMembers(t.db, b.id)).length, 2);
  // An invitation in A cannot name B's membership as its inviter.
  assert.throws(
    () => run(t.raw, "INSERT INTO workspace_invitations (workspace_id, email, role, token_hash, expires_at, invited_by_membership_id) VALUES (?, 'x@example.com', 'client', 'h', '2099-01-01T00:00:00.000Z', ?)", a.id, bOwner.id),
    /FOREIGN KEY/,
  );
  // An activity event in A cannot name B's membership as its actor.
  assert.throws(
    () => run(t.raw, "INSERT INTO activity_events (workspace_id, event_type, subject_type, subject_id, actor_membership_id) VALUES (?, 'MEMBERSHIP_SUSPENDED', 'membership', 'x', ?)", a.id, bOwner.id),
    /FOREIGN KEY/,
  );
  // The same person in both workspaces resolves to the earliest membership,
  // and a specific workspace can be asked for.
  run(t.raw, "INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, created_at) VALUES ('m_cross', ?, ?, 'team_member', 'active', '2099-01-01T00:00:00.000Z')", b.id, aOwner.user_id);
  assert.equal((await resolveWorkspaceAccess(t.db, aOwner.user_id)).workspace.id, a.id);
  assert.equal((await resolveWorkspaceAccess(t.db, aOwner.user_id, { workspaceId: b.id })).membership.role, 'team_member');
  // A suspended workspace denies everyone in it.
  run(t.raw, "UPDATE workspaces SET status = 'suspended' WHERE id = ?", b.id);
  assert.equal(await resolveWorkspaceAccess(t.db, bOwner.user_id), null);
});
