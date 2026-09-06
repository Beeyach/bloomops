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
const seed = [
  ...person('u_review_pm', PEOPLE.pm, 'Priya Manager', 'project_manager'),
  ...person('u_review_tm', PEOPLE.tm, 'Tomas Member', 'team_member'),
  ...person('u_review_client', PEOPLE.clientLinked, 'James Carter', 'client'),
  ...person('u_review_client2', PEOPLE.clientUnlinked, 'Dana Newclient', 'client'),
  `INSERT INTO bloomops_clients (id, workspace_id, name, slug, relationship_status) SELECT 'c_review_james', ${ws}, 'James Carter Coaching', 'james-carter-coaching', 'active' WHERE NOT EXISTS (SELECT 1 FROM bloomops_clients WHERE id = 'c_review_james');`,
  `INSERT INTO client_contacts (id, workspace_id, client_id, name, email, user_id, is_primary) SELECT 'cc_review_james', ${ws}, 'c_review_james', 'James Carter', ${lit(PEOPLE.clientLinked)}, (SELECT id FROM user WHERE email = ${lit(PEOPLE.clientLinked)}), 1 WHERE NOT EXISTS (SELECT 1 FROM client_contacts WHERE id = 'cc_review_james');`,
];
sql(seed.join(' '));
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
  summary.push({ name: 'invite-dialog-owner', width, ...(await capture(owner, 'invite-dialog-owner', '/team', width, { before: async (page) => { await page.getByRole('button', { name: 'Invite someone' }).click(); await page.getByRole('dialog').waitFor(); }, fullPage: false })) });
  summary.push({ name: 'invite-invalid-owner', width, ...(await capture(owner, 'invite-invalid-owner', '/team', width, { before: async (page) => { await page.getByRole('button', { name: 'Invite someone' }).click(); await page.getByRole('dialog').waitFor(); await page.locator('#invite-email').fill('not-an-address'); await page.getByRole('button', { name: 'Send invitation' }).click(); await page.locator('#invite-email-error').waitFor(); }, fullPage: false })) });
  summary.push({ name: 'remove-confirm-owner', width, ...(await capture(owner, 'remove-confirm-owner', '/team', width, { before: async (page) => { await page.getByRole('button', { name: /^Remove / }).first().click(); await page.getByRole('dialog').waitFor(); }, fullPage: false })) });
  // A real toast: resending the open invitation (local mailbox only) shows
  // the confirmation, so the dismiss target is measured like any other.
  summary.push({ name: 'toast-owner', width, ...(await capture(owner, 'toast-owner', '/team', width, { before: async (page) => { await page.getByRole('button', { name: /^Resend the invitation/ }).first().click(); await page.locator('.bo-toast').waitFor(); }, fullPage: false })) });
  if (width < 768) {
    summary.push({ name: 'more-sheet-owner', width, ...(await capture(owner, 'more-sheet-owner', '/', width, { before: async (page) => { await page.getByRole('button', { name: 'More' }).click(); await page.getByRole('dialog').waitFor(); }, fullPage: false })) });
    summary.push({ name: 'portal-account-menu', width, ...(await capture(clientLinked, 'portal-account-menu', '/portal', width, { before: async (page) => { await page.locator('.bo-account-btn:visible').first().click(); await page.locator('[role="menu"]').waitFor(); }, fullPage: false })) });
  }

  // Boundary, in the browser: a Client deep-linking internal addresses, an
  // internal person opening the portal, a Team Member opening /legacy.
  const clientPage = await clientLinked.newPage();
  await clientPage.goto(`${base}/team`, { waitUntil: 'networkidle' });
  record(`client deep-linking /team lands on the portal @${width}`, new URL(clientPage.url()).pathname === '/portal' && (await clientPage.locator('nav').count()) === 0, clientPage.url());
  await clientPage.close();
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
