#!/usr/bin/env node
// Built-Worker HTTP + browser B4 Deliverable acceptance. Loopback and development
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
  out = resolve(arg("--out", "/tmp/bloomops-b4-review"));
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
    overflowingRows: [...document.querySelectorAll('.bo-deliverable, [aria-label="Your projects"] > li')]
      .map(row => ({ width: row.clientWidth, content: row.scrollWidth })).filter(row => row.content > row.width) }));
  if (bounds.document > bounds.viewport || bounds.overflowingRows.length) console.error('Overflow diagnostic:', JSON.stringify(bounds));
  check(`${label} ${width}px fits the viewport and Deliverable rows`, bounds.document <= bounds.viewport && bounds.overflowingRows.length === 0);
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
  const health=await (await fetch(base+'/api/health')).json();check('built Worker uses development and local R2 mail',health.environment==='development'&&health.auth.mail==='r2-dev'&&health.auth.configured);
  const reference=await browser.newPage({viewport:{width:1440,height:1000}});
  const referenceResponse=await reference.goto('https://bloomlab-preview.cool-sunset-2169.workers.dev/design');
  check('live Bloom design reference is accessible',referenceResponse?.ok());
  await reference.waitForFunction(()=>document.querySelector('h1')&&!document.body.innerText.includes('Loading...'));
  await reference.evaluate(()=>document.fonts.ready);await reference.screenshot({path:join(out,'design-reference.png'),fullPage:true});await reference.close();
  const owner=await login('smoke-owner@example.com'),suffix=randomUUID().slice(0,8),ws=sql("SELECT id FROM workspaces WHERE slug='smoke-agency'")[0].id;
  const clientId=(await api(owner.context,'/api/bloomops/clients',{name:`James B4 ${suffix}`,contactName:'James',contactEmail:`james-b4-${suffix}@example.com`},201)).client.id;
  const serviceTypeId=sql(`SELECT id FROM service_types WHERE workspace_id=${lit(ws)} AND slug='social-media-management'`)[0].id;
  const serviceId=(await api(owner.context,`/api/bloomops/clients/${clientId}/services`,{serviceTypeId},201)).service.id;
  const projectId=(await api(owner.context,`/api/bloomops/clients/${clientId}/projects`,{name:`Website delivery B4 ${suffix}`,visibility:'client',clientLabel:'Your new website',serviceEngagementId:serviceId},201)).projectId;
  check('existing Project carries the purchased Service context',sql(`SELECT service_engagement_id FROM projects WHERE id=${lit(projectId)}`)[0].service_engagement_id===serviceId);
  const projectPath=`/api/bloomops/projects/${projectId}`,path=projectPath+'/deliverables',portalPath=`/api/bloomops/portal/projects/${projectId}/deliverables`,itemPath=id=>`${path}/${id}`;
  const members={};
  for(const[name,role]of [['sam','team_member'],['james','client'],['pm','project_manager']]){
    const id=`b4-${name}-${suffix}`,membership=`m-${id}`,email=`${id}@example.com`;
    sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(id)},${lit(name==='sam'?'Sam Contractor':name)},${lit(email)},1)`);
    sql(`INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit(membership)},${lit(ws)},${lit(id)},${lit(role)},'active')`);members[name]={id,membership,email};
  }
  sql(`UPDATE client_contacts SET user_id=${lit(members.james.id)} WHERE client_id=${lit(clientId)} AND workspace_id=${lit(ws)} AND is_primary=1`);
  const milestoneId=(await api(owner.context,projectPath+'/milestones',{name:'B4_PRIVATE_MILESTONE',requestId:randomUUID()},201)).milestoneId;
  const actionA=(await api(owner.context,projectPath+'/actions',{title:'B4_PRIVATE_PREPARE',milestoneId,requestId:randomUUID()},201)).actionId;
  const actionB=(await api(owner.context,projectPath+'/actions',{title:'B4_PRIVATE_BUILD',assigneeMembershipId:members.sam.membership,requestId:randomUUID()},201)).actionId;
  await api(owner.context,`/api/bloomops/actions/${actionB}/dependencies`,{dependsOnActionId:actionA,expectedRevision:1});
  const sam=await login(members.sam.email,'/work'),client=await login(members.james.email,'/portal'),pm=await login(members.pm.email,'/work');
  const stored=()=>sql(`SELECT * FROM deliverables WHERE project_id=${lit(projectId)} ORDER BY rowid`);
  const history=()=>sql(`SELECT * FROM activity_events WHERE subject_type='deliverable' AND subject_id IN (SELECT id FROM deliverables WHERE project_id=${lit(projectId)}) ORDER BY rowid`);
  const parents=()=>JSON.stringify([
    ...['projects','milestones','actions','action_dependencies'].map(table=>sql(`SELECT * FROM ${table} WHERE ${table==='projects'?'id':'project_id'}=${lit(projectId)} ORDER BY rowid`)),
    sql(`SELECT * FROM bloomops_clients WHERE id=${lit(clientId)}`),sql(`SELECT * FROM service_engagements WHERE id=${lit(serviceId)}`),
  ]);
  const parentBefore=parents();
  const get=async id=>(await (await owner.context.request.get(base+itemPath(id))).json()).deliverable;
  const edit=async(id,details)=>{const r=await owner.context.request.patch(base+itemPath(id),{headers:{origin:base},data:{...details,expectedRevision:(await get(id)).revision}});assert.equal(r.status(),200,await r.text());return r.json();};
  await owner.page.goto(`${base}/work/projects/${projectId}`);
  const section=owner.page.getByRole('region',{name:'Deliverables',exact:true}),row=id=>section.locator(`[data-deliverable-id="${id}"]`);
  check('existing B3 Project starts with an honest empty Deliverable section',await section.getByText('No Deliverables to show yet.',{exact:true}).isVisible());
  check('empty portal has no Deliverable module',await client.page.getByRole('list',{name:'Project deliverables',exact:true}).count()===0);
  for(const width of widths)await layout('deliverables-empty',owner.page,width);
  const names=[`B4_PRIVATE_WEBSITE_${suffix}`,`B4_PRIVATE_REPORT_${suffix}`,`B4_PRIVATE_QA_${suffix}`],ids=[],creationBodies=[];
  owner.page.on('request',request=>{if(request.method()==='POST'&&request.url()===base+path)creationBodies.push(request.postDataJSON());});
  for(let index=0;index<3;index++){
    await keyboardActivate(owner.page,section.getByRole('button',{name:'Add Deliverable',exact:true}));const dialog=owner.page.getByRole('dialog');await dialog.waitFor();
    if(index===0){
      await owner.page.waitForFunction(()=>document.activeElement?.id==='deliverable-title');check('keyboard create focuses the internal title',await dialog.locator('#deliverable-title').evaluate(n=>n===document.activeElement));
      await dialog.getByRole('button',{name:'Create Deliverable',exact:true}).click();check('missing title is labelled and focused',await dialog.locator('#deliverable-title').evaluate(n=>n.getAttribute('aria-invalid')==='true'&&n===document.activeElement));
      for(const width of widths)await layout('deliverable-create',owner.page,width);
    }
    await dialog.getByLabel('Internal title',{exact:true}).fill(names[index]);await dialog.getByLabel('Internal description',{exact:false}).fill('B4_PRIVATE_QA_NOTES\nCheck mobile delivery');
    if(index===0)await dialog.getByLabel('Client-facing label',{exact:false}).fill('Your website');
    await dialog.getByLabel('Target date',{exact:false}).fill('2026-10-01');await dialog.getByLabel('Deliverable visibility',{exact:true}).selectOption(index<2?'client':'internal');
    const response=owner.page.waitForResponse(r=>r.request().method()==='POST'&&r.url()===base+path);
    await dialog.getByRole('button',{name:'Create Deliverable',exact:true}).evaluate(button=>{button.click();button.click();});const result=await response;assert.equal(result.status(),201);ids.push((await result.json()).deliverableId);
    await dialog.waitFor({state:'hidden'});await row(ids[index]).waitFor();
  }
  check('double-click creates three independent Deliverables and exactly three events',creationBodies.length===3&&stored().length===3&&history().length===3);
  check('Deliverable history derives Client and Service from Project',history().every(event=>event.client_id===clientId&&event.service_engagement_id===serviceId));
  const retry=await api(owner.context,path,creationBodies[0],201);check('response-loss create retry converges',retry.unchanged&&retry.deliverableId===ids[0]&&stored().length===3&&history().length===3);
  for(const width of widths)await layout('project-deliverables',owner.page,width);
  await keyboardActivate(owner.page,row(ids[0]).getByRole('button',{name:'Edit Deliverable',exact:true}));await owner.page.waitForFunction(()=>document.activeElement?.id==='deliverable-title');
  check('keyboard edit restores multiline internal description',await owner.page.getByRole('dialog').getByLabel('Internal description',{exact:false}).inputValue()==='B4_PRIVATE_QA_NOTES\nCheck mobile delivery');
  for(const width of widths)await layout('deliverable-edit',owner.page,width);
  await owner.page.keyboard.press('Escape');check('Escape restores focus to the edit opener',await row(ids[0]).getByRole('button',{name:'Edit Deliverable',exact:true}).evaluate(n=>n===document.activeElement));
  await keyboardActivate(owner.page,row(ids[0]).getByRole('button',{name:'Edit Deliverable',exact:true}));await owner.page.getByRole('dialog').getByLabel('Target date',{exact:false}).fill('2026-10-02');
  await owner.page.getByRole('button',{name:'Save Deliverable details',exact:true}).click();await owner.page.getByRole('dialog').waitFor({state:'hidden'});await row(ids[0]).getByText(/Target 2 Oct 2026/).waitFor();check('Project edit stores the canonical target date',(await get(ids[0])).targetDate==='2026-10-02');
  const labels={in_progress:'In Progress',internal_review:'Internal Review',client_review:'Client Review',approved:'Approved',delivered:'Delivered',cancelled:'Cancelled'};
  async function status(id,to){
    await keyboardActivate(owner.page,row(id).getByRole('button',{name:'Change Deliverable status',exact:true}));await owner.page.waitForFunction(()=>document.activeElement?.id==='deliverable-toStatus');
    const dialog=owner.page.getByRole('dialog');await dialog.getByLabel('Next Deliverable status',{exact:true}).selectOption(to);
    if(to==='client_review'){
      for(const width of widths)await layout('deliverable-status',owner.page,width);
      await dialog.getByRole('button',{name:'Save Deliverable status',exact:true}).focus();await owner.page.keyboard.press('Tab');check('status dialog traps keyboard focus',await dialog.evaluate(n=>n.contains(document.activeElement)));
    }
    const response=owner.page.waitForResponse(r=>r.request().method()==='POST'&&r.url()===base+itemPath(id)+'/transition');
    await dialog.getByRole('button',{name:'Save Deliverable status',exact:true}).click();assert.equal((await response).status(),200);await dialog.waitFor({state:'hidden'});await row(id).getByText(labels[to],{exact:true}).waitFor();
    await owner.page.waitForFunction(id=>document.querySelector(`[data-deliverable-id="${id}"]`)?.contains(document.activeElement),id);check(`${to} restores focus to a stable Deliverable control`,await row(id).evaluate(n=>n.contains(document.activeElement)));
  }
  await status(ids[0],'in_progress');await status(ids[0],'internal_review');await client.page.reload();
  check('Client receives plain In progress without internal QA state or titles',(await client.page.getByRole('list',{name:'Project deliverables',exact:true}).innerText()).includes('In progress')&&!/B4_PRIVATE|Internal Review/.test(await client.page.content()));
  for(const state of ['client_review','in_progress','internal_review','approved','delivered'])await status(ids[0],state);await status(ids[1],'cancelled');
  const terminal=await get(ids[0]),beforeRetry=JSON.stringify([stored(),history()]);
  const repeated=await api(owner.context,itemPath(ids[0])+'/transition',{toStatus:'delivered',expectedRevision:terminal.revision-1});check('Delivered retry preserves timestamp, revision and semantic history',repeated.unchanged&&beforeRetry===JSON.stringify([stored(),history()]));
  check('Delivered and Cancelled remove status controls and only Delivered has a timestamp',await row(ids[0]).getByRole('button',{name:'Change Deliverable status',exact:true}).count()===0&&await row(ids[1]).getByRole('button',{name:'Change Deliverable status',exact:true}).count()===0&&Boolean(terminal.deliveredAt)&&(await get(ids[1])).deliveredAt===null);
  const reopen=await owner.context.request.post(base+itemPath(ids[0])+'/transition',{headers:{origin:base},data:{toStatus:'in_progress',expectedRevision:terminal.revision}});check('built Worker refuses terminal reopen with a safe uncached conflict',reopen.status()===409&&noStore(reopen));
  for(const width of widths)await layout('deliverables-terminal',owner.page,width);
  check('Action-only Team assignment grants no Deliverable API or Project access',(await sam.context.request.get(base+path)).status()===404&&(await sam.context.request.get(base+itemPath(ids[0]))).status()===404);
  await api(owner.context,projectPath+'/assignments',{membershipId:members.sam.membership});await sam.page.goto(`${base}/work/projects/${projectId}`);const teamSection=sam.page.getByRole('region',{name:'Deliverables',exact:true});
  check('Project-assigned Team reads three Deliverables with no coordinator controls',await teamSection.locator('[data-deliverable-id]').count()===3&&await teamSection.getByRole('button').count()===0);
  for(const width of widths)await layout('deliverables-team',sam.page,width);
  for(const[endpoint,method,data]of [[path,'post',{title:'Denied',requestId:randomUUID()}],[itemPath(ids[0]),'patch',{title:'Denied',expectedRevision:terminal.revision}],[itemPath(ids[2])+'/transition','post',{toStatus:'in_progress',expectedRevision:1}]]){
    const r=await sam.context.request[method](base+endpoint,{headers:{origin:base},data});check(`Team ${method} ${endpoint.split('/').at(-1)} is server-denied`,r.status()===403&&noStore(r));
  }
  const portalResponse=await client.context.request.get(base+portalPath),dto=await portalResponse.json();
  check('Client receives exactly five safe fields and no hidden counts',noStore(portalResponse)&&Object.keys(dto).join(',')==='items'&&dto.items.length===2&&dto.items.every(i=>JSON.stringify(Object.keys(i).sort())===JSON.stringify(['deliveredAt','id','label','statusLabel','targetDate']))&&dto.items.find(i=>i.id===ids[1]).label==='Deliverable');
  await client.page.reload();check('portal HTML includes safe labels and never internal title or description',(await client.page.content()).includes('Your website')&&!/B4_PRIVATE|Sam Contractor/.test(await client.page.content()));
  for(const width of widths)await layout('deliverables-portal',client.page,width);
  for(const id of [ids[2],actionA,milestoneId,'missing']){
    const r=await client.context.request.get(base+portalPath+'/'+id);check('hidden or other-domain guessed ID is a safe uncached 404',r.status()===404&&noStore(r)&&await r.text()==='{"error":"Not found."}');
  }
  await pm.page.goto(`${base}/work/projects/${projectId}`);check('PM initially reads ordinary Deliverable history',(await pm.page.locator('main').innerText()).includes(names[2]));
  await edit(ids[2],{visibility:'restricted'});await pm.page.reload();check('restriction removes current row and old title from PM history',!(await pm.page.content()).includes(names[2]));
  await edit(ids[0],{visibility:'internal'});await client.page.reload();check('hiding a Deliverable immediately removes its Client label',await client.page.getByText('Your website',{exact:true}).count()===0&&await client.page.getByRole('list',{name:'Project deliverables',exact:true}).locator('li').count()===1);
  await edit(ids[1],{visibility:'internal'});await client.page.reload();check('hidden-only Project has no Deliverable section or count',await client.page.getByRole('list',{name:'Project deliverables',exact:true}).count()===0&&!/Deliverables/.test(await client.page.locator('main').innerText()));
  const contested=await get(ids[2]),beforeRace=history().length;
  const competing=await Promise.all([owner.context.request.patch(base+itemPath(ids[2]),{headers:{origin:base},data:{targetDate:'2026-10-05',expectedRevision:contested.revision}}),owner.context.request.post(base+itemPath(ids[2])+'/transition',{headers:{origin:base},data:{toStatus:'in_progress',expectedRevision:contested.revision}})]);
  check('concurrent details/status requests have one revision winner and one event',competing.filter(r=>r.status()===200).length===1&&competing.filter(r=>r.status()===409).length===1&&(await get(ids[2])).revision===contested.revision+1&&history().length===beforeRace+1);
  const evil=await owner.context.request.post(base+path,{headers:{origin:'https://evil.example'},data:{title:'Bad',requestId:randomUUID()}});check('cross-Origin mutation is refused',evil.status()===403);
  for(const raw of ['{','null','[]']){const r=await owner.context.request.patch(base+itemPath(ids[0]),{headers:{origin:base,'content-type':'application/json'},data:raw});check('malformed/non-object body is safely refused without caching',r.status()===400&&noStore(r));}
  const forged=await owner.context.request.patch(base+itemPath(ids[0]),{headers:{origin:base},data:{workspaceId:'forged'}});check('forged authority fields are refused',forged.status()===400&&noStore(forged));
  sql(`CREATE TRIGGER b4_browser_fail BEFORE INSERT ON activity_events WHEN NEW.subject_type='deliverable' AND NEW.workspace_id=${lit(ws)} BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL INTERNAL_ID'); END`);
  try {
    for(const op of ['create','edit','status']){
      const before=JSON.stringify([stored(),history()]),current=await get(ids[2]);
      const[endpoint,method,data]=op==='create'?[path,'post',{title:'Failed',requestId:randomUUID()}]:op==='edit'?[itemPath(ids[0]),'patch',{title:'Failed',expectedRevision:(await get(ids[0])).revision}]:[itemPath(ids[2])+'/transition','post',{toStatus:current.status==='planned'?'in_progress':'internal_review',expectedRevision:current.revision}];
      const r=await owner.context.request[method](base+endpoint,{headers:{origin:base},data});check(`late ${op} failure is sanitized, uncached and atomically rolled back`,r.status()===500&&noStore(r)&&!/PRIVATE|SQL|INTERNAL|stack/.test(await r.text())&&before===JSON.stringify([stored(),history()]));
    }
  }finally{sql('DROP TRIGGER b4_browser_fail');}
  check('Deliverables never mutate Client, Service or existing Project, Milestone, Action and dependency records',parentBefore===parents());
  sql(`DELETE FROM project_assignments WHERE membership_id=${lit(members.sam.membership)} AND project_id=${lit(projectId)}`);check('scope revocation immediately removes issued Team session access',(await sam.context.request.get(base+itemPath(ids[0]))).status()===404);
  await edit(ids[0],{visibility:'client'});const project=sql(`SELECT revision FROM projects WHERE id=${lit(projectId)}`)[0];
  assert.equal((await owner.context.request.patch(base+projectPath,{headers:{origin:base},data:{visibility:'internal',expectedRevision:project.revision}})).status(),200);check('parent Project visibility caps all Client Deliverables',(await client.context.request.get(base+portalPath)).status()===404);
  assert.equal((await owner.context.request.patch(base+projectPath,{headers:{origin:base},data:{visibility:'client',expectedRevision:project.revision+1}})).status(),200);
  sql(`UPDATE client_contacts SET user_id=NULL WHERE client_id=${lit(clientId)} AND user_id=${lit(members.james.id)}`);check('contact revocation removes issued Client Deliverable access',(await client.context.request.get(base+portalPath)).status()===404);
  sql(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(members.james.membership)}`);check('membership suspension revokes the same issued identity session',(await client.context.request.get(base+portalPath)).status()===403);
  await owner.page.reload();await owner.page.emulateMedia({reducedMotion:'reduce'});await layout('deliverables-reduced-motion',owner.page,320);check('reduced motion disables button transitions',await owner.page.locator('.bo-btn').first().evaluate(n=>getComputedStyle(n).transitionDuration.split(',').every(v=>parseFloat(v)<=0.01)));
  const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await owner.context.storageState()}),touchPage=await touch.newPage();await touchPage.goto(`${base}/work/projects/${projectId}`);
  const touchAdd=touchPage.getByRole('region',{name:'Deliverables',exact:true}).getByRole('button',{name:'Add Deliverable',exact:true});await touchAdd.waitFor();await touchPage.waitForFunction(n=>!n.disabled,await touchAdd.elementHandle());await touchAdd.tap();check('touch opens Deliverable creation',await touchPage.getByRole('dialog').isVisible());await layout('deliverable-touch-create',touchPage,390);await touch.close();
  console.log(`B4 browser/HTTP: ${checks} checks passed; ${screenshots} screenshots at ${widths.join(', ')}px plus the design reference.`);
} catch(error){
  console.error('B4 browser acceptance failed:',String(error?.message||error).split('\n').filter(line=>!/cookie:|authorization:|token=/i.test(line)).join('\n'));process.exitCode=1;
} finally {await browser.close();}
