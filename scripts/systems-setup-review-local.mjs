#!/usr/bin/env node
// D2/D3 explicit Systems setup UI against the actual local Worker. Synthetic isolated workspace,
// captured local mail only; no live configuration or provider execution.
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
  out = resolve(arg("--out", "/tmp/bloomops-d2-setup/browser"));
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const kind = arg('--platform', 'ghl'); assert.ok(['ghl','kajabi'].includes(kind));
const executionReview = process.argv.includes('--execution');
const platform = kind === 'kajabi' ? 'Kajabi' : 'GHL', otherKind = kind === 'kajabi' ? 'ghl' : 'kajabi';
const buildLabels = kind === 'kajabi' ? ['Build course','Configure offer and checkout','Build nurture sequence','Perform internal QA'] : ['Confirm build scope','Build funnel','Perform internal QA'];
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
    controls: [...(document.querySelector('.bo-dialog') || document.querySelector('main')).querySelectorAll('button, select, .bo-build-check')].filter(n => n.checkVisibility()).map(n => n.getBoundingClientRect()).every(r => r.width > 0 && r.height >= 44 && r.x >= 0 && r.right <= innerWidth),
    text: [...document.querySelectorAll('.bo-build-check')].every(n => parseFloat(getComputedStyle(n).fontSize) >= 16),
  }));
  if (geometry.overflow || !geometry.controls || !geometry.text) console.error("Layout diagnostic", geometry);
  check(`${name} ${width}px fits and has usable targets/text`, !geometry.overflow && geometry.controls && geometry.text);
  await page.screenshot({ path: join(out, `${name}-${width}.png`), animations: 'disabled' }); screenshots++;
};try {
  const health = await (await fetch(base + '/api/health')).json();
  check('local development Worker uses captured mail', health.environment === 'development' && health.auth.mail === 'r2-dev' && health.auth.configured);
  const suffix = randomUUID().slice(0,8), ws = `systems-${kind}-${suffix}`, members = {};
  sql(`INSERT INTO workspaces(id,name,slug) VALUES(${lit(ws)},'Bloom Studio',${lit(ws)})`);
  for (const [name, role] of [['owner','owner'],['pm','project_manager'],['team','team_member'],['client','client']]) {
    const id = `${ws}-${name}`, membership = `m-${id}`, email = `${id}@example.com`; members[name] = { id, membership, email };
    sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(id)},${lit(name)},${lit(email)},1)`);
    sql(`INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit(membership)},${lit(ws)},${lit(id)},${lit(role)},'active')`);
  }
  const dept = `${ws}-systems`, types = {}, other = `${ws}-other-template`;
  sql(`INSERT INTO departments(id,workspace_id,name,slug) VALUES(${lit(dept)},${lit(ws)},'Systems','systems')`);
  for (const [key,name] of [['ghl','GHL'],['kajabi','Kajabi'],['other','Other Systems delivery']]) {
    types[key] = `${ws}-${key}`; sql(`INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(${lit(types[key])},${lit(ws)},${lit(name)},${lit(key)},${lit(dept)})`);
  }
  sql(`INSERT INTO templates(id,workspace_id,kind,name,slug) VALUES(${lit(other)},${lit(ws)},'systems','Other blueprint','other-blueprint')`);
  sql(`INSERT INTO service_type_blueprint_bindings(id,workspace_id,service_type_id,template_id,enabled) VALUES(${lit(ws+'-other-binding')},${lit(ws)},${lit(types.other)},${lit(other)},1)`);
  const endpoint = `/api/bloomops/systems/${kind}-setup`, owner = await login(members.owner.email, '/settings'), page = owner.page, errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('link', { name: `Manage ${platform} build setup` }).click(); await page.getByRole('heading', { name: `${platform} build setup`, exact: true }).waitFor(); await page.waitForLoadState('networkidle');
  const select = page.getByLabel('Service type', { exact: true }), checkbox = () => page.getByLabel(`Enable ${platform} builds`, { exact: true });
  const options = async context => { const r = await context.request.get(base + endpoint); assert.equal(r.status(),200); check('setup response is uncached', noStore(r)); return r.json(); };
  const configure = async (context, type, enabled) => {
    const row = (await options(context)).serviceTypes.find(r => r.id === type);
    return api(context, endpoint, { serviceTypeId: type, enabled, expectedBinding: row.binding ? { id: row.binding.id, revision: row.binding.revision } : null }, 200);
  };
  check('setup has no default Service Type selection or automatic provisioning', await select.inputValue() === '' && sql(`SELECT count(*) AS n FROM templates WHERE workspace_id=${lit(ws)} AND slug='${kind}-build'`)[0].n === 0);
  for (const width of widths) await layout('setup-empty-choice', page, width);
  await select.selectOption(types[kind]); check('selected unbound service starts disabled', !await checkbox().isChecked() && await page.getByRole('button', { name: 'Review setup' }).isDisabled());
  await checkbox().focus(); await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Review setup' }).click(); let dialog = page.getByRole('dialog');
  check('review names the exact choice before writing', (await dialog.innerText()).includes(`Enable ${platform} builds for ${platform}?`) && sql(`SELECT count(*) AS n FROM templates WHERE workspace_id=${lit(ws)} AND slug='${kind}-build'`)[0].n === 0);
  for (const width of widths) await layout('setup-confirm', page, width);
  await page.emulateMedia({ reducedMotion: 'reduce' }); await layout('setup-reduced-motion', page, 390);
  await page.keyboard.press('Escape'); check('Escape returns focus without saving', await page.getByRole('button', { name: 'Review setup' }).evaluate(n => n === document.activeElement));
  await page.getByRole('button', { name: 'Review setup' }).click();
  await page.route(`**/systems/${kind}-setup`, async route => { await new Promise(resolve => setTimeout(resolve,700)); await route.continue(); }, { times: 1 });
  await dialog.getByRole('button', { name: 'Enable builds', exact: true }).click(); check('saving has a disabled loading confirmation', await dialog.getByRole('button', { name: 'Enable builds', exact: true }).isDisabled());
  await dialog.waitFor({ state: 'detached' });
  check('explicit confirmation enables only the selected service', await checkbox().isChecked() && (await options(owner.context)).serviceTypes.find(r => r.id === types[otherKind]).binding === null);
  const installed = sql(`SELECT t.id AS template_id,v.status,v.definition_hash FROM templates t JOIN template_versions v ON v.template_id=t.id AND v.workspace_id=t.workspace_id WHERE t.workspace_id=${lit(ws)} AND t.slug='${kind}-build'`);
  check('default is provisioned once and published', installed.length === 1 && installed[0].status === 'published' && /^[a-f0-9]{64}$/.test(installed[0].definition_hash));
  await select.selectOption(types[otherKind]); check('unselected other platform remains disabled', !await checkbox().isChecked());
  await select.selectOption(types.other); check('existing other blueprint cannot be changed in this flow', await page.getByText('Another blueprint is already configured for this service type.').isVisible() && await page.getByRole('button', { name: 'Review setup' }).isDisabled());
  const clientId = (await api(owner.context, '/api/bloomops/clients', { name: 'Garden Studio', contactName: 'Garden', contactEmail: members.client.email, timezone: 'Etc/UTC' }, 201)).client.id;
  sql(`UPDATE client_contacts SET user_id=${lit(members.client.id)} WHERE workspace_id=${lit(ws)} AND client_id=${lit(clientId)}`);
  const service = (await api(owner.context, `/api/bloomops/clients/${clientId}/services`, { serviceTypeId: types[kind] }, 201)).service.id;
  const create = async name => (await api(owner.context, `/api/bloomops/clients/${clientId}/projects`, { name, serviceEngagementId: service, visibility: 'client', clientLabel: name }, 201)).projectId;
  const project = await create('Garden build'), nextProject = await create('Next build');
  await page.goto(`${base}/work/projects/${project}`, { waitUntil: 'networkidle' }); await page.getByRole('button', { name: `Start ${platform} build`, exact: true }).click();
  dialog = page.getByRole('dialog');
  for (const width of widths) await layout('build-components', page, width);
  for (const label of buildLabels) await dialog.getByLabel(label).check();
  await dialog.getByRole('button', { name: 'Preview work' }).click(); await page.getByRole('heading', { name: `Review ${platform} work` }).waitFor();
  check('setup feeds the selected canonical build preview', (await dialog.innerText()).includes(kind === 'kajabi' ? '4 milestones · 4 actions · 3 deliverables' : '3 milestones · 3 actions · 1 deliverables'));
  for (const width of widths) await layout('build-preview', page, width);
  let generationInput;
  if (kind === 'kajabi') {
    let committed, attempts = 0;
    await page.route('**/blueprint/generate', async route => {
      attempts++; generationInput = route.request().postDataJSON();
      const response = await route.fetch(); committed = { status: response.status(), data: await response.json() };
      await route.abort('failed');
    }, { times: 1 });
    await dialog.getByRole('button', { name: 'Generate work', exact: true }).click();
    await dialog.getByRole('alert').waitFor();
    assert.equal(committed?.status, 201); assert.ok(committed.data.ok);
    await page.reload({ waitUntil: 'networkidle' });
    check('lost Kajabi response survives reload without automatic submission', attempts === 1 && await page.getByRole('button', { name: 'Resume build request', exact: true }).isVisible());
    await page.getByRole('button', { name: 'Resume build request', exact: true }).click();
    const replayResponse = page.waitForResponse(r => r.url().endsWith('/blueprint/generate') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Retry this request', exact: true }).click();
    const replayed = await replayResponse;
    check('browser retries the exact saved Kajabi packet', replayed.status() === 200 && (await replayed.json()).replayed && JSON.stringify(replayed.request().postDataJSON()) === JSON.stringify(generationInput));
  } else {
    const generationResponse = page.waitForResponse(r => r.url().endsWith('/blueprint/generate') && r.request().method() === 'POST');
    await dialog.getByRole('button', { name: 'Generate work', exact: true }).click();
    const generated = await generationResponse; generationInput = generated.request().postDataJSON(); assert.equal(generated.status(),201);
  }
  await dialog.waitFor({ state: 'detached' }); await page.getByText('Systems work generated', { exact: true }).first().waitFor();
  let existingWork = sql(`SELECT id,title FROM actions WHERE project_id=${lit(project)} ORDER BY id`);
  check('setup through actual UI generates canonical selected work', existingWork.length === buildLabels.length && existingWork.some(a => a.title === (kind === 'kajabi' ? 'Build course' : 'Build funnel')));
  if (executionReview) {
    const systemsRow = () => page.locator(`[data-project-id="${project}"]`);
    const openSystems = async () => { await page.goto(base + '/systems', { waitUntil: 'networkidle' }); await systemsRow().waitFor(); };
    const phaseName = kind === 'kajabi' ? 'Course Build' : 'Discovery';
    await openSystems();
    check('Systems shows the generated next phase and readable action progress', (await systemsRow().innerText()).includes(`Next phase: ${phaseName}`) && (await systemsRow().innerText()).includes(`0 of ${buildLabels.length} Actions done`) && (await systemsRow().innerText()).includes('blocked by dependencies'));
    for (const width of widths) {
      await layout('systems-execution', page, width);
      const links = await systemsRow().locator('.bo-work-summary a').evaluateAll(nodes => nodes.every(n => { const r=n.getBoundingClientRect();return r.height>=44&&r.x>=0&&r.right<=innerWidth; }));
      check(`execution links remain usable at ${width}px`, links);
    }
    await keyboardActivate(page, systemsRow().getByRole('link', { name: new RegExp(`Next phase: ${phaseName}`) }));
    await page.getByRole('group', { name: `${phaseName} controls`, exact:true }).waitFor();
    check('phase link opens the canonical Project milestone controls', new URL(page.url()).hash === '#project-milestones-title');
    await page.getByRole('group', { name: `${phaseName} controls`, exact:true }).getByRole('button', { name:'Change milestone status',exact:true }).click();
    await page.getByLabel('Next milestone status',{exact:true}).selectOption('in_progress');
    await page.getByRole('button',{name:'Save milestone status',exact:true}).click(); await page.getByRole('dialog').waitFor({state:'detached'});
    await openSystems(); check('Systems current phase follows the canonical milestone transition', (await systemsRow().innerText()).includes(`Current phase: ${phaseName} · In Progress`));
    const qa = existingWork.find(a=>a.title==='Perform internal QA'); assert.ok(qa);
    for(const action of existingWork.filter(a=>a.id!==qa.id)) for(const status of ['in_progress','done']) {
      const revision=sql(`SELECT revision FROM actions WHERE id=${lit(action.id)}`)[0].revision;
      await api(owner.context, `/api/bloomops/actions/${action.id}/transition`, {toStatus:status,expectedRevision:revision},200);
    }
    const milestones=sql(`SELECT id,name,status FROM milestones WHERE project_id=${lit(project)} ORDER BY position,id`);
    for(const milestone of milestones.filter(m=>m.name!=='QA')) {
      for(const status of milestone.status==='in_progress'?['completed']:['in_progress','completed']) {
        const revision=sql(`SELECT revision FROM milestones WHERE id=${lit(milestone.id)}`)[0].revision;
        await api(owner.context, `/api/bloomops/projects/${project}/milestones/${milestone.id}/transition`,{toStatus:status,expectedRevision:revision},200);
      }
    }
    await page.goto(`${base}/work/actions/${qa.id}`,{waitUntil:'networkidle'});
    for(const status of ['in_progress','review']) {
      await page.getByRole('button',{name:'Change Action status',exact:true}).click();
      await page.getByLabel('Next Action status',{exact:true}).selectOption(status);
      await page.getByRole('button',{name:'Save Action status',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'}); await page.reload({waitUntil:'networkidle'});
    }
    await page.goto(`${base}/work/projects/${project}`,{waitUntil:'networkidle'});
    await page.getByRole('group',{name:'QA controls',exact:true}).getByRole('button',{name:'Change milestone status',exact:true}).click();
    await page.getByLabel('Next milestone status',{exact:true}).selectOption('in_progress');await page.getByRole('button',{name:'Save milestone status',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});
    const output=sql(`SELECT id FROM deliverables WHERE project_id=${lit(project)} ORDER BY id LIMIT 1`)[0];assert.ok(output);
    for(const status of ['in_progress','internal_review']) {
      await page.locator(`[data-deliverable-id="${output.id}"]`).getByRole('button',{name:'Change Deliverable status',exact:true}).click();
      await page.getByLabel('Next Deliverable status',{exact:true}).selectOption(status);await page.getByRole('button',{name:'Save Deliverable status',exact:true}).click();await page.getByRole('dialog').waitFor({state:'detached'});await page.reload({waitUntil:'networkidle'});
    }
    await openSystems(); const executing=await systemsRow().innerText();
    check('QA and Internal Review stay canonical without claiming approval',executing.includes('Current phase: QA · In Progress')&&executing.includes(`${buildLabels.length-1} of ${buildLabels.length} Actions done`)&&executing.includes('1 in Review')&&executing.includes('1 in Internal Review')&&!executing.includes('blocked by dependencies')&&!executing.includes('approved'));
    await page.emulateMedia({reducedMotion:'reduce'}); await layout('systems-qa-review',page,390);
    await systemsRow().getByRole('link',{name:'1 in Review',exact:true}).click();
    check('Systems review link opens the canonical Work review filter',new URL(page.url()).searchParams.get('view')==='review'&&new URL(page.url()).searchParams.get('projectId')===project);
    await openSystems(); await systemsRow().getByRole('link',{name:/Deliverable.*Internal Review/}).click();
    check('Systems output link opens canonical Project Deliverables',new URL(page.url()).pathname===`/work/projects/${project}`&&new URL(page.url()).hash==='#project-deliverables-title');
    existingWork=sql(`SELECT id,title FROM actions WHERE project_id=${lit(project)} ORDER BY id`);
  }
  await page.goto(base + `/settings/${kind}-builds`, { waitUntil: 'networkidle' }); await select.selectOption(types[kind]); await checkbox().uncheck();
  await page.getByRole('button', { name: 'Review setup' }).click(); await page.getByRole('button', { name: 'Disable builds', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'detached' });
  check('disable preserves existing generated records', JSON.stringify(sql(`SELECT id,title FROM actions WHERE project_id=${lit(project)} ORDER BY id`)) === JSON.stringify(existingWork));
  const replay = await api(owner.context, `/api/bloomops/projects/${project}/blueprint/generate`, generationInput, 200); check('disabled binding still permits the exact prior generation replay', replay.replayed);
  await page.goto(`${base}/work/projects/${nextProject}`, { waitUntil: 'networkidle' }); check('disabled configuration blocks new generation', await page.getByRole('button', { name: `Start ${platform} build`, exact: true }).count() === 0 && (await owner.context.request.get(`${base}/api/bloomops/projects/${nextProject}/blueprint`)).status() === 409);
  const pm = await login(members.pm.email, '/settings'); check('PM without template capability has no setup access', await pm.page.getByRole('link', { name: `Manage ${platform} build setup` }).count() === 0 && (await pm.context.request.get(base + endpoint)).status() === 403);
  if(executionReview) {
    const phase=sql(`SELECT id FROM milestones WHERE project_id=${lit(project)} AND name='QA'`)[0];
    const qa=sql(`SELECT id FROM actions WHERE project_id=${lit(project)} AND title='Perform internal QA'`)[0];
    sql(`UPDATE milestones SET visibility='restricted' WHERE id=${lit(phase.id)}`);
    sql(`UPDATE actions SET visibility='restricted' WHERE id=${lit(qa.id)}`);
    await pm.page.goto(base+'/systems',{waitUntil:'networkidle'}); const row=pm.page.locator(`[data-project-id="${project}"]`);
    check('restricted QA phase and Action do not leak through Systems summaries',await row.count()===1&&!(await row.innerText()).includes('Current phase: QA')&&!(await row.innerText()).includes('1 in Review')&&(await row.innerText()).includes(`${buildLabels.length-1} of ${buildLabels.length-1} Actions done`));
    sql(`UPDATE milestones SET visibility='internal' WHERE id=${lit(phase.id)}`); sql(`UPDATE actions SET visibility='internal' WHERE id=${lit(qa.id)}`);
  }
  sql(`INSERT INTO member_capabilities(workspace_id,membership_id,capability) VALUES(${lit(ws)},${lit(members.team.membership)},'templates.manage')`);
  await api(owner.context, `/api/bloomops/projects/${nextProject}/assignments`, { membershipId: members.team.membership }, 200);
  const team = await login(members.team.email, '/settings'); await team.page.getByRole('link', { name: `Manage ${platform} build setup` }).click();
  await team.page.getByRole('heading', { name: `${platform} build setup`, exact: true }).waitFor(); await team.page.waitForLoadState('networkidle');
  await team.page.getByLabel('Service type', { exact: true }).selectOption(types[kind]); await team.page.getByLabel(`Enable ${platform} builds`, { exact: true }).check(); await team.page.getByRole('button', { name: 'Review setup' }).click(); await team.page.getByRole('button', { name: 'Enable builds', exact: true }).click(); await team.page.getByRole('dialog').waitFor({ state: 'detached' });
  check('explicitly granted Team member can manage setup', (await options(team.context)).serviceTypes.find(r => r.id === types[kind]).binding.enabled);
  await team.page.goto(`${base}/work/projects/${nextProject}`, { waitUntil: 'networkidle' }); check('template grant does not grant Project generation authority', await team.page.getByRole('button', { name: `Start ${platform} build`, exact: true }).count() === 0 && (await team.context.request.get(`${base}/api/bloomops/projects/${nextProject}/blueprint`)).status() === 403);
  sql(`DELETE FROM member_capabilities WHERE workspace_id=${lit(ws)} AND membership_id=${lit(members.team.membership)} AND capability='templates.manage'`);
  check('capability revocation applies to the existing session', (await team.context.request.get(base + endpoint)).status() === 403);
  if(executionReview) {
    await team.page.goto(base+'/systems',{waitUntil:'networkidle'});
    check('Systems execution stays within exact Team Project assignments',await team.page.locator(`[data-project-id="${project}"]`).count()===0&&await team.page.locator(`[data-project-id="${nextProject}"]`).count()===1);
    sql(`DELETE FROM project_assignments WHERE workspace_id=${lit(ws)} AND project_id=${lit(nextProject)} AND membership_id=${lit(members.team.membership)}`);
    await team.page.reload({waitUntil:'networkidle'});check('existing Team session loses Systems rows after assignment revocation',await team.page.locator('[data-project-id]').count()===0);
  }

  await page.goto(base + `/settings/${kind}-builds`, { waitUntil: 'networkidle' }); await select.selectOption(types[kind]); await checkbox().uncheck(); await page.getByRole('button', { name: 'Review setup' }).click();
  await configure(owner.context, types[kind], false);
  await page.getByRole('button', { name: 'Disable builds', exact: true }).click(); await page.getByRole('dialog').waitFor({ state: 'detached' });
  check('stale setup returns a visible error and blocks blind resubmission', await page.locator('main').getByRole('alert').isVisible() && await page.getByRole('button', { name: 'Review setup' }).isDisabled());
  await page.getByRole('button', { name: 'Refresh configuration' }).click(); await page.waitForFunction(() => !document.querySelector('#systems-service-type').disabled);
  check('explicit refresh shows the current disabled state', !await checkbox().isChecked() && await page.locator('main').getByRole('alert').count() === 0);
  const client = await login(members.client.email, '/portal'); const portal = await client.page.locator('body').innerText();
  check('Client portal stays usable and hides internal setup and generated work', portal.includes('Garden build') && !/Perform internal QA|Build funnel|Build course|Manage (GHL|Kajabi) build setup/.test(portal) && (await client.context.request.get(base + endpoint)).status() === 403);
  check('other blueprint and unselected service remain untouched', sql(`SELECT template_id FROM service_type_blueprint_bindings WHERE service_type_id=${lit(types.other)}`)[0].template_id === other && sql(`SELECT count(*) AS n FROM service_type_blueprint_bindings WHERE service_type_id=${lit(types[otherKind])}`)[0].n === 0);
  if (kind === 'kajabi') {
    const secondEndpoint = '/api/bloomops/systems/ghl-setup';
    const ghlSetup = await api(owner.context, secondEndpoint, { serviceTypeId: types.ghl, enabled: true, expectedBinding: null }, 200);
    const secondService = (await api(owner.context, `/api/bloomops/clients/${clientId}/services`, { serviceTypeId: types.ghl }, 201)).service.id;
    const secondProject = (await api(owner.context, `/api/bloomops/clients/${clientId}/projects`, { name: 'Second platform build', serviceEngagementId: secondService }, 201)).projectId;
    await page.goto(`${base}/work/projects/${secondProject}`, { waitUntil: 'networkidle' });
    check('GHL and Kajabi defaults coexist with the correct Project label', await page.getByRole('button', { name: 'Start GHL build', exact: true }).isVisible() && sql(`SELECT count(*) AS n FROM templates WHERE workspace_id=${lit(ws)} AND slug IN ('ghl-build','kajabi-build')`)[0].n === 2);
    const wrong = await owner.context.request.post(base + endpoint, { headers: { origin: base }, data: { serviceTypeId: types.ghl, enabled: true, expectedBinding: { id: ghlSetup.binding.id, revision: ghlSetup.binding.revision } } });
    check('Kajabi setup cannot replace the GHL binding', wrong.status() === 409);
    const preview = await api(owner.context, `/api/bloomops/projects/${secondProject}/blueprint/preview`, { selectedComponentKeys: ['funnel'] }, 200);
    const ghlWork = await api(owner.context, `/api/bloomops/projects/${secondProject}/blueprint/generate`, { requestId: randomUUID(), selectedComponentKeys: ['funnel'], expected: preview.expected }, 201);
    check('both platforms share the same writer without mixed work', ghlWork.counts.actions === 1 && sql(`SELECT title FROM actions WHERE project_id=${lit(secondProject)}`)[0].title === 'Build funnel' && sql(`SELECT blueprint_key FROM systems_blueprint_generations WHERE project_id=${lit(project)}`)[0].blueprint_key === 'kajabi_build');
  }
  check('no browser page errors', errors.length === 0);
  console.log(`Systems ${platform} setup browser: ${checks} checks passed; ${screenshots} screenshots. Synthetic workspace ${ws}.`);
} finally { await browser.close(); }
