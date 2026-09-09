#!/usr/bin/env node
// Built Worker C4 acceptance; loopback, local D1/R2 mail, example.com only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
const arg = (name, fallback) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback;
const base = arg('--url', 'http://localhost:8787'), out = resolve(arg('--out', '/tmp/bloomops-c4-review'));
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
  const health = await (await fetch(base+'/api/health')).json(); check('local development, configured auth and R2-only mail',health.environment==='development'&&health.auth.mail==='r2-dev'&&health.auth.configured);
  const suffix=randomUUID().slice(0,8),ws=`c4-${suffix}`,members={};
  sql(`INSERT INTO workspaces(id,name,slug) VALUES(${lit(ws)},'Recording Studio',${lit(ws)})`);
  for(const[name,role]of[['owner','owner'],['pm','project_manager'],['team','team_member'],['client','client'],['other','client']]){
    const id=`${ws}-${name}`,email=`${id}@example.com`,membership=`m-${id}`;members[name]={id,email,membership};
    sql(`INSERT INTO user(id,name,email,email_verified) VALUES(${lit(id)},${lit(name)},${lit(email)},1)`);
    sql(`INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(${lit(membership)},${lit(ws)},${lit(id)},${lit(role)},'active')`);
  }
  const cl=`${ws}-james`,dept=`${ws}-social`,service=`${ws}-service`;
  sql(`INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(${lit(cl)},${lit(ws)},'James · Garden Studio',${lit(cl)})`);
  sql(`INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES(${lit(ws)},${lit(cl)},'James',${lit(members.client.id)})`);
  sql(`INSERT INTO departments(id,workspace_id,name,slug) VALUES(${lit(dept)},${lit(ws)},'Social','social')`);
  sql(`INSERT INTO service_types(id,workspace_id,name,slug,department_id) VALUES(${lit(dept)},${lit(ws)},'Social','social',${lit(dept)})`);
  sql(`INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(${lit(service)},${lit(ws)},${lit(cl)},${lit(dept)})`);
  const owner=await login(members.owner.email),client=await login(members.client.email),team=await login(members.team.email),pm=await login(members.pm.email),other=await login(members.other.email);
  const post = async(path,data,who=owner,expected=200)=>{const r=await who.context.request.post(base+path,{headers:{origin:base},data});assert.equal(r.status(),expected,await r.text());return r.json();};
  const parent=`/api/bloomops/clients/${cl}/services/${service}/content`;
  const id=(await post(parent,{requestId:randomUUID(),title:'Your short garden update',type:'reel',visibility:'client',recordingRequired:true,hook:'C4_PRIVATE_HOOK',script:'C4_PRIVATE_SCRIPT',caption:'C4_PRIVATE_CAPTION',cta:'C4_PRIVATE_CTA',platforms:['Instagram'],targetPublishDate:'2026-09-08'},owner,201)).contentId;
  const secondClient=`${ws}-second`,secondService=`${ws}-second-service`;
  sql(`INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(${lit(secondClient)},${lit(ws)},'Second Studio',${lit(secondClient)})`);
  sql(`INSERT INTO client_contacts(workspace_id,client_id,name,user_id) VALUES(${lit(ws)},${lit(secondClient)},'Other Client',${lit(members.other.id)})`);
  sql(`INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id) VALUES(${lit(secondService)},${lit(ws)},${lit(secondClient)},${lit(dept)})`);
  const secondContent=(await post(`/api/bloomops/clients/${secondClient}/services/${secondService}/content`,{requestId:randomUUID(),title:'Other Client update',type:'reel',visibility:'client',recordingRequired:true,platforms:['YouTube'],targetPublishDate:'2026-09-09'},owner,201)).contentId;
  sql(`UPDATE content_items SET stage='waiting_for_recording',stage_context='OTHER_PRIVATE' WHERE id=${lit(secondContent)}`);
  check('second Client has separate canonical Social Content and cannot read first request',(await other.context.request.get(base+`/api/bloomops/portal/recordings/${secondContent}/files`)).status()===200&&(await other.context.request.get(base+`/api/bloomops/portal/recordings/${id}/files`)).status()===404);
  const item=`/api/bloomops/content/${id}`,path=item+'/files',portal=`/api/bloomops/portal/recordings/${id}/files`,ui='/social/'+id,portalUi='/portal/recordings/'+id;
  const get = async()=> (await (await owner.context.request.get(base+item)).json()).item;
  for(const targetStage of ['script','waiting_for_recording'])await post(item+'/transition',{expectedRevision:(await get()).revision,targetStage,...targetStage==='waiting_for_recording'?{context:'C4_PRIVATE_WAITING'}:{}});
  const bytes=Buffer.from('Original short recording bytes'), file=(name='Garden recording.mp4')=>({name,mimeType:'video/mp4',buffer:bytes});
  const upload=async(details={},who=owner)=>{const input={requestId:randomUUID(),filename:'API recording.mp4',mimeType:'video/mp4',byteSize:bytes.length,purpose:'recording',...details};const r=await who.context.request.post(base+(who===client?portal:path),{headers:{origin:base,'content-type':'application/octet-stream','x-bloomops-file':encodeURIComponent(JSON.stringify(input))},data:bytes});return{r,input};};
  const stored=()=>sql(`SELECT assets.* FROM assets JOIN content_asset_links ON asset_id=assets.id WHERE content_id=${lit(id)} ORDER BY assets.rowid`);
  const events=()=>sql(`SELECT * FROM activity_events WHERE subject_type='file' AND subject_id IN(SELECT asset_id FROM content_asset_links WHERE content_id=${lit(id)}) ORDER BY rowid`);
  const facts=()=>JSON.stringify([sql(`SELECT * FROM content_items WHERE id=${lit(id)}`),sql(`SELECT * FROM content_platforms WHERE content_id=${lit(id)}`),sql(`SELECT * FROM bloomops_clients WHERE id=${lit(cl)}`),sql(`SELECT * FROM service_engagements WHERE id=${lit(service)}`)]),before=facts();
  await owner.page.goto(base+ui);await client.page.goto(base+'/portal');
  check('portal Home contains only conditional recording link',await client.page.getByRole('heading',{name:'Recording needed',exact:true}).count()===1&&await client.page.locator(`a[href="${portalUi}"]`).count()===1&&await client.page.locator('a[href="/social"],a[href="/portal/content"]').count()===0);
  await client.page.goto(base+portalUi);
  for(const width of widths){await layout('internal-empty',owner.page,width);await layout('client-empty',client.page,width);}
  const section=owner.page.getByRole('region',{name:'Recordings & assets',exact:true}),row=fileId=>section.locator(`[data-file-id="${fileId}"]`);
  await activate(owner.page,section.getByRole('button',{name:'Upload file',exact:true}));let dialog=owner.page.getByRole('dialog');
  await owner.page.waitForFunction(()=>document.activeElement?.id==='file-upload');await dialog.getByRole('button',{name:'Upload',exact:true}).click();
  check('empty upload announces error and focuses file field',await dialog.locator('#file-upload').evaluate(n=>n===document.activeElement&&n.getAttribute('aria-invalid')==='true'));
  for(const width of widths)await layout('internal-upload-error',owner.page,width);
  const longName='Garden '+ 'long '.repeat(25)+'é.mp4';await dialog.locator('#file-upload').setInputFiles(file(longName));await dialog.getByLabel('Purpose',{exact:true}).selectOption('recording');await dialog.getByLabel('File visibility',{exact:true}).selectOption('client');
  const response=owner.page.waitForResponse(r=>r.url()===base+path&&r.request().method()==='POST');await dialog.getByRole('button',{name:'Upload',exact:true}).evaluate(n=>{n.click();n.click();});const uploaded=await response;assert.equal(uploaded.status(),201,await uploaded.text());const fileId=(await uploaded.json()).fileId;
  await dialog.waitFor({state:'hidden'});await row(fileId).waitFor();check('double-click creates one File and semantic event',stored().length===1&&events().length===1);
  for(const width of widths)await layout('internal-ready',owner.page,width);
  const downloaded=owner.page.waitForEvent('download');await activate(owner.page,row(fileId).getByRole('button',{name:`Download ${longName}`,exact:true}));const actual=await downloaded;check('long Unicode filename and exact original bytes download',actual.suggestedFilename()===longName&&readFileSync(await actual.path()).equals(bytes));
  await activate(owner.page,row(fileId).getByRole('button',{name:'Change file visibility',exact:true}));dialog=owner.page.getByRole('dialog');await owner.page.waitForFunction(()=>document.activeElement?.id==='file-visibility');
  for(const width of widths)await layout('visibility',owner.page,width);
  await dialog.getByRole('button',{name:'Save file visibility',exact:true}).focus();await owner.page.keyboard.press('Tab');check('dialog traps focus',await dialog.evaluate(n=>n.contains(document.activeElement)));await owner.page.keyboard.press('Escape');check('Escape restores opener',await row(fileId).getByRole('button',{name:'Change file visibility',exact:true}).evaluate(n=>n===document.activeElement));
  await client.page.reload();check('portal HTML excludes internal Content fields and storage authority',!/C4_PRIVATE|objectKey|sha256|stageContext|uploaderMembershipId|leaseUntil/.test(await client.page.content()));
  await activate(client.page,client.page.getByRole('button',{name:'Upload recording',exact:true}));dialog=client.page.getByRole('dialog');
  for(const width of widths)await layout('client-upload',client.page,width);
  check('Client upload has no visibility, purpose, or relink chooser',await dialog.locator('select').count()===0);await dialog.locator('#file-upload').setInputFiles(file());await activate(client.page,dialog.getByRole('button',{name:'Upload',exact:true}));await dialog.waitFor({state:'hidden'});
  for(const width of widths)await layout('client-ready',client.page,width);
  check('Client recording upload preserves all Content lifecycle facts',facts()===before&&stored().every(f=>f.visibility==='client'));
  const clientFile=stored().find(f=>f.filename==='Garden recording.mp4');const clientDownload=client.page.waitForEvent('download');await activate(client.page,client.page.getByRole('button',{name:'Download Garden recording.mp4',exact:true}));check('Client keyboard download matches bytes',readFileSync(await(await clientDownload).path()).equals(bytes));
  check('unrelated Client cannot guess request or bytes',(await other.context.request.get(base+portal)).status()===404&&(await other.context.request.get(base+`/api/bloomops/files/${fileId}/download`)).status()===404);
  check('unassigned Team cannot upload',(await upload({},team)).r.status()===404);
  sql(`INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES(${lit(ws)},${lit(service)},${lit(members.team.membership)})`);check('issued Team assignment grants Content upload',(await upload({purpose:'asset'},team)).r.status()===201);
  sql(`DELETE FROM service_assignments WHERE membership_id=${lit(members.team.membership)}`);check('issued Team revocation fences files and bytes',(await team.context.request.get(base+path)).status()===404&&(await team.context.request.get(base+`/api/bloomops/files/${fileId}/download`)).status()===404);
  sql(`CREATE TRIGGER c4_browser_fail BEFORE INSERT ON activity_events WHEN NEW.event_type='FILE_UPLOADED' AND NEW.workspace_id=${lit(ws)} BEGIN SELECT RAISE(ABORT,'C4_PRIVATE_FAILURE'); END`);
  let failedId;try{const failed=await upload({filename:'Retry recording.mp4'});check('late failure is sanitized',failed.r.status()===500&&!/C4_PRIVATE|SQL|stack/.test(await failed.r.text()));failedId=stored().find(f=>f.filename==='Retry recording.mp4').id;}finally{sql('DROP TRIGGER c4_browser_fail');}
  await owner.page.reload();await activate(owner.page,row(failedId).getByRole('button',{name:'Retry upload',exact:true}));dialog=owner.page.getByRole('dialog');for(const width of widths)await layout('retry',owner.page,width);
  await dialog.locator('#file-upload').setInputFiles(file('Retry recording.mp4'));await activate(owner.page,dialog.getByRole('button',{name:'Upload',exact:true}));await dialog.waitFor({state:'hidden'});await row(failedId).getByText('Ready',{exact:true}).waitFor();
  await owner.page.waitForFunction(id=>document.querySelector(`[data-file-id="${id}"]`)?.contains(document.activeElement),failedId);check('retry restores surviving File control focus',true);
  await activate(owner.page,row(failedId).getByRole('button',{name:'Archive file',exact:true}));dialog=owner.page.getByRole('dialog');
  for(const width of widths)await layout('archive',owner.page,width);
  await activate(owner.page,dialog.getByRole('button',{name:'Archive file',exact:true}));await dialog.waitFor({state:'hidden'});await row(failedId).waitFor({state:'detached'});await owner.page.waitForFunction(()=>document.activeElement?.id==='upload-file');check('archive removes row and restores upload focus',true);
  const patch=async(visibility)=>{const file=stored().find(f=>f.id===fileId);const r=await owner.context.request.patch(base+path+'/'+fileId,{headers:{origin:base},data:{operation:'visibility',visibility,expectedRevision:file.revision}});assert.equal(r.status(),200);};
  await patch('restricted');check('issued Client visibility revokes download',(await client.context.request.get(base+`/api/bloomops/files/${fileId}/download`)).status()===404);await pm.page.goto(base+ui);check('restricted filename is absent from current and historical PM HTML',!(await pm.page.content()).includes(longName));await patch('client');
  check('File mutations preserve Content and platform facts',facts()===before);
  await post(item+'/transition',{targetStage:'editing',expectedRevision:(await get()).revision});check('stage movement immediately revokes Client uploads and bytes',(await upload({},client)).r.status()===404&&(await client.context.request.get(base+`/api/bloomops/files/${clientFile.id}/download`)).status()===404);await client.page.goto(base+'/portal');check('ineligible stage removes Recording needed module',await client.page.getByRole('heading',{name:'Recording needed',exact:true}).count()===0);
  sql(`UPDATE content_items SET stage='waiting_for_recording',stage_context='C4_PRIVATE_WAITING' WHERE id=${lit(id)}`);
  sql(`UPDATE client_contacts SET user_id=NULL WHERE client_id=${lit(cl)}`);check('contact unlink revokes issued Client request and download',(await client.context.request.get(base+portal)).status()===404&&(await client.context.request.get(base+`/api/bloomops/files/${clientFile.id}/download`)).status()===404);
  sql(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(members.client.membership)}`);check('membership suspension refuses still-issued identity',(await client.context.request.get(base+portal)).status()===403);
  await owner.page.emulateMedia({reducedMotion:'reduce'});await owner.page.goto(base+ui);await layout('reduced-motion',owner.page,320);check('reduced motion respected',await owner.page.locator('.bo-btn').first().evaluate(n=>getComputedStyle(n).transitionDuration.split(',').every(v=>parseFloat(v)<=0.01)));
  const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,storageState:await owner.context.storageState()}),touchPage=await touch.newPage();await touchPage.goto(base+ui);const add=touchPage.getByRole('button',{name:'Upload file',exact:true});await touchPage.waitForFunction(n=>n&&!n.disabled,await add.elementHandle());await add.tap();check('touch opens upload dialog',await touchPage.getByRole('dialog').isVisible());await layout('touch',touchPage,390);await touch.close();
  console.log(`C4 browser/HTTP: ${checks} checks passed; ${screenshots} screenshots at ${widths.join(', ')}px. Exit 0.`);
} catch(error){console.error('C4 browser acceptance failed:',String(error.message).split('\n').filter(l=>!/cookie:|authorization:|token=/i.test(l)).join('\n'));process.exitCode=1;}
finally{await browser.close();}
