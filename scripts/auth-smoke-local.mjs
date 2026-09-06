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
const PORTAL_CLIENT = `smoke-portal-${randomBytes(3).toString('hex')}@example.com`;
const CLIENT_NAME = `Smoke Client ${randomBytes(2).toString('hex')}`;
const CLIENT_CONTACT = `smoke-contact-${randomBytes(3).toString('hex')}@example.com`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  // wrangler's local server closes idle keep-alive sockets, and undici will
  // not replay a POST on one it finds closed. That is a transport hiccup
  // between this script and the dev server, not an answer from the Worker,
  // so the request is sent again on a fresh connection.
  let res = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      res = await fetch(base + path, { method, headers, body: body === null ? undefined : JSON.stringify(body), redirect: 'manual' });
      break;
    } catch (err) {
      if (err?.cause?.code !== 'UND_ERR_SOCKET' || attempt === 2) throw err;
      await sleep(250);
    }
  }
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

// Local D1 only, for the two things HTTP cannot do: seed a role the smoke
// needs (a Client membership) and read back what a route actually wrote.
function sql(command) {
  const out = wrangler(['d1', 'execute', 'DB', '--local', '--json', '--command', command]);
  const parsed = JSON.parse(out.slice(out.indexOf('[')));
  return parsed[0]?.results || [];
}
const sqlOne = (command) => sql(command)[0] || null;
const countRows = (table, where = '1=1') => Number(sqlOne(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`)?.n || 0);
const lit = (v) => `'${String(v).replace(/'/g, "''")}'`;

// The development transport writes dev-mail/<sha256(recipient)>.json into
// the local bucket. Overwritten on every send, so read it after the request.
function readDevMail(recipient) {
  const key = `dev-mail/${createHash('sha256').update(recipient.trim().toLowerCase()).digest('hex')}.json`;
  const out = wrangler(['r2', 'object', 'get', `bloomops-files-dev/${key}`, '--local', '--pipe']);
  const start = out.indexOf('{');
  return JSON.parse(out.slice(start));
}

async function signIn(email, { next = '/' } = {}) {
  let req = null;
  // Better Auth limits magic-link requests per minute. Several people sign
  // in during one smoke run, so a 429 is expected and waited out.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    req = await call('/api/auth/sign-in/magic-link', { method: 'POST', body: { email, callbackURL: next, newUserCallbackURL: next, errorCallbackURL: '/sign-in' } });
    if (req.status !== 429) break;
    console.log(`     magic link for ${email} was rate limited; waiting 15s`);
    await sleep(15000);
  }
  must(`magic link requested for ${email}`, req.status === 200 && req.json?.status === true, `status ${req.status}`);
  const mail = readDevMail(email);
  const link = mail.text.match(/https?:\/\/\S+/)[0];
  must('the link points at this Worker', link.startsWith(`${base}/api/auth/magic-link/verify?token=`), link.split('?')[0]);
  // The verify hop meets the same limiter, and losing the link to a 429
  // would waste the one-time token, so it waits too.
  let verified = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    verified = await call(link.slice(base.length), { accept: 'text/html' });
    if (verified.status !== 429) break;
    console.log(`     verifying the link for ${email} was rate limited; waiting 15s`);
    await sleep(15000);
  }
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

