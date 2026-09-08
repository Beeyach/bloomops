#!/usr/bin/env node
// Built-Worker HTTP + browser C1 Content acceptance. Loopback and development
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
  out = resolve(arg("--out", "/tmp/bloomops-c1-review"));
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
 const suffix=randomUUID().slice(0,8),ws=`c1-${suffix}`,members={};
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
 check('Social empty state is real',await owner.page.getByRole('heading',{name:'No Content here yet'}).isVisible());
 for(const w of widths)await layout('empty',owner.page,w);
 await owner.page.goto(base+'/social/new');for(const w of widths)await layout('create',owner.page,w);
 await keyboardActivate(owner.page,owner.page.getByRole('button',{name:'Create Content',exact:true}));
 check('keyboard validation focuses missing context',await owner.page.locator('#content-parent').evaluate(n=>n===document.activeElement));
 await owner.page.locator('#content-parent').selectOption({label:'James · Garden Studio · Social'});
 await owner.page.getByLabel('Title',{exact:true}).fill('T'.repeat(200));
 await owner.page.getByLabel('Content pillar').fill('A calm launch');
 await owner.page.getByLabel('Script').fill('First line\n'+'Editorial text '.repeat(1000));
 await owner.page.getByLabel('Caption').fill('A thoughtful caption');
 await owner.page.getByLabel('Call to action').fill('Tell us your story');
 await owner.page.getByLabel('Target publish date').fill('2026-10-01');
 await owner.page.getByLabel('Recording required',{exact:true}).check();
 await owner.page.getByLabel('Visibility',{exact:true}).selectOption('client');
 await keyboardActivate(owner.page,owner.page.getByRole('button',{name:'Create Content',exact:true}));await owner.page.waitForURL(/\/social\/[a-f0-9-]+$/);
 const id=new URL(owner.page.url()).pathname.split('/').pop(),item=await get(id);
 check('browser create persists exact Client, Social service and editorial facts',item.clientId===cl&&item.serviceEngagementId===service&&item.title.length===200&&item.script.length>10000&&item.recordingRequired&&item.stage==='idea'&&item.publishedAt===null);
 for(const w of widths)await layout('detail-long',owner.page,w);
 await keyboardActivate(owner.page,owner.page.getByRole('link',{name:'Edit details'}));await owner.page.waitForURL(/\/edit$/);
 for(const w of widths)await layout('edit-long',owner.page,w);
 check('edit form exposes no parent or stage mutation control',await owner.page.locator('#content-parent').count()===0&&await owner.page.locator('[name=stage]').count()===0);
 await owner.page.getByLabel('Hook').fill('Start with something useful');await keyboardActivate(owner.page,owner.page.getByRole('button',{name:'Save details'}));await owner.page.waitForURL(/\/social\/[a-f0-9-]+$/);
 check('keyboard save persists update and revision',(await get(id)).hook==='Start with something useful'&&(await get(id)).revision===2);
 await owner.page.goto(base+'/social');for(const w of widths)await layout('list-long',owner.page,w);
 await owner.page.getByLabel('Content type',{exact:true}).selectOption('video');await keyboardActivate(owner.page,owner.page.getByRole('button',{name:'Apply filters'}));await owner.page.waitForURL(/type=video/);check('type filter shows truthful empty state',await owner.page.getByRole('heading',{name:'No Content here yet'}).isVisible());
 for(const who of[client]){check('Client cannot read internal Content API',(await read(itemPath(id),who)).status()===404);check('Client internal Social redirects away',(await who.page.goto(base+'/social')).status()<500&&!new URL(who.page.url()).pathname.startsWith('/social'));const portal=await(await read('/portal',who)).text();check('Client portal contains no Content title or projection',!portal.includes(item.title)&&!portal.includes('Start with something useful'));check('no Content portal API',(await read('/api/bloomops/portal/content',who)).status()===404);}
 for(const [name,who] of [['Admin',admin],['PM',pm]]) { const made=(await api(who.context,servicePath,{title:`${name} editorial`,type:'static_post',requestId:randomUUID()},201)).contentId; check(`${name} creates and edits ordinary Social Content`,(await patch(made,{pillar:'Editorial',expectedRevision:1},who)).status()===200&&(await get(made,who)).stage==='idea'); }
 const restricted=(await api(owner.context,parentPath,{title:'RESTRICTED_CONTENT',type:'other',visibility:'restricted',requestId:randomUUID()},201)).contentId;
 check('PM ordinary read succeeds and restricted read denies',(await read(itemPath(id),pm)).status()===200&&(await read(itemPath(restricted),pm)).status()===404);
 check('unassigned Team cannot read or create',(await read(itemPath(id),team)).status()===404&&(await team.context.request.post(base+servicePath,{headers:{origin:base},data:{title:'Denied',type:'reel',requestId:randomUUID()}})).status()===404);
 sql(`INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES(${lit(ws)},${lit(service)},${lit(members.sam.membership)})`);
 const teamId=(await api(team.context,servicePath,{title:'Team editorial',type:'carousel',requestId:randomUUID()},201)).contentId;
 check('Service Team read/create/edit uses issued session',(await read(itemPath(id),team)).status()===200&&(await patch(teamId,{caption:'Team edit',expectedRevision:1},team)).status()===200);
 check('Service Team does not gain Client-level Content',(await read(itemPath(restricted),team)).status()===404);
 sql(`INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES(${lit(ws)},${lit(cl)},${lit(members.pm.membership)})`);check('current explicit Client assignment grants restricted PM',(await read(itemPath(restricted),pm)).status()===200);
 for(const path of[`/api/bloomops/clients/${other}/services/${service}/content`,`/api/bloomops/clients/${cl}/services/${nonSocial}/content`,`/api/bloomops/clients/${cl}/services/missing/content`]){const r=await owner.context.request.post(base+path+'?forged=1',{headers:{origin:base},data:null});check('wrong parent remains safe before input validation',r.status()===404&&noStore(r)&&!/SQL|constraint/.test(await r.text()));}
 const retryBody={title:'Retry identity',type:'email',requestId:randomUUID()},created=await Promise.all([api(owner.context,parentPath,retryBody,201),api(owner.context,parentPath,retryBody,201)]);check('built HTTP concurrent retries converge',created[0].contentId===created[1].contentId);
 const retryId=created[0].contentId,race=await Promise.all(['A','B'].map(title=>patch(retryId,{title,expectedRevision:1})));check('built HTTP edit race has one canonical winner',race.map(r=>r.status()).sort().join(',')==='200,409');
 check('retry after edits returns same identity',(await api(owner.context,parentPath,retryBody,201)).contentId===retryId);
 const forged=await patch(id,{stage:'published',caption:'Do not partially save',expectedRevision:2});check('forged stage rejects complete mutation',forged.status()===400&&(await get(id)).caption==='A thoughtful caption');
 sql(`DELETE FROM service_assignments WHERE membership_id=${lit(members.sam.membership)}`);check('issued Team session loses current Content read and mutation',(await read(itemPath(teamId),team)).status()===404&&(await patch(teamId,{caption:'Revoked',expectedRevision:2},team)).status()===404);
 sql(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(members.pm.membership)}`);check('issued PM session immediately loses workspace authorization',(await read(itemPath(id),pm)).status()===403);
 // SQL creates volume only; the operating flow above uses the real API/forms.
 const inserts=[];for(let i=0;i<205;i++)inserts.push(`INSERT INTO content_items(workspace_id,client_id,creation_request_id,title,type) VALUES(${lit(ws)},${lit(other)},${lit(randomUUID())},${lit('Volume '+i)},'story')`);sql(inserts.join(';'));
 await owner.page.goto(base+`/social?clientId=${other}`);for(const w of widths)await layout('overflow',owner.page,w);check('visible page is bounded with truthful next link',await owner.page.locator('.bo-content-list > li').count()===200&&await owner.page.getByRole('link',{name:'Next page'}).isVisible());
 await keyboardActivate(owner.page,owner.page.getByRole('link',{name:'Next page'}));await owner.page.waitForURL(/page=2/);check('second page reaches remaining Content and has no false overflow',await owner.page.locator('.bo-content-list > li').count()===5&&await owner.page.getByRole('link',{name:'Next page'}).count()===0);
 await owner.page.emulateMedia({reducedMotion:'reduce'});await owner.page.goto(base+'/social/'+id);check('reduced motion uses static Content presentation',await owner.page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches&&document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations===Infinity).length===0));await layout('reduced-motion',owner.page,390);
 const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await owner.context.storageState()}),touchPage=await touch.newPage();await touchPage.goto(base+'/social/'+id);await touchPage.getByRole('link',{name:'Edit details'}).tap();await touchPage.waitForURL(/\/edit$/);await touchPage.getByLabel('Recording required',{exact:true}).tap();check('touch toggles workflow intent in a 44px label',await touchPage.getByLabel('Recording required',{exact:true}).isChecked()===false&&await touchPage.locator('.bo-content-check').first().evaluate(n=>n.getBoundingClientRect().height>=44));await layout('touch',touchPage,390);await touch.close();
 const design=await browser.newPage();try{const r=await design.goto('https://bloomlab-preview.cool-sunset-2169.workers.dev/design',{timeout:45000});await design.getByRole('heading',{name:'Design gallery',exact:true}).waitFor({timeout:45000});check('live Bloom design reference loaded',r.ok());await design.screenshot({path:join(out,'design-reference.png'),fullPage:true});screenshots++;}catch(error){console.log('Design reference unavailable:',error.message);}
 console.log(`C1 browser/HTTP: ${checks} checks passed; ${screenshots} screenshots at ${widths.join(', ')}. Exit 0.`);
} finally { await browser.close(); }
