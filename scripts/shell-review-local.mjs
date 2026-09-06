#!/usr/bin/env node
// Visual and structural review of the A5 shells against a LOCAL BloomOps
// Worker, in a real browser, at the five review widths.
//
//   npm run preview                       # in one terminal (wrangler on :8787)
//   node scripts/shell-review-local.mjs [--url http://localhost:8787] [--out review-shots]
//
// Needs playwright-core and a Chromium. Neither is a dependency of the
// app; point at them with --playwright <dir containing playwright-core>
// (default: resolved from the working directory) and --chromium <path>
// (default: $PLAYWRIGHT_CHROMIUM, or the newest Chromium under
// $PLAYWRIGHT_BROWSERS_PATH).
//
// Development only, like scripts/auth-smoke-local.mjs: it refuses any URL
// that is not loopback and reads magic links back from the r2-dev
// mailbox. It seeds a Project Manager, a Team Member, a linked Client, an
// unlinked Client, one client record, and one open invitation in the
// LOCAL D1 (idempotent), signs each person in through the real magic-link
// flow, and captures every review state at 1440, 1024, 768, 390, and 320.
// For each capture it also checks that the document does not scroll
// sideways, that form controls are at least 16px on phones, and that the
// navigation and buttons meet the 44px target on phones. Screenshots go
// to --out; the summary is printed and the exit code says whether every
// structural check passed.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const arg = (name, fallback = '') => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || '') : fallback;
};
const base = arg('--url', 'http://localhost:8787').replace(/\/+$/, '');
const out = resolve(arg('--out', 'review-shots'));
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname)) {
  console.error('shell-review-local: only a loopback Worker can be reviewed; the development mailbox exists nowhere else.');
  process.exit(2);
}
mkdirSync(out, { recursive: true });

function findChromium() {
  if (process.env.PLAYWRIGHT_CHROMIUM) return process.env.PLAYWRIGHT_CHROMIUM;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root) return null;
  const dirs = readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort();
  for (const d of dirs.reverse()) {
    const candidate = join(root, d, 'chrome-linux', 'chrome');
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}
const chromiumPath = arg('--chromium') || findChromium();
if (!chromiumPath) {
  console.error('shell-review-local: no Chromium. Pass --chromium <path> or set PLAYWRIGHT_CHROMIUM.');
  process.exit(2);
}
const pwDir = arg('--playwright') ? resolve(arg('--playwright')) : process.cwd();
const require = createRequire(pathToFileURL(join(pwDir, 'package.json')));
let chromium;
try {
  ({ chromium } = require('playwright-core'));
} catch {
  console.error(`shell-review-local: playwright-core not found from ${pwDir}. Install it somewhere and pass --playwright <that directory>.`);
  process.exit(2);
}

const WIDTHS = [1440, 1024, 768, 390, 320];
const HEIGHTS = { 1440: 900, 1024: 768, 768: 1024, 390: 844, 320: 640 };
const PEOPLE = {
  owner: 'smoke-owner@example.com',
  admin: 'smoke-admin@example.com',
  pm: 'review-pm@example.com',
  tm: 'review-tm@example.com',
  clientLinked: 'review-client@example.com',
  clientUnlinked: 'review-client-unlinked@example.com',
  invitee: 'review-invitee@example.com',
  // A7: a second Team Member, so the Team tab has more than one row per
  // list, and somebody who was assigned and later suspended.
  maria: 'review-maria@example.com',
  gone: 'review-gone@example.com',
};

let failures = 0;
const results = [];
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

