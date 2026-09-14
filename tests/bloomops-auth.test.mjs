// Better Auth as BloomOps configures it, exercised through its real request
// handler over a real SQLite database: magic links are delivered only to
// known or invited addresses, work once, expire, and never create an
// identity for an uninvited address, while the outward response to a
// sign-in request never says which case applied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testAuth, run, one, all, APP_URL } from './_bloomops-db.mjs';
import { runBootstrap } from '../lib/bloomops/bootstrap.mjs';
import { createInvitation, revokeInvitation } from '../lib/bloomops/invitations.mjs';
import { getAccess } from '../lib/bloomops/access.mjs';
import { setMembershipStatus } from '../lib/bloomops/membership.mjs';
import { AUTH_COOKIE_PREFIX, MAGIC_LINK_TTL_SECONDS } from '../lib/bloomops/auth-config.mjs';

const BOOT = {
  workspaceName: 'Test Agency',
  owner: { email: 'owner@example.com', name: 'Owner Person' },
  admin: { email: 'admin@example.com', name: 'Admin Person' },
};

async function booted(options) {
  const t = testAuth(options);
  await runBootstrap(t.d1, BOOT);
  return t;
}

const location = (res) => res.headers.get('location') || '';

test('profile photo pointer cannot be set through Better Auth; own name updates still work',async()=>{
  const t=await booted();const {cookie}=await t.signIn('owner@example.com');
  const update=body=>t.auth.handler(new Request(`${APP_URL}/api/auth/update-user`,{method:'POST',headers:{cookie,origin:APP_URL,'content-type':'application/json'},body:JSON.stringify(body)}));
  for(const image of ['https://example.com/photo.png',null])assert.equal((await update({image})).status,400);
  assert.equal((await update({name:'Updated Owner'})).status,200);
  assert.equal((await t.session(cookie)).user.name,'Updated Owner');
  assert.equal((await t.session(cookie)).user.image,null);
  t.raw.close();
});

test('a known address gets exactly one magic link email and the link signs them in', async () => {
  const t = await booted();
  const res = await t.requestMagicLink('Owner@Example.com');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: true });
  assert.equal(t.mailer.sent.length, 1);
  assert.equal(t.mailer.sent[0].to, 'owner@example.com');
  assert.match(t.mailer.sent[0].subject, /sign-in link/i);

  const link = t.mailer.sent[0].text.match(/https?:\/\/\S+/)[0];
  assert.ok(link.startsWith(`${APP_URL}/api/auth/magic-link/verify?token=`), 'the link points at the configured origin only');
  const verified = await t.follow(link);
  assert.equal(verified.status, 302);
  assert.equal(location(verified), `${APP_URL}/`);
  const cookie = t.cookieOf(verified);
  assert.match(cookie, new RegExp(`^${AUTH_COOKIE_PREFIX}\\.session_token=`));

  const session = await t.session(cookie);
  assert.equal(session.user.email, 'owner@example.com');
  assert.equal(session.user.emailVerified, true, 'the first click proves control of the mailbox');
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM session').n, 1);
});

test('magic link cookies are HttpOnly, SameSite=Lax, and Secure on https origins', async () => {
  const t = await booted();
  const { response } = await t.signIn('owner@example.com');
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.doesNotMatch(setCookie, /Secure/i, 'http://localhost in development is not marked Secure, or the browser would drop it');

  const s = testAuth({ env: { BLOOMOPS_ENV: 'staging', BLOOMOPS_APP_URL: 'https://staging.example' } });
  await runBootstrap(s.d1, BOOT);
  const res = await s.auth.handler(new Request('https://staging.example/api/auth/sign-in/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://staging.example' },
    body: JSON.stringify({ email: 'owner@example.com', callbackURL: '/' }),
  }));
  assert.equal(res.status, 200);
  const link = s.mailer.sent[0].text.match(/https?:\/\/\S+/)[0];
  assert.ok(link.startsWith('https://staging.example/api/auth/magic-link/verify'), 'links use the configured https origin');
  const verified = await s.follow(link);
  assert.match(verified.headers.get('set-cookie'), /^__Secure-bloomops\.session_token=.*Secure/i);
});