// 3.5 Clients (A6): the real domain through the real routes.
{
  const empty = await call('/clients', { cookie: owner.cookie, accept: 'text/html' });
  check('the Owner opens the Clients area with a way to add one', empty.status === 200 && /Add client/.test(empty.text) && /aria-label="Main"/.test(empty.text), `status ${empty.status}`);
  const form = await call('/clients/new', { cookie: owner.cookie, accept: 'text/html' });
  check('the create form renders with its real fields', form.status === 200 && /Client or company name/.test(form.text) && /Primary contact email/.test(form.text) && /Internal owner/.test(form.text), `status ${form.status}`);

  const invitationsBefore = countRows('workspace_invitations');
  const membershipsBefore = countRows('workspace_memberships');
  const usersBefore = countRows('user');

  const created = await call('/api/bloomops/clients', {
    method: 'POST',
    cookie: owner.cookie,
    body: { name: CLIENT_NAME, contactName: 'Smoke Contact', contactEmail: CLIENT_CONTACT, website: 'smoke-client.example', timezone: 'Australia/Sydney', startDate: '2026-03-02', relationshipStatus: 'active' },
  });
  must('the Owner creates a client', created.status === 201 && created.json?.client?.id, `status ${created.status} ${created.text.slice(0, 200)}`);
  const clientId = created.json.client.id;

  const row = sqlOne(`SELECT relationship_status, health, website, timezone, start_date, workspace_id FROM bloomops_clients WHERE id = ${lit(clientId)}`);
  check('a new client is Draft and On Track, whatever the request asked for', row?.relationship_status === 'draft' && row?.health === 'on_track', JSON.stringify(row));
  check('the website is normalised and the time zone kept', row?.website === 'https://smoke-client.example' && row?.timezone === 'Australia/Sydney' && row?.start_date === '2026-03-02', JSON.stringify(row));

  const contacts = sql(`SELECT name, email, is_primary, user_id FROM client_contacts WHERE client_id = ${lit(clientId)}`);
  check('the primary contact was created with the client', contacts.length === 1 && contacts[0].is_primary === 1 && contacts[0].email === CLIENT_CONTACT, JSON.stringify(contacts));
  check('and the portal link was not written', contacts[0]?.user_id === null, JSON.stringify(contacts[0]));
  check('creating a client invited nobody', countRows('workspace_invitations') === invitationsBefore && countRows('workspace_memberships') === membershipsBefore && countRows('user') === usersBefore, `${countRows('workspace_invitations')}/${invitationsBefore} invitations`);
  check('and CLIENT_CREATED is the only history so far', JSON.stringify(sql(`SELECT event_type FROM activity_events WHERE client_id = ${lit(clientId)} ORDER BY rowid`).map((r) => r.event_type)) === '["CLIENT_CREATED"]');

  const list = await call('/clients', { cookie: owner.cookie, accept: 'text/html' });
  check('the client appears in the list with both state markers', list.status === 200 && list.text.includes(CLIENT_NAME) && /Draft/.test(list.text) && /On Track/.test(list.text), `status ${list.status}`);
  const filtered = await call('/clients?status=active', { cookie: owner.cookie, accept: 'text/html' });
  check('a lifecycle filter that excludes it hides it', filtered.status === 200 && !filtered.text.includes(CLIENT_NAME), `status ${filtered.status}`);

  const detail = await call(`/clients/${clientId}`, { cookie: owner.cookie, accept: 'text/html' });
  check('the client detail renders with the five Release A tabs', detail.status === 200 && detail.text.includes(CLIENT_NAME) && /Overview/.test(detail.text) && /Services/.test(detail.text) && /Onboarding/.test(detail.text) && /Team/.test(detail.text) && /Activity/.test(detail.text), `status ${detail.status}`);
  check('and offers no activation control', !/Activate/.test(detail.text));

  const health = await call(`/api/bloomops/clients/${clientId}`, { method: 'PATCH', cookie: owner.cookie, body: { health: 'needs_attention' } });
  check('the Owner changes the health', health.status === 200, `status ${health.status} ${health.text.slice(0, 160)}`);
  const afterHealth = sqlOne(`SELECT relationship_status, health FROM bloomops_clients WHERE id = ${lit(clientId)}`);
  check('and the lifecycle is untouched by it', afterHealth?.health === 'needs_attention' && afterHealth?.relationship_status === 'draft', JSON.stringify(afterHealth));
  const lifecycle = await call(`/api/bloomops/clients/${clientId}`, { method: 'PATCH', cookie: owner.cookie, body: { relationshipStatus: 'active' } });
  check('the lifecycle cannot be written here: activation is a later phase', lifecycle.status === 400 && lifecycle.json?.reason === 'status_not_editable', `status ${lifecycle.status}`);

  const second = await call(`/api/bloomops/clients/${clientId}/contacts`, { method: 'POST', cookie: owner.cookie, body: { name: 'Second Contact', email: `second-${randomBytes(3).toString('hex')}@example.com`, title: 'Operations' } });
  must('the Owner adds a second contact', second.status === 201, `status ${second.status} ${second.text.slice(0, 160)}`);
  const promoted = await call(`/api/bloomops/clients/${clientId}/contacts/${second.json.contact.id}`, { method: 'PATCH', cookie: owner.cookie, body: { isPrimary: true } });
  check('and makes them primary', promoted.status === 200, `status ${promoted.status}`);
  const primaries = sql(`SELECT id FROM client_contacts WHERE client_id = ${lit(clientId)} AND is_primary = 1`);
  check('exactly one contact is primary, in the database', primaries.length === 1 && primaries[0].id === second.json.contact.id, JSON.stringify(primaries));
  const duplicate = await call(`/api/bloomops/clients/${clientId}/contacts`, { method: 'POST', cookie: owner.cookie, body: { name: 'Duplicate', email: CLIENT_CONTACT } });
  check('one address per client is refused clearly', duplicate.status === 409 && duplicate.json?.reason === 'duplicate_email', `status ${duplicate.status}`);

  const activity = await call(`/clients/${clientId}?tab=activity`, { cookie: owner.cookie, accept: 'text/html' });
  check('the Activity tab shows real history in words', activity.status === 200 && /Client created/.test(activity.text) && /Health changed/.test(activity.text) && /From On Track to Needs Attention/.test(activity.text) && /Primary contact changed/.test(activity.text), `status ${activity.status}`);
  check('and no event code, id, or metadata reaches the page', !/CLIENT_HEALTH_CHANGED|metadata_json/.test(activity.text));

  // An owner who stops qualifying as a new owner stays on the record, and
  // the edit form sends every field on save, so the stored id coming back
  // unchanged must not fail an unrelated edit.
  const ownerMembershipId = sqlOne(`SELECT id FROM workspace_memberships WHERE workspace_id = ${lit(row.workspace_id)} AND user_id = (SELECT id FROM user WHERE email = ${lit(ADMIN)})`)?.id;
  must('the Admin membership is available to own a client', Boolean(ownerMembershipId), 'no admin membership');
  const owned = await call(`/api/bloomops/clients/${clientId}`, { method: 'PATCH', cookie: owner.cookie, body: { ownerMembershipId } });
  check('the Owner names an internal owner', owned.status === 200, `status ${owned.status} ${owned.text.slice(0, 160)}`);
  sql(`UPDATE workspace_memberships SET status = 'suspended' WHERE id = ${lit(ownerMembershipId)};`);
  const keptOwner = await call(`/api/bloomops/clients/${clientId}`, { method: 'PATCH', cookie: owner.cookie, body: { website: 'smoke-client-2.example', ownerMembershipId } });
  check('an unrelated edit still saves when the stored owner is no longer eligible', keptOwner.status === 200, `status ${keptOwner.status} ${keptOwner.text.slice(0, 200)}`);
  check('and the owner is unchanged with no owner event', sqlOne(`SELECT owner_membership_id FROM bloomops_clients WHERE id = ${lit(clientId)}`)?.owner_membership_id === ownerMembershipId && countRows('activity_events', `client_id = ${lit(clientId)} AND event_type = 'CLIENT_OWNER_CHANGED'`) === 1);
  const newIneligible = await call(`/api/bloomops/clients/${clientId}`, { method: 'PATCH', cookie: owner.cookie, body: { ownerMembershipId: `m_${'x'.repeat(8)}` } });
  check('but a genuinely new ineligible owner is still refused', newIneligible.status === 400 && newIneligible.json?.errors?.ownerMembershipId === 'Choose an owner from the list.', `status ${newIneligible.status}`);
  sql(`UPDATE workspace_memberships SET status = 'active' WHERE id = ${lit(ownerMembershipId)};`);

  const crossSite = await call(`/api/bloomops/clients/${clientId}`, { method: 'PATCH', cookie: owner.cookie, body: { name: 'Hijacked' }, origin: 'https://evil.example' });
  check('a cross-site write to a client is refused', crossSite.status === 403 && crossSite.json?.error === 'Cross-site request refused.', `status ${crossSite.status}`);
  check('and the client was not renamed', sqlOne(`SELECT name FROM bloomops_clients WHERE id = ${lit(clientId)}`)?.name === CLIENT_NAME);

  // A Team Member with no assignment: an empty list, a leak-safe detail,
  // and no way to create.
  const tmList = await call('/clients', { cookie: inviteeCookie, accept: 'text/html' });
  check('an unassigned Team Member sees no clients and no create control', tmList.status === 200 && !tmList.text.includes(CLIENT_NAME) && /No clients are assigned to you/.test(tmList.text) && !/Add client/.test(tmList.text), `status ${tmList.status}`);
  const tmDetail = await call(`/clients/${clientId}`, { cookie: inviteeCookie, accept: 'text/html' });
  check('and the client they are not assigned to is not found', tmDetail.status === 404, `status ${tmDetail.status}`);
  const tmCreate = await call('/api/bloomops/clients', { method: 'POST', cookie: inviteeCookie, body: { name: 'Nope', contactName: 'Nope', contactEmail: 'nope@example.com' } });
  check('a Team Member cannot create a client', tmCreate.status === 403 && !('reason' in (tmCreate.json || {})), `status ${tmCreate.status}`);
  const tmForm = await call('/clients/new', { cookie: inviteeCookie, accept: 'text/html' });
  check('and the create form does not exist for them', tmForm.status === 404, `status ${tmForm.status}`);

  // A Client membership, linked to this very client: the portal is theirs,
  // the internal Clients area is not.
  const workspaceId = row.workspace_id;
  const portalUserId = `u_smoke_portal_${randomBytes(4).toString('hex')}`;
  sql([
    `INSERT INTO user (id, name, email, email_verified) VALUES (${lit(portalUserId)}, 'Smoke Portal Client', ${lit(PORTAL_CLIENT)}, 1);`,
    `INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, joined_at) VALUES (${lit(`m_${portalUserId}`)}, ${lit(workspaceId)}, ${lit(portalUserId)}, 'client', 'active', '2026-09-01T09:00:00.000Z');`,
    `UPDATE client_contacts SET user_id = ${lit(portalUserId)} WHERE client_id = ${lit(clientId)} AND email = ${lit(CLIENT_CONTACT)};`,
  ].join(' '));
  const portalPerson = await signIn(PORTAL_CLIENT, { next: '/portal' });
  must('the linked Client signs in', Boolean(portalPerson.cookie), `status ${portalPerson.verified.status}`);
  const clientArea = await call('/clients', { cookie: portalPerson.cookie, accept: 'text/html' });
  check('a Client opening the internal Clients area is sent to their portal', clientArea.status === 307 && /\/portal$/.test(clientArea.headers.get('location') || ''), `status ${clientArea.status} -> ${clientArea.headers.get('location')}`);
  const clientDetail = await call(`/clients/${clientId}`, { cookie: portalPerson.cookie, accept: 'text/html' });
  check('and their own client’s internal detail is a redirect away from it too', clientDetail.status === 307, `status ${clientDetail.status}`);
  const clientApi = await call(`/api/bloomops/clients/${clientId}`, { method: 'PATCH', cookie: portalPerson.cookie, body: { health: 'at_risk' } });
  check('a Client calling the internal client API directly is answered as if it did not exist', clientApi.status === 404 && clientApi.json?.error === 'Not found.', `status ${clientApi.status} ${clientApi.text.slice(0, 120)}`);
  const clientContactApi = await call(`/api/bloomops/clients/${clientId}/contacts`, { method: 'POST', cookie: portalPerson.cookie, body: { name: 'Sneak' } });
  check('and cannot add a contact to their own client either', clientContactApi.status === 404, `status ${clientContactApi.status}`);
  check('nothing they tried changed anything', sqlOne(`SELECT health FROM bloomops_clients WHERE id = ${lit(clientId)}`)?.health === 'needs_attention' && countRows('client_contacts', `client_id = ${lit(clientId)}`) === 2);
  const portalHome = await call('/portal', { cookie: portalPerson.cookie, accept: 'text/html' });
  check('their portal still opens and carries no internal chrome', portalHome.status === 200 && !/aria-label="Main"/.test(portalHome.text) && !/Needs Attention/.test(portalHome.text), `status ${portalHome.status}`);
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
