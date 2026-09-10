#!/usr/bin/env node
// Built Worker C6 acceptance; loopback, local D1/R2 mail, example.com only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const base = arg('--url', 'http://localhost:8787'), out = resolve(arg('--out', '/tmp/bloomops-c6-review'));
assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const require = createRequire(join(resolve(arg('--playwright', '/tmp/bloomops-c6-tools')), 'package.json'));
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
  const health=await(await fetch(base+'/api/health')).json();check('development only, configured identity and local R2 mail',health.environment==='development'&&health.auth.mail==='r2-dev'&&health.auth.configured);
  const suffix=randomUUID().slice(0,8),ws=`c6-${suffix}`,members={};
  sql(`INSERT INTO workspaces(id,name,slug) VALUES(${lit(ws)},'Garden Studio',${lit(ws)})`);
  for(const [name,role] of [['owner','owner'],['client','client'],['social','client'],['other','client']]){
    const id=`${ws}-${name}`,email=`${id}@example.com`,membership=`m-${id}`;members[name]={id,email,membership};
    sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(id)},${lit(name)},${lit(email)},1)`);
    sql(`INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit(membership)},${lit(ws)},${lit(id)},${lit(role)},'active')`);
  }
  const cl=`${ws}-james`,socialClient=`${ws}-social-client`,otherClient=`${ws}-other-client`,dept=`${ws}-social`,systems=`${ws}-systems`,service=`${ws}-service`,socialService=`${ws}-social-service`,ghl=`${ws}-ghl`;
  for(const [id,name,user] of [[cl,'James · Garden Studio',members.client.id],[socialClient,'Social Studio',members.social.id],[otherClient,'Systems Studio',members.other.id]]){
    sql(`INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(${lit(id)},${lit(ws)},${lit(name)},${lit(id)})`);
    sql(`INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES(${lit(ws)},${lit(id)},${lit(name)},${lit(user)})`);
  }
  for(const [id,slug,name] of [[dept,'social','Social'],[systems,'systems','Systems']]){
    sql(`INSERT INTO departments(id,workspace_id,name,slug) VALUES(${lit(id)},${lit(ws)},${lit(name)},${lit(slug)})`);
    sql(`INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(${lit(id)},${lit(ws)},${lit(name)},${lit(slug)},${lit(id)})`);
  }
  for(const [id,client,type] of [[service,cl,dept],[socialService,socialClient,dept],[ghl,cl,systems],[`${ws}-systems-only`,otherClient,systems]])sql(`INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(${lit(id)},${lit(ws)},${lit(client)},${lit(type)})`);
  const owner=await login(members.owner.email),client=await login(members.client.email),social=await login(members.social.email),other=await login(members.other.email);
  const post=async(path,data,who=owner,expected=200)=>{const r=await who.context.request.post(base+path,{headers:{origin:base},data});assert.equal(r.status(),expected,await r.text());return r.json();};
  const add=async(input={},clientId=cl,serviceId=service)=>(await post(`/api/bloomops/clients/${clientId}/services/${serviceId}/content`,{requestId:randomUUID(),title:'A thoughtful seasonal update',type:'reel',visibility:'client',script:'C6_PRIVATE_SCRIPT',hook:'C6_PRIVATE_HOOK',caption:'C6_PRIVATE_CAPTION',cta:'C6_PRIVATE_CTA',pillar:'C6_PRIVATE_PILLAR',platforms:['Instagram','TikTok'],targetPublishDate:'2026-09-22',...input},owner,201)).contentId;
  const current=async id=>(await(await owner.context.request.get(base+`/api/bloomops/content/${id}`)).json()).item;
  const move=async(id,targetStage)=>post(`/api/bloomops/content/${id}/transition`,{targetStage,expectedRevision:(await current(id)).revision,...targetStage==='waiting_for_recording'?{context:'C6_PRIVATE_WAITING'}:{}});
  const read=async(id)=>(await(await client.context.request.get(base+`/api/bloomops/portal/content/${id}`)).json()).item;
  const upcoming=await add({title:'A seasonal update · '+'A calm editorial idea '.repeat(8)}),recording=await add({title:'Your next recording',recordingRequired:true}),review=await add({title:'Your next approval'});
  const hidden=await add({title:'C6_HIDDEN_TITLE',visibility:'internal'});
  await add({title:'Social only story'},socialClient,socialService);
  const project=(await post(`/api/bloomops/clients/${cl}/projects`,{name:'Your systems setup',visibility:'client',serviceEngagementId:ghl},owner,201)).projectId;
  check('canonical multi-service project created',Boolean(project));
  for(const stage of ['script','waiting_for_recording'])await move(recording,stage);
  for(const stage of ['script','editing','internal_review','client_review'])await move(review,stage);
  const round=(await post(`/api/bloomops/content/${review}/approvals`,{requestId:randomUUID(),expectedRevision:(await current(review)).revision},owner,201)).roundId;
  const published=await add({title:'A recently published story'}),old=await add({title:'C6_OLD_PUBLICATION'});
  sql(`UPDATE content_items SET stage='published',published_at=${lit(new Date(Date.now()-86400000).toISOString())} WHERE id=${lit(published)}`);
  sql(`UPDATE content_items SET stage='published',published_at='2025-01-01T00:00:00.000Z' WHERE id=${lit(old)}`);
  const bytes=Buffer.from('C6 synthetic original recording'),filename='Garden update '+'a'.repeat(162)+'.mp4',fileInput={requestId:randomUUID(),filename,mimeType:'video/mp4',byteSize:bytes.length,purpose:'recording'};
  const upload=await client.context.request.post(base+`/api/bloomops/portal/recordings/${recording}/files`,{headers:{origin:base,'content-type':'application/octet-stream','x-bloomops-file':encodeURIComponent(JSON.stringify(fileInput))},data:bytes});assert.equal(upload.status(),201,await upload.text());const fileId=(await upload.json()).fileId;
  const downloadPath=`/api/bloomops/files/${fileId}/download`;
  for(const [who,label,wantsContent] of [[client,'multi-service',true],[social,'social-only',true],[other,'systems-only',false]]){
    await who.page.goto(base+'/portal');check(`${label}: conditional Content navigation`,(await who.page.locator('.bo-portal-content-nav a[href="/portal/content"]').count()>0)===wantsContent);
    for(const width of widths)await layout(`${label}-home`,who.page,width);
  }
  check('multi-service Home keeps the existing Project',await client.page.getByText('Your systems setup',{exact:true}).count()>0);
  await other.page.goto(base+'/portal/content');check('irrelevant direct Content route has useful empty state',await other.page.getByText('No Content in progress',{exact:true}).count()===1);
  for(const width of widths)await layout('empty-content',other.page,width);
  await client.page.goto(base+'/portal/content');
  for(const width of widths)await layout('content-index',client.page,width);
  const body=await client.page.textContent('main');check('general list excludes hidden Content, internal copy and old publications',!/C6_PRIVATE|C6_HIDDEN|C6_OLD/.test(body));
  check('required actions link to canonical recording and approval pages',await client.page.locator(`a[href="/portal/recordings/${recording}"]`).count()===1&&await client.page.locator(`a[href="/portal/approvals/${round}"]`).count()===1);
  check('upcoming dates and platform labels remain legible',body.includes('Planned for')&&body.includes('Instagram'));
  await activate(client.page,client.page.locator(`a[href="/portal/content/${upcoming}"]`));await client.page.waitForURL(base+`/portal/content/${upcoming}`);
  check('keyboard opens safe detail without editorial copy',!(await client.page.textContent('main')).includes('C6_PRIVATE')&&await client.page.getByText('Nothing is needed from you right now.',{exact:true}).count()===1);
  for(const width of widths)await layout('content-no-action',client.page,width);
  await client.page.goto(base+`/portal/content/${recording}`);
  for(const width of widths)await layout('content-ready-file',client.page,width);
  check('File metadata exact DTO and canonical byte route',Object.keys((await read(recording)).files.items[0]).sort().join()==='byteSize,filename,id,mimeType,readyAt,status');
  const download=await client.context.request.get(base+downloadPath);check('existing download returns original bytes without a public URL',download.status()===200&&(await download.body()).equals(bytes)&&/no-store/.test(download.headers()['cache-control']));
  await activate(client.page,client.page.getByRole('link',{name:'Recording needed',exact:true}));await client.page.waitForURL(base+`/portal/recordings/${recording}`);check('recording link reaches existing uploader',await client.page.getByRole('heading',{name:'Recording needed',exact:true}).count()===1);
  await client.page.goto(base+`/portal/content/${review}`);await activate(client.page,client.page.getByRole('link',{name:'Approval needed',exact:true}));await client.page.waitForURL(base+`/portal/approvals/${round}`);
  check('explicit review alone reveals the frozen requested copy',(await client.page.textContent('main')).includes('C6_PRIVATE_SCRIPT'));
  await activate(client.page,client.page.getByRole('button',{name:'Approve',exact:true}));const dialog=client.page.getByRole('dialog');await activate(client.page,dialog.getByRole('button',{name:'Approve this round',exact:true}));await dialog.waitFor({state:'hidden'});
  await client.page.goto(base+`/portal/content/${review}`);check('successful C5 response removes C6 action link',await client.page.getByRole('link',{name:'Approval needed',exact:true}).count()===0&&(await read(review)).statusLabel==='Ready');
  await client.page.goto(base+'/portal/content?view=published');check('recent publication view excludes old publication',(await client.page.textContent('main')).includes('A recently published story')&&!(await client.page.textContent('main')).includes('C6_OLD'));
  for(const width of widths)await layout('recent-publications',client.page,width);
  await client.page.goto(base+'/portal/content?view=invalid');check('invalid input is recoverable without server details',await client.page.getByRole('link',{name:'Reset view',exact:true}).count()===1);
  for(const width of widths)await layout('invalid-view',client.page,width);
  const missing=await client.context.request.get(base+`/api/bloomops/portal/content/${hidden}`);check('hidden and missing detail deny alike',missing.status()===404&&(await client.context.request.get(base+'/api/bloomops/portal/content/unknown')).status()===404);
  await move(recording,'editing');check('live stage change removes recording action, File metadata and old byte access',!(await read(recording)).recordingNeeded&&!(await read(recording)).hasFiles&&(await client.context.request.get(base+downloadPath)).status()===404);
  await client.page.goto(base+'/portal/content?view=action');check('no-action view is reassuring',await client.page.getByText('You’re all set for now',{exact:true}).count()===1);
  for(const width of widths)await layout('no-actions',client.page,width);
  await client.page.emulateMedia({reducedMotion:'reduce'});await client.page.goto(base+'/portal/content');await layout('reduced-motion',client.page,320);
  check('reduced motion is respected',await client.page.locator('.bo-content-title').first().evaluate(n=>getComputedStyle(n).transitionDuration.split(',').every(v=>parseFloat(v)<=0.01)));
  const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await client.context.storageState()}),touchPage=await touch.newPage();await touchPage.goto(base+'/portal');await touchPage.locator('.bo-portal-content-nav a[href="/portal/content"]').tap();await touchPage.waitForURL(base+'/portal/content');await layout('touch',touchPage,390);await touch.close();
  check('touch navigates to Content',true);
  sql(`UPDATE content_items SET visibility='internal' WHERE client_id=${lit(cl)}`);await client.page.goto(base+'/portal');check('live visibility removes general Content navigation',await client.page.locator('.bo-portal-content-nav').count()===0&&(await client.context.request.get(base+`/api/bloomops/portal/content/${upcoming}`)).status()===404);
  sql(`UPDATE content_items SET visibility='client' WHERE id=${lit(upcoming)}`);sql(`UPDATE client_contacts SET user_id=NULL WHERE client_id=${lit(cl)}`);await client.page.goto(base+'/portal');check('contact revocation removes navigation and direct reads',await client.page.locator('.bo-portal-content-nav').count()===0&&(await client.context.request.get(base+`/api/bloomops/portal/content/${upcoming}`)).status()===404);
  sql(`UPDATE client_contacts SET user_id=${lit(members.client.id)} WHERE client_id=${lit(cl)}`);sql(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(members.client.membership)}`);check('issued session suspension is refused',(await client.context.request.get(base+'/api/bloomops/portal/content')).status()===403);
  console.log(`C6 browser/HTTP: ${checks} checks passed; ${screenshots} screenshots at ${widths.join(', ')}px. Exit 0.`);
}catch(error){console.error('C6 browser acceptance failed:',String(error.message).split('\n').filter(l=>!/cookie:|authorization:|token=/i.test(l)).join('\n'));process.exitCode=1;}
finally{await browser.close();}