test('a magic link works exactly once', async () => {
  const t = await booted();
  const { cookie, link } = await t.signIn('owner@example.com');
  assert.ok(cookie);
  const again = await t.follow(link);
  assert.equal(again.status, 302);
  assert.match(location(again), /error=INVALID_TOKEN/);
  assert.equal(t.cookieOf(again), '', 'no second session cookie');
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM session').n, 1, 'one click, one session');
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM verification').n, 0, 'the token row is consumed');
});

test('an expired magic link is refused', async () => {
  const t = await booted();
  await t.requestMagicLink('owner@example.com');
  const link = t.mailer.sent[0].text.match(/https?:\/\/\S+/)[0];
  const row = one(t.raw, 'SELECT expires_at FROM verification');
  const ttlMs = row.expires_at - Date.now();
  assert.ok(ttlMs > (MAGIC_LINK_TTL_SECONDS - 60) * 1000 && ttlMs <= MAGIC_LINK_TTL_SECONDS * 1000, `link lives ${MAGIC_LINK_TTL_SECONDS}s`);
  run(t.raw, 'UPDATE verification SET expires_at = ?', Date.now() - 1000);
  const res = await t.follow(link);
  assert.equal(res.status, 302);
  assert.match(location(res), /error=INVALID_TOKEN/);
  assert.equal(t.cookieOf(res), '');
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM session').n, 0);
});

test('malformed and unknown tokens are refused without a session', async () => {
  const t = await booted();
  for (const token of ['', 'nope', 'a'.repeat(32), '%00', encodeURIComponent('../../etc')]) {
    const res = await t.follow(`${APP_URL}/api/auth/magic-link/verify?token=${token}&callbackURL=%2F&errorCallbackURL=%2Fsign-in`);
    assert.ok(res.status === 302 || res.status === 400, `token ${JSON.stringify(token)} -> ${res.status}`);
    if (res.status === 302) assert.match(location(res), /\/sign-in\?error=/);
    assert.equal(t.cookieOf(res), '');
  }
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM session').n, 0);
});

test('tokens are stored hashed, and no token or link is ever logged', async () => {
  const t = await booted();
  const logged = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => logged.push(a.map(String).join(' '));
  try {
    await t.requestMagicLink('owner@example.com');
  } finally {
    Object.assign(console, orig);
  }
  const link = t.mailer.sent[0].text.match(/https?:\/\/\S+/)[0];
  const token = new URL(link).searchParams.get('token');
  const stored = one(t.raw, 'SELECT identifier, value FROM verification');
  assert.notEqual(stored.identifier, token, 'the raw token is not in the database');
  assert.ok(!stored.value.includes(token));
  assert.ok(logged.every((line) => !line.includes(token)), 'nothing logged the token');
});

test('an unknown address gets the same response as a known one, no email, and no identity', async () => {
  const t = await booted();
  const known = await t.requestMagicLink('owner@example.com');
  const unknown = await t.requestMagicLink('stranger@example.com');
  assert.equal(known.status, unknown.status);
  assert.equal(await known.text(), await unknown.text());
  assert.deepEqual([...unknown.headers.keys()].filter((h) => h === 'set-cookie'), []);
  assert.equal(t.mailer.sent.length, 1, 'only the known address received mail');
  assert.equal(t.mailer.sent[0].to, 'owner@example.com');
  assert.equal(one(t.raw, "SELECT COUNT(*) AS n FROM user WHERE email = 'stranger@example.com'").n, 0);
  assert.equal(one(t.raw, "SELECT COUNT(*) AS n FROM workspace_memberships").n, 2, 'still only the two bootstrapped memberships');
});