function wrangler(args) {
  return execFileSync('npx', ['--no-install', 'wrangler', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
}
function sql(command) {
  return wrangler(['d1', 'execute', 'DB', '--local', '--command', command]);
}
function readDevMail(recipient) {
  const key = `dev-mail/${createHash('sha256').update(recipient.trim().toLowerCase()).digest('hex')}.json`;
  const text = wrangler(['r2', 'object', 'get', `bloomops-files-dev/${key}`, '--local', '--pipe']);
  return JSON.parse(text.slice(text.indexOf('{')));
}
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

// ── seed (idempotent, local D1 only) ────────────────────────────────────
execFileSync('node', ['scripts/bootstrap-workspace.mjs', '--local', '--workspace-name', 'Smoke Agency', '--owner-email', PEOPLE.owner, '--owner-name', 'Smoke Owner', '--admin-email', PEOPLE.admin, '--admin-name', 'Smoke Admin'], { stdio: 'inherit' });
const ws = "(SELECT id FROM workspaces WHERE slug = 'smoke-agency')";
const person = (id, email, name, role) => [
  `INSERT INTO user (id, name, email, email_verified) SELECT ${lit(id)}, ${lit(name)}, ${lit(email)}, 1 WHERE NOT EXISTS (SELECT 1 FROM user WHERE email = ${lit(email)});`,
  `INSERT INTO workspace_memberships (id, workspace_id, user_id, role, status, joined_at) SELECT ${lit(`m_${id}`)}, ${ws}, (SELECT id FROM user WHERE email = ${lit(email)}), ${lit(role)}, 'active', '2026-09-01T09:00:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM workspace_memberships WHERE workspace_id = ${ws} AND user_id = (SELECT id FROM user WHERE email = ${lit(email)}));`,
];
// A7 fixtures. The service type is named by slug so the row is always this
// workspace's own catalogue entry, never an id typed in here.
const typeOf = (slug) => `(SELECT id FROM service_types WHERE workspace_id = ${ws} AND slug = ${lit(slug)})`;
const membershipOf = (email) => `(SELECT id FROM workspace_memberships WHERE workspace_id = ${ws} AND user_id = (SELECT id FROM user WHERE email = ${lit(email)}))`;
const engagement = (id, clientId, slug, status, packageName, startDate, scopeNotes) =>
  `INSERT INTO service_engagements (id, workspace_id, client_id, service_type_id, status, package_name, start_date, scope_notes) SELECT ${lit(id)}, ${ws}, ${lit(clientId)}, ${typeOf(slug)}, ${lit(status)}, ${packageName ? lit(packageName) : 'NULL'}, ${startDate ? lit(startDate) : 'NULL'}, ${scopeNotes ? lit(scopeNotes) : 'NULL'} WHERE NOT EXISTS (SELECT 1 FROM service_engagements WHERE id = ${lit(id)});`;
const assignment = (table, id, parentId, email, role) => {
  const parentColumn = table === 'client_assignments' ? 'client_id' : 'service_engagement_id';
  return `INSERT INTO ${table} (id, workspace_id, ${parentColumn}, membership_id, assignment_role) SELECT ${lit(id)}, ${ws}, ${lit(parentId)}, ${membershipOf(email)}, ${lit(role)} WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE id = ${lit(id)});`;
};
const event = (id, type, subjectType, subjectId, clientId, serviceId, actorEmail, metadata, at) =>
  `INSERT INTO activity_events (id, workspace_id, event_type, subject_type, subject_id, client_id, service_engagement_id, actor_membership_id, metadata_json, occurred_at) SELECT ${lit(id)}, ${ws}, ${lit(type)}, ${lit(subjectType)}, ${lit(subjectId)}, ${lit(clientId)}, ${serviceId ? lit(serviceId) : 'NULL'}, ${membershipOf(actorEmail)}, ${lit(metadata)}, ${lit(at)} WHERE NOT EXISTS (SELECT 1 FROM activity_events WHERE id = ${lit(id)});`;

const seed = [
  ...person('u_review_pm', PEOPLE.pm, 'Priya Manager', 'project_manager'),
  ...person('u_review_tm', PEOPLE.tm, 'Tomas Member', 'team_member'),
  ...person('u_review_client', PEOPLE.clientLinked, 'James Carter', 'client'),
  ...person('u_review_client2', PEOPLE.clientUnlinked, 'Dana Newclient', 'client'),
  ...person('u_review_maria', PEOPLE.maria, 'Maria Reyes', 'team_member'),
  ...person('u_review_gone', PEOPLE.gone, 'Sam Whitfield-Okonkwo', 'team_member'),
  `INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status) SELECT 'c_review_james', ${ws}, 'James Carter Coaching', 'james-carter-coaching', 'active' WHERE NOT EXISTS (SELECT 1 FROM bloomops_clients WHERE id = 'c_review_james');`,
  `INSERT INTO client_contacts (id, workspace_id, client_id, name, email, user_id, is_primary) SELECT 'cc_review_james', ${ws}, 'c_review_james', 'James Carter', ${lit(PEOPLE.clientLinked)}, (SELECT id FROM user WHERE email = ${lit(PEOPLE.clientLinked)}), 1 WHERE NOT EXISTS (SELECT 1 FROM client_contacts WHERE id = 'cc_review_james');`,
  // A6 review states. Local disposable data only: no BloomOps screen ever
  // renders a sample client, and staging is never seeded with any of this.
  `INSERT INTO client_contacts (id, workspace_id, client_id, name, email, phone, title, is_primary) SELECT 'cc_review_james_2', ${ws}, 'c_review_james', 'Priya Raman', 'priya@example.com', '+61 2 5550 0100', 'Marketing manager', 0 WHERE NOT EXISTS (SELECT 1 FROM client_contacts WHERE id = 'cc_review_james_2');`,
  `INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status, health, website, timezone, start_date, owner_membership_id) SELECT 'c_review_lawrence', ${ws}, 'Lawrence Physiotherapy', 'lawrence-physiotherapy', 'onboarding', 'needs_attention', 'https://lawrence.example', 'Australia/Sydney', '2026-08-14', (SELECT id FROM workspace_memberships WHERE workspace_id = ${ws} AND user_id = (SELECT id FROM user WHERE email = ${lit(PEOPLE.pm)})) WHERE NOT EXISTS (SELECT 1 FROM bloomops_clients WHERE id = 'c_review_lawrence');`,
  `INSERT INTO client_contacts (id, workspace_id, client_id, name, email, title, is_primary) SELECT 'cc_review_lawrence', ${ws}, 'c_review_lawrence', 'Lawrence Achebe-Fitzwilliam', 'lawrence.achebe.fitzwilliam@lawrencephysiotherapyandrehabilitation.example', 'Practice principal', 1 WHERE NOT EXISTS (SELECT 1 FROM client_contacts WHERE id = 'cc_review_lawrence');`,
  `INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status, health) SELECT 'c_review_draft', ${ws}, 'Vela', 'vela', 'draft', 'on_track' WHERE NOT EXISTS (SELECT 1 FROM bloomops_clients WHERE id = 'c_review_draft');`,
  `INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status, health) SELECT 'c_review_paused', ${ws}, 'Harbour & Co Physiotherapy and Rehabilitation Group', 'harbour-co', 'paused', 'at_risk' WHERE NOT EXISTS (SELECT 1 FROM bloomops_clients WHERE id = 'c_review_paused');`,
  `INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status, health) SELECT 'c_review_ended', ${ws}, 'Northwind Studio', 'northwind-studio', 'ended', 'on_track' WHERE NOT EXISTS (SELECT 1 FROM bloomops_clients WHERE id = 'c_review_ended');`,
  // The Team Member is assigned to one client, so their scoped list has
  // something in it and every other client stays out of reach.
  `INSERT INTO client_assignments (workspace_id, client_id, membership_id, assignment_role) SELECT ${ws}, 'c_review_james', (SELECT id FROM workspace_memberships WHERE workspace_id = ${ws} AND user_id = (SELECT id FROM user WHERE email = ${lit(PEOPLE.tm)})), 'member' WHERE NOT EXISTS (SELECT 1 FROM client_assignments WHERE client_id = 'c_review_james' AND membership_id = (SELECT id FROM workspace_memberships WHERE workspace_id = ${ws} AND user_id = (SELECT id FROM user WHERE email = ${lit(PEOPLE.tm)})));`,
  // Some history to render on the Activity tab.
  `INSERT INTO activity_events (id, workspace_id, event_type, subject_type, subject_id, client_id, actor_membership_id, metadata_json, occurred_at) SELECT 'ae_review_1', ${ws}, 'CLIENT_CREATED', 'client', 'c_review_lawrence', 'c_review_lawrence', (SELECT id FROM workspace_memberships WHERE workspace_id = ${ws} AND user_id = (SELECT id FROM user WHERE email = ${lit(PEOPLE.owner)})), '{"name":"Lawrence Physiotherapy"}', '2026-08-14T09:00:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM activity_events WHERE id = 'ae_review_1');`,
  `INSERT INTO activity_events (id, workspace_id, event_type, subject_type, subject_id, client_id, actor_membership_id, metadata_json, occurred_at) SELECT 'ae_review_2', ${ws}, 'CLIENT_OWNER_CHANGED', 'client', 'c_review_lawrence', 'c_review_lawrence', (SELECT id FROM workspace_memberships WHERE workspace_id = ${ws} AND user_id = (SELECT id FROM user WHERE email = ${lit(PEOPLE.owner)})), '{"from":null,"to":"x","fromName":null,"toName":"Priya Manager"}', '2026-08-20T11:30:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM activity_events WHERE id = 'ae_review_2');`,
  `INSERT INTO activity_events (id, workspace_id, event_type, subject_type, subject_id, client_id, actor_membership_id, metadata_json, occurred_at) SELECT 'ae_review_3', ${ws}, 'CLIENT_HEALTH_CHANGED', 'client', 'c_review_lawrence', 'c_review_lawrence', (SELECT id FROM workspace_memberships WHERE workspace_id = ${ws} AND user_id = (SELECT id FROM user WHERE email = ${lit(PEOPLE.pm)})), '{"from":"on_track","to":"needs_attention"}', '2026-09-01T15:05:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM activity_events WHERE id = 'ae_review_3');`,
  `INSERT INTO activity_events (id, workspace_id, event_type, subject_type, subject_id, client_id, actor_membership_id, metadata_json, occurred_at) SELECT 'ae_review_4', ${ws}, 'CLIENT_CONTACT_ADDED', 'client_contact', 'cc_review_lawrence', 'c_review_lawrence', (SELECT id FROM workspace_memberships WHERE workspace_id = ${ws} AND user_id = (SELECT id FROM user WHERE email = ${lit(PEOPLE.pm)})), '{"name":"Lawrence Achebe-Fitzwilliam"}', '2026-09-02T08:15:00.000Z' WHERE NOT EXISTS (SELECT 1 FROM activity_events WHERE id = 'ae_review_4');`,

  // A7 review states. The catalogue itself came from the bootstrap above;
  // these are engagements and assignments over it. Local disposable data
  // only, and staging is never seeded with any of it.
  //
  // Lawrence holds three of the five service types, so the Services tab has
  // several rows in different statuses and the Add service form still has
  // something left to offer. One carries a long package name and a long
  // scope note, which is the case that decides whether the row holds up.
  engagement('se_review_social', 'c_review_lawrence', 'social-media-management', 'active', 'Growth', '2026-08-14', 'Three feed posts and two reels a week, captions written here, client approves in the portal before anything is scheduled. Stories are the client’s own.'),
  engagement('se_review_ghl', 'c_review_lawrence', 'ghl', 'onboarding', 'Systems build and migration from the old booking tool', '2026-09-01', null),
  engagement('se_review_ads', 'c_review_lawrence', 'ads', 'paused', null, null, null),
  // A client whose catalogue is fully spoken for, so the Add service form
  // has the honest nothing-left state to render.
  ...['social-media-management', 'ads', 'ghl', 'kajabi', 'content-calendar'].map((slug, i) =>
    engagement(`se_review_full_${i}`, 'c_review_paused', slug, 'active', null, null, null)),
  // James has one service, so the assigned Team Member has something to
  // read on the Services tab they cannot change.
  engagement('se_review_james_social', 'c_review_james', 'social-media-management', 'active', 'Starter', '2026-07-01', null),

  // Client-wide and service-specific assignment, side by side, which is the
  // distinction the Team tab exists to make visible.
  assignment('client_assignments', 'ca_review_pm', 'c_review_lawrence', PEOPLE.pm, 'lead'),
  assignment('client_assignments', 'ca_review_maria', 'c_review_lawrence', PEOPLE.maria, 'member'),
  assignment('service_assignments', 'sa_review_social', 'se_review_social', PEOPLE.tm, 'lead'),
  assignment('service_assignments', 'sa_review_ghl', 'se_review_ghl', PEOPLE.maria, 'member'),
  // Somebody who was assigned while active and has since been suspended.
  // Their row stays, and the screen has to say so in words. Seeded
  // directly, because the API refuses a suspended person a NEW assignment.
  assignment('client_assignments', 'ca_review_gone', 'c_review_lawrence', PEOPLE.gone, 'member'),
  `UPDATE workspace_memberships SET status = 'suspended' WHERE workspace_id = ${ws} AND user_id = (SELECT id FROM user WHERE email = ${lit(PEOPLE.gone)});`,

  // A7 history beside the A6 history, so the Activity tab renders both.
  event('ae_review_5', 'SERVICE_ENGAGEMENT_CREATED', 'service_engagement', 'se_review_social', 'c_review_lawrence', 'se_review_social', PEOPLE.owner, '{"serviceTypeName":"Social Media Management","packageName":"Growth"}', '2026-08-14T09:30:00.000Z'),
  event('ae_review_6', 'CLIENT_ASSIGNMENT_ADDED', 'client_assignment', 'ca_review_pm', 'c_review_lawrence', null, PEOPLE.owner, '{"memberName":"Priya Manager","assignmentRole":"lead"}', '2026-08-15T10:00:00.000Z'),
  event('ae_review_7', 'SERVICE_ASSIGNMENT_ADDED', 'service_assignment', 'sa_review_social', 'c_review_lawrence', 'se_review_social', PEOPLE.pm, '{"memberName":"Tomas Member","assignmentRole":"lead","serviceTypeName":"Social Media Management"}', '2026-08-16T14:20:00.000Z'),
  event('ae_review_8', 'SERVICE_STATUS_CHANGED', 'service_engagement', 'se_review_social', 'c_review_lawrence', 'se_review_social', PEOPLE.pm, '{"serviceTypeName":"Social Media Management","from":"planned","to":"active"}', '2026-08-20T09:05:00.000Z'),
  event('ae_review_9', 'SERVICE_ASSIGNMENT_REMOVED', 'service_assignment', 'sa_review_old', 'c_review_lawrence', 'se_review_ghl', PEOPLE.owner, '{"memberName":"Sam Whitfield-Okonkwo","assignmentRole":"member","serviceTypeName":"GHL"}', '2026-09-03T16:40:00.000Z'),
];
sql(seed.join(' '));
// The primary marker is the point of the contact fixture, so it is set
// after the inserts rather than left to them. Idempotent, and the partial
// unique index still holds: one primary per client.
sql("UPDATE client_contacts SET is_primary = 0 WHERE client_id = 'c_review_lawrence'; UPDATE client_contacts SET is_primary = 1 WHERE id = 'cc_review_lawrence';");
console.log('seeded review people in the local D1');

// ── sessions through the real magic-link flow ───────────────────────────
async function call(path, { method = 'GET', body = null, cookie = '' } = {}) {
  const headers = { accept: 'application/json' };
  if (cookie) headers.cookie = cookie;
  if (method !== 'GET') headers.origin = base;
  if (body !== null) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: body === null ? undefined : JSON.stringify(body), redirect: 'manual' });
  let json = null;
  try {
    json = JSON.parse(await res.text());
  } catch {}
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie')].filter(Boolean);
  return { status: res.status, json, cookies: setCookies.map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ') };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Better Auth limits magic-link requests per minute; a 429 right after the
// smoke script is normal, so wait out the window rather than fail.
async function magicLink(email) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const req = await call('/api/auth/sign-in/magic-link', { method: 'POST', body: { email, callbackURL: '/', newUserCallbackURL: '/', errorCallbackURL: '/sign-in' } });
    if (req.status === 200) return readDevMail(email).text.match(/https?:\/\/\S+/)[0];
    if (req.status !== 429) throw new Error(`magic link for ${email}: ${req.status}`);
    console.log(`magic link for ${email} was rate limited; waiting 15s`);
    await sleep(15000);
  }
  throw new Error(`magic link for ${email}: still rate limited`);
}

