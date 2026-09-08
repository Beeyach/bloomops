import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testDb, run, one, all } from './_bloomops-db.mjs';
import { runBootstrap } from '../lib/bloomops/bootstrap.mjs';
import {
  createInvitation,
  acceptInvitation,
  resendInvitation,
  revokeInvitation,
  lookupInvitation,
  INVITATION_TTL_MS,
} from '../lib/bloomops/invitations.mjs';
import { setMembershipStatus } from '../lib/bloomops/membership.mjs';

async function setup() {
  const t = testDb();
  await runBootstrap(t.d1, {
    workspaceName: 'Hardening',
    owner: { email: 'owner@example.com' },
    admin: { email: 'admin@example.com' },
  });
  t.ws = one(t.raw, 'SELECT id FROM workspaces').id;
  t.admin = one(t.raw, "SELECT * FROM workspace_memberships WHERE role='admin'");
  t.person = (id) => {
    run(t.raw, 'INSERT INTO user(id,name,email) VALUES(?,?,?)', id, id, `${id}@example.com`);
    return { id, email: `${id}@example.com` };
  };
  t.user = t.person('invited');
  t.invite = await createInvitation(t.db, { workspaceId: t.ws, email: t.user.email, role: 'team_member' });
  t.options = { workspaceId: t.ws, invitationId: t.invite.invitation.id };
  t.snapshot = () =>
    ['workspace_invitations', 'workspace_memberships', 'activity_events'].map((table) =>
      all(t.raw, `SELECT * FROM ${table} ORDER BY rowid`),
    );
  return t;
}
// Interleave a real writer after validation but before the next write. All
// SQL and transactions still execute on SQLite through the production driver.
function beforeWrite(t, effect) {
  const prepare = t.d1.prepare.bind(t.d1);
  let armed = true;
  const batch = t.db.batch.bind(t.db);
  t.db.batch = async (writes) => {
    if (armed) {
      armed = false;
      await effect();
    }
    return batch(writes);
  };
  t.d1.prepare = (query) => {
    const stmt = prepare(query);
    const wrap = (s) =>
      new Proxy(s, {
        get(target, key) {
          if (key === 'bind') return (...params) => wrap(target.bind(...params));
          if (['run', 'all', 'raw'].includes(key))
            return async (...args) => {
              if (armed && /^\s*(insert|update|delete)/i.test(query)) {
                armed = false;
                await effect();
              }
              return target[key](...args);
            };
          return target[key];
        },
      });
    return wrap(stmt);
  };
}
for (const action of ['rotate', 'revoke', 'inactive'])
  test(`generic acceptance refuses ${action} winning after validation without granting membership`, async () => {
    const t = await setup();
    beforeWrite(t, async () => {
      if (action === 'rotate') assert.equal((await resendInvitation(t.db, t.options)).ok, true);
      if (action === 'revoke') assert.equal((await revokeInvitation(t.db, t.options)).ok, true);
      if (action === 'inactive') run(t.raw, "UPDATE workspaces SET status='suspended' WHERE id=?", t.ws);
    });
    const r = await acceptInvitation(t.db, { token: t.invite.token, user: t.user });
    assert.equal(r.ok, false);
    assert.equal(one(t.raw, 'SELECT count(*) n FROM workspace_memberships WHERE user_id=?', t.user.id).n, 0);
    assert.equal(
      one(t.raw, "SELECT count(*) n FROM activity_events WHERE event_type='INVITATION_ACCEPTED'").n,
      0,
    );
  });
for (const event of ['INVITATION_ACCEPTED', 'MEMBERSHIP_CREATED'])
  test(`generic acceptance rolls back on late ${event} failure`, async () => {
    const t = await setup(),
      before = t.snapshot();
    t.raw.exec(
      `CREATE TRIGGER fail_event BEFORE INSERT ON activity_events WHEN NEW.event_type='${event}' BEGIN SELECT RAISE(ABORT,'injected late failure'); END`,
    );
    await assert.rejects(acceptInvitation(t.db, { token: t.invite.token, user: t.user }));
    assert.deepEqual(t.snapshot(), before);
  });
for (const [operation, event] of [
  ['resend', 'INVITATION_RESENT'],
  ['revoke', 'INVITATION_REVOKED'],
  ['expire', 'INVITATION_EXPIRED'],
])
  test(`${operation} and its event commit or roll back together`, async () => {
    const t = await setup(),
      before = t.snapshot();
    t.raw.exec(
      `CREATE TRIGGER fail_event BEFORE INSERT ON activity_events WHEN NEW.event_type='${event}' BEGIN SELECT RAISE(ABORT,'injected late failure'); END`,
    );
    const request =
      operation === 'resend'
        ? resendInvitation(t.db, t.options)
        : operation === 'revoke'
          ? revokeInvitation(t.db, t.options)
          : lookupInvitation(t.db, t.invite.token, { now: new Date(Date.now() + INVITATION_TTL_MS + 1000) });
    await assert.rejects(request);
    assert.deepEqual(t.snapshot(), before);
  });
