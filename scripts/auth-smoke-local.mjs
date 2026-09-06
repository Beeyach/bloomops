#!/usr/bin/env node
// End-to-end authentication smoke against a LOCAL BloomOps Worker.
//
//   npm run preview            # in one terminal (wrangler on :8787)
//   node scripts/auth-smoke-local.mjs [--url http://127.0.0.1:8787]
//
// Drives the real thing on workerd: request a magic link for the local
// Owner, read the email back from the development mail transport (the local
// R2 simulation, via `wrangler r2 object get --local`), click the link, use
// the session on inherited and BloomOps routes, invite a new person, sign
// them in through their invitation, accept it, prove the A4 fence (a Team
// Member reaches neither the inherited prospecting routes nor the
// inherited app at /legacy, and holds no capabilities) and the A5 shells
// (the Owner and the Team Member land in the BloomOps internal shell, the
// Owner is bounced from the portal, the Team Member gets the limited Team
// and Finance views), suspend them, watch
// access stop while their identity session survives, and sign out.
//
// Development only. It refuses any URL that is not loopback and needs the
// r2-dev transport, which the Worker itself refuses outside development. It
// bootstraps a local workspace with example.com addresses first, so it
// needs the local D1 migrated (npm run db:schema:local, db:migrate:local,
// db:domain:migrate:local). Nothing here works against staging or
// production: there is no development mailbox there to read.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';

const arg = (name, fallback = '') => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || '') : fallback;
};
const base = arg('--url', 'http://127.0.0.1:8787').replace(/\/+$/, '');
const host = new URL(base).hostname;
if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
  console.error('auth-smoke-local: only a loopback Worker can be smoked; the development mailbox exists nowhere else.');
  process.exit(2);
}

const OWNER = 'smoke-owner@example.com';
const ADMIN = 'smoke-admin@example.com';
const INVITEE = `smoke-invitee-${randomBytes(3).toString('hex')}@example.com`;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}
function must(name, ok, detail) {
  check(name, ok, detail);
  if (!ok) {
    console.error('auth-smoke-local: stopping at the first hard failure');
    process.exit(1);
  }
}

async function call(path, { method = 'GET', body = null, cookie = '', accept = 'application/json', origin = base } = {}) {
  const headers = { accept };
  if (cookie) headers.cookie = cookie;
  if (method !== 'GET') headers.origin = origin;
  if (body !== null) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: body === null ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  const cookies = setCookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
  return { status: res.status, json, text, headers: res.headers, cookies };
}

