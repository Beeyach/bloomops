import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testAuth, run, one, APP_URL } from './_bloomops-db.mjs';
import { getAccess, getActor } from '../lib/bloomops/access.mjs';
import { getIdentity } from '../lib/bloomops/auth.mjs';
import { resolveWorkspaceAccess } from '../lib/bloomops/membership.mjs';
import { readWorkspaceIdentity, workspaceSessionDatabase } from '../lib/bloomops/workspace-session.mjs';
import { schema } from '../lib/bloomops/db.mjs';
import { eq, sql } from 'drizzle-orm';

async function scenario(context, prefix = '') {
  const t = testAuth(); context.after(() => t.raw.close());
  for (const id of ['a','b']) run(t.raw, 'INSERT INTO workspaces(id,name,slug) VALUES(?,?,?)', id, `${prefix}${id}`, id);
  for (const role of ['owner','admin']) {
    run(t.raw, 'INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)', role, `${prefix}${role}`, `${role}@example.com`);
    run(t.raw, "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status,created_at) VALUES(?,?,?,?, 'active','2026-01-01')", `m-${role}`, role === 'owner' ? 'a' : 'b', role, role);
  }
  t.cookies = {};
  for (const role of ['owner','admin']) t.cookies[role] = (await t.signIn(`${role}@example.com`)).cookie;
  t.read = role => getAccess(new Request(APP_URL + '/systems', { headers: { cookie: t.cookies[role] } }), { env: t.env });
  return t;
}

test('one joined request preserves exact canonical membership ordering, field decoding and unchanged identity DTOs', async context => {
  const t = await scenario(context);
  run(t.raw, "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status,created_at) VALUES('z-second','b','owner','team_member','active','2026-01-01')");
  const canonical = await resolveWorkspaceAccess(t.db, 'owner');
  let calls = 0; const original = t.d1.prepare;
  t.d1.prepare = sql => { calls++; return original(sql); };
  const access = await t.read('owner');
  assert.equal(calls, 1);
  assert.deepEqual({ membership: access.membership, workspace: access.workspace }, canonical);
  assert.equal(access.user.emailVerified, true); assert.ok(access.user.createdAt instanceof Date);
  assert.equal(access.membership.joinedAt, null); assert.equal(access.workspace.name, 'a');
  assert.ok(!JSON.stringify(access.user).includes('boWorkspace'));
  assert.ok(!JSON.stringify(access.session).includes('boWorkspace'));
  const ordinary = await getIdentity(t.auth, new Headers({ cookie: t.cookies.owner }));
  assert.deepEqual(access.user, ordinary.user); assert.deepEqual(access.session, ordinary.session);
});

for (const change of ['suspended','removed','workspace_suspended','workspace_archived','deleted']) test(`issued identity selects current access after ${change}`, async context => {
  const t = await scenario(context);
  assert.ok((await t.read('owner')).membership);
  if (change.startsWith('workspace_')) run(t.raw, 'UPDATE workspaces SET status=? WHERE id=?', change.slice(10), 'a');
  else if (change === 'deleted') run(t.raw, "DELETE FROM workspace_memberships WHERE id='m-owner'");
  else run(t.raw, "UPDATE workspace_memberships SET status=? WHERE id='m-owner'", change);
  const revoked = await t.read('owner');
  assert.ok(revoked.session); assert.equal(revoked.membership, null); assert.equal(revoked.workspace, null);
  run(t.raw, "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('new-membership','b','owner','team_member','active')");
  assert.equal((await t.read('owner')).membership.id, 'new-membership');
});

test('same auth factory observes current identity and capabilities with no metadata retained between requests', async context => {
  const t = await scenario(context);
  const before = await t.read('admin');
  run(t.raw, "INSERT INTO member_capabilities(workspace_id,membership_id,capability) VALUES('b','m-admin','finance.view')");
  assert.ok((await getActor(await t.read('admin'))).capabilities.has('finance.view'));
  run(t.raw, "DELETE FROM member_capabilities WHERE membership_id='m-admin'");
  run(t.raw, "UPDATE user SET name='Current' WHERE id='admin'");
  const after = await t.read('admin');
  assert.equal(after.user.name, 'Current'); assert.notEqual(after, before);
  assert.ok(!(await getActor(after)).capabilities.has('finance.view'));
});

test('forged cookie, expired session and deleted session never reuse captured membership', async context => {
  const t = await scenario(context);
  await t.read('owner');
  const cookie = t.cookies.owner;
  t.cookies.owner = cookie.replace(/.$/, character => character === 'a' ? 'b' : 'a');
  assert.equal(await t.read('owner'), null);
  t.cookies.owner = cookie;
  run(t.raw, "UPDATE session SET expires_at=? WHERE user_id='owner'", Date.now() - 1000);
  assert.equal(await t.read('owner'), null);
  assert.equal(one(t.raw, "SELECT count(*) n FROM session WHERE user_id='owner'").n, 0, 'Better Auth retains expired-session cleanup');
  run(t.raw, "DELETE FROM session WHERE user_id='admin'");
  assert.equal(await t.read('admin'), null);
});