// One real sign-in per person (the magic-link route is rate limited), then
// the session cookie is handed to every browser context that needs it.
const sessions = new Map();
async function sessionFor(email) {
  if (sessions.has(email)) return sessions.get(email);
  const link = await magicLink(email);
  const verified = await fetch(link, { redirect: 'manual' });
  const raw = (typeof verified.headers.getSetCookie === 'function' ? verified.headers.getSetCookie() : [verified.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).find((c) => /session_token=/.test(c));
  if (!raw) throw new Error(`no session cookie for ${email} (status ${verified.status})`);
  const [name, ...rest] = raw.split('=');
  const session = { name, value: rest.join('='), header: raw };
  sessions.set(email, session);
  return session;
}

const browser = await chromium.launch({ executablePath: chromiumPath, args: ['--no-sandbox'] });
const host = new URL(base).hostname;

async function signedInContext(email, width) {
  const context = await browser.newContext({ viewport: { width, height: HEIGHTS[width] }, deviceScaleFactor: 1, hasTouch: width < 768, isMobile: width < 768 });
  if (email) {
    const s = await sessionFor(email);
    await context.addCookies([{ name: s.name, value: s.value, domain: host, path: '/', httpOnly: true, sameSite: 'Lax' }]);
  }
  return context;
}

// The Owner creates one open invitation through the real route so the
// Team page has something to show. Rotates if already pending.
{
  const created = await call('/api/bloomops/invitations', { method: 'POST', cookie: (await sessionFor(PEOPLE.owner)).header, body: { email: PEOPLE.invitee, role: 'project_manager', name: 'Review Invitee' } });
  record('an open invitation exists for the Team page', created.status === 201 || created.status === 200, `status ${created.status}`);
}

// ── captures ────────────────────────────────────────────────────────────
async function checks(page, name, width) {
  const m = await page.evaluate(() => {
    const doc = document.documentElement;
    const small = [...document.querySelectorAll('input, select, textarea')].filter((el) => el.offsetParent !== null && parseFloat(getComputedStyle(el).fontSize) < 16).length;
    const targets = [...document.querySelectorAll('nav a, nav button, .bo-btn, .bo-account-btn, .bo-menu-item, .bo-close, .bo-toast-dismiss')].filter((el) => el.offsetParent !== null);
    const shortTargets = targets.filter((el) => el.getBoundingClientRect().height < 43).map((el) => `${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}=${Math.round(el.getBoundingClientRect().height)}`);
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, small, shortTargets, title: document.title, h1: document.querySelector('h1')?.textContent?.trim() || '' };
  });
  record(`${name} @${width}: no horizontal overflow`, m.scrollWidth <= m.clientWidth + 1, `${m.scrollWidth} vs ${m.clientWidth}`);
  if (width < 768) {
    record(`${name} @${width}: form controls at least 16px`, m.small === 0, `${m.small} below 16px`);
    record(`${name} @${width}: navigation and buttons at least 44px`, m.shortTargets.length === 0, m.shortTargets.join(', '));
  }
  return m;
}

