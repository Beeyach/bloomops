#!/usr/bin/env node
// Built-Worker HTTP + browser C3 Content acceptance. Loopback and development
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
  out = resolve(arg("--out", "/tmp/bloomops-c3-review"));
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
        !/SQLITE_BUSY|database is locked/.test(String(error.stderr) + String(error.stdout))
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
    fullPage: label !== 'overflow' && !label.startsWith('dense') && await page.getByRole('dialog').count() === 0,
    animations: 'disabled',
  });
  screenshots++;
};
try {
 const health=await(await fetch(base+'/api/health')).json();check('loopback development Worker and local R2 mail only',health.environment==='development'&&health.auth.mail==='r2-dev');
 const suffix=randomUUID().slice(0,8),ws=`c3-${suffix}`,members={};
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
 const set=async(id,platforms,{who=owner,expectedRevision,expected=200}={})=>{const r=await who.context.request.put(base+itemPath(id)+'/platforms',{headers:{origin:base},data:{platforms,expectedRevision:expectedRevision??(await get(id)).revision}});assert.equal(r.status(),expected,await r.text());return r.json();};
 const calendarPath='/api/bloomops/content/calendar?start=2026-09-01&end=2026-09-30',cal=async(who=owner,query='')=>{const r=await read(calendarPath+query,who);assert.equal(r.status(),200);assert.ok(noStore(r));return r.json();};
 const page=owner.page,labels=['Agency primary channel','Partner channel · '+'L'.repeat(40)],id=await add({targetPublishDate:'2026-09-08',platforms:labels},{title:'A thoughtful launch · '+'L'.repeat(160)});
 const otherId=(await api(owner.context,`/api/bloomops/clients/${other}/content`,{title:'Other Client monthly update',type:'static_post',targetPublishDate:'2026-09-30',requestId:randomUUID()},201)).contentId;
 await add({targetPublishDate:'2026-08-31'});await add({targetPublishDate:'2026-10-01'});await add();check('month projection includes only canonical in-range target dates',(await cal()).items.length===2);
 await set(id,['agency primary channel','AGENCY PRIMARY CHANNEL'],{expected:400});check('duplicate association never duplicates canonical rows',(await get(id)).platforms.length===2);
 const published=await add({targetPublishDate:'2026-09-01',platforms:['Published channel'],internalReviewRequired:false,clientApprovalRequired:false});for(const stage of ['script','editing','approved','scheduled','published'])await move(published,stage);
 await page.goto(base+'/social/calendar?month=2026-09');await page.getByRole('heading',{name:'Content calendar',exact:true}).waitFor();for(const w of widths)await layout('calendar',page,w);check('Published calendar presentation uses actual C2 timestamp',await page.locator(`a[href="/social/${published}"]`).locator('xpath=../..').innerText().then(t=>t.includes((new Date()).toISOString().slice(0,10))&&t.includes('Published')));
 await page.getByRole('link',{name:'Previous month',exact:true}).focus();await page.keyboard.press('Tab');check('calendar keyboard focus reaches next month with visible outline',await page.getByRole('link',{name:'Next month',exact:true}).evaluate(n=>n===document.activeElement&&parseFloat(getComputedStyle(n).outlineWidth)>0));await keyboardActivate(page,page.getByRole('link',{name:'Next month',exact:true}));await page.waitForURL(/month=2026-10/);check('keyboard month navigation follows real date range',await page.locator('.bo-content-list > li').count()===1);
 await page.goto(base+'/social/calendar?month=2026-09');await page.getByLabel('Platform',{exact:true}).fill('AGENCY PRIMARY CHANNEL');await keyboardActivate(page,page.getByRole('button',{name:'Apply filters',exact:true}));await page.waitForURL(/platform=AGENCY/);check('calendar platform filter keeps one canonical multi-platform row',await page.locator('.bo-content-list > li').count()===1);
 await page.goto(base+'/social');await page.getByLabel('Platform',{exact:true}).fill('Agency primary channel');await keyboardActivate(page,page.getByRole('button',{name:'Apply filters',exact:true}));await page.waitForURL(/platform=Agency/);check('list platform filter preserves Content row identity',await page.locator('.bo-content-list > li').count()===1);for(const w of widths)await layout('list-filter',page,w);
 await page.goto(base+'/social/'+id);for(const w of widths)await layout('platform-detail',page,w);await page.getByRole('textbox',{name:'Platforms',exact:true}).fill('Edited channel\nSecond channel');await keyboardActivate(page,page.getByRole('button',{name:'Save platforms',exact:true}));await page.getByText('Platforms saved.',{exact:true}).waitFor();check('keyboard platform save persists canonical set',(await get(id)).platforms.map(p=>p.label).join()==='Edited channel,Second channel');
 await page.goto(base+'/social/'+id+'/edit');for(const w of widths)await layout('platform-edit',page,w);check('existing Content edit exposes separate platform operation',await page.getByRole('button',{name:'Save platforms',exact:true}).count()===1);
 await page.goto(base+'/social/new');await page.getByRole('heading',{name:'Create Content',exact:true}).waitFor();for(const w of widths)await layout('platform-create',page,w);check('Content create exposes optional platforms',await page.getByRole('textbox',{name:'Platforms',exact:true}).count()===1);await page.getByLabel('Client and service',{exact:true}).selectOption('0');await page.getByLabel('Title',{exact:true}).fill('Created with channels');await page.getByRole('textbox',{name:'Platforms',exact:true}).fill('Browser channel\nAnother channel');await keyboardActivate(page,page.getByRole('button',{name:'Create Content',exact:true}));await page.waitForURL(/\/social\/[0-9a-f-]+$/);check('browser creation commits initial platform set',(await get(new URL(page.url()).pathname.split('/').pop())).platforms.length===2);
 await page.goto(base+'/social/calendar?month=2027-01');for(const w of widths)await layout('empty-month',page,w);check('empty month remains useful',await page.getByText('Nothing planned in this range',{exact:true}).isVisible());
 for(const month of ['0100-01','9999-12','2024-02']){await page.goto(base+'/social/calendar?month='+month);check(`month edge ${month} loads exact calendar`,await page.getByRole('heading',{name:'Content calendar',exact:true}).isVisible());if(month==='0100-01')check('minimum month hides previous navigation',await page.getByRole('link',{name:'Previous month',exact:true}).count()===0);if(month==='9999-12')check('maximum month hides next navigation',await page.getByRole('link',{name:'Next month',exact:true}).count()===0);}
 for(const query of ['?start=2026-02-30&end=2026-03-01','?start=2026-09-01&end=2026-09-30&start=2026-09-02','?start=2026-01-01&end=2026-12-31','?start=2026-09-01&end=2026-09-30&forged=1']){const r=await read('/api/bloomops/content/calendar'+query);check('built calendar rejects invalid exact query safely',r.status()===400&&noStore(r)&&!/(?:SQL|constraint|stack)/.test(await r.text()));}
 const restricted=await add({targetPublishDate:'2026-09-08',visibility:'restricted'});await set(restricted,['Team'],{who:team,expected:404});await set(restricted,['PM'],{who:pm,expected:404});check('unassigned Team calendar is empty',(await cal(team)).items.length===0);
 sql(`INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES(${lit(ws)},${lit(service)},${lit(members.sam.membership)})`);await set(restricted,['Team'],{who:team});check('issued Team exact Service grants calendar and platform edit',(await cal(team)).items.some(i=>i.id===restricted)&&!(await cal(team)).items.some(i=>i.id===otherId));
 const clientLevel=(await api(owner.context,parentPath,{title:'Client-level idea',type:'reel',targetPublishDate:'2026-09-08',requestId:randomUUID()},201)).contentId;await set(clientLevel,['Team'],{who:team,expected:404});check('Service assignment never grants Client-level calendar row',!(await cal(team)).items.some(i=>i.id===clientLevel));
 const broad=await add({targetPublishDate:'2026-09-08'});check('ordinary PM sees calendar before restriction',(await cal(pm)).items.some(i=>i.id===broad));await patch(broad,{visibility:'restricted',expectedRevision:1});await set(broad,['Blocked'],{who:pm,expected:404});check('issued PM visibility restriction removes calendar row',!(await cal(pm)).items.some(i=>i.id===broad));
 sql(`INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES(${lit(ws)},${lit(cl)},${lit(members.pm.membership)})`);await set(broad,['PM'],{who:pm});check('exact Client assignment restores restricted PM fulfillment',(await cal(pm)).items.some(i=>i.id===broad));
 const raceId=await add(),race=await Promise.all([owner.context.request.put(base+itemPath(raceId)+'/platforms',{headers:{origin:base},data:{platforms:['One'],expectedRevision:1}}),patch(raceId,{caption:'Race',expectedRevision:1})]);check('built platform/edit race has one winner',race.map(r=>r.status()).sort().join(',')==='200,409'&&(await get(raceId)).revision===2);
 const sameId=await add(),same=await Promise.all([set(sameId,['Same'],{expectedRevision:1}),set(sameId,['Same'],{expectedRevision:1})]);check('identical built HTTP platform writes converge once',same.filter(r=>r.unchanged).length===1&&(await get(sameId)).revision===2);
 const stale=await add();await page.goto(base+'/social/'+stale);await patch(stale,{caption:'Changed',expectedRevision:1});await page.getByRole('textbox',{name:'Platforms',exact:true}).fill('Losing change');const response=page.waitForResponse(r=>r.url().endsWith('/platforms'));await keyboardActivate(page,page.getByRole('button',{name:'Save platforms',exact:true}));assert.equal((await response).status(),409);await page.getByRole('link',{name:'Reload Content',exact:true}).waitFor();check('stale form returns conflict with safe reload',await page.getByRole('link',{name:'Reload Content',exact:true}).isVisible());
 sql(`DELETE FROM service_assignments WHERE membership_id=${lit(members.sam.membership)}`);await set(restricted,['Blocked'],{who:team,expected:404});check('issued Team revocation removes all calendar rows',(await cal(team)).items.length===0);await team.page.goto(base+'/social/calendar?month=2026-09');check('revoked browser has calm empty calendar',await team.page.getByText('Nothing planned in this range',{exact:true}).isVisible());
 for(const path of [calendarPath,itemPath(id)+'/platforms']){const r=path===calendarPath?await read(path,client):await client.context.request.put(base+path,{headers:{origin:base},data:null});check('Client denied internal C3 APIs before body validation',r.status()===(path===calendarPath?403:404)&&noStore(r));}await client.page.goto(base+'/social/calendar');check('Client cannot enter internal calendar shell',!await client.page.getByRole('heading',{name:'Content calendar',exact:true}).count());
 const dense=[];for(let i=0;i<205;i++){const denseId=`${ws}-dense-${String(i).padStart(3,'0')}`;dense.push(`INSERT INTO content_items(id,workspace_id,client_id,creation_request_id,title,type,target_publish_date) VALUES(${lit(denseId)},${lit(ws)},${lit(cl)},${lit(randomUUID())},${lit('Dense same-day item '+i+' · '+'Long'.repeat(30))},'reel','2026-09-08')`);for(const key of ['dense','second'])dense.push(`INSERT INTO content_platforms VALUES(${lit(ws)},${lit(denseId)},${lit(key)},${lit(key)})`);}
 const fixture=join(out,'dense.sql');const {writeFileSync}=await import('node:fs');writeFileSync(fixture,dense.join(';\n')+';');wrangler(['d1','execute','DB','--local','--file',fixture]);
 const first=await cal(owner,'&platform=dense'),second=await cal(owner,'&platform=dense&page=2');check('205 dense multichannel rows paginate without duplication',first.items.length===200&&first.hasMore&&second.items.length===5&&!second.hasMore&&new Set([...first.items,...second.items].map(i=>i.id)).size===205);
 await page.goto(base+'/social/calendar?month=2026-09&platform=dense');for(const w of widths)await layout('dense-calendar',page,w);check('dense browser page retains all 200 items',await page.locator('.bo-content-list > li').count()===200);await keyboardActivate(page,page.getByRole('link',{name:'Next page',exact:true}));await page.waitForURL(/page=2/);check('dense next page exposes remaining five',await page.locator('.bo-content-list > li').count()===5);
 const facts=()=>JSON.stringify(sql(`SELECT id,revision,stage,target_publish_date,published_at FROM content_items WHERE workspace_id=${lit(ws)} ORDER BY id`));const events=()=>sql(`SELECT count(*) n FROM activity_events WHERE workspace_id=${lit(ws)}`)[0].n;const beforeFacts=facts(),beforeEvents=events();await cal();await read('/api/bloomops/content');await page.reload();check('calendar and list reads write no Content or activity',beforeFacts===facts()&&beforeEvents===events());
 const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await owner.context.storageState()}),touchPage=await touch.newPage();await touchPage.goto(base+'/social/'+id);await touchPage.getByRole('textbox',{name:'Platforms',exact:true}).fill('Touch channel');await touchPage.getByRole('button',{name:'Save platforms',exact:true}).tap();await touchPage.getByText('Platforms saved.',{exact:true}).waitFor();check('real touch platform edit persists',(await get(id)).platforms[0].label==='Touch channel');await touchPage.goto(base+'/social/calendar?month=2026-09');await layout('touch-calendar',touchPage,390);await touch.close();
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+'/social/calendar?month=2026-09');check('reduced motion calendar remains static',await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches&&document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations===Infinity).length===0));await layout('reduced-motion',page,390);
 check('C3 preserves Client and Service lifecycle facts',beforeParents===JSON.stringify(sql(`SELECT id,relationship_status AS status FROM bloomops_clients WHERE workspace_id=${lit(ws)} UNION ALL SELECT id,status FROM service_engagements WHERE workspace_id=${lit(ws)}`)));
 sql(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(members.pm.membership)}`);await set(restricted,['Blocked'],{who:pm,expected:403});check('issued membership suspension fences calendar',(await read(calendarPath,pm)).status()===403);
 const workspaceRevision=(await get(id)).revision;sql(`UPDATE workspaces SET status='suspended' WHERE id=${lit(ws)}`);await set(id,['Blocked'],{expectedRevision:workspaceRevision,expected:403});check('issued workspace suspension fences calendar',(await read(calendarPath)).status()===403);
 const design=await browser.newPage();try{const r=await design.goto('https://bloomlab-preview.cool-sunset-2169.workers.dev/design',{timeout:45000});await design.getByRole('heading',{name:'Design gallery',exact:true}).waitFor({timeout:45000});check('live Bloom design reference loaded',r.ok());await design.screenshot({path:join(out,'design-reference.png'),fullPage:true});screenshots++;}catch(error){console.log('Design reference unavailable:',error.message);}
 console.log(`C3 browser/HTTP: ${checks} checks passed; ${screenshots} screenshots at ${widths.join(', ')}. Exit 0.`);
} finally { await browser.close(); }