function wrangler(args) {
  return execFileSync('npx', ['--no-install', 'wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
}

// The development transport writes dev-mail/<sha256(recipient)>.json into
// the local bucket. Overwritten on every send, so read it after the request.
function readDevMail(recipient) {
  const key = `dev-mail/${createHash('sha256').update(recipient.trim().toLowerCase()).digest('hex')}.json`;
  const out = wrangler(['r2', 'object', 'get', `bloomops-files-dev/${key}`, '--local', '--pipe']);
  const start = out.indexOf('{');
  return JSON.parse(out.slice(start));
}

async function signIn(email, { next = '/' } = {}) {
  const req = await call('/api/auth/sign-in/magic-link', { method: 'POST', body: { email, callbackURL: next, newUserCallbackURL: next, errorCallbackURL: '/sign-in' } });
  must(`magic link requested for ${email}`, req.status === 200 && req.json?.status === true, `status ${req.status}`);
  const mail = readDevMail(email);
  const link = mail.text.match(/https?:\/\/\S+/)[0];
  must('the link points at this Worker', link.startsWith(`${base}/api/auth/magic-link/verify?token=`), link.split('?')[0]);
  const verified = await call(link.slice(base.length), { accept: 'text/html' });
  return { verified, link, cookie: verified.cookies };
}

// 0. Bootstrap the local workspace (idempotent).
execFileSync('node', ['scripts/bootstrap-workspace.mjs', '--local', '--workspace-name', 'Smoke Agency', '--owner-email', OWNER, '--owner-name', 'Smoke Owner', '--admin-email', ADMIN], { stdio: 'inherit' });

// 1. Front door.
{
  const h = await call('/api/health');
  must('/api/health reports development with auth configured and r2-dev mail', h.json?.environment === 'development' && h.json?.auth?.configured === true && h.json?.auth?.mail === 'r2-dev' && h.json?.schema?.ok === true, JSON.stringify(h.json));
  check('anonymous / redirects to /sign-in', (await call('/', { accept: 'text/html' })).status === 307);
  check('anonymous /api/infra is 401', (await call('/api/infra')).status === 401);
  const unknown = await call('/api/auth/sign-in/magic-link', { method: 'POST', body: { email: `nobody-${randomBytes(3).toString('hex')}@example.com`, callbackURL: '/' } });
  check('an unknown address gets the same 200 {status:true}', unknown.status === 200 && unknown.json?.status === true, `status ${unknown.status}`);
}

// 2. Owner signs in through a real link and uses the app.
const owner = await signIn(OWNER);
must('the link redirects home and sets the session cookie', owner.verified.status === 302 && /bloomops\.session_token=/.test(owner.cookie), `status ${owner.verified.status}`);
{
  const reuse = await call(owner.link.slice(base.length), { accept: 'text/html' });
  check('the same link cannot be used twice', reuse.status === 302 && /error=INVALID_TOKEN/.test(reuse.headers.get('location') || '') && !reuse.cookies, reuse.headers.get('location'));
  const me = await call('/api/bloomops/me', { cookie: owner.cookie });
  must('/api/bloomops/me shows the Owner membership', me.json?.membership?.role === 'owner' && me.json?.workspace?.slug === 'smoke-agency', JSON.stringify(me.json));
  check('the Owner holds every capability by role and may use the inherited app', JSON.stringify(me.json?.membership?.capabilities) === JSON.stringify(['members.manage', 'workspace.settings', 'templates.manage', 'finance.view', 'finance.edit']) && me.json?.membership?.legacyApp === true, JSON.stringify(me.json?.membership));
  const home = await call('/', { cookie: owner.cookie, accept: 'text/html' });
  check('the signed-in home page is the BloomOps internal shell for the Owner', home.status === 200 && /aria-label="Main"/.test(home.text) && /href="\/team"/.test(home.text) && !/Search prospects/.test(home.text) && !/sign-in-email/.test(home.text), `status ${home.status}`);
  const team = await call('/team', { cookie: owner.cookie, accept: 'text/html' });
  check('the Owner gets the Team directory with the invite action', team.status === 200 && /Invite someone/.test(team.text) && new RegExp(OWNER).test(team.text), `status ${team.status}`);
  const legacy = await call('/legacy', { cookie: owner.cookie, accept: 'text/html' });
  check('the inherited prospecting app still opens for the Owner at /legacy, off the navigation', legacy.status === 200 && !/aria-label="Main"/.test(legacy.text) && !/sign-in-email/.test(legacy.text), `status ${legacy.status}`);
  const portalAsOwner = await call('/portal', { cookie: owner.cookie, accept: 'text/html' });
  check('the Owner opening the portal is sent back to the internal app', portalAsOwner.status === 307 && /\/$/.test(portalAsOwner.headers.get('location') || ''), `status ${portalAsOwner.status} -> ${portalAsOwner.headers.get('location')}`);
  const infra = await call('/api/infra', { cookie: owner.cookie });
  check('/api/infra answers a member', infra.status === 200 && infra.json?.environment === 'development', `status ${infra.status}`);
  const pages = await call('/api/pages', { cookie: owner.cookie });
  check('inherited /api/pages is scoped to the workspace slug', pages.status === 200 && Array.isArray(pages.json?.pages), `status ${pages.status}, ${pages.json?.pages?.length} pages`);
  const signInPage = await call('/sign-in', { cookie: owner.cookie, accept: 'text/html' });
  check('a signed-in member visiting /sign-in is sent home', signInPage.status === 307 && /\/$/.test(signInPage.headers.get('location') || ''), `status ${signInPage.status}`);
}

// 3. Invite somebody new, sign them in through the invitation, accept.
let inviteeCookie = '';
let invitationId = '';
{
  const created = await call('/api/bloomops/invitations', { method: 'POST', cookie: owner.cookie, body: { email: INVITEE, role: 'team_member', name: 'Smoke Invitee' } });
  must('the Owner can create an invitation', created.status === 201 && created.json?.invitation?.status === 'pending' && created.json?.delivered === true, `status ${created.status} ${JSON.stringify(created.json)}`);
  invitationId = created.json.invitation.id;
  check('the invitation response never carries the token', !JSON.stringify(created.json).includes('token'));
  const mail = readDevMail(INVITEE);
  const inviteLink = mail.text.match(/https?:\/\/\S+\/invite\/\S+/)[0];
  const token = inviteLink.split('/invite/')[1];
  const page = await call(`/invite/${token}`, { accept: 'text/html' });
  check('the invitation page renders for a signed-out person', page.status === 200 && /Smoke Agency/.test(page.text) && /sign-in-email/.test(page.text), `status ${page.status}`);

  const invitee = await signIn(INVITEE, { next: `/invite/${token}` });
  must('the invited person establishes an identity and lands on the invitation', invitee.verified.status === 302 && /\/invite\//.test(invitee.verified.headers.get('location') || '') && invitee.cookie, `status ${invitee.verified.status}`);
  inviteeCookie = invitee.cookie;
  const before = await call('/api/bloomops/me', { cookie: inviteeCookie });
  check('identity without membership: /api/bloomops/me shows no workspace', before.status === 200 && before.json?.workspace === null, JSON.stringify(before.json));
  check('identity without membership: inherited routes refuse', (await call('/api/pages', { cookie: inviteeCookie })).status === 401);
  const wrong = await call('/api/bloomops/invitations/accept', { method: 'POST', cookie: owner.cookie, body: { token } });
  check('the Owner cannot accept the invitee\'s invitation', wrong.status === 403 && wrong.json?.reason === 'email_mismatch', `status ${wrong.status}`);
  const accepted = await call('/api/bloomops/invitations/accept', { method: 'POST', cookie: inviteeCookie, body: { token } });
  must('the invitee accepts', accepted.status === 200 && accepted.json?.membership?.role === 'team_member', `status ${accepted.status} ${JSON.stringify(accepted.json)}`);
  const again = await call('/api/bloomops/invitations/accept', { method: 'POST', cookie: inviteeCookie, body: { token } });
  check('accepting again is idempotent', again.status === 200 && again.json?.alreadyAccepted === true, `status ${again.status}`);
  const after = await call('/api/bloomops/me', { cookie: inviteeCookie });
  check('the invitee is now a Team Member', after.json?.membership?.role === 'team_member' && after.json?.membership?.canManageMembers === false, JSON.stringify(after.json?.membership));
  check('a Team Member holds no capability and may not use the inherited app', Array.isArray(after.json?.membership?.capabilities) && after.json.membership.capabilities.length === 0 && after.json?.membership?.legacyApp === false, JSON.stringify(after.json?.membership));
  const denied = await call('/api/bloomops/members', { cookie: inviteeCookie });
  check('a Team Member cannot list members', denied.status === 403 && denied.json?.error === 'You do not have permission to do that.' && !('reason' in (denied.json || {})), `status ${denied.status} ${denied.text.slice(0, 120)}`);
  const invite = await call('/api/bloomops/invitations', { method: 'POST', cookie: inviteeCookie, body: { email: 'nobody@example.com', role: 'team_member' } });
  check('a Team Member cannot invite', invite.status === 403, `status ${invite.status}`);
  check('a Team Member cannot reach the inherited prospecting routes', (await call('/api/pages', { cookie: inviteeCookie })).status === 401 && (await call('/api/prospects', { cookie: inviteeCookie })).status === 401 && (await call('/api/settings', { cookie: inviteeCookie })).status === 401);
  const teamHome = await call('/', { cookie: inviteeCookie, accept: 'text/html' });
  check('a Team Member lands in the BloomOps internal shell, not the prospecting app', teamHome.status === 200 && /aria-label="Main"/.test(teamHome.text) && /Smoke Agency/.test(teamHome.text) && !/Search prospects/.test(teamHome.text) && !/Nothing here yet/.test(teamHome.text), `status ${teamHome.status}`);
  const teamPage = await call('/team', { cookie: inviteeCookie, accept: 'text/html' });
  check('a Team Member gets the limited Team view without the directory', teamPage.status === 200 && /Your place in/.test(teamPage.text) && !/Invite someone/.test(teamPage.text) && !new RegExp(OWNER).test(teamPage.text), `status ${teamPage.status}`);
  const financePage = await call('/finance', { cookie: inviteeCookie, accept: 'text/html' });
  check('a Team Member sees Finance as not open to them', financePage.status === 200 && /not open to you/.test(financePage.text) && !/Renewals/.test(financePage.text), `status ${financePage.status}`);
  const legacyDenied = await call('/legacy', { cookie: inviteeCookie, accept: 'text/html' });
  check('a Team Member cannot open the inherited prospecting app', legacyDenied.status === 404, `status ${legacyDenied.status}`);
  check('the Owner still reaches the inherited routes', (await call('/api/prospects', { cookie: owner.cookie })).status === 200);
  check('the resend of an accepted invitation is refused', (await call(`/api/bloomops/invitations/${invitationId}/resend`, { method: 'POST', cookie: owner.cookie })).status === 409);
}

// 4. Suspend: identity survives, access stops.
{
  const members = await call('/api/bloomops/members', { cookie: owner.cookie });
  const invitee = (members.json?.members || []).find((m) => m.email === INVITEE);
  must('the Owner lists members including the invitee', Boolean(invitee), JSON.stringify(members.json).slice(0, 200));
  const suspended = await call(`/api/bloomops/members/${invitee.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'suspended' } });
  check('the Owner suspends the invitee', suspended.status === 200 && suspended.json?.membership?.status === 'suspended', `status ${suspended.status}`);
  const session = await call('/api/auth/get-session', { cookie: inviteeCookie });
  check('the suspended person still has an identity session', session.status === 200 && session.json?.user?.email === INVITEE);
  check('but /api/bloomops/me shows no workspace', (await call('/api/bloomops/me', { cookie: inviteeCookie })).json?.workspace === null);
  check('and inherited routes refuse them', (await call('/api/pages', { cookie: inviteeCookie })).status === 401);
  check('and the home page sends them to sign-in', (await call('/', { cookie: inviteeCookie, accept: 'text/html' })).status === 307);
  const self = await call(`/api/bloomops/members/${(await call('/api/bloomops/me', { cookie: owner.cookie })).json.membership.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'suspended' } });
  check('the Owner cannot suspend themselves', self.status === 400 && self.json?.reason === 'self');
  const foreign = await call(`/api/bloomops/members/${invitee.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'active' }, origin: 'https://evil.example' });
  check('a cross-site origin cannot change members', foreign.status === 403);
  const removed = await call(`/api/bloomops/members/${invitee.id}`, { method: 'PATCH', cookie: owner.cookie, body: { status: 'removed' } });
  check('the Owner removes the invitee', removed.status === 200 && removed.json?.membership?.status === 'removed');
}

// 5. Old login gone, sign-out works.
{
  const old = await call('/api/auth', { method: 'POST', body: { code: 'honeypetalbee' } });
  check('the inherited access-code login is gone', old.status !== 200 && !old.cookies, `status ${old.status}`);
  check('an inherited session cookie is worthless', (await call('/api/infra', { cookie: 'ltb_session=eyJ3IjoiYXJ5IiwiciI6ImFkbWluIn0.sig' })).status === 401);
  const out = await call('/api/auth/sign-out', { method: 'POST', cookie: owner.cookie, body: {} });
  check('sign-out answers', out.status === 200);
  check('the Owner cookie no longer opens anything', (await call('/api/bloomops/me', { cookie: owner.cookie })).status === 401);
}

console.log(failures === 0 ? 'auth-smoke-local: all checks passed' : `auth-smoke-local: ${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