async function openDialog(page, name) {
  const button = page.getByRole('button', { name }).first();
  await button.waitFor();
  const dialog = page.getByRole('dialog');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await dialog.count()) break;
    await button.click().catch(() => {});
    try {
      await dialog.waitFor({ timeout: 2500 });
      break;
    } catch {}
  }
  await dialog.waitFor();
}

async function capture(context, name, path, width, { before = null, fullPage = true } = {}) {
  const page = await context.newPage();
  const response = await page.goto(base + path, { waitUntil: 'networkidle' });
  const status = response?.status();
  if (before) await before(page);
  await page.waitForTimeout(150);
  const file = join(out, `${name}-${width}.png`);
  await page.screenshot({ path: file, fullPage });
  const m = await checks(page, name, width);
  await page.close();
  return { status, ...m, file };
}

const summary = [];
for (const width of WIDTHS) {
  const owner = await signedInContext(PEOPLE.owner, width);
  const tm = await signedInContext(PEOPLE.tm, width);
  const pm = await signedInContext(PEOPLE.pm, width);
  const clientLinked = await signedInContext(PEOPLE.clientLinked, width);
  const clientUnlinked = await signedInContext(PEOPLE.clientUnlinked, width);
  const anon = await signedInContext(null, width);

  const plan = [
    [anon, 'sign-in', '/sign-in'],
    [owner, 'home-owner', '/'],
    [owner, 'clients-owner', '/clients'],
    [owner, 'onboarding-owner', '/onboarding'],
    [owner, 'team-owner', '/team'],
    [owner, 'settings-owner', '/settings'],
    [owner, 'work-owner', '/work'],
    [owner, 'finance-owner', '/finance'],
    [owner, 'design-gallery', '/design'],
    [tm, 'home-team-member', '/'],
    [tm, 'team-team-member', '/team'],
    [tm, 'clients-team-member', '/clients'],
    // A6
    [owner, 'clients-list-owner', '/clients'],
    [owner, 'clients-filtered-owner', '/clients?status=onboarding'],
    [owner, 'clients-new-owner', '/clients/new'],
    [owner, 'client-overview-owner', '/clients/c_review_lawrence'],
    [owner, 'client-services-owner', '/clients/c_review_lawrence?tab=services'],
    [owner, 'client-onboarding-owner', '/clients/c_review_lawrence?tab=onboarding'],
    [owner, 'client-team-owner', '/clients/c_review_lawrence?tab=team'],
    [owner, 'client-activity-owner', '/clients/c_review_lawrence?tab=activity'],
    [owner, 'client-long-names-owner', '/clients/c_review_paused'],
    [tm, 'client-overview-team-member', '/clients/c_review_james'],
    // A7
    [owner, 'client-services-list-owner', '/clients/c_review_lawrence?tab=services'],
    [owner, 'client-services-none-owner', '/clients/c_review_draft?tab=services'],
    [owner, 'client-services-full-owner', '/clients/c_review_paused?tab=services'],
    [owner, 'client-team-assignments-owner', '/clients/c_review_lawrence?tab=team'],
    [owner, 'client-team-empty-owner', '/clients/c_review_draft?tab=team'],
    [owner, 'client-activity-mixed-owner', '/clients/c_review_lawrence?tab=activity'],
    [tm, 'client-services-team-member', '/clients/c_review_james?tab=services'],
    [tm, 'client-team-team-member', '/clients/c_review_james?tab=team'],
    [pm, 'finance-project-manager', '/finance'],
    [clientLinked, 'portal-linked', '/portal'],
    [clientUnlinked, 'portal-unlinked', '/portal'],
  ];
  for (const [ctx, name, path] of plan) {
    const r = await capture(ctx, name, path, width);
    summary.push({ name, width, status: r.status, h1: r.h1, file: r.file });
  }

  // Interaction states.
  summary.push({ name: 'account-menu-owner', width, ...(await capture(owner, 'account-menu-owner', '/', width, { before: async (page) => { await page.locator('.bo-account-btn:visible').first().click(); await page.locator('[role="menu"]').waitFor(); }, fullPage: false })) });
  summary.push({ name: 'invite-dialog-owner', width, ...(await capture(owner, 'invite-dialog-owner', '/team', width, { before: async (page) => { await openDialog(page, 'Invite someone'); }, fullPage: false })) });
  summary.push({ name: 'invite-invalid-owner', width, ...(await capture(owner, 'invite-invalid-owner', '/team', width, { before: async (page) => { await openDialog(page, 'Invite someone'); await page.locator('#invite-email').fill('not-an-address'); await page.getByRole('button', { name: 'Send invitation' }).click(); await page.locator('#invite-email-error').waitFor(); }, fullPage: false })) });
  summary.push({ name: 'remove-confirm-owner', width, ...(await capture(owner, 'remove-confirm-owner', '/team', width, { before: async (page) => { await openDialog(page, /^Remove /); }, fullPage: false })) });
  // A real toast: resending the open invitation (local mailbox only) shows
  // the confirmation, so the dismiss target is measured like any other.
  summary.push({ name: 'toast-owner', width, ...(await capture(owner, 'toast-owner', '/team', width, { before: async (page) => { await page.getByRole('button', { name: /^Resend the invitation/ }).first().click(); await page.locator('.bo-toast').waitFor(); }, fullPage: false })) });
  summary.push({ name: 'client-create-invalid', width, ...(await capture(owner, 'client-create-invalid', '/clients/new', width, { before: async (page) => { const submit = page.getByRole('button', { name: 'Add client' }); await submit.waitFor(); for (let a = 0; a < 4; a += 1) { if (await page.locator('#client-name-error').count()) break; await submit.click().catch(() => {}); try { await page.locator('#client-name-error').waitFor({ timeout: 2500 }); break; } catch {} } await page.locator('#client-name-error').waitFor(); } })) });
  summary.push({ name: 'client-edit-dialog', width, ...(await capture(owner, 'client-edit-dialog', '/clients/c_review_lawrence', width, { before: async (page) => { await openDialog(page, 'Edit details'); }, fullPage: false })) });
  summary.push({ name: 'client-contact-dialog', width, ...(await capture(owner, 'client-contact-dialog', '/clients/c_review_lawrence', width, { before: async (page) => { await openDialog(page, 'Add contact'); }, fullPage: false })) });
  summary.push({ name: 'client-contact-remove-confirm', width, ...(await capture(owner, 'client-contact-remove-confirm', '/clients/c_review_lawrence', width, { before: async (page) => { await openDialog(page, /^Remove /); }, fullPage: false })) });
  // A7 interaction states: the two small forms, the status selector open in
  // the edit form, the assignment dialog for each of the two scopes, the
  // confirmation before an unassignment, and the honest state when a client
  // already has every service in the catalogue.
  summary.push({ name: 'service-add-dialog', width, ...(await capture(owner, 'service-add-dialog', '/clients/c_review_lawrence?tab=services', width, { before: async (page) => { await openDialog(page, 'Add service'); }, fullPage: false })) });
  summary.push({ name: 'service-add-nothing-left', width, ...(await capture(owner, 'service-add-nothing-left', '/clients/c_review_paused?tab=services', width, { before: async (page) => { await openDialog(page, 'Add service'); }, fullPage: false })) });
  summary.push({ name: 'service-edit-dialog', width, ...(await capture(owner, 'service-edit-dialog', '/clients/c_review_lawrence?tab=services', width, { before: async (page) => { await openDialog(page, /^Edit Social Media Management$/); }, fullPage: false })) });
  summary.push({ name: 'service-status-choices', width, ...(await capture(owner, 'service-status-choices', '/clients/c_review_lawrence?tab=services', width, { before: async (page) => { await openDialog(page, /^Edit Social Media Management$/); await page.locator('#edit-service-status').focus(); }, fullPage: false })) });
  summary.push({ name: 'assign-client-dialog', width, ...(await capture(owner, 'assign-client-dialog', '/clients/c_review_lawrence?tab=team', width, { before: async (page) => { await openDialog(page, 'Assign to client'); }, fullPage: false })) });
  summary.push({ name: 'assign-service-dialog', width, ...(await capture(owner, 'assign-service-dialog', '/clients/c_review_lawrence?tab=team', width, { before: async (page) => { await openDialog(page, /^Assign someone to Social Media Management$/); }, fullPage: false })) });
  summary.push({ name: 'unassign-confirm', width, ...(await capture(owner, 'unassign-confirm', '/clients/c_review_lawrence?tab=team', width, { before: async (page) => { await openDialog(page, /^Remove Priya Manager$/); }, fullPage: false })) });

  if (width < 768) {
    summary.push({ name: 'more-sheet-owner', width, ...(await capture(owner, 'more-sheet-owner', '/', width, { before: async (page) => { await openDialog(page, 'More'); }, fullPage: false })) });
    summary.push({ name: 'portal-account-menu', width, ...(await capture(clientLinked, 'portal-account-menu', '/portal', width, { before: async (page) => { await page.locator('.bo-account-btn:visible').first().click(); await page.locator('[role="menu"]').waitFor(); }, fullPage: false })) });
  }

  // Boundary, in the browser: a Client deep-linking internal addresses, an
  // internal person opening the portal, a Team Member opening /legacy.
  const clientPage = await clientLinked.newPage();
  await clientPage.goto(`${base}/team`, { waitUntil: 'networkidle' });
  record(`client deep-linking /team lands on the portal @${width}`, new URL(clientPage.url()).pathname === '/portal' && (await clientPage.locator('nav').count()) === 0, clientPage.url());
  // A6: their own client's internal screen is not theirs either.
  await clientPage.goto(`${base}/clients/c_review_james`, { waitUntil: 'networkidle' });
  const clientBody = await clientPage.evaluate(() => document.body.innerText);
  record(`client deep-linking their own client detail lands on the portal @${width}`, new URL(clientPage.url()).pathname === '/portal' && !/Needs Attention|Internal owner|Activity/.test(clientBody), clientPage.url());
  await clientPage.close();
  // A6: an assigned Team Member reads their client and is offered nothing
  // to change; an unassigned one does not find it at all.
  const tmClientPage = await tm.newPage();
  await tmClientPage.goto(`${base}/clients/c_review_james`, { waitUntil: 'networkidle' });
  const tmControls = await tmClientPage.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()));
  record(`assigned Team Member reads their client with no controls @${width}`, /James Carter Coaching/.test(await tmClientPage.evaluate(() => document.body.innerText)) && !tmControls.some((t) => /Edit details|Add contact|Make primary|Remove/.test(t)), tmControls.join('|').slice(0, 80));
  const tmMiss = await tmClientPage.goto(`${base}/clients/c_review_lawrence`, { waitUntil: 'networkidle' });
  record(`unassigned client is not found for a Team Member @${width}`, tmMiss?.status() === 404, `status ${tmMiss?.status()}`);
  // A7: the same Team Member reads the services and the team of the client
  // they are assigned to, and is offered nothing to change on either.
  await tmClientPage.goto(`${base}/clients/c_review_james?tab=services`, { waitUntil: 'networkidle' });
  const tmServiceControls = await tmClientPage.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()));
  record(`assigned Team Member reads the services with no controls @${width}`,
    /Social Media Management/.test(await tmClientPage.evaluate(() => document.body.innerText)) && !tmServiceControls.some((t) => /Add service|^Edit/.test(t)),
    tmServiceControls.join('|').slice(0, 80));
  await tmClientPage.goto(`${base}/clients/c_review_james?tab=team`, { waitUntil: 'networkidle' });
  const tmTeamText = await tmClientPage.evaluate(() => document.body.innerText);
  const tmTeamControls = await tmClientPage.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()));
  record(`assigned Team Member reads the team with no controls @${width}`,
    /Client-wide team/.test(tmTeamText) && /Service teams/.test(tmTeamText) && !tmTeamControls.some((t) => /Assign to|Make lead|Make member|^Remove/.test(t)),
    tmTeamControls.join('|').slice(0, 80));
  await tmClientPage.close();

  // A7: the two kinds of assignment are told apart by structure and words,
  // not by styling, and a suspended person's row says what happened.
  const teamPage = await owner.newPage();
  await teamPage.goto(`${base}/clients/c_review_lawrence?tab=team`, { waitUntil: 'networkidle' });
  const teamText = await teamPage.evaluate(() => document.body.innerText);
  record(`client-wide and service-specific assignment are separate sections @${width}`,
    /Internal owner/.test(teamText) && /Client-wide team/.test(teamText) && /Service teams/.test(teamText) &&
      teamText.indexOf('Client-wide team') < teamText.indexOf('Service teams'),
    'headings');
  record(`each service names its own team @${width}`,
    (await teamPage.locator('[aria-label="Social Media Management team"]').count()) === 1 &&
      (await teamPage.locator('[aria-label="Client-wide team"]').count()) === 1,
    'aria-labelled lists');
  record(`the assignment role is a word, not a colour @${width}`, /\bLead\b/.test(teamText) && /\bMember\b/.test(teamText), 'Lead / Member');
  record(`a member who is no longer active says so @${width}`, /No longer active in this workspace/.test(teamText), 'inactive marker');
  await teamPage.goto(`${base}/clients/c_review_lawrence?tab=services`, { waitUntil: 'networkidle' });
  const servicesText = await teamPage.evaluate(() => document.body.innerText);
  record(`a service row carries its department and status in words @${width}`,
    /Social Media Management/.test(servicesText) && /Systems/.test(servicesText) && /Active/.test(servicesText) && /Paused/.test(servicesText) && /Onboarding/.test(servicesText),
    'service rows');
  record(`the Services tab says a service status is not the client's @${width}`,
    /Changing it does not change/.test(servicesText), 'independence note');
  await teamPage.goto(`${base}/clients/c_review_lawrence?tab=activity`, { waitUntil: 'networkidle' });
  const activityText = await teamPage.evaluate(() => document.body.innerText);
  record(`A6 and A7 history read as words together @${width}`,
    /Client created/.test(activityText) && /Service added/.test(activityText) && /Service status changed/.test(activityText) &&
      /Client team member added/.test(activityText) && /Service team member removed/.test(activityText),
    'activity lines');
  record(`and no event code, id, or metadata JSON reaches the screen @${width}`,
    !/SERVICE_|CLIENT_ASSIGNMENT|se_review_|ca_review_|[{}]/.test(activityText), 'activity is words');
  await teamPage.close();
  const ownerPage = await owner.newPage();
  await ownerPage.goto(`${base}/portal`, { waitUntil: 'networkidle' });
  record(`Owner opening /portal is sent to internal Home @${width}`, new URL(ownerPage.url()).pathname === '/' && (await ownerPage.locator('nav[aria-label="Main"]').count()) > 0, ownerPage.url());
  await ownerPage.close();
  const tmPage = await tm.newPage();
  const legacy = await tmPage.goto(`${base}/legacy`, { waitUntil: 'networkidle' });
  record(`Team Member opening /legacy gets not found @${width}`, legacy?.status() === 404, `status ${legacy?.status()}`);
  await tmPage.close();

  // Keyboard: Tab from the top reaches the skip link, then the navigation.
  if (width >= 1024) {
    const kb = await owner.newPage();
    await kb.goto(`${base}/`, { waitUntil: 'networkidle' });
    await kb.keyboard.press('Tab');
    const first = await kb.evaluate(() => document.activeElement?.textContent?.trim());
    await kb.keyboard.press('Tab');
    const second = await kb.evaluate(() => document.activeElement?.getAttribute('href'));
    record(`keyboard order: skip link, then Home @${width}`, first === 'Skip to content' && second === '/', `${first} -> ${second}`);
    await kb.getByRole('button', { name: 'Invite someone' }).count();
    await kb.goto(`${base}/team`, { waitUntil: 'networkidle' });
    await kb.getByRole('button', { name: 'Invite someone' }).click();
    await kb.getByRole('dialog').waitFor();
    const focused = await kb.evaluate(() => document.activeElement?.id);
    await kb.keyboard.press('Escape');
    const closed = (await kb.getByRole('dialog').count()) === 0;
    const returned = await kb.evaluate(() => document.activeElement?.textContent?.trim());
    record(`dialog: focus moves in, Escape closes, focus returns @${width}`, focused === 'invite-email' && closed && returned === 'Invite someone', `${focused} / ${closed} / ${returned}`);
    await kb.close();
  }

  for (const ctx of [owner, tm, pm, clientLinked, clientUnlinked, anon]) await ctx.close();
}

await browser.close();
console.log('\nCaptures:');
for (const s of summary) console.log(`  ${String(s.width).padStart(4)}  ${s.name.padEnd(26)} ${s.status}  ${s.h1 || ''}`);
console.log(`\nshell-review-local: ${results.length - failures} of ${results.length} checks passed; screenshots in ${out}`);
process.exit(failures === 0 ? 0 : 1);
