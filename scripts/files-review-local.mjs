#!/usr/bin/env node
// Built-Worker HTTP + browser B5 Files acceptance. Loopback and development
// R2 mail only. Run auth-smoke-local first to bootstrap the local workspace.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, join } from "node:path";
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const base = arg("--url", "http://localhost:8787"),
  out = resolve(arg("--out", "/tmp/bloomops-b5-review"));
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
  if (await page.getByRole('dialog').count() === 0) await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {})));
  });
  await page.evaluate(() => document.fonts.ready);
  const bounds = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
    overflowingRows: [...document.querySelectorAll('.bo-file, .bo-file-attachment, [aria-label="Your projects"] > li')]
      .map(row => ({ width: row.clientWidth, content: row.scrollWidth })).filter(row => row.content > row.width) }));
  if (bounds.document > bounds.viewport || bounds.overflowingRows.length) console.error('Overflow diagnostic:', JSON.stringify(bounds));
  check(`${label} ${width}px fits the viewport and File rows`, bounds.document <= bounds.viewport && bounds.overflowingRows.length === 0);
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
  const health = await (await fetch(base + '/api/health')).json(); check('built Worker uses development and local R2 mail', health.environment === 'development' && health.auth.mail === 'r2-dev' && health.auth.configured);
  const reference = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const referenceResponse = await reference.goto('https://bloomlab-preview.cool-sunset-2169.workers.dev/design'); check('live Bloom design reference is accessible', referenceResponse?.ok());
  await reference.waitForFunction(() => document.querySelector('h1') && !document.body.innerText.includes('Loading...')); await reference.evaluate(() => document.fonts.ready);
  await reference.screenshot({ path: join(out, 'design-reference.png'), fullPage: true }); await reference.close();
  const owner = await login('smoke-owner@example.com'), suffix = randomUUID().slice(0, 8), ws = sql("SELECT id FROM workspaces WHERE slug='smoke-agency'")[0].id;
  const clientId = (await api(owner.context, '/api/bloomops/clients', { name: `James B5 ${suffix}`, contactName: 'James', contactEmail: `james-b5-${suffix}@example.com` }, 201)).client.id;
  const serviceTypeId = sql(`SELECT id FROM service_types WHERE workspace_id=${lit(ws)} AND slug='social-media-management'`)[0].id;
  const serviceId = (await api(owner.context, `/api/bloomops/clients/${clientId}/services`, { serviceTypeId }, 201)).service.id;
  const projectId = (await api(owner.context, `/api/bloomops/clients/${clientId}/projects`, { name: `Website files B5 ${suffix}`, visibility: 'client', clientLabel: 'Your new website', serviceEngagementId: serviceId }, 201)).projectId;
  const projectPath = `/api/bloomops/projects/${projectId}`, path = projectPath + '/files', portalPath = `/api/bloomops/portal/projects/${projectId}/files`, itemPath = id => `/api/bloomops/files/${id}`;
  const members = {};
  for (const [name, role] of [['sam', 'team_member'], ['james', 'client'], ['pm', 'project_manager']]) {
    const id = `b5-${name}-${suffix}`, membership = `m-${id}`, email = `${id}@example.com`;
    sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(id)},${lit(name === 'sam' ? 'Sam Contractor' : name)},${lit(email)},1)`);
    sql(`INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit(membership)},${lit(ws)},${lit(id)},${lit(role)},'active')`); members[name] = { id, membership, email };
  }
  sql(`UPDATE client_contacts SET user_id=${lit(members.james.id)} WHERE client_id=${lit(clientId)} AND workspace_id=${lit(ws)} AND is_primary=1`);
  const milestoneId = (await api(owner.context, projectPath + '/milestones', { name: 'B5_PRIVATE_MILESTONE', requestId: randomUUID() }, 201)).milestoneId;
  const actionId = (await api(owner.context, projectPath + '/actions', { title: 'B5_PRIVATE_BUILD', milestoneId, assigneeMembershipId: members.sam.membership, requestId: randomUUID() }, 201)).actionId;
  const deliverableId = (await api(owner.context, projectPath + '/deliverables', { title: 'B5_PRIVATE_DELIVERABLE', clientLabel: 'Your website', visibility: 'client', requestId: randomUUID() }, 201)).deliverableId;
  const sam = await login(members.sam.email, '/work'), client = await login(members.james.email, '/portal'), pm = await login(members.pm.email, '/work');
  const stored = () => sql(`SELECT assets.* FROM assets JOIN asset_links ON asset_links.asset_id=assets.id WHERE asset_links.project_id=${lit(projectId)} ORDER BY assets.rowid`);
  const history = () => sql(`SELECT * FROM activity_events WHERE subject_type='file' AND subject_id IN (SELECT asset_id FROM asset_links WHERE project_id=${lit(projectId)}) ORDER BY rowid`);
  const parents = () => JSON.stringify([...['projects', 'milestones', 'actions', 'deliverables'].map(table => sql(`SELECT * FROM ${table} WHERE ${table === 'projects' ? 'id' : 'project_id'}=${lit(projectId)} ORDER BY rowid`)), sql(`SELECT * FROM bloomops_clients WHERE id=${lit(clientId)}`), sql(`SELECT * FROM service_engagements WHERE id=${lit(serviceId)}`)]);
  const beforeParents = parents(), get = async id => (await (await owner.context.request.get(base + itemPath(id))).json()).file;
  const edit = async (id, visibility) => {
    const r = await owner.context.request.patch(base + itemPath(id), { headers: { origin: base }, data: { operation: 'visibility', visibility, expectedRevision: (await get(id)).revision } }); assert.equal(r.status(), 200, await r.text()); return r.json();
  };
  const bytes = Buffer.from('BloomOps B5 client handoff\nActual file bytes.\n'), file = (name = 'Website handoff.txt') => ({ name, mimeType: 'text/plain', buffer: bytes });
  const upload = async (details = {}, options = {}) => {
    const metadata = { requestId: randomUUID(), filename: 'API handoff.txt', mimeType: 'text/plain', byteSize: bytes.length, visibility: 'internal', ...details };
    const r = await (options.context || owner.context).request.post(base + path, { headers: { origin: options.origin || base, 'content-type': 'application/octet-stream', 'x-bloomops-file': encodeURIComponent(JSON.stringify(metadata)) }, data: options.bytes || bytes }); return { response: r, metadata };
  };
  await owner.page.goto(`${base}/work/projects/${projectId}`);
  const section = owner.page.getByRole('region', { name: 'Files', exact: true }), row = id => section.locator(`[data-file-id="${id}"]`);
  check('Project has a functional empty Files section', await section.getByText('No files to show yet.', { exact: true }).isVisible());
  check('empty portal omits Files', await client.page.getByRole('list', { name: 'Shared files', exact: true }).count() === 0);
  for (const width of widths) await layout('files-empty', owner.page, width);
  const creations = [];
  owner.page.on('request', request => { if (request.method() === 'POST' && request.url() === base + path) creations.push(decodeURIComponent(request.headers()['x-bloomops-file'])); });
  await keyboardActivate(owner.page, section.getByRole('button', { name: 'Upload file', exact: true }));
  let dialog = owner.page.getByRole('dialog'); await owner.page.waitForFunction(() => document.activeElement?.id === 'file-upload');
  check('keyboard opens upload at the labelled file input', await dialog.getByLabel('File', { exact: true }).evaluate(n => n === document.activeElement));
  await dialog.getByRole('button', { name: 'Upload', exact: true }).click(); check('empty upload has a focused and announced error', await dialog.locator('#file-upload').evaluate(n => n === document.activeElement && n.getAttribute('aria-invalid') === 'true'));
  for (const width of widths) await layout('file-upload-error', owner.page, width);
  const chooser = owner.page.waitForEvent('filechooser'); await dialog.locator('#file-upload').focus(); await owner.page.keyboard.press('Enter'); await (await chooser).setFiles(file());
  check('keyboard file chooser supplies a real file', await dialog.locator('#file-upload').evaluate(n => n.files[0].name) === 'Website handoff.txt');
  await dialog.getByLabel('Attach to', { exact: true }).selectOption(deliverableId); await dialog.getByLabel('File visibility', { exact: true }).selectOption('client');
  const response = owner.page.waitForResponse(r => r.request().method() === 'POST' && r.url() === base + path);
  await dialog.getByRole('button', { name: 'Upload', exact: true }).evaluate(button => { button.click(); button.click(); });
  const result = await response; assert.equal(result.status(), 201, await result.text()); const id = (await result.json()).fileId;
  await dialog.waitFor({ state: 'hidden' }); await row(id).waitFor();
  check('double-click uploads one File, object generation and semantic event', creations.length === 1 && stored().length === 1 && history().length === 1 && sql(`SELECT count(*) n FROM asset_upload_attempts WHERE asset_id=${lit(id)}`)[0].n === 1);
  const first = stored()[0]; check('server-owned opaque key and ready metadata are coherent', first.status === 'ready' && Boolean(first.ready_at) && first.object_key.startsWith(`bloomops-files/${ws}/`) && !first.object_key.includes('handoff'));
  check('File activity derives Client and Service without storage keys', history()[0].client_id === clientId && history()[0].service_engagement_id === serviceId && !/object_key|bloomops-files|bucket/.test(history()[0].metadata_json));
  const again = await upload(JSON.parse(creations[0])); assert.equal(again.response.status(), 201); const retry = await again.response.json();
  check('response-loss retry preserves File, bytes, timestamp and history', retry.unchanged && retry.fileId === id && stored().length === 1 && history().length === 1 && stored()[0].ready_at === first.ready_at && sql(`SELECT count(*) n FROM asset_upload_attempts WHERE asset_id=${lit(id)}`)[0].n === 1);
  check('incompatible retry is refused', (await upload(JSON.parse(creations[0]), { bytes: Buffer.alloc(bytes.length) })).response.status() === 409);
  const secretName = `B5_INTERNAL_${suffix}.txt`, internal = await upload({ filename: secretName }); assert.equal(internal.response.status(), 201); const internalId = (await internal.response.json()).fileId;
  const restricted = await upload({ filename: `B5_RESTRICTED_${suffix}.txt`, visibility: 'restricted' }); assert.equal(restricted.response.status(), 201); const restrictedId = (await restricted.response.json()).fileId;
  await owner.page.reload(); check('Deliverable clearly shows its actual attachment', await owner.page.locator(`[data-deliverable-id="${deliverableId}"]`).getByRole('button', { name: 'Download Website handoff.txt', exact: true }).count() === 1);
  const unhydrated = await browser.newContext({ javaScriptEnabled: false, storageState: await owner.context.storageState() }), unhydratedPage = await unhydrated.newPage();
  await unhydratedPage.goto(`${base}/work/projects/${projectId}`);
  const unhydratedFiles = unhydratedPage.getByRole('region', { name: 'Files', exact: true });
  check('server-rendered upload stays disabled without hydration', await unhydratedFiles.getByRole('button', { name: 'Upload file', exact: true }).isDisabled());
  check('server-rendered download stays disabled without hydration', await unhydratedFiles.getByRole('button', { name: 'Download Website handoff.txt', exact: true }).isDisabled());
  check('server-rendered mutation controls stay disabled without hydration', await unhydratedFiles.getByRole('button', { name: 'Change file visibility', exact: true }).first().isDisabled() && await unhydratedFiles.getByRole('button', { name: 'Archive file', exact: true }).first().isDisabled());
  await unhydrated.close();
  for (const width of widths) await layout('project-files', owner.page, width);
  await keyboardActivate(owner.page, row(id).getByRole('button', { name: 'Change file visibility', exact: true })); dialog = owner.page.getByRole('dialog'); await owner.page.waitForFunction(() => document.activeElement?.id === 'file-visibility');
  for (const width of widths) await layout('file-visibility', owner.page, width);
  await dialog.getByRole('button', { name: 'Save file visibility', exact: true }).focus(); await owner.page.keyboard.press('Tab'); check('visibility dialog traps keyboard focus', await dialog.evaluate(n => n.contains(document.activeElement)));
  await owner.page.keyboard.press('Escape'); check('Escape restores the file control opener', await row(id).getByRole('button', { name: 'Change file visibility', exact: true }).evaluate(n => n === document.activeElement));
  const downloadEvent = owner.page.waitForEvent('download'); await keyboardActivate(owner.page, row(id).getByRole('button', { name: 'Download Website handoff.txt', exact: true })); const downloaded = await downloadEvent;
  check('keyboard download saves exact bytes and display filename', downloaded.suggestedFilename() === 'Website handoff.txt' && readFileSync(await downloaded.path()).equals(bytes));
  check('Action-only assignee cannot guess File or byte routes', (await sam.context.request.get(base + path)).status() === 404 && (await sam.context.request.get(base + itemPath(id) + '/download')).status() === 404);
  await api(owner.context, projectPath + '/assignments', { membershipId: members.sam.membership }); await sam.page.goto(`${base}/work/projects/${projectId}`);
  const teamSection = sam.page.getByRole('region', { name: 'Files', exact: true });
  check('Team Files are readable with downloads and no coordinator controls', await teamSection.locator('[data-file-id]').count() === 3 && await teamSection.getByRole('button', { name: /Download/ }).count() === 3 && await teamSection.getByRole('button', { name: /Upload|Archive|visibility/ }).count() === 0);
  for (const width of widths) await layout('files-team', sam.page, width);
  for (const [endpoint, method, data] of [[itemPath(id), 'patch', { operation: 'archive', expectedRevision: 2 }], [itemPath(id) + '/retry', 'post', {}]]) { const denied = await sam.context.request[method](base + endpoint, { headers: { origin: base }, data }); check('Team writes are server-denied', denied.status() === 403 && noStore(denied)); }
  check('Team upload is server-denied', (await upload({}, { context: sam.context })).response.status() === 403);
  const portalResponse = await client.context.request.get(base + portalPath), dto = await portalResponse.json();
  check('Client DTO has exactly six safe fields and only the visible Ready file', noStore(portalResponse) && Object.keys(dto).join(',') === 'items' && dto.items.length === 1 && Object.keys(dto.items[0]).sort().join(',') === 'attachmentLabel,byteSize,filename,id,mimeType,readyAt');
  await client.page.reload(); check('portal HTML hides internal filenames, titles, uploader and storage authority', !/B5_PRIVATE|B5_INTERNAL|B5_RESTRICTED|Sam Contractor|bloomops-files\/|sha256|objectKey/.test(await client.page.content()));
  for (const width of widths) await layout('files-portal', client.page, width);
  const clientDownload = client.page.waitForEvent('download'); await keyboardActivate(client.page, client.page.getByRole('button', { name: 'Download Website handoff.txt', exact: true }));
  check('Client keyboard download saves the same original bytes', readFileSync(await (await clientDownload).path()).equals(bytes));
  const bytesResponse = await client.context.request.get(base + itemPath(id) + '/download'); check('byte response is a private attachment with safe headers', bytesResponse.status() === 200 && bytesResponse.headers()['content-disposition'].startsWith('attachment;') && bytesResponse.headers()['cache-control'].includes('private') && noStore(bytesResponse) && bytesResponse.headers()['x-content-type-options'] === 'nosniff' && (await bytesResponse.body()).equals(bytes));
  for (const fileId of [internalId, restrictedId, actionId, milestoneId, deliverableId, 'missing']) { const denied = await client.context.request.get(base + itemPath(fileId) + '/download'); check('hidden/other-domain guessed byte ID has identical uncached 404', denied.status() === 404 && noStore(denied) && await denied.text() === '{"error":"Not found."}'); }
  await pm.page.goto(`${base}/work/projects/${projectId}`); check('PM reads ordinary File history', (await pm.page.content()).includes(secretName));
  await edit(internalId, 'restricted'); await pm.page.reload(); check('restriction removes File metadata and old filename from PM history', !(await pm.page.content()).includes(secretName));
  await edit(id, 'internal'); await client.page.reload(); check('hidden-only Files omit portal section and byte access immediately', await client.page.getByRole('list', { name: 'Shared files', exact: true }).count() === 0 && (await client.context.request.get(base + itemPath(id) + '/download')).status() === 404);
  await edit(id, 'client');
  check('cross-Origin upload is refused', (await upload({}, { origin: 'https://evil.example' })).response.status() === 403);
  for (const bad of [{ workspaceId: 'foreign' }, { objectKey: 'dev-mail/secret' }, { byteSize: 5 * 1024 * 1024 + 1 }, { filename: 'bad\r\nX:y' },
    { mimeType: { toString: 'invalid', valueOf: 'invalid' } }, { byteSize: { toString: 'invalid', valueOf: 'invalid' } }]) {
    const denied = (await upload(bad)).response; check('invalid size, filename, field type or authority is safely refused', denied.status() === (typeof bad.byteSize === 'number' ? 413 : 400) && noStore(denied));
  }
  sql(`CREATE TRIGGER b5_browser_fail BEFORE INSERT ON activity_events WHEN NEW.subject_type='file' AND NEW.event_type='FILE_UPLOADED' AND NEW.workspace_id=${lit(ws)} BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL INTERNAL_ID'); END`);
  let failedId;
  try {
    const failed = await upload({ filename: 'Retry handoff.txt', visibility: 'client' }); check('late finalize failure is sanitized and never Ready', failed.response.status() === 500 && noStore(failed.response) && !/PRIVATE|SQL|stack|objectKey/.test(await failed.response.text()));
    failedId = stored().find(file => file.filename === 'Retry handoff.txt').id; check('failed upload owns recoverable metadata and no semantic upload event', stored().find(file => file.id === failedId).status === 'failed' && !history().some(event => event.subject_id === failedId) && (await owner.context.request.get(base + itemPath(failedId) + '/download')).status() === 404);
  } finally { sql('DROP TRIGGER b5_browser_fail'); }
  await owner.page.reload(); await keyboardActivate(owner.page, row(failedId).getByRole('button', { name: 'Retry upload', exact: true })); dialog = owner.page.getByRole('dialog');
  for (const width of widths) await layout('file-retry', owner.page, width);
  await dialog.locator('#file-upload').setInputFiles(file('Retry handoff.txt')); await dialog.getByRole('button', { name: 'Upload', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); await row(failedId).getByText('Ready', { exact: true }).waitFor();
  await owner.page.waitForFunction(id => document.querySelector(`[data-file-id="${id}"]`)?.contains(document.activeElement), failedId);
  await keyboardActivate(owner.page, row(failedId).getByRole('button', { name: 'Archive file', exact: true })); dialog = owner.page.getByRole('dialog');
  // B7: inspect immediately, before CLI history reads or five-width captures
  // can let the real five-second success toast expire and hide an obstruction.
  for (const width of [390, 320]) {
    await owner.page.setViewportSize({ width, height: 900 });
    await dialog.evaluate(async panel => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      await Promise.all(panel.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
    });
    check(`fresh upload toast remains present during ${width}px archive confirmation`, await owner.page.locator('.bo-toast').count() > 0);
    await owner.page.screenshot({ path: join(out, `file-toast-${width}.png`), animations: 'disabled' }); screenshots++;
    check(`upload toast cannot intercept the ${width}px Archive button`, await dialog.getByRole('button', { name: 'Archive file', exact: true }).evaluate(button => {
      const rect = button.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return hit === button || button.contains(hit);
    }));
  }
  check('retry restores focus to a surviving File control and records one Ready event', history().filter(event => event.subject_id === failedId && event.event_type === 'FILE_UPLOADED').length === 1);
  for (const width of widths) await layout('file-archive', owner.page, width);
  await dialog.getByRole('button', { name: 'Archive file', exact: true }).click(); await dialog.waitFor({ state: 'hidden' }); await row(failedId).waitFor({ state: 'detached' });
  await owner.page.waitForFunction(() => document.activeElement?.id === 'upload-file'); check('archive restores focus after removing the row and denies downloads', stored().find(file => file.id === failedId).status === 'archived' && (await client.context.request.get(base + itemPath(failedId) + '/download')).status() === 404);
  check('Files preserve every existing Client Service Project Milestone Action Deliverable fact', beforeParents === parents());
  const projectRevision = sql(`SELECT revision FROM projects WHERE id=${lit(projectId)}`)[0].revision;
  assert.equal((await owner.context.request.patch(base + projectPath, { headers: { origin: base }, data: { visibility: 'internal', expectedRevision: projectRevision } })).status(), 200);
  check('hidden Project revokes Client metadata and bytes', (await client.context.request.get(base + portalPath)).status() === 404 && (await client.context.request.get(base + itemPath(id) + '/download')).status() === 404);
  assert.equal((await owner.context.request.patch(base + projectPath, { headers: { origin: base }, data: { visibility: 'client', expectedRevision: projectRevision + 1 } })).status(), 200);
  sql(`DELETE FROM project_assignments WHERE membership_id=${lit(members.sam.membership)} AND project_id=${lit(projectId)}`); check('issued Team session loses both metadata and bytes after unassignment', (await sam.context.request.get(base + itemPath(id))).status() === 404 && (await sam.context.request.get(base + itemPath(id) + '/download')).status() === 404);
  sql(`UPDATE client_contacts SET user_id=NULL WHERE client_id=${lit(clientId)} AND user_id=${lit(members.james.id)}`); check('contact unlink revokes issued Client metadata and bytes', (await client.context.request.get(base + portalPath)).status() === 404 && (await client.context.request.get(base + itemPath(id) + '/download')).status() === 404);
  sql(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(members.james.membership)}`); check('membership suspension revokes issued Client identity session', (await client.context.request.get(base + portalPath)).status() === 403 && (await client.context.request.get(base + itemPath(id) + '/download')).status() === 403);
  await owner.page.reload(); await owner.page.emulateMedia({ reducedMotion: 'reduce' }); await layout('files-reduced-motion', owner.page, 320); check('reduced motion disables button transitions', await owner.page.locator('.bo-btn').first().evaluate(n => getComputedStyle(n).transitionDuration.split(',').every(v => parseFloat(v) <= 0.01)));
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, storageState: await owner.context.storageState() }), touchPage = await touch.newPage(); await touchPage.goto(`${base}/work/projects/${projectId}`);
  const add = touchPage.getByRole('region', { name: 'Files', exact: true }).getByRole('button', { name: 'Upload file', exact: true }); await touchPage.waitForFunction(n => n && !n.disabled, await add.elementHandle()); await add.tap(); check('touch opens file upload', await touchPage.getByRole('dialog').isVisible()); await layout('file-touch-upload', touchPage, 390); await touch.close();
  console.log(`B5 browser/HTTP: ${checks} checks passed; ${screenshots} screenshots at ${widths.join(', ')}px plus the design reference.`);
} catch (error) {
  console.error('B5 browser acceptance failed:', String(error?.message || error).split('\n').filter(line => !/cookie:|authorization:|token=/i.test(line)).join('\n')); process.exitCode = 1;
  const health = await fetch(base + '/api/health', { signal: AbortSignal.timeout(5000) }).then(response => `HTTP ${response.status}`).catch(() => 'unreachable');
  console.error('Local Worker health after failure:', health);
} finally { await browser.close(); }
