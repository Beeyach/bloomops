#!/usr/bin/env node
// Built-Worker HTTP + browser B2 Milestone acceptance. Loopback and development
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
  out = resolve(arg("--out", "/tmp/bloomops-b2-review"));
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
  const bounds = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
    overflowingProjects: [...document.querySelectorAll('[aria-label="Your projects"] > li')]
      .map(row => ({ width: row.clientWidth, content: row.scrollWidth })).filter(row => row.content > row.width) }));
  if (bounds.document > bounds.viewport || bounds.overflowingProjects.length) console.error('Overflow diagnostic:', JSON.stringify(bounds));
  check(`${label} ${width}px fits the viewport and Project rows`, bounds.document <= bounds.viewport && bounds.overflowingProjects.length === 0);
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
  check('built Worker uses development and local R2 mail',health.environment==='development'&&health.auth.mail==='r2-dev'&&health.auth.configured);
  const owner=await login('smoke-owner@example.com'),suffix=randomUUID().slice(0,8),ws=sql("SELECT id FROM workspaces WHERE slug='smoke-agency'")[0].id;
  const james=(await api(owner.context,'/api/bloomops/clients',{name:`James B2 ${suffix}`,contactName:'James',contactEmail:`james-b2-${suffix}@example.com`},201)).client.id;
  const projectId=(await api(owner.context,`/api/bloomops/clients/${james}/projects`,{name:`Website B2 ${suffix}`,clientLabel:'Your new website',visibility:'client'},201)).projectId;
  const path=`/api/bloomops/projects/${projectId}/milestones`,projectPath=`/api/bloomops/projects/${projectId}`;
  const stored=()=>sql(`SELECT * FROM milestones WHERE project_id=${lit(projectId)} ORDER BY position,id`);
  const history=()=>sql(`SELECT * FROM activity_events WHERE subject_type='milestone' AND subject_id IN (SELECT id FROM milestones WHERE project_id=${lit(projectId)}) ORDER BY rowid`);
  const parentBefore=JSON.stringify(sql(`SELECT * FROM projects WHERE id=${lit(projectId)}`));
  const members={};
  for(const[name,role]of[['sam','team_member'],['james','client'],['pm','project_manager']]){
    const id=`b2-${name}-${suffix}`,membership=`m-${id}`,email=`${id}@example.com`;
    sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(id)},${lit(name==='sam'?'Sam Contractor':name)},${lit(email)},1)`);
    sql(`INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit(membership)},${lit(ws)},${lit(id)},${lit(role)},'active')`);
    members[name]={id,membership,email};
  }
  sql(`UPDATE client_contacts SET user_id=${lit(members.james.id)} WHERE client_id=${lit(james)} AND workspace_id=${lit(ws)} AND is_primary=1`);
  const sam=await login(members.sam.email,'/work'),client=await login(members.james.email,'/portal'),pm=await login(members.pm.email,'/work');
  await owner.page.goto(`${base}/work/projects/${projectId}`);
  const section=owner.page.getByRole('region',{name:'Milestones',exact:true});
  const row=id=>section.locator(`[data-milestone-id="${id}"]`);
  check('existing Project has an honest empty Milestone list without progress',await section.getByText('No milestones to show yet.',{exact:true}).isVisible()&&await section.locator('progress').count()===0);
  await client.page.goto(base+'/portal');
  check('portal hides empty Milestone progress',await client.page.getByRole('list',{name:'Project milestones',exact:true}).count()===0);
  for(const width of widths)await layout('milestones-empty',owner.page,width);
  await owner.page.setViewportSize({width:1440,height:900});
  const creationBodies=[];
  owner.page.on('request',request=>{if(request.method()==='POST'&&request.url()===base+path)creationBodies.push(request.postDataJSON());});
  const names=[`B2_INTERNAL_BRIEF_${suffix}`,`B2_INTERNAL_BUILD_${suffix}`,`B2_PRIVATE_QA_${suffix}`],labels=['Your brief','Website build',''];
  const ids=[];
  for(let n=0;n<3;n++){
    const add=section.getByRole('button',{name:'Add milestone',exact:true});await add.focus();await owner.page.keyboard.press('Enter');
    const dialog=owner.page.getByRole('dialog');await dialog.waitFor();
    if(n===0){
      await owner.page.waitForFunction(()=>document.activeElement?.id==='milestone-name');
      check('create dialog receives keyboard focus',await dialog.locator('#milestone-name').evaluate(n=>n===document.activeElement));
      await dialog.getByRole('button',{name:'Create milestone',exact:true}).click();
      check('missing milestone name is labelled and focused',await dialog.locator('#milestone-name').evaluate(n=>n.getAttribute('aria-invalid')==='true'&&n===document.activeElement));
      for(const width of widths)await layout('milestone-create',owner.page,width);
    }
    await dialog.getByLabel('Milestone name',{exact:true}).fill(names[n]);
    if(labels[n])await dialog.getByLabel('Client-facing label',{exact:false}).fill(labels[n]);
    await dialog.getByLabel('Milestone visibility',{exact:true}).selectOption(n<2?'client':'internal');
    if(n===0){
      await dialog.getByLabel('Start date',{exact:false}).fill('2026-09-10');await dialog.getByLabel('Target date',{exact:false}).fill('2026-09-09');
      await dialog.getByRole('button',{name:'Create milestone',exact:true}).click();
      check('invalid date range is explained',await dialog.getByText('The target date cannot be before the start date.',{exact:true}).isVisible());
      await layout('milestone-validation',owner.page,320);await dialog.getByLabel('Target date',{exact:false}).fill('2026-10-01');
    }
    const response=owner.page.waitForResponse(r=>r.request().method()==='POST'&&r.url()===base+path);
    await dialog.getByRole('button',{name:'Create milestone',exact:true}).evaluate(button=>{button.click();button.click();});
    const result=await response;assert.equal(result.status(),201);ids.push((await result.json()).milestoneId);
    await dialog.waitFor({state:'hidden'});await row(ids[n]).waitFor();
  }
  check('three double-clicked creates produce exactly three rows and events',creationBodies.length===3&&stored().length===3&&history().filter(e=>e.event_type==='MILESTONE_CREATED').length===3);
  const retry=await api(owner.context,path,creationBodies[0],201);
  check('response-loss create retry returns the same fact with no new history',retry.unchanged&&retry.milestoneId===ids[0]&&stored().length===3&&history().length===3);
  for(const width of widths)await layout('milestones-ordered',owner.page,width);
  await owner.page.setViewportSize({width:1440,height:900});
  await row(ids[2]).getByRole('button',{name:`Move ${names[2]} earlier`,exact:true}).focus();await owner.page.keyboard.press('Enter');
  await owner.page.waitForFunction(id=>document.querySelectorAll('[data-milestone-id]')[1]?.getAttribute('data-milestone-id')===id,ids[2]);
  await owner.page.waitForFunction(id=>document.querySelector(`[data-milestone-id="${id}"]`)?.contains(document.activeElement),ids[2]);
  check('keyboard reorder restores focus to the moved Milestone',await row(ids[2]).evaluate(n=>n.contains(document.activeElement)));
  const touchContext=await browser.newContext({hasTouch:true,viewport:{width:320,height:900},storageState:await owner.context.storageState()});
  const touchPage=await touchContext.newPage();await touchPage.goto(`${base}/work/projects/${projectId}`);
  await touchPage.locator(`[data-milestone-id="${ids[2]}"]`).getByRole('button',{name:`Move ${names[2]} earlier`,exact:true}).tap();
  await touchPage.waitForFunction(id=>document.querySelector('[data-milestone-id]')?.getAttribute('data-milestone-id')===id,ids[2]);
  await layout('milestone-touch-order',touchPage,320);await touchContext.close();
  await owner.page.setViewportSize({width:320,height:900});await owner.page.reload();
  await owner.page.waitForFunction(id=>document.querySelector('[data-milestone-id]')?.getAttribute('data-milestone-id')===id,ids[2]);
  check('touch-sized controls persist the same order shown on screen',JSON.stringify(stored().map(i=>i.id))===JSON.stringify([ids[2],ids[0],ids[1]]));
  async function status(id,to,reason='Waiting for Ellen\nFeedback expected tomorrow'){
    await row(id).getByRole('button',{name:'Change milestone status',exact:true}).click();
    const dialog=owner.page.getByRole('dialog');await dialog.waitFor();await dialog.getByLabel('Next milestone status',{exact:true}).selectOption(to);
    if(to==='waiting')await dialog.getByLabel('What or whom are we waiting on?',{exact:true}).fill(reason);
    if(to==='waiting'&&id===ids[0]){
      for(const width of widths)await layout('milestone-status',owner.page,width);
      const buttons=dialog.getByRole('button');await buttons.last().focus();await owner.page.keyboard.press('Tab');
      check('status dialog traps keyboard focus',await dialog.evaluate(n=>n.contains(document.activeElement)));
    }
    const response=owner.page.waitForResponse(r=>r.request().method()==='POST'&&r.url()===`${base}${path}/${id}/transition`);
    await dialog.getByRole('button',{name:'Save milestone status',exact:true}).click();assert.equal((await response).status(),200);await dialog.waitFor({state:'hidden'});
    const label={waiting:'Waiting',completed:'Completed',in_progress:'In Progress',skipped:'Skipped'}[to];await row(id).getByText(label,{exact:true}).waitFor();
    await owner.page.waitForFunction(id=>document.querySelector(`[data-milestone-id="${id}"]`)?.contains(document.activeElement),id);
    check(`status ${to} restores focus to the Milestone`,await row(id).evaluate(n=>n.contains(document.activeElement)));
  }
  await status(ids[0],'waiting');
  await client.page.reload();check('Client sees plain Waiting without the internal explanation',(await client.page.getByText('Waiting',{exact:true}).count())===1&&!(await client.page.content()).includes('Feedback expected tomorrow'));
  await status(ids[0],'completed');await status(ids[1],'in_progress');await status(ids[1],'skipped');await status(ids[2],'waiting');
  check('finished progress changes while Project facts remain unchanged',await section.getByText('2 of 3 milestones finished',{exact:true}).isVisible()&&parentBefore===JSON.stringify(sql(`SELECT * FROM projects WHERE id=${lit(projectId)}`)));
  const terminal=stored().find(i=>i.id===ids[0]),beforeRetry=history().length;
  const repeated=await api(owner.context,`${path}/${ids[0]}/transition`,{toStatus:'completed',expectedRevision:terminal.revision-1});
  check('terminal response-loss retry changes no timestamp or semantic history',repeated.unchanged&&history().length===beforeRetry&&stored().find(i=>i.id===ids[0]).completed_at===terminal.completed_at);
  await row(ids[0]).getByRole('button',{name:'Edit milestone',exact:true}).click();
  let dialog=owner.page.getByRole('dialog');await dialog.waitFor();
  await dialog.getByLabel('Target date',{exact:false}).fill('2026-10-02');
  for(const width of widths)await layout('milestone-edit',owner.page,width);
  await dialog.getByRole('button',{name:'Save milestone details',exact:true}).click();await dialog.waitFor({state:'hidden'});await row(ids[0]).getByText(/Target 2 Oct 2026/).waitFor();
  check('edited milestone date is stored and rendered',stored().find(i=>i.id===ids[0]).target_date==='2026-10-02');
  await api(owner.context,`${projectPath}/assignments`,{membershipId:members.sam.membership},200);
  await sam.page.goto(`${base}/work/projects/${projectId}`);const samSection=sam.page.getByRole('region',{name:'Milestones',exact:true});
  check('Project-assigned Team Member sees readable Milestones without controls',await samSection.locator('[data-milestone-id]').count()===3&&await samSection.getByRole('button').count()===0);
  for(const width of widths)await layout('milestones-team',sam.page,width);
  check('Team Member cannot coordinate child records',(await sam.context.request.patch(`${base}${path}/${ids[0]}`,{headers:{origin:base},data:{name:'Denied',expectedRevision:terminal.revision}})).status()===403);
  check('Project assignment does not grant parent Client access',(await sam.context.request.get(`${base}/api/bloomops/clients/${james}/projects`)).status()===404);
  const portalPath=`/api/bloomops/portal/projects/${projectId}/milestones`;
  const portalResponse=await client.context.request.get(base+portalPath),dto=await portalResponse.json();
  check('Client DTO has the exact Milestone field allowlist and visible-only progress',noStore(portalResponse)&&dto.items.length===2&&dto.progress.total===2&&dto.progress.finished===2&&dto.items.every(i=>JSON.stringify(Object.keys(i).sort())===JSON.stringify(['completedAt','id','label','statusLabel','targetDate'])));
  await client.page.reload();
  const html=await client.page.content();check('portal HTML includes safe labels and no private milestone data',html.includes('Your brief')&&html.includes('Website build')&&names.every(name=>!html.includes(name))&&!html.includes('Feedback expected tomorrow'));
  for(const width of widths)await layout('milestones-portal',client.page,width);
  await owner.page.emulateMedia({reducedMotion:'reduce'});await layout('milestones-reduced-motion',owner.page,390);
  check('reduced motion removes button transitions',await owner.page.locator('.bo-btn').first().evaluate(n=>getComputedStyle(n).transitionDuration.split(',').every(v=>parseFloat(v)<=0.01)));
  await pm.page.goto(`${base}/work/projects/${projectId}`);check('PM initially sees ordinary internal QA',await pm.page.getByRole('heading',{name:names[2],exact:true}).isVisible());
  const qa=stored().find(i=>i.id===ids[2]);assert.equal((await owner.context.request.patch(`${base}${path}/${ids[2]}`,{headers:{origin:base},data:{visibility:'restricted',expectedRevision:qa.revision}})).status(),200);
  await pm.page.reload();check('restricting QA removes its current row and prior history for unnamed PM',!(await pm.page.content()).includes(names[2]));
  const current=stored().find(i=>i.id===ids[0]);assert.equal((await owner.context.request.patch(`${base}${path}/${ids[0]}`,{headers:{origin:base},data:{visibility:'internal',expectedRevision:current.revision}})).status(),200);
  await client.page.reload();check('hiding a previously visible Milestone removes its row and hidden count',await client.page.getByText('Your brief',{exact:true}).count()===0&&await client.page.getByText('1 of 1 milestones finished',{exact:true}).isVisible());
  const missing=await client.context.request.get(`${base}${portalPath}/missing`),denied=await client.context.request.get(`${base}${portalPath}/${ids[0]}`);
  check('hidden and guessed Milestones have identical no-store 404 answers',missing.status()===404&&denied.status()===404&&await missing.text()===await denied.text()&&noStore(denied));
  check('cross-site Milestone writes are denied',(await owner.context.request.post(base+path,{headers:{origin:'https://evil.example'},data:{name:'Bad',requestId:randomUUID()}})).status()===403);
  for(const raw of ['{','null','[]']){const r=await owner.context.request.patch(`${base}${path}/${ids[0]}`,{headers:{origin:base,'content-type':'application/json'},data:raw});check('malformed/non-object JSON is safe and uncached',r.status()===400&&noStore(r));}
  const snapshot=JSON.stringify([stored(),history()]);
  sql(`CREATE TRIGGER b2_browser_fail BEFORE INSERT ON activity_events WHEN NEW.subject_type='milestone' AND NEW.workspace_id=${lit(ws)} BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL INTERNAL_ID'); END`);
  try {
    const r=await owner.context.request.patch(`${base}${path}/${ids[0]}`,{headers:{origin:base},data:{name:'Failed',expectedRevision:stored().find(i=>i.id===ids[0]).revision}});
    check('unexpected late activity failure is sanitized with no-store',r.status()===500&&noStore(r)&&!/PRIVATE|SQL|INTERNAL|stack/.test(await r.text()));
    check('failed mutation leaves fact, revision and history unchanged',snapshot===JSON.stringify([stored(),history()]));
  }finally{sql('DROP TRIGGER b2_browser_fail');}
  sql(`DELETE FROM project_assignments WHERE membership_id=${lit(members.sam.membership)} AND project_id=${lit(projectId)}`);
  check('revoked Project scope immediately removes issued Team session access',(await sam.context.request.get(`${base}${path}/${ids[1]}`)).status()===404);
  const project=sql(`SELECT revision FROM projects WHERE id=${lit(projectId)}`)[0];
  assert.equal((await owner.context.request.patch(base+projectPath,{headers:{origin:base},data:{visibility:'internal',expectedRevision:project.revision}})).status(),200);
  check('parent visibility caps every client-visible child',(await client.context.request.get(base+portalPath)).status()===404);
  assert.equal((await owner.context.request.patch(base+projectPath,{headers:{origin:base},data:{visibility:'client',expectedRevision:project.revision+1}})).status(),200);
  sql(`UPDATE client_contacts SET user_id=NULL WHERE client_id=${lit(james)} AND user_id=${lit(members.james.id)}`);
  check('contact revocation immediately removes Client Milestones',(await client.context.request.get(base+portalPath)).status()===404);
  await client.page.reload();check('unlinked portal shows no Milestone counts or work',await client.page.getByText('1 of 1 milestones finished',{exact:true}).count()===0&&await client.page.getByRole('list',{name:'Project milestones',exact:true}).count()===0);
  sql(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(members.james.membership)}`);
  check('suspension revokes the still-issued identity session',(await client.context.request.get(base+portalPath)).status()===403);
  console.log(`B2 built-Worker browser/HTTP: ${checks} checks passed; ${screenshots} screenshots.`);
} catch(error){
  console.error('B2 browser acceptance failed:',String(error?.message||error).split('\n').filter(line=>!/cookie:|authorization:|token=/i.test(line)).join('\n'));
  process.exitCode=1;
} finally {await browser.close();}
