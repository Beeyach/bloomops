#!/usr/bin/env node
// Built-Worker HTTP + browser B3 Action/dependency acceptance. Loopback and development
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
  out = resolve(arg("--out", "/tmp/bloomops-b3-review"));
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
const keyboardActivate = async (page, control) => {
  await control.waitFor({ state: 'visible' });
  await page.waitForFunction(element => element.isConnected && !element.disabled, await control.elementHandle());
  await control.focus();
  await page.keyboard.press('Enter');
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
  const bounds = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
    overflowingRows: [...document.querySelectorAll('.bo-action-row, .bo-action-dependencies li, [aria-label="Your projects"] > li')]
      .map(row => ({ width: row.clientWidth, content: row.scrollWidth })).filter(row => row.content > row.width) }));
  if (bounds.document > bounds.viewport || bounds.overflowingRows.length) console.error('Overflow diagnostic:', JSON.stringify(bounds));
  check(`${label} ${width}px fits the viewport and Action rows`, bounds.document <= bounds.viewport && bounds.overflowingRows.length === 0);
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
  check('built Worker uses development and local R2 mail', health.environment === 'development' && health.auth.mail === 'r2-dev' && health.auth.configured);
  const owner = await login('smoke-owner@example.com'), suffix = randomUUID().slice(0, 8), ws = sql("SELECT id FROM workspaces WHERE slug='smoke-agency'")[0].id;
  const clientId = (await api(owner.context, '/api/bloomops/clients', { name: `James B3 ${suffix}`, contactName: 'James', contactEmail: `james-b3-${suffix}@example.com` }, 201)).client.id;
  const serviceTypeId = sql(`SELECT id FROM service_types WHERE workspace_id=${lit(ws)} AND slug='social-media-management'`)[0].id;
  const serviceId = (await api(owner.context, `/api/bloomops/clients/${clientId}/services`, { serviceTypeId }, 201)).serviceEngagementId;
  const projectId = (await api(owner.context, `/api/bloomops/clients/${clientId}/projects`, { name: `Website delivery B3 ${suffix}`, visibility: 'client', clientLabel: 'Your new website', serviceEngagementId: serviceId }, 201)).projectId;
  const milestoneId = (await api(owner.context, `/api/bloomops/projects/${projectId}/milestones`, { name: 'Internal delivery milestone', requestId: randomUUID() }, 201)).milestoneId;
  const members = {};
  for (const [name, role] of [['sam', 'team_member'], ['james', 'client'], ['pm', 'project_manager']]) {
    const id = `b3-${name}-${suffix}`, membership = `m-${id}`, email = `${id}@example.com`;
    sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(id)},${lit(name === 'sam' ? 'Sam Contractor' : name)},${lit(email)},1)`);
    sql(`INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit(membership)},${lit(ws)},${lit(id)},${lit(role)},'active')`);
    members[name] = { id, membership, email };
  }
  sql(`UPDATE client_contacts SET user_id=${lit(members.james.id)} WHERE client_id=${lit(clientId)} AND workspace_id=${lit(ws)} AND is_primary=1`);
  const sam = await login(members.sam.email, '/work'), client = await login(members.james.email, '/portal'), pm = await login(members.pm.email, '/work');
  check('unassigned Team starts with an honest empty Action view', await sam.page.getByRole('heading', { name: 'No Actions in this view' }).isVisible());
  const path = `/api/bloomops/projects/${projectId}/actions`, itemPath = id => `/api/bloomops/actions/${id}`;
  const stored = () => sql(`SELECT * FROM actions WHERE project_id=${lit(projectId)} ORDER BY rowid`);
  const history = () => sql(`SELECT * FROM activity_events WHERE subject_type='action' AND subject_id IN (SELECT id FROM actions WHERE project_id=${lit(projectId)}) ORDER BY rowid`);
  const parentBefore = JSON.stringify(sql(`SELECT * FROM projects WHERE id=${lit(projectId)}`));
  const get = async id => (await (await owner.context.request.get(base + itemPath(id))).json()).action;
  const status = async (id, toStatus) => api(owner.context, itemPath(id) + '/transition', { toStatus, expectedRevision: (await get(id)).revision });
  await owner.page.goto(`${base}/work/projects/${projectId}`);
  const section = owner.page.getByRole('region', { name: 'Actions', exact: true });
  check('Project detail has the canonical Actions section', await section.getByRole('heading', { name: 'No Actions in this view' }).isVisible());
  const dates = [-2, 0, 2].map(offset => { const now = new Date(); now.setUTCDate(now.getUTCDate() + offset); return now.toISOString().slice(0, 10); });
  const names = [`Build the landing page ${suffix}`, `Prepare the creative brief ${suffix}`, `Internal QA ${suffix}`], ids = [], creationBodies = [];
  owner.page.on('request', request => { if (request.method() === 'POST' && request.url() === base + path) creationBodies.push(request.postDataJSON()); });
  for (let index = 0; index < 3; index++) {
    await keyboardActivate(owner.page, section.getByRole('button', { name: 'Add Action', exact: true }));
    const dialog = owner.page.getByRole('dialog'); await dialog.waitFor();
    if (index === 0) {
      await owner.page.waitForFunction(() => document.activeElement?.id === 'action-title');
      check('keyboard create enters the title field', await dialog.locator('#action-title').evaluate(node => node === document.activeElement));
      await dialog.getByRole('button', { name: 'Create Action', exact: true }).click();
      check('required title error is labelled and focused', await dialog.locator('#action-title').evaluate(node => node.getAttribute('aria-invalid') === 'true' && node === document.activeElement));
      for (const width of widths) await layout('action-create', owner.page, width);
      await dialog.getByLabel('Description', { exact: false }).fill('Build the page\nCheck the mobile layout');
      await dialog.getByLabel('Assignee', { exact: false }).selectOption(members.sam.membership);
      await dialog.getByLabel('Milestone', { exact: false }).selectOption(milestoneId);
      await dialog.getByLabel('Priority', { exact: true }).selectOption('high');
    }
    await dialog.getByLabel('Action title', { exact: true }).fill(names[index]);
    await dialog.getByLabel('Due date', { exact: false }).fill(dates[index === 0 ? 0 : index === 1 ? 2 : 1]);
    const response = owner.page.waitForResponse(r => r.request().method() === 'POST' && r.url() === base + path);
    await dialog.getByRole('button', { name: 'Create Action', exact: true }).evaluate(button => { button.click(); button.click(); });
    const result = await response; assert.equal(result.status(), 201); ids.push((await result.json()).actionId);
    await dialog.waitFor({ state: 'hidden' }); await section.locator(`[data-action-id="${ids[index]}"]`).waitFor();
  }
  check('double-click creates exactly three Actions and three events', creationBodies.length === 3 && stored().length === 3 && history().length === 3);
  const retry = await api(owner.context, path, creationBodies[0], 201);
  check('response-loss create retry returns the same Action', retry.unchanged && retry.actionId === ids[0] && stored().length === 3 && history().length === 3);
  for (const width of widths) await layout('project-actions', owner.page, width);
  const row = id => section.locator(`[data-action-id="${id}"]`);
  await keyboardActivate(owner.page, row(ids[0]).getByRole('button', { name: 'Edit Action', exact: true }));
  await owner.page.waitForFunction(() => document.activeElement?.id === 'action-title');
  check('keyboard edit restores stored details', await owner.page.getByRole('dialog').getByLabel('Description', { exact: false }).inputValue() === 'Build the page\nCheck the mobile layout');
  for (const width of widths) await layout('action-edit', owner.page, width);
  await owner.page.keyboard.press('Escape');
  check('Escape returns focus to the edit opener', await row(ids[0]).getByRole('button', { name: 'Edit Action', exact: true }).evaluate(node => node === document.activeElement));
  await row(ids[0]).getByRole('button', { name: 'Edit Action', exact: true }).click();
  await owner.page.getByRole('dialog').getByLabel('Priority', { exact: true }).selectOption('urgent');
  await owner.page.getByRole('button', { name: 'Save Action details', exact: true }).click(); await owner.page.getByRole('dialog').waitFor({ state: 'hidden' });
  await row(ids[0]).getByText('Urgent priority', { exact: true }).waitFor();
  check('Project controls save canonical priority', (await get(ids[0])).priority === 'urgent');
  await owner.page.goto(`${base}/work/actions/${ids[0]}`);
  await keyboardActivate(owner.page, owner.page.getByRole('button', { name: 'Add dependency', exact: true }));
  await owner.page.waitForFunction(() => document.activeElement?.id === 'action-dependsOnActionId');
  check('keyboard dependency dialog receives focus', await owner.page.locator('#action-dependsOnActionId').evaluate(node => node === document.activeElement));
  for (const width of widths) await layout('action-dependency-add', owner.page, width);
  await owner.page.locator('#action-dependsOnActionId').selectOption(ids[1]);
  await owner.page.getByRole('button', { name: 'Save dependency', exact: true }).click(); await owner.page.getByRole('dialog').waitFor({ state: 'hidden' });
  await owner.page.getByRole('list', { name: 'Prerequisite Actions', exact: true }).getByRole('link', { name: names[1], exact: true }).waitFor();
  check('detail shows explicit dependency blocking', await owner.page.getByText('Dependency blocked · A prerequisite is still unresolved.', { exact: true }).isVisible());
  const cycle = await owner.context.request.post(base + itemPath(ids[1]) + '/dependencies', { headers: { origin: base }, data: { dependsOnActionId: ids[0], expectedRevision: (await get(ids[1])).revision } });
  check('built Worker refuses a cycle with safe no-store conflict', cycle.status() === 409 && noStore(cycle) && !/action_id|SQL|constraint/.test(await cycle.text()));
  for (const width of widths) await layout('action-detail-blocked', owner.page, width);
  const work = (view, filters = {}) => `${base}/work?${new URLSearchParams({ tab: 'actions', view, projectId, ...filters })}`;
  for (const [view, expected] of [['today', [ids[2]]], ['upcoming', [ids[1]]], ['overdue', []], ['all', ids]]) {
    await owner.page.goto(work(view));
    check(`${view} Work view shows the correct canonical Actions`, JSON.stringify((await owner.page.locator('[data-action-id]').evaluateAll(rows => rows.map(row => row.dataset.actionId))).sort()) === JSON.stringify([...expected].sort()));
  }
  for (const width of widths) await layout('work-actions', owner.page, width);
  await keyboardActivate(owner.page, owner.page.locator('.bo-action-filter-panel > summary'));
  check('keyboard opens the compact filter disclosure', await owner.page.locator('.bo-action-filter-panel').getAttribute('open') !== null);
  for (const width of widths) await layout('work-action-filters', owner.page, width);
  for (const label of ['Client', 'Department', 'Service', 'Project', 'Assignee', 'Status', 'Priority']) check(`${label} filter is present and labelled`, await owner.page.getByLabel(label, { exact: true }).count() === 1);
  await owner.page.getByLabel('Assignee', { exact: true }).selectOption(members.sam.membership);
  await owner.page.getByLabel('Priority', { exact: true }).selectOption('urgent');
  await owner.page.getByRole('button', { name: 'Apply filters', exact: true }).click(); await owner.page.waitForURL(/assigneeMembershipId=/);
  check('combined browser filters narrow to assigned urgent Action', await owner.page.locator('[data-action-id]').count() === 1 && await owner.page.locator(`[data-action-id="${ids[0]}"]`).count() === 1);
  await sam.page.goto(base + '/work'); check('Mine includes Action-only assignment', await sam.page.locator('[data-action-id]').count() === 1);
  await sam.page.getByRole('link', { name: names[0], exact: true }).click();
  check('Action-only detail hides full Project, sibling and Milestone access', await sam.page.getByRole('link', { name: 'Open Project', exact: true }).count() === 0 && !/Internal delivery milestone|Prepare the creative brief|Internal QA/.test(await sam.page.locator('main').innerText()));
  check('Team sees progress but no edit or dependency controls', await sam.page.getByRole('button', { name: 'Change Action status', exact: true }).count() === 1 && await sam.page.getByRole('button', { name: 'Edit Action', exact: true }).count() === 0 && await sam.page.getByRole('button', { name: 'Add dependency', exact: true }).count() === 0);
  await keyboardActivate(sam.page, sam.page.getByRole('button', { name: 'Change Action status', exact: true }));
  await sam.page.waitForFunction(() => document.activeElement?.id === 'action-toStatus');
  await sam.page.locator('#action-toStatus').selectOption('waiting');
  await sam.page.locator('#action-waitingType').selectOption('ary'); await sam.page.locator('#action-waitingReason').fill('Ary to review the automation\nFeedback expected tomorrow');
  for (const width of widths) await layout('action-status-waiting', sam.page, width);
  await sam.page.getByRole('dialog').getByRole('button', { name: 'Save Action status', exact: true }).focus(); await sam.page.keyboard.press('Tab');
  check('status dialog traps Tab within the dialog', await sam.page.getByRole('dialog').evaluate(node => node.contains(document.activeElement)));
  await sam.page.getByRole('button', { name: 'Save Action status', exact: true }).click(); await sam.page.getByRole('dialog').waitFor({ state: 'hidden' });
  await sam.page.getByText(/Waiting on Ary/).waitFor();
  check('Team Waiting saves the typed multiline explanation', (await get(ids[0])).waitingReason.includes('\n') && (await get(ids[0])).waitingType === 'ary');
  await owner.page.goto(work('waiting')); check('Waiting view uses explicit lifecycle', await owner.page.locator(`[data-action-id="${ids[0]}"]`).count() === 1);
  await status(ids[1], 'in_progress'); await status(ids[1], 'review'); await owner.page.goto(work('review'));
  check('Review view uses explicit lifecycle', await owner.page.locator(`[data-action-id="${ids[1]}"]`).count() === 1);
  await status(ids[1], 'done'); await owner.page.goto(work('overdue'));
  check('Done prerequisite unblocks ordinary Overdue without changing downstream lifecycle', await owner.page.locator(`[data-action-id="${ids[0]}"]`).count() === 1 && (await get(ids[0])).status === 'waiting');
  await owner.page.goto(`${base}/work/actions/${ids[0]}`);
  await keyboardActivate(owner.page, owner.page.getByRole('button', { name: `Remove dependency on ${names[1]}`, exact: true }));
  await owner.page.waitForFunction(() => document.activeElement?.id === 'action-remove-cancel');
  check('dependency removal initially focuses Cancel', await owner.page.locator('#action-remove-cancel').evaluate(node => node === document.activeElement));
  await layout('action-dependency-remove', owner.page, 320);
  await owner.page.getByRole('dialog').getByRole('button', { name: 'Remove dependency', exact: true }).click(); await owner.page.getByRole('dialog').waitFor({ state: 'hidden' });
  await owner.page.getByText('No available prerequisites.', { exact: true }).waitFor();
  await owner.page.waitForFunction(() => document.activeElement !== document.body);
  check('dependency removal keeps keyboard focus on a stable control', await owner.page.getByRole('button', { name: 'Add dependency', exact: true }).evaluate(node => node === document.activeElement) || await owner.page.getByRole('button', { name: 'Edit Action', exact: true }).evaluate(node => node === document.activeElement));
  await sam.page.reload(); await sam.page.getByRole('button', { name: 'Change Action status', exact: true }).click(); await sam.page.locator('#action-toStatus').selectOption('done');
  await sam.page.getByRole('button', { name: 'Save Action status', exact: true }).click(); await sam.page.getByRole('dialog').waitFor({ state: 'hidden' });
  await sam.page.waitForFunction(() => ![...document.querySelectorAll('button')].some(button => button.textContent.includes('Change Action status')));
  await sam.page.waitForFunction(() => document.activeElement?.id === 'page-title');
  check('Team terminal completion restores focus to Action title', await sam.page.locator('#page-title').evaluate(node => node === document.activeElement));
  check('Done owns timestamp and clears Waiting metadata', Boolean((await get(ids[0])).completedAt) && (await get(ids[0])).waitingReason === null && (await get(ids[0])).waitingType === null);
  for (const width of widths) await layout('action-team-done', sam.page, width);
  const terminal = await sam.context.request.post(base + itemPath(ids[0]) + '/transition', { headers: { origin: base }, data: { toStatus: 'in_progress', expectedRevision: (await get(ids[0])).revision } });
  check('terminal reopen is safely refused by built Worker', terminal.status() === 409 && noStore(terminal));
  const edit = async (id, details) => { const response = await owner.context.request.patch(base + itemPath(id), { headers: { origin: base }, data: { ...details, expectedRevision: (await get(id)).revision } }); assert.equal(response.status(), 200, await response.text()); };
  await pm.page.goto(`${base}/work/projects/${projectId}`); check('PM can initially see ordinary Action history', (await pm.page.locator('main').innerText()).includes(names[2]));
  await edit(ids[2], { visibility: 'restricted' }); await pm.page.reload(); check('restriction removes historical Action titles and list row for PM', !(await pm.page.locator('main').innerText()).includes(names[2]));
  await client.page.reload(); check('portal contains no Action names, navigation, counts or history', !/Build the landing page|Prepare the creative brief|Internal QA|Actions|Dependencies/.test(await client.page.locator('main').innerText()));
  for (const width of widths) await layout('action-portal-isolation', client.page, width);
  for (const endpoint of [itemPath(ids[0]), itemPath(ids[0]) + '/dependencies', path]) { const response = await client.context.request.get(base + endpoint); check(`Client guessed ${endpoint.split('/').at(-1)} is no-store 404`, response.status() === 404 && noStore(response)); }
  const foreign = await sam.context.request.patch(base + itemPath(ids[0]), { headers: { origin: base }, data: { priority: 'high', expectedRevision: (await get(ids[0])).revision } });
  check('Team structural edit is server-denied', foreign.status() === 403 && noStore(foreign));
  const malformed = await owner.context.request.patch(base + itemPath(ids[0]), { headers: { origin: base, 'content-type': 'application/json' }, data: 'null' });
  check('non-object JSON is a safe no-store 400', malformed.status() === 400 && noStore(malformed));
  const forged = await owner.context.request.patch(base + itemPath(ids[0]), { headers: { origin: base }, data: { workspaceId: 'forged' } });
  check('forged authority fields are refused', forged.status() === 400 && noStore(forged));
  const origin = await owner.context.request.patch(base + itemPath(ids[0]), { headers: { origin: 'https://evil.example' }, data: { title: 'Bad', expectedRevision: (await get(ids[0])).revision } });
  check('cross-origin Action mutation is refused', origin.status() === 403);
  await edit(ids[0], { assigneeMembershipId: null });
  const revoked = await sam.context.request.get(base + itemPath(ids[0])); check('reassignment revokes issued-session Action-only access immediately', revoked.status() === 404 && noStore(revoked));
  await sam.page.goto(base + '/work'); check('Mine empties after reassignment', await sam.page.getByRole('heading', { name: 'No Actions in this view' }).isVisible());
  await edit(ids[0], { assigneeMembershipId: members.sam.membership }); sql(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(members.sam.membership)}`);
  check('membership suspension revokes the same issued session', (await sam.context.request.get(base + itemPath(ids[0]))).status() === 403);
  check('Action work never rewrites parent Project lifecycle or details', parentBefore === JSON.stringify(sql(`SELECT * FROM projects WHERE id=${lit(projectId)}`)));
  await owner.page.goto(work('all')); await owner.page.emulateMedia({ reducedMotion: 'reduce' }); await layout('actions-reduced-motion', owner.page, 320);
  check('reduced motion preference is honored', await owner.page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches));
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); await touch.addCookies(await owner.context.cookies());
  const touchPage = await touch.newPage(); await touchPage.goto(`${base}/work/projects/${projectId}`);
  await touchPage.getByRole('region', { name: 'Actions', exact: true }).getByRole('button', { name: 'Add Action', exact: true }).tap();
  check('touch opens Action creation', await touchPage.getByRole('dialog').isVisible()); await layout('action-touch-create', touchPage, 390);
  await touch.close();
  console.log(`B3 browser/HTTP: ${checks} checks passed; ${screenshots} screenshots at ${widths.join(', ')}px.`);
} finally { await browser.close(); }