test('Better Auth still refreshes a due session through its ordinary write path', async context => {
  const t = await scenario(context);
  run(t.raw, "UPDATE session SET expires_at=?, updated_at=? WHERE user_id='owner'", Date.now() + 86400000, Date.now() - 2 * 86400000);
  const access = await t.read('owner');
  assert.ok(access.session.expiresAt.getTime() > Date.now() + 20 * 86400000);
  assert.equal(access.membership.id, 'm-owner');
});

test('a session whose current user changes cannot retain its former workspace', async context => {
  const t = await scenario(context);
  assert.equal((await t.read('owner')).workspace.id, 'a');
  run(t.raw, "UPDATE session SET user_id='admin' WHERE user_id='owner'");
  const current = await t.read('owner');
  assert.equal(current.user.id, 'admin'); assert.equal(current.workspace.id, 'b');
  assert.equal(current.membership.id, 'm-admin');
});

test('deletion during a due Better Auth refresh cannot authorize captured membership', async context => {
  const t = await scenario(context);
  run(t.raw, "UPDATE session SET expires_at=? WHERE user_id='owner'", Date.now() + 86400000);
  const prepare = t.d1.prepare;
  t.d1.prepare = statement => {
    if (/^update "session"/i.test(statement)) run(t.raw, "DELETE FROM session WHERE user_id='owner'");
    return prepare(statement);
  };
  await assert.rejects(t.read('owner'));
});

test('concurrent users and separate D1 bindings cannot exchange membership captures', async context => {
  const a = await scenario(context, 'first-'), b = await scenario(context, 'second-');
  const operations = Array.from({ length: 12 }, (_, i) => ({ source: i % 2 ? a : b, role: i % 3 ? 'owner' : 'admin' }));
  const results = await Promise.all(operations.map(({ source, role }) => source.read(role)));
  results.forEach((access, i) => {
    const { source, role } = operations[i];
    assert.equal(access.user.id, role);
    assert.equal(access.membership.id, `m-${role}`);
    assert.equal(access.workspace.name, `${source === a ? 'first-' : 'second-'}${role === 'owner' ? 'a' : 'b'}`);
  });
});

test('unmatched or unsupported identity reads fall back without fabricating access; ordinary queries remain unchanged', async context => {
  const t = await scenario(context), db = workspaceSessionDatabase(t.db);
  assert.notEqual(db, t.db); assert.notEqual(db.query, t.db.query);
  const { identity, resolved } = await readWorkspaceIdentity(t.db, () => getIdentity(t.auth, new Headers({ cookie: t.cookies.owner })));
  assert.ok(identity); assert.ok(resolved);
  const outside = await db.query.session.findFirst({ where: eq(schema.session.userId, 'owner'), with: { user: true } });
  assert.equal(Object.hasOwn(outside, 'boWorkspace'), false);
  assert.deepEqual(await readWorkspaceIdentity(t.db, async () => null), { identity: null, resolved: undefined });
  const unsupported = await readWorkspaceIdentity(t.db, async () => ({ user: { id: 'owner' }, session: { id: 'unobserved' } }));
  assert.equal(unsupported.resolved, undefined);
  const preexistingExtras = await readWorkspaceIdentity(t.db, async () => {
    const session = await db.query.session.findFirst({ where: eq(schema.session.userId, 'owner'), with: { user: true },
      extras: { preserved: sql`1`.as('preserved') } });
    assert.equal(session.preserved, 1);
    assert.equal(Object.hasOwn(session, 'boWorkspace'), false);
    return { session, user: session.user };
  });
  assert.equal(preexistingExtras.resolved, undefined);
  for (const field of ['user', 'session']) {
    const mismatched = await readWorkspaceIdentity(t.db, async () => {
      const identity = await getIdentity(t.auth, new Headers({ cookie: t.cookies.owner }));
      return { ...identity, [field]: { ...identity[field], id: 'different-accepted-identity' } };
    });
    assert.equal(mismatched.resolved, undefined, 'a capture cannot authorize a different accepted identity');
  }
});

test('joined database failure rejects without a second membership query or partial access', async context => {
  const t = await scenario(context); let calls = 0;
  t.d1.prepare = () => { calls++; throw new Error('Synthetic read failure'); };
  await assert.rejects(t.read('owner'));
  assert.equal(calls, 1);
});
