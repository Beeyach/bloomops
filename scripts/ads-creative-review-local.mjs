#!/usr/bin/env node
// E2B browser acceptance against the built local Worker.
// Loopback, local D1/R2 mail, example.com only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const base = arg('--url', 'http://localhost:8787'), out = resolve(arg('--out', '/tmp/bloomops-e2b-review'));
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const require = createRequire(join(resolve(arg('--playwright', '/tmp/bloomops-a11-browser')), 'package.json'));
const { chromium } = require('playwright'), browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
mkdirSync(out, { recursive: true });
let checks = 0, screenshots = 0;
const widths = [1440,1024,768,390,320], check = (name, ok) => { assert.ok(ok, name); checks++; console.log(`ok   ${name}`); };
const wrangler = args => execFileSync('npx', ['--no-install','wrangler',...args], { encoding:'utf8', stdio:['ignore','pipe','pipe'] });
const lit = value => `'${String(value).replace(/'/g,"''")}'`;
const sql = query => { const text = wrangler(['d1','execute','DB','--local','--json','--command',query]); return JSON.parse(text.slice(text.indexOf('[')))[0].results; };
const login = async email => {
  const context = await browser.newContext(), page = await context.newPage();
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await context.request.post(base+'/api/auth/sign-in/magic-link', { headers:{origin:base}, data:{email,callbackURL:'/',newUserCallbackURL:'/',errorCallbackURL:'/sign-in'} });
    if (r.status() !== 429 || attempt === 5) { assert.equal(r.status(),200); break; }
    console.log('Local sign-in limit reached; retrying in 15 seconds.'); await new Promise(resolve=>setTimeout(resolve,15000));
  }
  const key = createHash('sha256').update(email).digest('hex'), raw = wrangler(['r2','object','get',`bloomops-files-dev/dev-mail/${key}.json`,'--local','--pipe']);
  const url = JSON.parse(raw.slice(raw.indexOf('{'))).text.match(/https?:\/\/\S+/)[0]; assert.ok(url.startsWith(base+'/api/auth/magic-link/verify?'));
  for (let attempt = 0; attempt < 6; attempt++) {
    const r = await page.goto(url);
    if (r?.status() !== 429 || attempt === 5) { assert.ok(r?.ok()); break; }
    await new Promise(resolve=>setTimeout(resolve,15000));
  }
  return { context, page };
};
const activate = async (page, control) => { await control.waitFor(); await page.waitForFunction(n=>n.isConnected&&!n.disabled,await control.elementHandle()); await control.focus(); await page.keyboard.press('Enter'); };
const layout = async (label,page,width) => {
  await page.setViewportSize({width,height:900});
  if (await page.getByRole('dialog').count() === 0) await page.evaluate(()=>window.scrollTo(0,0));
  await page.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});
  const result = await page.evaluate(()=>({ width:innerWidth, document:document.documentElement.scrollWidth, headings:document.querySelectorAll('h1').length,
    rows:[...document.querySelectorAll('.bo-file')].filter(n=>n.scrollWidth>n.clientWidth).length,
    bad:[...document.querySelectorAll('button,input,select,textarea')].filter(n=>n.checkVisibility()&&n.type!=='checkbox').map(n=>n.getBoundingClientRect()).filter(r=>r.left<0||r.right>innerWidth||r.width<=0||(innerWidth<=390&&r.height<44)).length }));
  check(`${label} ${width}px: no overflow, readable controls and one heading`,result.document<=result.width&&result.headings===1&&result.rows===0&&result.bad===0);
  await page.screenshot({path:join(out,`${label}-${width}.png`),fullPage:await page.getByRole('dialog').count()===0,animations:'disabled'});screenshots++;
};
try {
 const health=await(await fetch(base+'/api/health')).json();check('development bindings and captured local mail only',health.environment==='development'&&health.auth.mail==='r2-dev');
 const reference=await browser.newPage();try{const response=await reference.goto('https://bloomlab-preview.cool-sunset-2169.workers.dev/design',{timeout:30000});if(response?.ok()){await reference.screenshot({path:join(out,'design-reference.png'),fullPage:true});console.log('Design reference captured.');}else console.log(`Design reference unavailable: ${response?.status()}`);}catch{console.log('Design reference unavailable.');}await reference.close();
 const ws=`e2b-${randomUUID().slice(0,8)}`,ids=Object.fromEntries(['owner','team','pm','client'].map(who=>[who,`${ws}-${who}`])),cl=`${ws}-client-record`,service=`${ws}-service`,project=`${ws}-project`,dept=`${ws}-ads`;
 sql(`INSERT INTO workspaces(id,name,slug) VALUES(${lit(ws)},'Studio Creative',${lit(ws)})`);
 for(const [who,role] of [['owner','owner'],['team','team_member'],['pm','project_manager'],['client','client']])sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(ids[who])},${lit(who)},${lit(ids[who]+'@example.com')},1); INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit('m-'+ids[who])},${lit(ws)},${lit(ids[who])},${lit(role)},'active')`);
 sql(`INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(${lit(cl)},${lit(ws)},'Garden Studio',${lit(cl)}); INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES(${lit(ws)},${lit(cl)},'Garden Studio',${lit(ids.client)});
 INSERT INTO departments(id,workspace_id,name,slug) VALUES(${lit(dept)},${lit(ws)},'Ads','ads'); INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(${lit(dept)},${lit(ws)},'Paid social','ads',${lit(dept)}); INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(${lit(service)},${lit(ws)},${lit(cl)},${lit(dept)});
 INSERT INTO projects(id,workspace_id,client_id,service_engagement_id,name,visibility) VALUES(${lit(project)},${lit(ws)},${lit(cl)},${lit(service)},'Autumn launch','internal'); INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES(${lit(ws)},${lit(project)},${lit('m-'+ids.team)})`);
 const team=await login(ids.team+'@example.com'),owner=await login(ids.owner+'@example.com'),client=await login(ids.client+'@example.com');
 const page=team.page;
 await page.goto(base+'/ads/creative');check('new workspace has a useful genuine empty state',await page.getByRole('heading',{name:'No creative in this view'}).count()===1);
 for(const width of widths)await layout('empty',page,width);
 await page.getByRole('link',{name:'Create creative',exact:true}).click();await page.getByLabel('Ads Project',{exact:true}).selectOption({index:1});await page.getByLabel('Title',{exact:true}).fill('Autumn launch — first cut');await page.getByLabel('Content type',{exact:true}).selectOption('video');await page.locator('#content-script').fill('Open with the garden in morning light.\nKeep the invitation clear and warm.');await page.getByLabel('Platforms',{exact:true}).fill('Instagram\nYouTube');
 check('Ads editor excludes client visibility and workflow switches',await page.locator('#content-visibility option[value="client"]').count()===0&&await page.getByRole('checkbox').count()===0);
 for(const width of widths)await layout('create',page,width);
 const created=page.waitForResponse(r=>r.url().endsWith(`/projects/${project}/creative`)&&r.request().method()==='POST');await activate(page,page.getByRole('button',{name:'Create creative',exact:true}));const response=await created;check('Project-only Team creates through the real form',response.status()===201);const {contentId}=await response.json();const ui=`/ads/creative/${contentId}`,api=`/api/bloomops/content/${contentId}`;await page.waitForURL(base+ui);
 check('successful save stays in Ads and reveals internal production',await page.getByRole('button',{name:'Move to Script'}).count()===1&&!await page.getByRole('button',{name:'Request Client approval',exact:true}).count());
 for(const width of widths)await layout('detail-idea',page,width);
 await page.getByRole('link',{name:'Edit details',exact:true}).click();await page.locator('#content-caption').fill('The next season starts with one small step.');
 for(const width of widths)await layout('edit',page,width);
 const saved=page.waitForResponse(r=>r.url()===base+api&&r.request().method()==='PATCH');await activate(page,page.getByRole('button',{name:'Save details',exact:true}));const savedResponse=await saved;assert.equal(savedResponse.status(),200);await page.waitForURL(base+ui);check('edited caption survives save and reload', (await (await team.context.request.get(base+api)).json()).item.caption==='The next season starts with one small step.');
 for(const stage of ['Script','Editing','Internal Review']){const next=page.waitForResponse(r=>r.url()===base+api+'/transition');await activate(page,page.getByRole('button',{name:`Move to ${stage}`,exact:true}));check(`real UI transition to ${stage}`,(await next).status()===200);await page.getByRole('region',{name:'Production',exact:true}).locator('.bo-content-stage').filter({hasText:stage}).waitFor();}
 check('internal review stops before client review',await page.getByRole('button',{name:'Move to Client Review',exact:true}).count()===0);
 await activate(page,page.getByRole('button',{name:'Request revision',exact:true}));let dialog=page.getByRole('dialog');await dialog.getByLabel('What needs to change?',{exact:true}).fill('Shorten the first shot and make the invitation easier to read.');
 for(const width of widths)await layout('revision-dialog',page,width);
 await page.keyboard.press('Escape');check('revision cancel restores focus',await page.getByRole('button',{name:'Request revision',exact:true}).evaluate(n=>n===document.activeElement));
 await activate(page,page.getByRole('button',{name:'Request revision',exact:true}));dialog=page.getByRole('dialog');await dialog.getByLabel('What needs to change?',{exact:true}).fill('Shorten the opening.');const revised=page.waitForResponse(r=>r.url()===base+api+'/transition');await activate(page,dialog.getByRole('button',{name:'Request revision',exact:true}));check('revision explanation saves',(await revised).status()===200);await dialog.waitFor({state:'hidden'});await page.getByRole('button',{name:'Move to Editing',exact:true}).waitFor();
 await activate(page,page.getByRole('button',{name:'Upload asset',exact:true}));dialog=page.getByRole('dialog');
 check('asset dialog hides recording purpose and client visibility',await page.locator('#file-purpose').count()===0&&await page.locator('#file-visibility option[value="client"]').count()===0);
 const bytes=Buffer.from('Browser E2B working image');await page.locator('#file-upload').setInputFiles({name:'autumn-creative.png',mimeType:'image/png',buffer:bytes});
 for(const width of widths)await layout('asset-dialog',page,width);
 const uploaded=page.waitForResponse(r=>r.url()===base+api+'/files'&&r.request().method()==='POST');await activate(page,dialog.getByRole('button',{name:'Upload',exact:true}));const uploadResponse=await uploaded;check('asset form uploads to canonical Content Files',uploadResponse.status()===201);const {fileId}=await uploadResponse.json();await dialog.waitFor({state:'hidden'});await page.getByRole('heading',{name:'autumn-creative.png',exact:true}).waitFor();
 const download=await team.context.request.get(base+`/api/bloomops/files/${fileId}/download`);check('HTTP download returns original bytes and private headers',download.status()===200&&(await download.body()).equals(bytes)&&/no-store/.test(download.headers()['cache-control']));
 const current=async()=> (await(await team.context.request.get(base+api)).json()).item;
 const now=await current();for(const patch of [{visibility:'client'},{clientApprovalRequired:false}])check('forged Ads detail input denied',(await team.context.request.patch(base+api,{headers:{origin:base},data:{...patch,expectedRevision:now.revision}})).status()===400);
 for(const path of ['/social/'+contentId,'/social/'+contentId+'/edit']){await page.goto(base+path);check('Social guessed Ads page is unavailable',await page.getByRole('heading',{name:'There is nothing here',exact:true}).count()>0&&!((await page.textContent('main'))||'').includes('Autumn launch — first cut'));}
 for(const path of [api,`/api/bloomops/portal/content/${contentId}`,`/api/bloomops/portal/recordings/${contentId}/files`,`/api/bloomops/files/${fileId}/download`])check('Client cannot read internal Ads or raw bytes',(await client.context.request.get(base+path)).status()===404);
 await page.goto(base+'/ads/creative');for(const width of widths)await layout('list',page,width);
 check('list uses separate context labels and meaningful platform icon',await page.locator('.bo-ads-context dt').allTextContents().then(t=>t.includes('Project')&&t.includes('Client'))&&await page.locator('.bo-creative-platforms svg').count()===1);
 await page.goto(base+ui);for(const width of widths)await layout('detail-assets',page,width);
 // Exercise conflict recovery with two authenticated editors on the same item.
 await page.goto(base+ui+'/edit');const old=await current();assert.equal((await owner.context.request.patch(base+api,{headers:{origin:base},data:{caption:'Another editor saved first.',expectedRevision:old.revision}})).status(),200);await page.locator('#content-caption').fill('Stale edit');const conflict=page.waitForResponse(r=>r.url()===base+api&&r.request().method()==='PATCH');await activate(page,page.getByRole('button',{name:'Save details',exact:true}));check('stale editor gets a conflict and remains in Ads',(await conflict).status()===409&&page.url()===base+ui+'/edit');for(const width of [390,320])await layout('edit-conflict',page,width);
 await page.getByRole('link',{name:'Cancel',exact:true}).click();await page.waitForURL(base+ui);
 sql(`DELETE FROM project_assignments WHERE project_id=${lit(project)} AND membership_id=${lit('m-'+ids.team)}`);
 check('issued Team session loses Content and bytes immediately',(await team.context.request.get(base+api)).status()===404&&(await team.context.request.get(base+`/api/bloomops/files/${fileId}/download`)).status()===404);
 await page.goto(base+ui);await page.getByRole('heading',{name:'There is nothing here',exact:true}).waitFor();check('revoked detail does not show creative copy',!((await page.textContent('main'))||'').includes('Autumn launch — first cut'));
 await owner.context.close();await team.context.close();await client.context.close();
 console.log(`E2B browser/HTTP: ${checks} checks, ${screenshots} captures passed.`);
} finally {await browser.close();}
