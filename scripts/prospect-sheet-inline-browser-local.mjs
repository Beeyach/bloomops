// Inline failure/recovery acceptance against an isolated synthetic built Worker.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
const root=process.env.BLOOMOPS_BROWSER_EVIDENCE_DIR,base=process.env.BLOOMOPS_BROWSER_BASE;
assert.ok(root&&base);assert.ok(['localhost','127.0.0.1'].includes(new URL(base).hostname));
const health=await(await fetch(base+'/api/health')).json();assert.equal(health.environment,'development');assert.equal(health.auth.mail,'r2-dev');
const {chromium}=createRequire(process.env.BLOOMOPS_PLAYWRIGHT_PACKAGE||'/tmp/bloomops-pilot-tools/package.json')('playwright');
const browser=await chromium.launch({headless:true,args:['--no-sandbox']}),checks=[],errors=[],dialogs=[],writes=[];
const ctx=await browser.newContext({storageState:JSON.parse(readFileSync(root+'/storage-state.json')),viewport:{width:1440,height:1000}});
await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());const page=await ctx.newPage();let acceptLeave=false;
page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>{dialogs.push(d.message());acceptLeave?d.accept():d.dismiss();});page.on('request',r=>{if(r.method()==='PATCH'&&r.url().endsWith('/sheet-edit'))writes.push(r.postDataJSON());});
const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('ok '+name);};
const ready=()=>page.waitForFunction(()=>!!document.querySelector('.bo-sheet-table')&&!document.querySelector('.bo-sheet-scroll[aria-busy=true]')&&!document.querySelector('.bo-sheet-save-status.saving'));
let name,id,userId,workspaceId;
const choice=k=>page.getByRole('combobox',{name:'Change '+k+' for '+name,exact:true});
const pending=k=>page.getByRole('group',{name:'Unsaved '+k+' for '+name,exact:true});
const read=async()=>(await(await ctx.request.get(base+'/api/bloomops/prospecting/'+id)).json()).profile;
const foreignEdit=async fields=>{const p=await read();const r=await ctx.request.patch(base+'/api/bloomops/prospecting/'+id,{data:{workspaceId,userId,expectedRevision:p.revision,fields}});assert.equal(r.status(),200);};
const fail=()=>page.route('**/api/bloomops/prospecting/sheet-edit',r=>r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Temporarily unavailable'})}));
const restore=async()=>{await page.locator('.bo-sheet-recovery summary').click();await page.getByRole('button',{name:'Restore edits',exact:true}).click();await page.getByRole('button',{name:'Restore edits',exact:true}).waitFor({state:'hidden'});await ready();};
const reload=async()=>{acceptLeave=true;await page.reload({waitUntil:'networkidle'});acceptLeave=false;await ready();};
try{
 workspaceId=JSON.parse(readFileSync(root+'/browser-fixture.json')).workspaceId;userId=(await(await ctx.request.get(base+'/api/auth/get-session')).json()).user.id;name='QA Inline Garden '+Date.now();
 const made=await ctx.request.post(base+'/api/bloomops/prospecting',{data:{workspaceId,requestId:crypto.randomUUID(),fields:{businessName:name,platform:'Kajabi',personName:'Rowan'}}});assert.equal(made.status(),201);id=(await made.json()).prospectId;
 await page.goto(base+'/prospecting?q='+encodeURIComponent(name)+'&fit=',{waitUntil:'networkidle'});await ready();
 // Text editing must keep the record geometry stable and expose a labelled Save.
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});const cell=page.getByRole('cell',{name:'Contact for '+name,exact:true});
  const before=await cell.evaluate(e=>({row:e.closest('tr').getBoundingClientRect().height,cell:e.getBoundingClientRect().height}));
  await page.getByRole('button',{name:'Edit Contact for '+name,exact:true}).click();
  const metrics=await cell.evaluate(e=>{const f=e.querySelector('form'),r=f.getBoundingClientRect(),input=f.querySelector('input').getBoundingClientRect();return {row:e.closest('tr').getBoundingClientRect().height,cell:e.getBoundingClientRect().height,left:r.left,right:r.right,height:r.height,input:input.width,save:f.querySelector('[type=submit]').textContent,labelClear:getComputedStyle(e.querySelector('.bo-sheet-field-label')).display==='none'||r.top>=e.querySelector('.bo-sheet-field-label').getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth+1};});
  check('Compact Contact editor preserves row height and labelled Save at '+width,Math.abs(before.row-metrics.row)<1&&Math.abs(before.cell-metrics.cell)<1&&metrics.left>=0&&metrics.right<=width&&metrics.input>=80&&metrics.height<=56&&metrics.save==='Save'&&metrics.labelClear&&!metrics.overflow);
  if([1440,390].includes(width))await page.screenshot({path:root+'/editor-'+width+'.png',fullPage:true});
  await page.getByRole('textbox',{name:'Edit Contact',exact:true}).press('Escape');await page.getByRole('button',{name:'Edit Contact for '+name,exact:true}).waitFor();
 }
 check('Opening and cancelling text editors creates no writes or recovery copy',writes.length===0&&await page.locator('.bo-sheet-recovery').count()===0);
 await page.setViewportSize({width:1440,height:1000});
 await fail();await choice('Platform').selectOption('WordPress');await pending('Platform').waitFor();await ready();
 check('Failure keeps attempted value in its cell with inline Retry',await choice('Platform').inputValue()==='WordPress'&&await pending('Platform').getByRole('button',{name:'Retry',exact:true}).count()===1);
 check('Failure opens no review panel or confirmation',await page.locator('.bo-sheet-review').count()===0&&dialogs.length===0);
 await page.unroute('**/api/bloomops/prospecting/sheet-edit');await choice('Fit').selectOption('strong');await ready();
 check('Another field saves without discarding the failed cell',(await read()).fit==='strong'&&(await read()).platform==='Kajabi'&&await pending('Platform').count()===1&&dialogs.length===0);
 await page.getByRole('searchbox').fill('No inline result');await page.getByRole('button',{name:'Search prospects',exact:true}).click();await ready();
 check('Changing views retains accessible unsaved cells without discard',await page.locator('.bo-sheet-offscreen-drafts').count()===1&&await pending('Platform').count()===1&&dialogs.length===0);
 await page.getByRole('searchbox').fill(name);await page.getByRole('button',{name:'Search prospects',exact:true}).click();await ready();await pending('Platform').getByRole('button',{name:'Retry',exact:true}).click();await ready();
 check('Inline Retry commits and clears only its own pending field',(await read()).platform==='WordPress'&&await pending('Platform').count()===0);
 await fail();await choice('Platform').selectOption('Shopify');await pending('Platform').waitFor();await ready();await choice('Fit').selectOption('skip');await pending('Fit').waitFor();await ready();
 check('Two failed fields coexist without prompting',await pending('Platform').count()===1&&await pending('Fit').count()===1&&dialogs.length===0);
 const stored=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('bloomsi:sheet-draft:')).flatMap(k=>JSON.parse(localStorage.getItem(k)).fields));check('Recovery retains both failed fields and original baselines',stored.some(f=>f.key==='platform'&&f.before==='WordPress'&&f.value==='Shopify')&&stored.some(f=>f.key==='fit'&&f.before==='strong'&&f.value==='skip'));
 await page.unroute('**/api/bloomops/prospecting/sheet-edit');await pending('Fit').getByRole('button',{name:'Retry',exact:true}).click();await ready();check('Saving one queued field preserves the other',(await read()).fit==='skip'&&await pending('Platform').count()===1&&await pending('Fit').count()===0);
 await reload();check('Old copies are collapsed and do not replace saved cells automatically',await page.locator('.bo-sheet-recovery').evaluate(e=>!e.open)&&await choice('Platform').inputValue()==='WordPress');
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});const menu=page.locator('.bo-sheet-recovery');await menu.locator('summary').click();
  const bounds=await menu.locator('.bo-sheet-draft-menu').boundingBox();check('Drafts toolbar menu stays within viewport at '+width,bounds.x>=0&&bounds.x+bounds.width<=width&&await menu.locator('summary').innerText().then(t=>t.startsWith('Drafts')));
  const filterButton=page.getByRole('button',{name:'Filter',exact:true});if(width<768){await filterButton.focus();await filterButton.press('Enter');}else await filterButton.click();check('Filter replaces Drafts without overlapping menus at '+width,await page.locator('.bo-sheet-menu:visible').count()===1&&await menu.evaluate(e=>!e.open));
  if(width<768){await menu.locator('summary').focus();await menu.locator('summary').press('Enter');}else await menu.locator('summary').click();check('Drafts replaces Filter without overlapping menus at '+width,await page.locator('.bo-sheet-menu:visible').count()===1&&await page.getByRole('button',{name:'Filter',exact:true}).getAttribute('aria-expanded')==='false');
  await page.evaluate(()=>window.scrollTo(0,0));if([1440,390].includes(width))await page.screenshot({path:root+'/drafts-'+width+'.png',fullPage:false});
  await menu.locator('summary').click();
 }
 await page.setViewportSize({width:1440,height:1000});await restore();
 check('Restoration returns to the cell without a global review',await choice('Platform').inputValue()==='Shopify'&&await pending('Platform').count()===1&&await page.locator('.bo-sheet-review').count()===0);
 await pending('Platform').getByRole('button',{name:'Save',exact:true}).click();await ready();check('Restored field saves in one action',(await read()).platform==='Shopify'&&await pending('Platform').count()===0);
 // Reproduce the owner's exact old-copy/new-canonical conflict and resolve it locally.
 await fail();await choice('Platform').selectOption('WordPress');await pending('Platform').waitFor();await ready();await page.unroute('**/api/bloomops/prospecting/sheet-edit');await foreignEdit({platform:'Squarespace'});await reload();await restore();
 check('Recovered conflict shows both attempted and current saved values',await choice('Platform').inputValue()==='WordPress'&&(await pending('Platform').innerText()).includes('Saved: Squarespace'));
 let releaseKept,startKept;const keptGate=new Promise(r=>releaseKept=r),keptBegun=new Promise(r=>startKept=r);
 // Hold reconciliation before conflict detection, so table data is still Squarespace.
 await page.route('**/api/bloomops/prospecting/sheet?*',async r=>{const response=await r.fetch();startKept();await keptGate;try{await r.fulfill({response});}catch{}});
 await foreignEdit({platform:'Webflow'});await pending('Platform').getByRole('button',{name:'Use my value',exact:true}).click();await keptBegun;
 check('A newer edit after comparison is never silently overwritten',(await read()).platform==='Webflow'&&(await pending('Platform').innerText()).includes('Saved: Webflow'));
 await choice('Fit').selectOption('strong');await page.waitForFunction(()=>document.querySelector('.bo-sheet-save-status')?.textContent==='Fit saved');
 check('A same-row field saves while conflict reconciliation is held',(await read()).fit==='strong'&&await pending('Platform').count()===1);
 const keptWrites=writes.length;await pending('Platform').getByRole('button',{name:'Keep saved',exact:true}).click();
 check('Keep saved immediately displays the compared value while refresh is held',await choice('Platform').inputValue()==='Webflow'&&await pending('Platform').count()===0&&writes.length===keptWrites);
 releaseKept();await ready();await page.unroute('**/api/bloomops/prospecting/sheet?*');
 await foreignEdit({platform:'Squarespace'});await choice('Platform').selectOption('WordPress');await pending('Platform').waitFor();await ready();
 await pending('Platform').getByRole('button',{name:'Use my value',exact:true}).click();await ready();check('Use my value resolves the conflict through guarded canonical save',(await read()).platform==='WordPress'&&await pending('Platform').count()===0);
 await page.getByRole('button',{name:'Undo edits',exact:true}).click();await ready();check('Undo restores the value that conflict resolution actually replaced',(await read()).platform==='Squarespace');
 await fail();await choice('Platform').selectOption('Shopify');await pending('Platform').waitFor();await ready();await page.unroute('**/api/bloomops/prospecting/sheet-edit');await pending('Platform').getByRole('button',{name:'Keep saved',exact:true}).click();await ready();check('Keep saved dismisses only the local attempt without writing',(await read()).platform==='Squarespace'&&await choice('Platform').inputValue()==='Squarespace');
 // A lost reply can be confirmed after another field succeeds, without a duplicate PATCH.
 let once=true;await page.route('**/api/bloomops/prospecting/sheet-edit',async r=>{if(!once)return r.continue();once=false;await r.fetch();await r.abort('failed');});await choice('Platform').selectOption('Shopify');await pending('Platform').waitFor();await ready();await page.unroute('**/api/bloomops/prospecting/sheet-edit');await choice('Fit').selectOption('hold');await ready();const n=writes.length;await pending('Platform').getByRole('button',{name:'Retry',exact:true}).click();await ready();check('Lost reply retry confirms saved value without a duplicate write',writes.length===n&&(await read()).platform==='Shopify'&&(await read()).fit==='hold');
 await page.getByRole('button',{name:'Edit Contact for '+name,exact:true}).click();await page.getByRole('textbox',{name:'Edit Contact',exact:true}).fill('Rowan Garden');const beforeDialogs=dialogs.length;await choice('Fit').selectOption('strong');await ready();
 check('Switching from text entry preserves unfinished text without prompting',await pending('Contact').count()===1&&(await read()).personName==='Rowan'&&dialogs.length===beforeDialogs);
 await pending('Contact').getByRole('button',{name:'Save',exact:true}).click();await ready();check('Parked text saves beside its cell',(await read()).personName==='Rowan Garden');
 await fail();await page.getByRole('button',{name:'Edit Contact for '+name,exact:true}).click();await page.getByRole('textbox',{name:'Edit Contact',exact:true}).fill('');await page.getByRole('button',{name:'Save field',exact:true}).click();await pending('Contact').waitFor();await ready();await page.unroute('**/api/bloomops/prospecting/sheet-edit');
 await page.getByRole('button',{name:'Edit Contact for '+name,exact:true}).click();check('Reopening a failed clear preserves its empty value',await page.getByRole('textbox',{name:'Edit Contact',exact:true}).inputValue()==='');await page.getByRole('textbox',{name:'Edit Contact',exact:true}).fill('Rowan Replacement');
 check('Active text editor hides recovery actions for the older queued value',await pending('Contact').count()===0&&await page.getByRole('button',{name:'Save field',exact:true}).count()===1);
 await page.getByRole('button',{name:'Save field',exact:true}).click();await ready();check('Editor saves the visible replacement instead of the older failed value',(await read()).personName==='Rowan Replacement'&&await pending('Contact').count()===0);
 await page.getByRole('button',{name:'Edit Contact for '+name,exact:true}).click();await page.getByRole('textbox',{name:'Edit Contact',exact:true}).fill('');await page.getByRole('button',{name:'Save field',exact:true}).click();await ready();check('Cleared optional field saves without restoring the old text',(await read()).personName===null);
 // Already-committed old copies should retire rather than demand another review/save.
 await fail();await choice('Platform').selectOption('WordPress');await pending('Platform').waitFor();await ready();await page.unroute('**/api/bloomops/prospecting/sheet-edit');await foreignEdit({platform:'WordPress'});await reload();const count=writes.length;await restore();check('Already-saved recovered copy retires without another write',await pending('Platform').count()===0&&await page.locator('.bo-sheet-recovery').count()===0&&writes.length===count);
 for(const width of [1440,1024,390,320]){await page.setViewportSize({width,height:width<768?844:1000});await fail();await choice('Platform').selectOption('Shopify');await pending('Platform').waitFor();await ready();check('Inline error controls remain accessible without overflow at '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)&&await pending('Platform').getByRole('button',{name:'Retry',exact:true}).isVisible());if(width<768)check('Phone recovery actions retain44px targets at '+width,await pending('Platform').getByRole('button',{name:'Retry',exact:true}).evaluate(e=>e.getBoundingClientRect().height>=44));if(width===1440||width===390)await page.screenshot({path:root+'/inline-'+width+'.png',fullPage:width<768});await page.unroute('**/api/bloomops/prospecting/sheet-edit');await pending('Platform').getByRole('button',{name:'Keep saved',exact:true}).click();await ready();}
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/prospecting/'+id,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Edit identity & contact',exact:true}).click();
 await page.locator('#prospect-platform').waitFor();
 check('Profile platform source editor is removed while other source details remain',await page.locator('summary').filter({hasText:'Source details for current platform'}).count()===0&&await page.locator('#prospect-platform').isVisible()&&await page.locator('summary').filter({hasText:'Source details for public contact email'}).count()===1);
 await page.getByRole('form',{name:'Edit identity & contact',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();await page.goto(base+'/prospecting?q='+encodeURIComponent(name)+'&fit=',{waitUntil:'networkidle'});await ready();
 // A full recovery store must preserve the source until explicit resolution, then retire it.
 await page.evaluate(({id,userId,workspaceId})=>{for(let i=0;i<10;i++){const writer='capacity'+i,key='bloomsi:sheet-draft:'+JSON.stringify([userId,workspaceId])+':'+writer;localStorage.setItem(key,JSON.stringify({version:1,id:writer,userId,workspaceId,updatedAt:Date.now()-i,query:{view:'all',q:'',fit:'',region:'',platform:'',batch:'',never:'',sort:'createdAt',direction:'desc',page:1,size:25},fields:[{id,key:'platform',before:'WordPress',value:'Shopify'}]}));}}, {id,userId,workspaceId});
 await page.reload({waitUntil:'networkidle'});await ready();await page.locator('.bo-sheet-recovery summary').click();await page.getByRole('button',{name:'Restore edits',exact:true}).first().click();await pending('Platform').waitFor();await ready();check('Full recovery storage leaves the source copy intact',await page.getByRole('button',{name:'Restore edits',exact:true}).count()===10);await pending('Platform').getByRole('button',{name:'Keep saved',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.bo-sheet-recovery time').length===9);check('Explicit resolution retires that source without deleting other copies',await page.getByRole('button',{name:'Restore edits',exact:true}).count()===9);
 await page.route('**/api/bloomops/prospecting/'+id,r=>r.fulfill({status:403,contentType:'application/json',body:'{}'}));await choice('Fit').selectOption('hold');await page.getByText('Your account or workspace access changed. Reload to continue.').waitFor();check('Denied authority clears pending cells and private rows',await page.locator('.bo-sheet-cell-recovery,.bo-sheet-table').count()===0);
 check('No browser exceptions',errors.length===0);check('No provider calls',JSON.parse(readFileSync(root+'/provider-log.json')).length===0);
 writeFileSync(root+'/inline-checks.json',JSON.stringify({checks,dialogs},null,2));console.log('PASS '+checks.length);
}finally{await browser.close();}
