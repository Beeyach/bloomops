#!/usr/bin/env node
// D2 generation UI against the actual local Worker. Synthetic isolated workspace,
// captured local mail only; no live configuration or provider execution.
import assert from "node:assert/strict";
import { encodeSystemsBlueprintDefinition } from "../lib/bloomops/systems-blueprint-definition.mjs";
import { GHL_BUILD_BLUEPRINT_V1 } from "../lib/bloomops/systems-blueprint-defaults.mjs";
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
  out = resolve(arg("--out", "/tmp/bloomops-d2-interface/browser"));
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const require = createRequire(
  join(
    resolve(arg("--playwright", "/tmp/bloomops-c6-tools")),
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
    let response;
    try { response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }); }
    catch { throw new Error('Local magic-link navigation did not finish; URL details are omitted to protect the token.'); }
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
const layout = async (name, page, width) => {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
  const geometry = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth,
    controls: [...document.querySelectorAll('.bo-dialog button, .bo-build-check, #project-ghl-build button')].filter(n => n.checkVisibility()).map(n => n.getBoundingClientRect()).every(r => r.width > 0 && r.height >= 44 && r.x >= 0 && r.right <= innerWidth),
    text: [...document.querySelectorAll('.bo-build-check')].every(n => parseFloat(getComputedStyle(n).fontSize) >= 16),
  }));
  if (geometry.overflow || !geometry.controls || !geometry.text) console.error("Layout diagnostic", geometry);
  check(`${name} ${width}px fits and has usable targets/text`, !geometry.overflow && geometry.controls && geometry.text);
  await page.screenshot({ path: join(out, `${name}-${width}.png`), animations: 'disabled' }); screenshots++;
};
try {
  const health = await (await fetch(base + '/api/health')).json();
  check('local development Worker uses captured mail', health.environment === 'development' && health.auth.mail === 'r2-dev' && health.auth.configured);
  const suffix = randomUUID().slice(0, 8), ws = `d2-interface-${suffix}`, members = {};
  sql(`INSERT INTO workspaces(id,name,slug) VALUES(${lit(ws)},'Bloom Studio',${lit(ws)})`);
  for (const [name, role] of [['owner','owner'],['pm','project_manager'],['team','team_member'],['client','client']]) {
    const id = `${ws}-${name}`, membership = `m-${id}`, email = `${id}@example.com`; members[name] = { id, membership, email };
    sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(id)},${lit(name)},${lit(email)},1)`);
    sql(`INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit(membership)},${lit(ws)},${lit(id)},${lit(role)},'active')`);
  }
  const dept = `${ws}-systems`, type = `${ws}-ghl`, template = `${ws}-template`, version = `${ws}-version`, binding = `${ws}-binding`;
  const encoded = await encodeSystemsBlueprintDefinition(GHL_BUILD_BLUEPRINT_V1);
  sql(`INSERT INTO departments(id,workspace_id,name,slug) VALUES(${lit(dept)},${lit(ws)},'Systems','systems')`);
  sql(`INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(${lit(type)},${lit(ws)},'GHL','ghl',${lit(dept)})`);
  sql(`INSERT INTO templates(id,workspace_id,kind,name,slug) VALUES(${lit(template)},${lit(ws)},'systems','GHL build','ghl-build')`);
  sql(`INSERT INTO template_versions(id,workspace_id,template_id,version_number,status,definition_json,definition_hash,created_by_membership_id) VALUES(${lit(version)},${lit(ws)},${lit(template)},1,'draft',${lit(encoded.definitionJson)},${lit(encoded.definitionHash)},${lit(members.owner.membership)})`);
  sql(`UPDATE template_versions SET status='published',published_at='2026-09-12T08:00:00.000Z' WHERE id=${lit(version)}`);
  sql(`INSERT INTO service_type_blueprint_bindings(id,workspace_id,service_type_id,template_id,enabled,created_by_membership_id,updated_by_membership_id) VALUES(${lit(binding)},${lit(ws)},${lit(type)},${lit(template)},1,${lit(members.owner.membership)},${lit(members.owner.membership)})`);
  const owner = await login(members.owner.email), errors = []; owner.page.on('pageerror', e => errors.push(e.message));
  const clientId = (await api(owner.context, '/api/bloomops/clients', { name: 'Garden Studio', contactName: 'Garden', contactEmail: members.client.email, timezone: 'Etc/UTC' }, 201)).client.id;
  sql(`UPDATE client_contacts SET user_id=${lit(members.client.id)} WHERE workspace_id=${lit(ws)} AND client_id=${lit(clientId)}`);
  const service = (await api(owner.context, `/api/bloomops/clients/${clientId}/services`, { serviceTypeId: type }, 201)).service.id;
  const create = async (name, linked = true) => (await api(owner.context, `/api/bloomops/clients/${clientId}/projects`, { name, serviceEngagementId: linked ? service : null, visibility: 'client', clientLabel: name }, 201)).projectId;
  const project = await create('Garden GHL build'), stale = await create('Fresh preview build'), ordinary = await create('Ordinary work', false), denied = await create('Assigned build');
  const page = owner.page, goto = id => page.goto(`${base}/work/projects/${id}`, { waitUntil: 'networkidle' });
  const start = () => keyboardActivate(page, page.getByRole('button', { name: 'Start GHL build', exact: true }));
  await goto(project); check('eligible Project offers GHL build', await page.getByRole('button', { name: 'Start GHL build', exact: true }).isVisible());
  await page.getByRole('button', { name: 'Start GHL build', exact: true }).scrollIntoViewIfNeeded();
  for (const width of widths) await layout('entry', page, width);
  await start(); const dialog = page.getByRole('dialog');
  check('nothing preselected and preview disabled', await dialog.getByRole('checkbox').count() === 14 && await dialog.getByRole('checkbox', { checked: true }).count() === 0 && await dialog.getByRole('button', { name: 'Preview work' }).isDisabled());
  for (const width of widths) await layout('components', page, width);
  const email = dialog.getByLabel('Build email sequence'); await email.focus(); await page.keyboard.press('Space'); await dialog.getByLabel('Build SMS sequence').check();
  check('component selection is keyboard operable with visible focus', await email.isChecked());
  await page.route('**/blueprint/preview', async route => { await new Promise(resolve => setTimeout(resolve, 700)); await route.continue(); }, { times: 1 });
  await dialog.getByRole('button', { name: 'Preview work' }).click();
  check('preview has a loading state', await dialog.getByRole('status').isVisible());
  await page.getByRole('heading', { name: 'Review GHL work' }).waitFor();
  check('Email and SMS share one milestone', (await dialog.innerText()).includes('1 milestones · 2 actions · 2 deliverables'));
  await dialog.getByRole('button', { name: 'Back to components' }).click();
  check('back preserves the selection', await dialog.getByRole('checkbox', { checked: true }).count() === 2);
  for (const checkbox of await dialog.getByRole('checkbox').all()) await checkbox.check();
  await dialog.getByRole('button', { name: 'Preview work' }).click(); await page.getByRole('heading', { name: 'Review GHL work' }).waitFor();
  check('all-component preview shows canonical counts and internal initial state', /13 milestones · 14 actions · 8 deliverables/.test(await dialog.innerText()) && /Work starts internal/.test(await dialog.innerText()));
  for (const width of widths) await layout('preview', page, width);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await layout('preview-reduced-motion', page, 390);
  const close = dialog.getByRole('button', { name: 'Close', exact: true }).first(); await close.focus(); await page.keyboard.press('Shift+Tab');
  check('dialog traps reverse tab', await dialog.evaluate(n => n.contains(document.activeElement)));
  await page.keyboard.press('Escape'); check('Escape restores focus to the opener', await page.getByRole('button', { name: 'Start GHL build', exact: true }).evaluate(n => n === document.activeElement));
  await start();
  let lostBody, lostResult;
  await page.route('**/blueprint/generate', async route => {
    lostBody = route.request().postDataJSON(); const response = await route.fetch(); assert.equal(response.status(), 201); lostResult = await response.json(); await route.abort('failed');
  }, { times: 1 });
  await dialog.getByRole('button', { name: 'Generate work', exact: true }).click();
  await dialog.getByRole('button', { name: 'Retry this request' }).waitFor();
  await page.waitForFunction(() => document.querySelector('[role="alert"]'));
  check('lost response retains one immutable request and blocks component edits', !!lostResult.generationId && await dialog.getByRole('checkbox').count() === 0);
  const storage = await page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith('bloomops:ghl:')).map(key => sessionStorage.getItem(key)));
  check('saved retry contains only input, not plan or labels', storage.length === 1 && JSON.parse(storage[0]).requestId === lostBody.requestId && !/definitionJson|Garden|Build funnel/.test(storage[0]));
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Resume GHL build request' }).click();
  const retryResponse = page.waitForResponse(r => r.url().endsWith('/blueprint/generate') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Retry this request', exact: true }).click();
  const retried = await retryResponse; check('reload retries the original packet and proves the prior commit', retried.status() === 200 && retried.request().postDataJSON().requestId === lostBody.requestId && (await retried.json()).replayed);
  await page.getByRole('dialog').waitFor({ state: 'detached' }); await page.waitForTimeout(500);
  check('canonical Project displays generated work and internal activity', await page.getByText('Systems work generated', { exact: true }).isVisible() && await page.getByText('Build funnel', { exact: true }).count() > 0);
  check('successful retry clears pending recovery and removes generation entry', await page.getByRole('button', { name: /GHL build/ }).count() === 0 && await page.evaluate(() => Object.keys(sessionStorage).filter(k => k.startsWith('bloomops:ghl:')).length) === 0);
  const facts = sql(`SELECT (SELECT count(*) FROM milestones WHERE project_id=${lit(project)}) AS milestones,(SELECT count(*) FROM actions WHERE project_id=${lit(project)}) AS actions,(SELECT count(*) FROM deliverables WHERE project_id=${lit(project)}) AS deliverables,(SELECT count(*) FROM systems_blueprint_generations WHERE project_id=${lit(project)}) AS receipts,(SELECT count(*) FROM activity_events WHERE subject_id=${lit(project)} AND event_type='PROJECT_BLUEPRINT_GENERATED') AS events`)[0];
  check('actual D1 has one complete generation and event', JSON.stringify(facts) === JSON.stringify({ milestones: 13, actions: 14, deliverables: 8, receipts: 1, events: 1 }));
  await goto(stale); await start(); await dialog.getByLabel('Build funnel').check(); await dialog.getByRole('button', { name: 'Preview work' }).click(); await page.getByRole('heading', { name: 'Review GHL work' }).waitFor();
  sql(`UPDATE projects SET revision=revision+1 WHERE id=${lit(stale)}`);
  await dialog.getByRole('button', { name: 'Generate work', exact: true }).click(); await dialog.getByRole('button', { name: 'Refresh preview' }).waitFor();
  check('stale confirmation creates no work', sql(`SELECT count(*) AS n FROM systems_blueprint_generations WHERE project_id=${lit(stale)}`)[0].n === 0);
  await dialog.getByRole('button', { name: 'Refresh preview' }).click(); await page.getByRole('heading', { name: 'Choose GHL components' }).waitFor();
  check('explicit fresh preview recovers a completed stale rejection', await dialog.getByRole('checkbox', { checked: true }).count() === 0);
  await dialog.getByLabel('Build funnel').check(); await dialog.getByRole('button', { name: 'Preview work' }).click(); await page.getByRole('heading', { name: 'Review GHL work' }).waitFor();
  await dialog.getByRole('button', { name: 'Generate work', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'detached' });
  await goto(ordinary); check('ordinary Work Project has no irrelevant GHL entry', await page.getByRole('button', { name: 'Start GHL build', exact: true }).count() === 0);
  await goto(denied); await start(); await dialog.getByLabel('Build funnel').check();
  await dialog.getByRole('button', { name: 'Preview work' }).click(); await page.getByRole('heading', { name: 'Review GHL work' }).waitFor();
  await page.evaluate(() => { window.__originalStorageSet = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
    if (key.startsWith('bloomops:ghl:')) throw new DOMException('Storage unavailable', 'QuotaExceededError'); return window.__originalStorageSet.call(this, key, value);
  }; });
  await dialog.getByRole('button', { name: 'Generate work', exact: true }).click();
  await dialog.getByText('This tab cannot save a retry request. Allow session storage before generating work.').waitFor();
  check('storage failure stops before sending a generation', sql(`SELECT count(*) AS n FROM systems_blueprint_generations WHERE project_id=${lit(denied)}`)[0].n === 0);
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalStorageSet; delete window.__originalStorageSet; });
  await page.keyboard.press('Escape');
  await api(owner.context, `/api/bloomops/projects/${denied}/assignments`, { membershipId: members.team.membership }, 200);
  const team = await login(members.team.email, `/work/projects/${denied}`);
  check('assigned Team Member cannot start generation', await team.page.getByRole('button', { name: /GHL build/ }).count() === 0 && (await team.context.request.get(`${base}/api/bloomops/projects/${denied}/blueprint`)).status() === 403);
  const client = await login(members.client.email, '/portal');
  await client.page.goto(`${base}/portal`, { waitUntil: 'networkidle' });
  const portal = await client.page.locator('body').innerText();
  check('Client portal renders the actual client-visible Project', portal.includes('Garden GHL build'));
  for (const kind of ['milestones', 'deliverables']) {
    const r = await client.context.request.get(`${base}/api/bloomops/portal/projects/${project}/${kind}`);
    check(`Client ${kind} API excludes internal generated outputs`, r.status() === 200 && !/GHL funnel|Build funnel|Email sequence|Email\/SMS|ghl_/.test(await r.text()));
  }
  check('Client cannot access blueprint endpoints or internal generated content', (await client.context.request.get(`${base}/api/bloomops/projects/${project}/blueprint`)).status() === 404 && !/Build funnel|Perform internal QA|Systems work generated|Start GHL build/.test(portal));
  check('no browser page errors', errors.length === 0);
  console.log(`D2 generation browser: ${checks} checks passed; ${screenshots} screenshots. Synthetic workspace ${ws}.`);
} finally { await browser.close(); }
