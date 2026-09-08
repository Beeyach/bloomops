#!/usr/bin/env node
// Built-Worker HTTP + browser C2 Content acceptance. Loopback and development
// R2 mail only. Uses a separate local workspace and example.com identities.
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
  out = resolve(arg("--out", "/tmp/bloomops-c2-review"));
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
    overflowingRows: [...document.querySelectorAll('.bo-content-list > li, .bo-content-copy')]
      .map(row => ({ width: row.clientWidth, content: row.scrollWidth })).filter(row => row.content > row.width) }));
  if (bounds.document > bounds.viewport || bounds.overflowingRows.length) console.error('Overflow diagnostic:', JSON.stringify(bounds));
  check(`${label} ${width}px fits the viewport and operational rows`, bounds.document <= bounds.viewport && bounds.overflowingRows.length === 0);
  const geometry = await page.evaluate(() => ({ headings: document.querySelectorAll('h1').length,
    invalidControls: [...document.querySelectorAll('button,input,textarea,select')].filter(n => n.checkVisibility() && n.type !== 'checkbox').map(n => {
      const r = n.getBoundingClientRect();
      return { label: n.getAttribute('aria-label') || n.id || n.textContent, x: r.x, right: r.right, width: r.width, height: r.height };
    }).filter(r => !(r.width > 0 && r.x >= 0 && r.right <= innerWidth && (innerWidth > 390 || r.height >= 44))) }));
  if (geometry.headings !== 1 || geometry.invalidControls.length) console.error('Layout diagnostic:', JSON.stringify(geometry));
  check(`${label} ${width}px heading and controls are readable`, geometry.headings === 1 && geometry.invalidControls.length === 0);
  await page.screenshot({
    path: join(out, `${label}-${width}.png`),
    fullPage: label !== 'overflow' && await page.getByRole('dialog').count() === 0,
    animations: 'disabled',
  });
  screenshots++;
};
try {
 const health=await(await fetch(base+'/api/health')).json();check('loopback development Worker and local R2 mail only',health.environment==='development'&&health.auth.mail==='r2-dev');
 const suffix=randomUUID().slice(0,8),ws=`c2-${suffix}`,members={};
 sql(`INSERT INTO workspaces(id,name,slug) VALUES(${lit(ws)},'Content Studio',${lit(ws)})`);
 for(const[name,role]of[['owner','owner'],['admin','admin'],['pm','project_manager'],['sam','team_member'],['client','client']]){
  const id=`${ws}-${name}`,email=`${id}@example.com`,membership=`m-${id}`;members[name]={id,email,membership};
  sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(id)},${lit(name)},${lit(email)},1)`);
  sql(`INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit(membership)},${lit(ws)},${lit(id)},${lit(role)},'active')`);
 }
 const cl=`${ws}-james`,other=`${ws}-other`,social=`${ws}-social`,systems=`${ws}-systems`,service=`${ws}-service`,nonSocial=`${ws}-ghl`;
 for(const[id,name]of[[cl,'James · Garden Studio'],[other,'Another Client']])sql(`INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(${lit(id)},${lit(ws)},${lit(name)},${lit(id)})`);
 for(const[id,name,slug]of[[social,'Social','social'],[systems,'Systems','systems']]){sql(`INSERT INTO departments(id,workspace_id,name,slug) VALUES(${lit(id)},${lit(ws)},${lit(name)},${lit(slug)})`);sql(`INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(${lit(id)},${lit(ws)},${lit(name)},${lit('custom-'+slug)},${lit(id)})`);}
 for(const[id,type]of[[service,social],[nonSocial,systems]])sql(`INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(${lit(id)},${lit(ws)},${lit(cl)},${lit(type)})`);
 const owner=await login(members.owner.email,'/social'),admin=await login(members.admin.email,'/social'),pm=await login(members.pm.email,'/social'),team=await login(members.sam.email,'/social'),client=await login(members.client.email,'/portal');
 const itemPath=id=>`/api/bloomops/content/${id}`,parentPath=`/api/bloomops/clients/${cl}/content`,servicePath=`/api/bloomops/clients/${cl}/services/${service}/content`;
 const get=async(id,who=owner)=>{const r=await who.context.request.get(base+itemPath(id));assert.equal(r.status(),200);return(await r.json()).item;};
 const patch=async(id,data,who=owner)=>who.context.request.patch(base+itemPath(id),{headers:{origin:base},data});
 const read=async(path,who=owner)=>who.context.request.get(base+path);

 const add=async(flags={},extra={})=>(await api(owner.context,servicePath,{title:'Production story',type:'reel',requestId:randomUUID(),...flags,...extra},201)).contentId;
 const move=async(id,targetStage,{who=owner,context,expectedRevision,expected=200}={})=>api(who.context,itemPath(id)+'/transition',{targetStage,expectedRevision:expectedRevision??(await get(id)).revision,...(context==null?{}:{context})},expected);
 const beforeParents=JSON.stringify(sql(`SELECT id,relationship_status AS status FROM bloomops_clients WHERE workspace_id=${lit(ws)} UNION ALL SELECT id,status FROM service_engagements WHERE workspace_id=${lit(ws)}`));
 for(let mask=0;mask<8;mask++){
  const flags={recordingRequired:!!(mask&1),internalReviewRequired:!!(mask&2),clientApprovalRequired:!!(mask&4)},id=await add(flags),path=['script',...(mask&1?['waiting_for_recording']:[]),'editing',...(mask&2?['internal_review']:[]),...(mask&4?['client_review']:[]),'approved','scheduled','published'];
  for(const stage of path)await move(id,stage,{...(stage==='waiting_for_recording'?{context:'James to record the opening'}:{})});const item=await get(id);check(`flags ${mask} real HTTP exact forward path`,item.stage==='published'&&item.revision===path.length+1&&!!item.publishedAt);
  const retry=await move(id,'published',{expectedRevision:path.length});check(`flags ${mask} Published response loss converges with stable timestamp`,retry.unchanged&&(await get(id)).publishedAt===item.publishedAt);await move(id,'idea',{expected:400});
 }
 const id=await add({recordingRequired:true,internalReviewRequired:true,clientApprovalRequired:true},{title:'A thoughtful launch · '+ 'L'.repeat(160)}),page=owner.page;
 await page.goto(base+'/social/'+id);for(const w of widths)await layout('idea',page,w);
 await keyboardActivate(page,page.getByRole('button',{name:'Move to Script',exact:true}));await page.getByRole('button',{name:'Move to Waiting for Recording',exact:true}).waitFor();check('keyboard forward transition persists',(await get(id)).stage==='script');
 await keyboardActivate(page,page.getByRole('button',{name:'Move to Waiting for Recording',exact:true}));const dialog=page.getByRole('dialog');await dialog.waitFor();
 await page.waitForFunction(n=>n===document.activeElement,await page.locator('#content-transition-context').elementHandle());check('waiting dialog focuses required context',await page.locator('#content-transition-context').evaluate(n=>n===document.activeElement));check('blank waiting context cannot submit',await dialog.getByRole('button',{name:'Wait for recording',exact:true}).isDisabled());
 await page.keyboard.press('Escape');check('Escape restores waiting opener focus',await page.getByRole('button',{name:'Move to Waiting for Recording',exact:true}).evaluate(n=>n===document.activeElement));
 await keyboardActivate(page,page.getByRole('button',{name:'Move to Waiting for Recording',exact:true}));const reason='James to record the opening.\n'+'LongContext'.repeat(175);await page.getByLabel('What recording is needed, and from whom?').fill(reason);
 for(const w of widths)await layout('waiting-dialog-long',page,w);
 await dialog.getByRole('button',{name:'Wait for recording',exact:true}).focus();await page.keyboard.press('Tab');check('dialog traps Tab at last control',await dialog.getByRole('button',{name:'Close',exact:true}).evaluate(n=>n===document.activeElement));
 await keyboardActivate(page,dialog.getByRole('button',{name:'Wait for recording',exact:true}));await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:'Move to Editing',exact:true}).waitFor();check('waiting reason is canonical and focus survives transition',(await get(id)).stageContext===reason&&await page.locator('.bo-content-stage').evaluate(n=>n===document.activeElement));for(const w of widths)await layout('waiting-long',page,w);
 await keyboardActivate(page,page.getByRole('button',{name:'Move to Editing',exact:true}));await page.getByRole('button',{name:'Move to Internal Review',exact:true}).waitFor();await keyboardActivate(page,page.getByRole('button',{name:'Move to Internal Review',exact:true}));await page.getByRole('button',{name:'Request revision',exact:true}).waitFor();
 for(const source of ['internal_review','client_review']){
  await keyboardActivate(page,page.getByRole('button',{name:'Request revision',exact:true}));await dialog.waitFor();check(`${source} revision reason required`,await dialog.getByRole('button',{name:'Request revision',exact:true}).isDisabled());await page.getByLabel('What needs to change?').fill(reason);
  if(source==='internal_review')for(const w of widths)await layout('revision-dialog-long',page,w);
  await keyboardActivate(page,dialog.getByRole('button',{name:'Request revision',exact:true}));await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:'Move to Editing',exact:true}).waitFor();check(`${source} revision branch stores context`,(await get(id)).stage==='revision_requested'&&(await get(id)).stageContext===reason);
  if(source==='internal_review')for(const w of widths)await layout('revision-long',page,w);
  await keyboardActivate(page,page.getByRole('button',{name:'Move to Editing',exact:true}));await page.getByRole('button',{name:'Move to Internal Review',exact:true}).waitFor();await keyboardActivate(page,page.getByRole('button',{name:'Move to Internal Review',exact:true}));await page.getByRole('button',{name:'Move to Client Review',exact:true}).waitFor();await keyboardActivate(page,page.getByRole('button',{name:'Move to Client Review',exact:true}));await page.getByRole('button',{name:'Move to Approved',exact:true}).waitFor();
 }
 await keyboardActivate(page,page.getByRole('button',{name:'Move to Approved',exact:true}));await page.getByRole('button',{name:'Move to Scheduled',exact:true}).waitFor();await keyboardActivate(page,page.getByRole('button',{name:'Move to Scheduled',exact:true}));await page.getByRole('button',{name:'Move to Published',exact:true}).waitFor();await keyboardActivate(page,page.getByRole('button',{name:'Move to Published',exact:true}));await page.getByText('This is the final production stage.',{exact:false}).waitFor();check('Published removes transition actions',await page.getByRole('button',{name:/Move to|Request revision/}).count()===0);for(const w of widths)await layout('published',page,w);
 const conflictId=await add();await page.goto(base+'/social/'+conflictId);await patch(conflictId,{caption:'Another coordinator edited',expectedRevision:1});const conflictResponse=page.waitForResponse(r=>r.url().endsWith(itemPath(conflictId)+'/transition'));await keyboardActivate(page,page.getByRole('button',{name:'Move to Script',exact:true}));assert.equal((await conflictResponse).status(),409);await page.getByRole('link',{name:'Reload Content'}).waitFor();check('stale UI gives safe conflict and reload',await page.getByRole('link',{name:'Reload Content'}).isVisible()&&(await get(conflictId)).stage==='idea');for(const w of widths)await layout('conflict',page,w);
 await page.goto(base+'/social');await page.getByLabel('Stage',{exact:true}).selectOption('published');await keyboardActivate(page,page.getByRole('button',{name:'Apply filters',exact:true}));await page.waitForURL(/stage=published/);check('stage filter shows nine canonical published items',await page.locator('.bo-content-list > li').count()===9);for(const w of widths)await layout('stage-filter',page,w);
 const teamId=await add({},{visibility:'restricted'});await move(teamId,'script',{who:team,expected:404});await move(teamId,'script',{who:pm,expected:404});sql(`INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES(${lit(ws)},${lit(service)},${lit(members.sam.membership)})`);await move(teamId,'script',{who:team});check('issued Team session gains exact Service fulfillment',(await get(teamId)).stage==='script');
 const clientLevel=(await api(owner.context,parentPath,{title:'Client-level idea',type:'reel',requestId:randomUUID()},201)).contentId;await move(clientLevel,'script',{who:team,expected:404});check('Service assignment remains exact',(await get(clientLevel)).stage==='idea');
 sql(`INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES(${lit(ws)},${lit(cl)},${lit(members.pm.membership)})`);await move(teamId,'editing',{who:pm});check('restricted PM needs explicit assignment',(await get(teamId)).stage==='editing');
 for(const who of [client]){const r=await who.context.request.post(base+itemPath(id)+'/transition?forged=1',{headers:{origin:base},data:null});check('Client has no internal transition even before malformed validation',r.status()===404&&noStore(r));}
 const raceId=await add();const responses=await Promise.all([owner.context.request.post(base+itemPath(raceId)+'/transition',{headers:{origin:base},data:{targetStage:'script',expectedRevision:1}}),patch(raceId,{caption:'Race edit',expectedRevision:1})]);check('built HTTP transition/edit has one winner',responses.map(r=>r.status()).sort().join(',')==='200,409'&&(await get(raceId)).revision===2);
 const sameId=await add(),same=await Promise.all([move(sameId,'script',{expectedRevision:1}),move(sameId,'script',{expectedRevision:1})]);check('built HTTP identical transition race converges once',same.filter(r=>r.unchanged).length===1&&(await get(sameId)).revision===2);
 sql(`DELETE FROM service_assignments WHERE membership_id=${lit(members.sam.membership)}`);await move(teamId,'internal_review',{who:team,expected:404});check('issued Team session revocation immediately fences transition',(await get(teamId)).stage==='editing');
 sql(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(members.pm.membership)}`);await move(teamId,'internal_review',{who:pm,expected:403});check('issued PM membership suspension fences transition',(await get(teamId)).stage==='editing');
 const visibilityId=await add();await move(visibilityId,'script',{who:admin});const adminRev=(await get(visibilityId)).revision;sql(`UPDATE workspace_memberships SET role='client' WHERE id=${lit(members.admin.membership)}`);await move(visibilityId,'editing',{who:admin,expected:404});check('issued role change fences transition',(await get(visibilityId)).revision===adminRev);
 const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await owner.context.storageState()}),touchPage=await touch.newPage(),touchId=await add();await touchPage.goto(base+'/social/'+touchId);await touchPage.getByRole('button',{name:'Move to Script',exact:true}).tap();await touchPage.getByRole('button',{name:'Move to Editing',exact:true}).waitFor();check('real touch transition persists',(await get(touchId)).stage==='script');await layout('touch',touchPage,390);await touch.close();
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+'/social/'+id);check('reduced motion remains static',await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches&&document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations===Infinity).length===0));await layout('reduced-motion',page,390);
 const afterParents=JSON.stringify(sql(`SELECT id,relationship_status AS status FROM bloomops_clients WHERE workspace_id=${lit(ws)} UNION ALL SELECT id,status FROM service_engagements WHERE workspace_id=${lit(ws)}`));check('real acceptance preserves Client and Service lifecycle facts',beforeParents===afterParents);
 sql(`UPDATE workspaces SET status='suspended' WHERE id=${lit(ws)}`);const fenced=await owner.context.request.post(base+itemPath(id)+'/transition',{headers:{origin:base},data:{targetStage:'idea',expectedRevision:1}});check('issued workspace suspension fences transition',fenced.status()===403&&noStore(fenced));
 const design=await browser.newPage();try{const r=await design.goto('https://bloomlab-preview.cool-sunset-2169.workers.dev/design',{timeout:45000});await design.getByRole('heading',{name:'Design gallery',exact:true}).waitFor({timeout:45000});check('live Bloom design reference loaded',r.ok());await design.screenshot({path:join(out,'design-reference.png'),fullPage:true});screenshots++;}catch(error){console.log('Design reference unavailable:',error.message);}
 console.log(`C2 browser/HTTP: ${checks} checks passed; ${screenshots} screenshots at ${widths.join(', ')}. Exit 0.`);
} finally { await browser.close(); }
