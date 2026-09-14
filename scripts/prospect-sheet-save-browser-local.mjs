// Direct-save regression checks. Requires a copied synthetic local fixture with provider egress blocked.
// Evidence directory contains storage-state.json, browser-fixture.json and provider-log.json.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
const root=process.env.BLOOMOPS_BROWSER_EVIDENCE_DIR,base=process.env.BLOOMOPS_BROWSER_BASE;
assert.ok(root&&base,'Set BLOOMOPS_BROWSER_EVIDENCE_DIR and BLOOMOPS_BROWSER_BASE for an isolated synthetic fixture.');
assert.ok(['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname),'Local synthetic Worker only.');
const health=await(await fetch(base+'/api/health')).json();assert.equal(health.environment,'development');assert.equal(health.auth.mail,'r2-dev');
const {chromium}=createRequire(process.env.BLOOMOPS_PLAYWRIGHT_PACKAGE||'/tmp/bloomops-pilot-tools/package.json')('playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});const checks=[],errors=[],dialogs=[],writes=[];
const check=(name,v)=>{assert.ok(v,name);checks.push(name);console.log('ok '+name);};
const ctx=await browser.newContext({storageState:JSON.parse(readFileSync(root+'/storage-state.json')),viewport:{width:1440,height:1000}});
await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));let acceptDialogs=false;page.on('dialog',d=>{dialogs.push(d.message());acceptDialogs?d.accept():d.dismiss();});page.on('request',r=>{if(r.method()==='PATCH'&&r.url().endsWith('/sheet-edit'))writes.push(r.postDataJSON());});
const ready=()=>page.locator('.bo-sheet-scroll[aria-busy=false] td[data-row="0"]').first().waitFor();
const choice=k=>page.locator('td[data-row="0"][aria-label^="'+k+' for"] .bo-sheet-choice select');
const review=()=>page.getByRole('region',{name:'Preview field changes'});
const settled=async()=>{await page.waitForFunction(()=>!document.querySelector('.bo-sheet-save-status.saving')&&!document.querySelector('.bo-sheet-scroll[aria-busy=true]'));await ready();};
let id,workspaceId,userId;
const read=async()=>{const r=await ctx.request.get(base+'/api/bloomops/prospecting/'+id);assert.equal(r.status(),200);return (await r.json()).profile;};
const freshFit=async value=>{await choice('Fit').selectOption(value);await page.waitForFunction(v=>document.querySelector('td[data-row="0"][aria-label^="Fit for"] select')?.value===v&&!document.querySelector('.bo-sheet-save-status.saving'),value);await settled();};
try{
 const fixture=JSON.parse(readFileSync(root+'/browser-fixture.json'));workspaceId=fixture.workspaceId;userId=(await(await ctx.request.get(base+'/api/auth/get-session')).json()).user.id;
 const name='QA Direct Garden '+Date.now(),made=await ctx.request.post(base+'/api/bloomops/prospecting',{data:{workspaceId,requestId:crypto.randomUUID(),fields:{businessName:name,personName:'Maya Garden',website:'https://garden.example.test/',platform:'Kajabi'}}});assert.equal(made.status(),201);id=(await made.json()).prospectId;
 await page.goto(base+'/prospecting?q='+encodeURIComponent(name),{waitUntil:'networkidle'});await ready();
 await freshFit('hold');check('Fit selection immediately saves canonical Maybe',(await read()).fit==='hold');check('Single choice needs no review or discard dialog',await review().count()===0&&dialogs.length===0);
 await choice('Platform').selectOption('GoHighLevel');await settled();check('Next dropdown saves without discarding the preceding choice',(await read()).platform==='GoHighLevel'&&(await read()).fit==='hold'&&dialogs.length===0);check('Saved feedback is visible',await page.locator('.bo-sheet-save-status.saved').innerText()==='Platform saved');
 await page.reload({waitUntil:'networkidle'});await ready();check('Both choices survive reload',await choice('Platform').inputValue()==='GoHighLevel'&&await choice('Fit').inputValue()==='hold');
 let release,started;const gate=new Promise(r=>release=r),begun=new Promise(r=>started=r);await page.route('**/api/bloomops/prospecting/sheet-edit',async r=>{started();await gate;await r.continue();});
 await choice('Fit').selectOption('strong');await begun;
 check('Chosen value appears while save is pending',await choice('Fit').inputValue()==='strong'&&await page.locator('.bo-sheet-save-status.saving').innerText()==='Fit saving…');
 check('In-flight field blocks duplicate control writes',await choice('Platform').isDisabled()&&await choice('Fit').isDisabled());
 release();await settled();await page.unroute('**/api/bloomops/prospecting/sheet-edit');check('Delayed save confirms the chosen value',(await read()).fit==='strong');
 await page.route('**/api/bloomops/prospecting/sheet-edit',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic unavailable'})}));
 await choice('Fit').selectOption('skip');await review().waitFor();check('Failed direct save retains selected value for explicit retry',(await review().innerText()).includes('Skip')&&(await read()).fit==='strong');check('Failure visibly says not saved',await page.locator('.bo-sheet-save-status.error').innerText()==='Fit not saved');
 await page.unroute('**/api/bloomops/prospecting/sheet-edit');await review().getByRole('button',{name:'Retry failed changes',exact:true}).click();await review().waitFor({state:'hidden'});await settled();check('Retry commits retained choice and clears stale failure',(await read()).fit==='skip'&&await page.locator('.bo-sheet-save-status.error').count()===0);
 // A response lost after a real transaction is confirmed on retry, never duplicated.
 let lost=true;await page.route('**/api/bloomops/prospecting/sheet-edit',async r=>{if(!lost)return r.continue();lost=false;await r.fetch();await r.abort('failed');});
 await choice('Fit').selectOption('hold');await review().waitFor();const revision=(await read()).revision,count=writes.length;check('Lost reply retains review even though server committed',(await read()).fit==='hold');
 await page.unroute('**/api/bloomops/prospecting/sheet-edit');await review().getByRole('button',{name:'Retry failed changes',exact:true}).click();await review().waitFor({state:'hidden'});await settled();check('Lost reply retry confirms without another write',(await read()).revision===revision&&writes.length===count);
 // Concurrent canonical edit must win over the old cell's baseline.
 const current=await read();await ctx.request.patch(base+'/api/bloomops/prospecting/'+id,{data:{workspaceId,userId,expectedRevision:current.revision,fields:{fit:'strong'}}});
 await choice('Fit').selectOption('skip');await review().waitFor();check('Concurrent field change is protected',(await read()).fit==='strong'&&(await review().innerText()).includes('Field changed'));await review().getByRole('button',{name:'Cancel',exact:true}).click();await settled();
 await page.reload({waitUntil:'networkidle'});await ready();
 // Single text/custom edits use one explicit Save field, not a second preview.
 await choice('Platform').selectOption({label:'Custom platform…'});await page.getByRole('textbox',{name:'Edit Platform',exact:true}).fill('Garden custom CMS');await page.getByRole('button',{name:'Save field',exact:true}).click();await settled();check('Custom platform saves with one explicit action',(await read()).platform==='Garden custom CMS'&&await review().count()===0);
 await page.getByRole('button',{name:'Edit Contact for '+name,exact:true}).click();await page.getByRole('textbox',{name:'Edit Contact',exact:true}).fill('Maya Rowan');await page.getByRole('button',{name:'Save field',exact:true}).click();await settled();check('Text edit saves without a second confirmation',(await read()).personName==='Maya Rowan');
 await page.getByRole('button',{name:'Undo edits',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.bo-sheet-undo'));await settled();check('Undo restores confirmed custom and text changes',(await read()).platform==='GoHighLevel'&&(await read()).personName==='Maya Garden');
 // Recovery after a failed direct save uses the existing scoped draft mechanism.
 await page.route('**/api/bloomops/prospecting/sheet-edit',r=>r.abort('failed'));await choice('Platform').selectOption('WordPress');await review().waitFor();acceptDialogs=true;await page.reload({waitUntil:'networkidle'});acceptDialogs=false;await page.unroute('**/api/bloomops/prospecting/sheet-edit');await ready();await page.getByRole('button',{name:'Review recovered fields',exact:true}).click();await review().waitFor();check('Failed direct choice survives reload for explicit recovery',await page.getByRole('textbox',{name:/Recovered Platform/}).inputValue()==='WordPress');await review().getByRole('button',{name:'Save changes',exact:true}).click();await review().waitFor({state:'hidden'});await settled();check('Recovered choice saves canonical value',(await read()).platform==='WordPress');
 // Keyboard and screen widths use a fresh field choice, not a post-selection DOM alteration.
 for(const width of [1920,1440,1024,768,390,320]){await page.setViewportSize({width,height:width<768?844:1000});const next=(await read()).fit==='hold'?'strong':'hold';await freshFit(next);check('Direct save works at '+width,(await read()).fit===next&&await page.evaluate(()=>{const s=document.querySelector('.bo-sheet-scroll');return document.documentElement.scrollWidth<=innerWidth&&s.scrollWidth<=s.clientWidth+1;}));if([1440,390].includes(width))await page.screenshot({path:root+'/sheet-'+width+'.png',fullPage:width<768});}
 await page.setViewportSize({width:1440,height:1000});await choice('Fit').focus();await page.keyboard.press('Space');check('Keyboard opens native choices',await choice('Fit').evaluate(s=>s.matches(':open')));await page.keyboard.press('Escape');
 const rowBefore=await read(),profilePath='/prospecting/'+id;await page.locator('td[data-row="0"][data-col="0"] a').click();await page.waitForURL(base+profilePath);check('Business opens canonical full-page profile',await page.getByRole('heading',{level:1}).innerText()===name);await page.goBack({waitUntil:'networkidle'});await ready();check('Profile return retains search and canonical choices',(await read()).revision===rowBefore.revision&&await page.getByRole('searchbox').inputValue()===name);
 // Successful creation must retire its warning synchronously before navigation.
 await page.goto(base+'/prospecting/new',{waitUntil:'networkidle'});await page.locator('#prospect-businessName').fill('QA Created Garden '+Date.now());
 await page.route('**/api/bloomops/prospecting',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic unavailable'})}));
 await page.getByRole('button',{name:'Create prospect',exact:true}).click();await page.getByRole('alert').filter({hasText:'Create failed'}).waitFor();const beforeDialogs=dialogs.length;
 await page.getByRole('link',{name:'Cancel',exact:true}).click();check('Failed creation keeps the genuine unsaved warning',dialogs.length===beforeDialogs+1&&new URL(page.url()).pathname==='/prospecting/new');
 await page.unroute('**/api/bloomops/prospecting');const afterWarning=dialogs.length;await page.getByRole('button',{name:'Create prospect',exact:true}).click();await page.waitForURL(u=>/^\/prospecting\/[a-f0-9-]{36}$/.test(u.pathname));
 check('Confirmed creation opens profile without an unsaved warning',dialogs.length===afterWarning&&await page.getByRole('heading',{level:1}).textContent().then(x=>x.startsWith('QA Created Garden')));
 check('No browser exceptions',errors.length===0);check('No provider calls',JSON.parse(readFileSync(root+'/provider-log.json')).length===0);writeFileSync(root+'/sheet-qa-checks.json',JSON.stringify({checks,dialogs},null,2));console.log('PASS '+checks.length);
}finally{await browser.close();}