test('concurrent generic acceptance creates one membership and one acceptance fact', async () => {
  const t = await setup();
  const results = await Promise.all(
    Array.from({ length: 4 }, () => acceptInvitation(t.db, { token: t.invite.token, user: t.user })),
  );
  assert.ok(results.every((r) => r.ok));
  assert.equal(new Set(results.map((r) => r.membership.id)).size, 1);
  for (const type of ['INVITATION_ACCEPTED', 'MEMBERSHIP_CREATED'])
    assert.equal(
      one(
        t.raw,
        'SELECT count(*) n FROM activity_events WHERE event_type=? AND actor_user_id=?',
        type,
        t.user.id,
      ).n,
      1,
    );
});
test('accepted token retry cannot report active access after membership suspension or workspace deactivation', async () => {
  const t = await setup();
  assert.equal((await acceptInvitation(t.db, { token: t.invite.token, user: t.user })).ok, true);
  run(t.raw, "UPDATE workspace_memberships SET status='suspended' WHERE user_id=?", t.user.id);
  assert.equal((await acceptInvitation(t.db, { token: t.invite.token, user: t.user })).ok, false);
  run(t.raw, "UPDATE workspace_memberships SET status='active' WHERE user_id=?", t.user.id);
  run(t.raw, "UPDATE workspaces SET status='archived' WHERE id=?", t.ws);
  assert.equal((await acceptInvitation(t.db, { token: t.invite.token, user: t.user })).ok, false);
});
test('membership change rolls back if its history cannot be recorded', async () => {
  const t = await setup();
  const target = one(t.raw, "SELECT * FROM workspace_memberships WHERE role='owner'");
  const before = t.snapshot();
  t.raw.exec(
    "CREATE TRIGGER fail_event BEFORE INSERT ON activity_events WHEN NEW.event_type='MEMBERSHIP_SUSPENDED' BEGIN SELECT RAISE(ABORT,'injected late failure'); END",
  );
  await assert.rejects(
    setMembershipStatus(t.db, {
      workspaceId: t.ws,
      membershipId: t.admin.id,
      status: 'suspended',
      actorMembership: target,
    }),
  );
  assert.deepEqual(t.snapshot(), before);
});
test('concurrent suspensions cannot remove both remaining Owners', async () => {
  const t = await setup();
  const user = t.person('second-owner');
  run(
    t.raw,
    "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('second-owner-member',?,?,'owner','active')",
    t.ws,
    user.id,
  );
  const owners = all(t.raw, "SELECT id FROM workspace_memberships WHERE role='owner'");
  const r = await Promise.all(
    owners.map((o) =>
      setMembershipStatus(t.db, {
        workspaceId: t.ws,
        membershipId: o.id,
        status: 'suspended',
        actorMembership: t.admin,
      }),
    ),
  );
  assert.equal(r.filter((x) => x.ok).length, 1);
  assert.equal(
    one(t.raw, "SELECT count(*) n FROM workspace_memberships WHERE role='owner' AND status='active'").n,
    1,
  );
  assert.equal(
    one(t.raw, "SELECT count(*) n FROM activity_events WHERE event_type='MEMBERSHIP_SUSPENDED'").n,
    1,
  );
});

test('stale expiration lookup cannot expire a newly rotated invitation', async () => {
  const t = await setup();
  const late = new Date(Date.now() + INVITATION_TTL_MS + 1000);
  let latest;
  beforeWrite(t, async () => {
    latest = await resendInvitation(t.db, {
      ...t.options,
      now: new Date(new Date(t.invite.invitation.expiresAt).getTime() - 1000),
    });
  });
  assert.equal((await lookupInvitation(t.db, t.invite.token, { now: late })).state, 'invalid');
  assert.equal(latest.ok, true);
  assert.equal((await lookupInvitation(t.db, latest.token, { now: late })).state, 'pending');
});

test('a stale generic revoke cannot record the wrong client after invitation retargeting wins', async () => {
  const t = await setup();
  run(
    t.raw,
    "INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES('retarget',?,'Retarget','retarget')",
    t.ws,
  );
  beforeWrite(t, async () => {
    assert.equal(
      (
        await createInvitation(t.db, {
          workspaceId: t.ws,
          email: t.user.email,
          role: 'client',
          clientId: 'retarget',
        })
      ).ok,
      true,
    );
  });
  assert.equal((await revokeInvitation(t.db, t.options)).ok, false);
  assert.equal(
    one(t.raw, 'SELECT status FROM workspace_invitations WHERE id=?', t.invite.invitation.id).status,
    'pending',
  );
  assert.equal(
    one(t.raw, "SELECT count(*) n FROM activity_events WHERE event_type='INVITATION_REVOKED'").n,
    0,
  );
});