test('an unknown address cannot gain an identity even if its token were somehow presented', async () => {
  const t = await booted();
  await t.requestMagicLink('stranger@example.com');
  // The token row exists (Better Auth writes it before asking us to send)
  // but nothing was delivered. Reconstruct what a click would look like by
  // reading the hashed row and presenting the only thing a holder could
  // present: a token that hashes to it. There is no such token to be had,
  // so instead prove the hook: invite, deliver, revoke, then click.
  assert.equal(t.mailer.sent.length, 0);
  const ws = one(t.raw, 'SELECT id FROM workspaces');
  const invited = await createInvitation(t.db, { workspaceId: ws.id, email: 'late@example.com', role: 'team_member' });
  assert.ok(invited.ok);
  await t.requestMagicLink('late@example.com');
  assert.equal(t.mailer.sent.length, 1, 'an invited address is known');
  const link = t.mailer.sent[0].text.match(/https?:\/\/\S+/)[0];
  await revokeInvitation(t.db, { workspaceId: ws.id, invitationId: invited.invitation.id });
  const res = await t.follow(link);
  assert.equal(res.status, 302);
  assert.match(location(res), /error=NOT_INVITED/);
  assert.equal(t.cookieOf(res), '');
  assert.equal(one(t.raw, "SELECT COUNT(*) AS n FROM user WHERE email = 'late@example.com'").n, 0, 'no identity was created');
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM session').n, 0);
});

test('an invited new person establishes an identity on first click, named from the invitation', async () => {
  const t = await booted();
  const ws = one(t.raw, 'SELECT id FROM workspaces');
  const invited = await createInvitation(t.db, { workspaceId: ws.id, email: 'New.Person@Example.com', role: 'project_manager', inviteeName: 'New Person' });
  assert.ok(invited.ok);
  const { cookie, response } = await t.signIn('new.person@example.com', { next: `/invite/${invited.token}` });
  assert.equal(location(response), `${APP_URL}/invite/${invited.token}`, 'lands back on the invitation');
  const user = one(t.raw, "SELECT name, email, email_verified FROM user WHERE email = 'new.person@example.com'");
  assert.deepEqual({ ...user }, { name: 'New Person', email: 'new.person@example.com', email_verified: 1 });
  const session = await t.session(cookie);
  assert.equal(session.user.email, 'new.person@example.com');
  // Identity is not membership: nothing was granted by signing in.
  const access = await getAccess(new Headers({ cookie }), { env: t.env, url: APP_URL });
  assert.equal(access.membership, null);
  assert.equal(access.workspace, null);
});

test('sign-out ends the session and the cookie stops working', async () => {
  const t = await booted();
  const { cookie } = await t.signIn('owner@example.com');
  const res = await t.auth.handler(new Request(`${APP_URL}/api/auth/sign-out`, {
    method: 'POST',
    headers: { cookie, origin: APP_URL, 'content-type': 'application/json' },
    body: '{}',
  }));
  assert.equal(res.status, 200);
  assert.equal(await t.session(cookie), null);
  assert.equal(one(t.raw, 'SELECT COUNT(*) AS n FROM session').n, 0);
});

test('a forged or foreign cookie is not a session', async () => {
  const t = await booted();
  const { cookie } = await t.signIn('owner@example.com');
  const [name, value] = cookie.split('=');
  const tampered = `${name}=${value.slice(0, -4)}AAAA`;
  assert.equal(await t.session(tampered), null);
  assert.equal(await t.session(`${name}=${value.split('.')[0]}.bogus`), null);
  assert.equal(await t.session('ltb_session=eyJ3IjoiYXJ5IiwiciI6ImFkbWluIn0.signature'), null, 'the inherited Leadsthatbloom cookie means nothing');

  const other = await booted({ env: { BLOOMOPS_AUTH_SECRET: 'a-completely-different-secret-value-0123456789' } });
  assert.equal(await other.session(cookie), null, 'a cookie signed with another secret is refused');
});

test('callback URLs are limited to the app origin and relative paths', async () => {
  const t = await booted();
  const res = await t.requestMagicLink('owner@example.com', { next: 'https://evil.example/steal' });
  assert.equal(res.status, 403, `status ${res.status}`);
  assert.equal(t.mailer.sent.length, 0);
  const ok = await t.requestMagicLink('owner@example.com', { next: '/clients' });
  assert.equal(ok.status, 200);
  const link = t.mailer.sent[0].text.match(/https?:\/\/\S+/)[0];
  const verified = await t.follow(link);
  assert.equal(location(verified), `${APP_URL}/clients`);
  const protocolRelative = await t.requestMagicLink('owner@example.com', { next: '//evil.example' });
  assert.equal(protocolRelative.status, 403);
});

test('a cross-site origin cannot request a magic link', async () => {
  const t = await booted();
  const res = await t.requestMagicLink('owner@example.com', { origin: 'https://evil.example' });
  assert.equal(res.status, 403);
  assert.equal(t.mailer.sent.length, 0);
});

