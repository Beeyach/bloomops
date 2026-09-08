#!/usr/bin/env node
// Built-Worker HTTP + browser B1 Projects acceptance. Loopback and development
// R2 mail only. Run auth-smoke-local first to bootstrap the local workspace.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const base = arg("--url", "http://localhost:8787"),
  out = resolve(arg("--out", "/tmp/bloomops-b1-review"));
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const require = createRequire(
  join(
    resolve(arg("--playwright", "/tmp/bloomops-a11-browser")),
    "package.json",
  ),
);
const { chromium } = require("playwright");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
let checks = 0,
  screenshots = 0;
const widths = [1440, 1024, 768, 390, 320];
const check = (name, ok) => {
  assert.ok(ok, name);
  checks++;
  console.log(`ok   ${name}`);
};
const noStore = response => /(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers()['cache-control'] || '');
const wrangler = (args, { retrySafe = false } = {}) => {
  const command = args[args.indexOf("--command") + 1] || "";
  const readOnly =
    args.includes("--command") && /^\s*(SELECT|PRAGMA)\b/i.test(command);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return execFileSync("npx", ["--no-install", "wrangler", ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      // A standalone local Wrangler connection can briefly collide with the
      // live Worker. Replay only reads or explicitly idempotent fixture writes;
      // application mutations and uncertain failures are never retried here.
      if (
        (!readOnly && !retrySafe) ||
        attempt === 2 ||
        !/SQLITE_BUSY|database is locked/.test(String(error.stderr))
      )
        throw error;
    }
  }
};
const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sql = (command, options) => {
  const text = wrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--json",
    "--command",
    command,
  ], options);
  return JSON.parse(text.slice(text.indexOf("[")))[0].results;
};
const mail = (email) => {
  const key = createHash("sha256").update(email).digest("hex");
  const raw = wrangler([
    "r2",
    "object",
    "get",
    `bloomops-files-dev/dev-mail/${key}.json`,
    "--local",
    "--pipe",
  ]);
  return JSON.parse(raw.slice(raw.indexOf("{")));
};
const api = async (context, path, data, expected = 200) => {
  const response = await context.request.post(base + path, {
    headers: { origin: base },
    data,
  });
  assert.equal(response.status(), expected, await response.text());
  return response.json();
};
const login = async (email, next = "/") => {
  const context = await browser.newContext();
  const page = await context.newPage();
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await context.request.post(base + '/api/auth/sign-in/magic-link', {
      headers: { origin: base }, data: { email, callbackURL: next, newUserCallbackURL: next, errorCallbackURL: '/sign-in' },
    });
    if (response.status() !== 429 || attempt === 5) { assert.equal(response.status(), 200); break; }
    console.log('Local sign-in rate limit reached; waiting 15 seconds.');
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  const url = mail(email).text.match(/https?:\/\/\S+/)[0];
  assert.ok(url.startsWith(base + "/api/auth/magic-link/verify?"));
  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await page.goto(url);
    if (response?.status() !== 429 || attempt === 5) { assert.ok(response?.ok(), 'magic link reaches the authenticated page'); break; }
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
  return { context, page };
};
const layout = async (label, page, width) => {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  await page.evaluate(() => document.fonts.ready);
  check(
    `${label} ${width}px fits the viewport`,
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  const geometry = await page.evaluate(() => ({ headings: document.querySelectorAll('h1').length,
    invalidControls: [...document.querySelectorAll('button,input,textarea,select')].filter(n => n.checkVisibility()).map(n => {
      const r = n.getBoundingClientRect();
      return { label: n.getAttribute('aria-label') || n.id || n.textContent, x: r.x, right: r.right, width: r.width, height: r.height };
    }).filter(r => !(r.width > 0 && r.x >= 0 && r.right <= innerWidth && (innerWidth > 390 || r.height >= 44))) }));
  if (geometry.headings !== 1 || geometry.invalidControls.length) console.error('Layout diagnostic:', JSON.stringify(geometry));
  check(`${label} ${width}px heading and controls are readable`, geometry.headings === 1 && geometry.invalidControls.length === 0);
  await page.screenshot({
    path: join(out, `${label}-${width}.png`),
    fullPage: await page.getByRole('dialog').count() === 0,
    animations: 'disabled',
  });
  screenshots++;
};
try {
  const health = await (await fetch(base + '/api/health')).json();
  check('built Worker is development with local R2 mail', health.environment === 'development' && health.auth.mail === 'r2-dev' && health.auth.configured);
  const owner = await login('smoke-owner@example.com');
  const suffix = randomUUID().slice(0, 8), ws = sql("SELECT id FROM workspaces WHERE slug='smoke-agency'")[0].id;
  const clients = [];
  for (const name of ['James', 'Lawrence']) {
    const created = await api(owner.context, '/api/bloomops/clients', { name: `${name} B1 ${suffix}`, contactName: name, contactEmail: `${name.toLowerCase()}-${suffix}@example.com` }, 201);
    clients.push(created.client.id);
  }
  const [james, lawrence] = clients;
  const members = {};
  for (const [name, role] of [['sam','team_member'], ['james','client'], ['pm','project_manager']]) {
    const id = `b1-${name}-${suffix}`, email = `${id}@example.com`, membership = `m-${id}`;
    sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(id)},${lit(name === 'sam' ? 'Sam Contractor' : name)},${lit(email)},1)`);
    sql(`INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit(membership)},${lit(ws)},${lit(id)},${lit(role)},'active')`);
    members[name] = { id, email, membership };
  }
  sql(`UPDATE client_contacts SET user_id=${lit(members.james.id)} WHERE workspace_id=${lit(ws)} AND client_id=${lit(james)} AND is_primary=1`);
  const socialType = sql(`SELECT id FROM service_types WHERE workspace_id=${lit(ws)} AND slug='social-media-management'`)[0]?.id;
  assert.ok(socialType, 'bootstrap Social Media catalogue exists');
  const service = await api(owner.context, `/api/bloomops/clients/${james}/services`, { serviceTypeId: socialType }, 201);
  const serviceId = service.serviceEngagementId || service.service?.id;
  assert.ok(serviceId);
  const sam = await login(members.sam.email, '/work'), client = await login(members.james.email, '/portal'), pm = await login(members.pm.email, '/work');
  await sam.page.goto(base + '/work');
  check('unassigned Team Member has a meaningful empty Projects view', await sam.page.getByRole('heading', { name: 'No projects yet' }).isVisible() && await sam.page.getByRole('link', { name: 'Create project', exact: true }).count() === 0);
  for (const width of widths) await layout('projects-empty', sam.page, width);
  await owner.page.goto(`${base}/clients/${james}`);
  check('Client without Projects has no empty Projects tab', await owner.page.getByRole('link', { name: 'Projects', exact: true }).count() === 0);
  await client.page.goto(base + '/portal');
  check('portal hides irrelevant Projects section', await client.page.getByRole('heading', { name: 'Your projects', exact: true }).count() === 0);
  await owner.page.goto(`${base}/work/projects/new?clientId=${james}`);
  for (const width of widths) await layout('project-create', owner.page, width);
  await owner.page.getByRole('button', { name: 'Create project', exact: true }).click();
  check('empty creation focuses and labels the invalid field', await owner.page.locator('#project-name').evaluate(n => n === document.activeElement && n.getAttribute('aria-invalid') === 'true'));
  const name = `Website launch ${suffix}`;
  await owner.page.getByLabel('Project name', { exact: true }).fill(name);
  await owner.page.getByLabel('Purchased service', { exact: false }).selectOption(serviceId);
  await owner.page.getByLabel('Start date', { exact: false }).fill('2026-09-10');
  await owner.page.getByLabel('Target date', { exact: false }).fill('2026-09-09');
  await owner.page.getByRole('button', { name: 'Create project', exact: true }).click();
  check('date ordering error is explained beside the date', await owner.page.getByText('The target date cannot be before the start date.', { exact: true }).isVisible());
  await layout('project-validation', owner.page, 320);
  await owner.page.getByLabel('Target date', { exact: false }).fill('2026-10-01');
  await owner.page.getByLabel('Internal owner', { exact: false }).selectOption(members.sam.membership);
  await owner.page.getByLabel('Client-facing label', { exact: false }).fill('Your new website');
  let creates = 0;
  owner.page.on('request', request => { if (request.method() === 'POST' && request.url() === `${base}/api/bloomops/clients/${james}/projects`) creates++; });
  await owner.page.getByRole('button', { name: 'Create project', exact: true }).evaluate(button => { button.click(); button.click(); });
  await owner.page.waitForURL(/\/work\/projects\/(?!new)[^/?]+$/);
  await owner.page.getByRole('heading', { name, exact: true }).waitFor();
  const id = new URL(owner.page.url()).pathname.split('/').at(-1), path = `/api/bloomops/projects/${id}`;
  const read = async (context = owner.context) => (await context.request.get(base + path)).json();
  const stored = () => sql(`SELECT * FROM projects WHERE id=${lit(id)}`)[0];
  const eventCount = event => sql(`SELECT count(*) n FROM activity_events WHERE subject_id=${lit(id)} AND event_type=${lit(event)}`)[0].n;
  check('double-click creates one Project and one semantic event', creates === 1 && eventCount('PROJECT_CREATED') === 1);
  check('stored parents, owner and derived Department are coherent', stored().client_id === james && stored().service_engagement_id === serviceId && stored().department_id === null && stored().owner_membership_id === members.sam.membership);
  check('owner responsibility grants Sam no Project access', (await sam.context.request.get(base + path)).status() === 404);
  const originalClient = sql(`SELECT relationship_status,health FROM bloomops_clients WHERE id=${lit(james)}`)[0];
  const originalService = sql(`SELECT status FROM service_engagements WHERE id=${lit(serviceId)}`)[0];
  await owner.page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await owner.page.getByRole('dialog').waitFor();
  await owner.page.waitForFunction(() => document.activeElement?.id === 'project-name');
  check('details dialog focuses its labelled name field', await owner.page.locator('#project-name').evaluate(n => n === document.activeElement));
  await owner.page.keyboard.press('Shift+Tab');
  check('keyboard stays inside the modal', await owner.page.getByRole('dialog').evaluate(n => n.contains(document.activeElement)));
  await owner.page.keyboard.press('Escape');
  check('Escape closes the modal and restores focus', await owner.page.getByRole('dialog').count() === 0 && await owner.page.getByRole('button', { name: 'Edit details', exact: true }).evaluate(n => n === document.activeElement));
  for (const width of widths) await layout('project-detail', owner.page, width);
  const healthSaved = owner.page.waitForResponse(r => r.url() === base + path && r.request().method() === 'PATCH');
  await owner.page.getByRole('button', { name: 'At Risk', exact: true }).click();
  assert.equal((await healthSaved).status(), 200);
  await owner.page.reload();
  check('health changes independently of status', stored().health === 'at_risk' && stored().status === 'planned');
  async function status(to, reason = '') {
    await owner.page.getByRole('button', { name: 'Change status', exact: true }).click();
    await owner.page.getByLabel('Next status', { exact: true }).selectOption(to);
    if (reason) await owner.page.locator('#project-reason').fill(reason);
    const response = owner.page.waitForResponse(r => r.url() === base + path + '/transition');
    await owner.page.getByRole('button', { name: 'Save status', exact: true }).click();
    assert.equal((await response).status(), 200);
    await owner.page.reload();
  }
  await status('ready'); await status('in_progress');
  await owner.page.getByRole('button', { name: 'Change status', exact: true }).click();
  await owner.page.getByLabel('Next status', { exact: true }).selectOption('waiting');
  const invalid = owner.page.waitForResponse(r => r.url() === base + path + '/transition');
  await owner.page.getByRole('button', { name: 'Save status', exact: true }).click();
  check('Waiting without a reason is refused by the built API', (await invalid).status() === 400);
  await owner.page.locator('#project-reason[aria-invalid="true"]').waitFor();
  for (const width of widths) await layout('project-waiting-dialog', owner.page, width);
  await owner.page.locator('#project-reason').fill('Waiting on the client’s brand assets');
  await owner.page.getByRole('button', { name: 'Save status', exact: true }).click();
  await owner.page.getByRole('dialog').waitFor({ state: 'detached' }); await owner.page.reload();
  check('Waiting explanation persists after refresh', await owner.page.getByText('Waiting on the client’s brand assets', { exact: true }).isVisible());
  await owner.page.getByRole('button', { name: 'Assign someone', exact: true }).click();
  await owner.page.getByLabel('Person', { exact: true }).selectOption(members.sam.membership);
  await owner.page.getByRole('button', { name: 'Save assignment', exact: true }).click();
  await owner.page.getByRole('dialog').waitFor({ state: 'detached' }); await owner.page.reload();
  check('Project assignment grants the intended Project', (await sam.context.request.get(base + path)).status() === 200);
  check('Project assignment does not grant the parent Client view', (await sam.context.request.get(`${base}/api/bloomops/clients/${james}/projects`)).status() === 404);
  const hidden = await api(owner.context, `/api/bloomops/clients/${james}/projects`, { name: 'Internal sibling secret' }, 201);
  check('Project assignment cannot reach a sibling', (await sam.context.request.get(`${base}/api/bloomops/projects/${hidden.projectId}`)).status() === 404);
  await sam.page.goto(`${base}/work/projects/${id}`);
  check('Team Member sees history but no coordination controls or parent link', await sam.page.getByRole('heading', { name: 'Activity', exact: true }).isVisible() && await sam.page.getByRole('button', { name: 'Edit details', exact: true }).count() === 0 && await sam.page.locator(`a[href="/clients/${james}"]`).count() === 0);
  for (const width of widths) await layout('project-team-readonly', sam.page, width);
  check('forged Team mutation is denied with no-store', await (async () => { const r = await sam.context.request.patch(base + path, { headers: { origin: base }, data: { health: 'on_track', expectedRevision: stored().revision } }); return r.status() === 403 && noStore(r); })());
  await owner.page.getByRole('button', { name: 'Edit assignment for Sam Contractor', exact: true }).click();
  await owner.page.getByLabel('Responsibility', { exact: true }).selectOption('lead');
  await owner.page.getByRole('button', { name: 'Save assignment', exact: true }).click();
  await owner.page.getByRole('dialog').waitFor({ state: 'detached' }); await owner.page.reload();
  check('assignment responsibility edit writes one event', eventCount('PROJECT_ASSIGNMENT_UPDATED') === 1);
  await owner.page.getByRole('button', { name: 'Edit assignment for Sam Contractor', exact: true }).click();
  await owner.page.getByRole('button', { name: 'Remove assignment', exact: true }).click();
  await owner.page.getByRole('dialog').waitFor({ state: 'detached' }); await owner.page.reload();
  check('assignment removal revokes scope while preserving ownership', (await sam.context.request.get(base + path)).status() === 404 && stored().owner_membership_id === members.sam.membership && eventCount('PROJECT_ASSIGNMENT_REMOVED') === 1);
  await owner.page.getByRole('button', { name: 'Edit details', exact: true }).click();
  await owner.page.getByLabel('Visibility', { exact: true }).selectOption('client');
  await owner.page.getByRole('button', { name: 'Save details', exact: true }).click();
  await owner.page.getByRole('dialog').waitFor({ state: 'detached' }); await owner.page.reload();
  const portal = await client.context.request.get(`${base}/api/bloomops/portal/projects/${id}`), dto = (await portal.json()).project;
  check('Client receives only the safe Project DTO', portal.status() === 200 && noStore(portal) && dto.label === 'Your new website' && JSON.stringify(Object.keys(dto).sort()) === JSON.stringify(['id','label','statusLabel','targetDate','completedAt','clientId','clientName'].sort()));
  check('Client cannot use internal Project APIs', (await client.context.request.get(base + path)).status() === 404 && (await client.context.request.get(base + '/api/bloomops/projects')).status() === 403);
  await client.page.reload();
  check('portal displays label and status without internal facts', await client.page.getByText('Your new website', { exact: true }).isVisible() && !/Sam Contractor|At Risk|brand assets|Internal sibling secret|Project assignments|Website launch/.test(await client.page.locator('main').innerText()));
  for (const width of widths) await layout('project-portal', client.page, width);
  const other = await api(owner.context, `/api/bloomops/clients/${lawrence}/projects`, { name: 'Lawrence launch', clientLabel: 'Your course launch', visibility: 'client' }, 201);
  check('Client cannot guess another client-visible Project', (await client.context.request.get(`${base}/api/bloomops/portal/projects/${other.projectId}`)).status() === 404);
  sql(`UPDATE client_contacts SET user_id=${lit(members.james.id)} WHERE client_id=${lit(lawrence)} AND is_primary=1`);
  await client.page.reload();
  check('multi-client portal separates Project context', await client.page.getByRole('heading', { name: `James B1 ${suffix} · Projects`, exact: true }).isVisible() && await client.page.getByRole('heading', { name: `Lawrence B1 ${suffix} · Projects`, exact: true }).isVisible());
  await layout('project-portal-multiple', client.page, 320);
  await owner.page.goto(`${base}/clients/${james}?tab=projects`);
  check('Client Projects tab shares the canonical records', await owner.page.getByRole('link', { name, exact: true }).isVisible());
  for (const width of widths) await layout('client-projects', owner.page, width);
  await owner.page.goto(base + '/work');
  for (const width of widths) await layout('projects-list', owner.page, width);
  await owner.page.getByLabel('Status', { exact: true }).selectOption('completed');
  await owner.page.getByRole('button', { name: 'Apply filter', exact: true }).click();
  await owner.page.waitForURL(/status=completed/);
  check('status filter has a truthful empty view', await owner.page.getByRole('heading', { name: 'No projects match this view' }).isVisible());
  await owner.page.goto(`${base}/work/projects/${id}`);
  await status('in_progress'); await status('review'); await status('completed');
  const completedAt = stored().completed_at;
  await status('archived');
  check('completed Project archives without losing its completion or changing parents', stored().completed_at === completedAt && stored().health === 'at_risk' && JSON.stringify(sql(`SELECT relationship_status,health FROM bloomops_clients WHERE id=${lit(james)}`)[0]) === JSON.stringify(originalClient) && JSON.stringify(sql(`SELECT status FROM service_engagements WHERE id=${lit(serviceId)}`)[0]) === JSON.stringify(originalService));
  check('archived Project has no reopening control', await owner.page.getByRole('button', { name: 'Change status', exact: true }).count() === 0);
  const revision = stored().revision;
  await api(owner.context, path + '/transition', { toStatus: 'in_progress', expectedRevision: revision }, 409);
  const crossSite = await owner.context.request.patch(base + path, { headers: { origin: 'https://untrusted.example' }, data: { name: 'Rejected', expectedRevision: revision } });
  check('cross-site mutation is refused', crossSite.status() === 403 && noStore(crossSite));
  const malformed = await owner.context.request.patch(base + path, { headers: { origin: base, 'content-type': 'application/json' }, data: '[' });
  check('malformed JSON produces a safe no-store response', malformed.status() === 400 && noStore(malformed));
  const before = stored().health, beforeEvents = eventCount('PROJECT_HEALTH_CHANGED');
  sql("CREATE TRIGGER b1_fail_late BEFORE INSERT ON activity_events WHEN NEW.event_type='PROJECT_HEALTH_CHANGED' BEGIN SELECT RAISE(ABORT,'B1 private database failure'); END");
  try {
    const failed = await owner.context.request.patch(base + path, { headers: { origin: base }, data: { health: 'on_track', expectedRevision: revision } });
    const body = await failed.text();
    check('late Worker failure is sanitized', failed.status() === 500 && !/D1|SQLite|constraint|stack|B1 private|activity_events/i.test(body));
    check('late failure response forbids caching', noStore(failed));
    check('late failure rolls back Project and history', stored().health === before && eventCount('PROJECT_HEALTH_CHANGED') === beforeEvents);
  } finally { sql('DROP TRIGGER b1_fail_late'); }
  const restrict = await owner.context.request.patch(base + path, { headers: { origin: base }, data: { visibility: 'restricted', expectedRevision: revision } });
  assert.equal(restrict.status(), 200);
  const missing = await client.context.request.get(base + '/api/bloomops/portal/projects/does-not-exist');
  const denied = await client.context.request.get(`${base}/api/bloomops/portal/projects/${id}`);
  check('revoked visibility is indistinguishable from a guessed missing Project', denied.status() === 404 && await denied.text() === await missing.text());
  check('PM cannot read a restricted Project without explicit assignment', (await pm.context.request.get(base + path)).status() === 404);
  await client.page.reload();
  check('previously visible Project disappears from the live portal', await client.page.getByText('Your new website', { exact: true }).count() === 0);
  sql(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(members.james.membership)}`);
  check('suspension revokes Project APIs despite a still-valid identity session', (await client.context.request.get(base + '/api/bloomops/portal/projects')).status() === 403);
  console.log(`B1 built-Worker browser/HTTP: ${checks} checks passed; ${screenshots} screenshots.`);
} catch (error) {
  // Playwright transport errors can include request cookies in their call
  // log. Keep diagnostics useful without printing local session credentials.
  console.error('B1 browser acceptance failed:', String(error?.message || error).split('\n')
    .filter(line => !/cookie:|authorization:|token=/i.test(line)).join('\n'));
  process.exitCode = 1;
} finally { await browser.close(); }
