// Built-Worker regression: quiet post-save reads, stale-response safety and stable rows.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
const root=process.env.BLOOMOPS_BROWSER_EVIDENCE_DIR,base=process.env.BLOOMOPS_BROWSER_BASE;
assert.ok(root&&base);assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const health=await(await fetch(base+'/api/health')).json();assert.equal(health.environment,'development');assert.equal(health.auth.mail,'r2-dev');
const {chromium}=createRequire(process.env.BLOOMOPS_PLAYWRIGHT_PACKAGE||'/tmp/bloomops-pilot-tools/package.json')('playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),checks=[],errors=[];
const ctx=await browser.newContext({storageState:JSON.parse(readFileSync(root+'/storage-state.json')),viewport:{width:1440,height:1000}});
await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('ok '+name);};
const ready=()=>page.waitForFunction(()=>!!document.querySelector('.bo-sheet-table tbody tr')&&!document.querySelector('.bo-sheet-scroll[aria-busy=true]')&&!document.querySelector('.bo-sheet-save-status.saving'));
const choice=k=>page.getByRole('combobox',{name:'Change '+k+' for '+name,exact:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let id,name;
try{
 const f=JSON.parse(readFileSync(root+'/browser-fixture.json'));name='QA Quiet Garden '+Date.now();
 const made=await ctx.request.post(base+'/api/bloomops/prospecting',{data:{workspaceId:f.workspaceId,requestId:crypto.randomUUID(),fields:{businessName:name,platform:'Kajabi'}}});assert.equal(made.status(),201);id=(await made.json()).prospectId;
 const read=async()=>(await(await ctx.request.get(base+'/api/bloomops/prospecting/'+id)).json()).profile;
 await page.goto(base+'/prospecting?q='+encodeURIComponent(name)+'&fit=',{waitUntil:'networkidle'});await ready();
 const observe=()=>page.evaluate(()=>{const table=document.querySelector('.bo-sheet-table'),scroller=document.querySelector('.bo-sheet-scroll');window.quietProbe={table,scroller,start:scroller.getBoundingClientRect().top,tops:[],skeleton:false};window.quietProbe.observer=new MutationObserver(()=>{const p=window.quietProbe;p.tops.push(scroller.getBoundingClientRect().top);p.skeleton||=!!document.querySelector('.bo-sheet-skeleton');});window.quietProbe.observer.observe(document.querySelector('.bo-sheet'),{subtree:true,childList:true,attributes:true});});
 const probe=()=>page.evaluate(()=>{const p=window.quietProbe;p.observer.disconnect();return {movement:Math.max(0,...p.tops.map(n=>Math.abs(n-p.start))),skeleton:p.skeleton,sameTable:p.table===document.querySelector('.bo-sheet-table'),sameScroller:p.scroller===document.querySelector('.bo-sheet-scroll'),progress:document.querySelector('.bo-sheet-progress')?.textContent||'',platformEnabled:!document.querySelector('select[aria-label^="Change Platform"]').disabled};});
 let release,started;const gate=new Promise(r=>release=r),begun=new Promise(r=>started=r);
 await page.route('**/api/bloomops/prospecting/sheet?*',async route=>{const response=await route.fetch();started();await gate;try{await route.fulfill({response});}catch{}});
 await observe();await choice('Fit').selectOption('hold');await begun;await pause(100);
 const observed=await probe();
 if(process.env.BLOOMOPS_REPRODUCE==='1'){writeFileSync(root+'/before.json',JSON.stringify(observed,null,2));console.log(JSON.stringify(observed));release();await ready();process.exitCode=0;}
 else{
  check('Pending background read keeps table position and DOM stable',observed.movement<1&&observed.sameTable&&observed.sameScroller&&!observed.skeleton);
  check('Confirmed save has no table-wide Updating message',observed.progress==='');
  check('Next dropdown is usable while revalidation is pending',observed.platformEnabled);
  check('First save is canonical before background read finishes',(await read()).fit==='hold');
  // Start a second real save while the older sheet response remains held.
  await choice('Platform').selectOption('WordPress');await page.waitForFunction(()=>document.querySelector('.bo-sheet-save-status')?.textContent==='Platform saved');
  release();await ready();await page.unroute('**/api/bloomops/prospecting/sheet?*');
  check('Older background response cannot revert the newer save',await choice('Platform').inputValue()==='WordPress'&&(await read()).platform==='WordPress');
  check('Consecutive saves preserve both canonical fields',(await read()).fit==='hold');
  let releaseUndo,startUndo;const undoGate=new Promise(r=>releaseUndo=r),undoBegun=new Promise(r=>startUndo=r);
  await page.route('**/api/bloomops/prospecting/sheet?*',async r=>{const response=await r.fetch();startUndo();await undoGate;await r.fulfill({response});});
  await page.getByRole('button',{name:'Undo edits',exact:true}).click();await undoBegun;
  check('Undo reconciliation keeps stale cells guarded until canonical rows arrive',await choice('Fit').isDisabled()&&await choice('Platform').isDisabled());
  check('Undo committed original values before the held read finishes',(await read()).fit==='unknown'&&(await read()).platform==='Kajabi');
  releaseUndo();await ready();await page.unroute('**/api/bloomops/prospecting/sheet?*');
  check('Undo restores displayed fields and enables editing after reconciliation',await choice('Fit').inputValue()==='unknown'&&await choice('Platform').inputValue()==='Kajabi'&&await choice('Fit').isEnabled());
  // Failed sheet refresh is different from a failed write: retain confirmed value and expose Retry.
  await page.route('**/api/bloomops/prospecting/sheet?*',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic refresh unavailable'})}));
  await choice('Fit').selectOption('strong');await page.getByRole('alert').filter({hasText:'Synthetic refresh unavailable'}).waitFor();
  check('Background read failure retains confirmed save',await choice('Fit').inputValue()==='strong'&&(await read()).fit==='strong'&&await page.locator('.bo-sheet-save-status').innerText()==='Fit saved');
  await page.unroute('**/api/bloomops/prospecting/sheet?*');await page.getByRole('button',{name:'Refresh',exact:true}).click();await ready();check('Failed revalidation can be explicitly refreshed',await page.getByRole('alert').filter({hasText:'Synthetic refresh unavailable'}).count()===0);
  // Query changes must still block actions until matching rows arrive.
  let releaseQuery,startQuery;const queryGate=new Promise(r=>releaseQuery=r),queryBegun=new Promise(r=>startQuery=r);
  await page.route('**/api/bloomops/prospecting/sheet?*',async r=>{startQuery();await queryGate;await r.continue();});
  await page.getByRole('searchbox').fill('No matching quiet garden');await page.getByRole('button',{name:'Search prospects',exact:true}).click();await queryBegun;
  check('Query scope change disables stale row actions',await choice('Fit').isDisabled());releaseQuery();await page.getByRole('heading',{name:'No matching prospects'}).waitFor();await page.unroute('**/api/bloomops/prospecting/sheet?*');
  // Saving a filtered field must still reconcile membership and counts.
  await page.goto(base+'/prospecting?q='+encodeURIComponent(name)+'&fit=strong',{waitUntil:'networkidle'});await ready();await choice('Fit').selectOption('hold');await page.getByRole('heading',{name:'No matching prospects'}).waitFor();check('Background refresh reconciles filtered membership and count',await page.locator('.bo-sheet-count').innerText()==='0 records');
  for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:width<768?844:1000});await page.goto(base+'/prospecting?q='+encodeURIComponent(name)+'&fit=',{waitUntil:'networkidle'});await ready();
   // Focus/scroll the target before measuring, so browser automation scrolling is not counted as layout movement.
   await choice('Fit').scrollIntoViewIfNeeded();await observe();await choice('Fit').selectOption((await read()).fit==='hold'?'strong':'hold');await ready();const p=await probe();
   check('Stable direct-save geometry and no overflow at '+width,p.movement<1&&!p.skeleton&&p.sameTable&&await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   if(width===1440||width===390)await page.screenshot({path:root+'/smooth-'+width+'.png',fullPage:width<768});
  }
  await page.route('**/api/bloomops/prospecting/sheet?*',r=>r.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'Synthetic revoked access'})}));
  await choice('Fit').selectOption((await read()).fit==='hold'?'strong':'hold');await page.getByText('Your account or workspace access changed. Reload to continue.').waitFor();
  check('Denied background read clears the table and invalidates access',await page.locator('.bo-sheet-table').count()===0);
  await page.unroute('**/api/bloomops/prospecting/sheet?*');
  check('No browser exceptions',errors.length===0);check('No provider calls',JSON.parse(readFileSync(root+'/provider-log.json')).length===0);
  writeFileSync(root+'/smooth-checks.json',JSON.stringify({checks},null,2));console.log('PASS '+checks.length);
 }
}finally{await browser.close();}