test('without a mail transport sign-in reports the deployment as unconfigured, regardless of the address', async () => {
  const t = await booted({ mailer: { transport: 'none', ready: false, from: 'x', sent: [], async send() { throw new Error('no'); } } });
  const known = await t.requestMagicLink('owner@example.com');
  const unknown = await t.requestMagicLink('stranger@example.com');
  assert.equal(known.status, 503);
  assert.equal(unknown.status, 503);
  assert.equal(await known.text(), await unknown.text());
});

test('a mail delivery failure for a known address still looks like success and logs no address or link', async () => {
  const failing = { transport: 'resend', ready: true, from: 'x', sent: [], async send() { const e = new Error('Resend refused'); e.status = 422; e.errorName = 'validation_error'; throw e; } };
  const t = await booted({ mailer: failing });
  const logged = [];
  const origError = console.error;
  console.error = (...a) => logged.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
  let res;
  try {
    res = await t.requestMagicLink('owner@example.com');
  } finally {
    console.error = origError;
  }
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: true });
  assert.equal(logged.length, 1);
  assert.doesNotMatch(logged[0], /owner@example\.com|token=/);
});

test('the identity session survives suspension, but workspace access does not', async () => {
  const t = await booted();
  const { cookie } = await t.signIn('admin@example.com');
  const before = await getAccess(new Headers({ cookie }), { env: t.env, url: APP_URL });
  assert.equal(before.membership.role, 'admin');
  assert.equal(before.workspace.slug, 'test-agency');

  const ws = one(t.raw, 'SELECT id FROM workspaces');
  const owner = one(t.raw, "SELECT m.* FROM workspace_memberships m JOIN user u ON u.id = m.user_id WHERE u.email = 'owner@example.com'");
  const suspended = await setMembershipStatus(t.db, { workspaceId: ws.id, membershipId: before.membership.id, status: 'suspended', actorMembership: owner });
  assert.ok(suspended.ok);

  assert.ok(await t.session(cookie), 'Better Auth still recognises the identity');
  const after = await getAccess(new Headers({ cookie }), { env: t.env, url: APP_URL });
  assert.ok(after, 'still an identity');
  assert.equal(after.membership, null, 'but no workspace authority');
  assert.equal(after.workspace, null);

  const reinstated = await setMembershipStatus(t.db, { workspaceId: ws.id, membershipId: before.membership.id, status: 'active', actorMembership: owner });
  assert.ok(reinstated.ok);
  const back = await getAccess(new Headers({ cookie }), { env: t.env, url: APP_URL });
  assert.equal(back.membership.role, 'admin');

  const removed = await setMembershipStatus(t.db, { workspaceId: ws.id, membershipId: before.membership.id, status: 'removed', actorMembership: owner });
  assert.ok(removed.ok);
  const gone = await getAccess(new Headers({ cookie }), { env: t.env, url: APP_URL });
  assert.equal(gone.membership, null);
  assert.ok(await t.session(cookie), 'the identity session itself is untouched');
});

test('a bootstrapped identity signs in with its intended role, without a public sign-up', async () => {
  const t = await booted();
  const owner = await t.signIn('owner@example.com');
  const admin = await t.signIn('admin@example.com');
  const o = await getAccess(new Headers({ cookie: owner.cookie }), { env: t.env, url: APP_URL });
  const a = await getAccess(new Headers({ cookie: admin.cookie }), { env: t.env, url: APP_URL });
  assert.equal(o.membership.role, 'owner');
  assert.equal(a.membership.role, 'admin');
  assert.equal(o.workspace.id, a.workspace.id);
  // Better Auth's own sign-up and password endpoints are off.
  const signUp = await t.auth.handler(new Request(`${APP_URL}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: APP_URL },
    body: JSON.stringify({ email: 'anyone@example.com', password: 'password12345', name: 'Anyone' }),
  }));
  assert.ok(signUp.status >= 400, `sign-up/email answers ${signUp.status}`);
  assert.equal(one(t.raw, "SELECT COUNT(*) AS n FROM user WHERE email = 'anyone@example.com'").n, 0);
  assert.equal(all(t.raw, 'SELECT * FROM account').length, 0, 'magic-link sign-in creates no account rows');
});
