// Optional P2B1 checks for the existing isolated local source fixture.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
export async function checkSourceExport({context,page,base,src,foreign,dest,preview,data,out,query,lit,snapshot,check}){
 const endpoint=base+'/api/bloomops/prospecting/source-export',ids=[data.rows[0].id,data.rows[5].id],post=(body,origin=base)=>context.request.post(endpoint,{headers:{origin},data:body});
 const before=snapshot();
 await page.goto(base+preview,{waitUntil:'networkidle'});
 check('Export starts with nothing selected and download disabled',await page.getByRole('button',{name:'Download selected',exact:true}).isDisabled());
 check('Worked and ambiguous records cannot be selected',await page.getByRole('checkbox',{name:'Select Willow House',exact:true}).isDisabled()&&await page.getByRole('checkbox',{name:'Select Clover Collective',exact:true}).isDisabled());
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});await page.emulateMedia({reducedMotion:'reduce'});await page.goto(base+preview,{waitUntil:'networkidle'});
  await page.getByRole('checkbox',{name:'Select Fern & Field Studio',exact:true}).check();
  check(`Selection is usable without overflow at ${width}px`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)&&!(await page.getByRole('button',{name:'Download selected',exact:true}).isDisabled()));
  check(`Selection touch target is 44px at ${width}px`,(await page.locator('.bo-source-select').first().boundingBox()).height>=44);
  await page.locator('.bo-source-export').evaluate(el=>window.scrollTo(0,scrollY+el.getBoundingClientRect().top-90));
  await page.screenshot({path:join(out,`export-${width}.png`),fullPage:false});
 }
 const all=page.getByRole('checkbox',{name:'Select eligible on this page',exact:true});await all.check();
 check('Select all selects only the 46 eligible page records',await page.locator('.bo-source-rows input:checked').count()===46&&await page.locator('.bo-source-rows input:disabled').count()===4);
 await all.uncheck();await all.focus();await page.keyboard.press('Space');check('Selection works with keyboard Space',await all.isChecked());await all.uncheck();
 await page.getByRole('checkbox',{name:'Select Fern & Field Studio',exact:true}).check();await page.getByRole('checkbox',{name:'Select Garden Studio 05',exact:true}).check();
 let release,started;const gate=new Promise(resolve=>release=resolve),requestStarted=new Promise(resolve=>started=resolve);
 await page.route('**/api/bloomops/prospecting/source-export',async route=>{started();await gate;await route.continue();});
 let downloads=0;page.on('download',()=>downloads++);
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download selected',exact:true}).click();await requestStarted;
 check('In-flight download disables selection and shows eligibility check',await all.isDisabled()&&await page.getByRole('button',{name:'Checking eligibility…',exact:true}).isDisabled());
 release();const download=await downloading;await page.unroute('**/api/bloomops/prospecting/source-export');
 const exported=JSON.parse(readFileSync(await download.path(),'utf8'));
 check('Browser saves only selected source IDs and exact raw fields',download.suggestedFilename()==='bloomops-raw-prospects.json'&&exported.records.length===2&&exported.records.every((r,i)=>r.provenance.sourceWorkspaceId===src&&r.provenance.sourceRecordId===ids[i])&&exported.records[0].fields.businessName==='Fern & Field Studio'&&exported.records[0].fields.website==='example.com'&&exported.records[0].fields.publicEmail==='garden-0@example.com');
 check('Download has version, date, reconciled counts and no old history',exported.format==='bloomops.raw-prospects'&&exported.version===1&&Number.isFinite(Date.parse(exported.exportedAt))&&exported.counts.selected===2&&exported.counts.exported===2&&exported.counts.blocked===0&&!JSON.stringify(exported).includes('PRIVATE')&&Object.keys(exported.records[0].fields).sort().join(',')==='businessName,country,niche,personName,publicEmail,source,website');
 const response=await post({source:src,ids});check('Native D1 export is a private JSON attachment',response.status()===200&&response.headers()['content-type'].includes('application/json')&&response.headers()['content-disposition']==='attachment; filename="bloomops-raw-prospects.json"'&&response.headers()['cache-control']==='no-store'&&response.headers()['x-content-type-options']==='nosniff');
 check('Exports leave source, send history and destination unchanged',snapshot()===before);
 await page.route('**/api/bloomops/prospecting/source-export',route=>route.abort('failed'));
 await page.getByRole('button',{name:'Download selected',exact:true}).click();await page.getByText('The download could not be prepared. Check your connection and try again.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Reload source records',exact:true}).scrollIntoViewIfNeeded();
 const retryState={selected:await page.getByRole('checkbox',{name:'Select Fern & Field Studio',exact:true}).isChecked(),reload:await page.getByRole('button',{name:'Reload source records',exact:true}).isVisible(),downloads};
 assert.ok(retryState.selected&&retryState.reload&&retryState.downloads===1,JSON.stringify(retryState));check('Network error retains selection and offers retry',true);
 await page.unroute('**/api/bloomops/prospecting/source-export');
 const retried=page.waitForEvent('download');await page.getByRole('button',{name:'Download selected',exact:true}).click();await retried;
 check('Retry produces a download without a source write',snapshot()===before);
 await page.getByRole('link',{name:'Next page',exact:true}).click();await page.waitForLoadState('networkidle');check('Changing pages clears selection',await page.getByRole('button',{name:'Download selected',exact:true}).isDisabled());
 await page.goto(base+preview,{waitUntil:'networkidle'});await page.getByRole('checkbox',{name:'Select Fern & Field Studio',exact:true}).check();
 // Fixture-only send evidence added after the UI preview. No provider is called.
 query(`INSERT INTO send_events(workspace,prospect_id,sent_at,dedupe_key,subject) VALUES(${lit(src)},${ids[0]},'2026-09-12',${lit(src+'-late-send')},'PRIVATE NEW SEND')`);
 const afterFixtureChange=snapshot();
 await page.getByRole('button',{name:'Download selected',exact:true}).click();await page.getByText('Some selected records are no longer eligible. No file was downloaded.',{exact:true}).waitFor();
 check('Stale selected record is blocked with a reason and no download',await page.locator('.bo-prospect-notice[role="alert"]').getByText('Some selected records are no longer eligible. No file was downloaded.',{exact:true}).isVisible()&&await page.locator('.bo-prospect-notice[role="alert"]').getByText('Contact, reply, stop or client history is recorded.',{exact:false}).isVisible()&&downloads===2);
 await page.locator('.bo-prospect-notice[role="alert"]').scrollIntoViewIfNeeded();await page.screenshot({path:join(out,'export-conflict-320.png'),fullPage:false});
 const conflict=await post({source:src,ids}),problem=await conflict.json();check('Server rejects the whole stale selection and reconciles counts',conflict.status()===409&&!problem.records&&problem.counts.selected===2&&problem.counts.eligible===1&&problem.counts.blocked===1&&problem.counts.exported===0&&!JSON.stringify(problem).includes('PRIVATE'));
 await page.getByRole('button',{name:'Reload source records',exact:true}).click();await page.waitForLoadState('networkidle');check('Reload clears selection and disables newly worked record',await page.getByRole('checkbox',{name:'Select Fern & Field Studio',exact:true}).isDisabled()&&await page.getByRole('button',{name:'Download selected',exact:true}).isDisabled());
 check('Foreign source export is denied',(await post({source:foreign,ids})).status()===404);
 const missing=await post({source:src,ids:[Number.MAX_SAFE_INTEGER]});check('Unavailable selected ID cannot leak another record',missing.status()===409&&(await missing.json()).rejections[0].reasons[0]==='unavailable');
 check('Cross-origin export is denied',(await post({source:src,ids:[ids[1]]},'https://foreign.example')).status()===403);
 check('Export has no GET endpoint',(await context.request.get(endpoint)).status()===405);
 check('Malformed and excessive selections are rejected',(await post({source:src,ids:[ids[1],ids[1]]})).status()===400&&(await post({source:src,ids:Array.from({length:51},(_,i)=>i+1)})).status()===400&&(await post({source:src,ids:[ids[1]],fields:{businessName:'Forged'}})).status()===400);
 check('Oversized body is rejected',(await post({source:src,ids:[ids[1]],extra:'x'.repeat(65536)})).status()===400);
 query(`UPDATE workspace_memberships SET status='suspended' WHERE id=${lit(src+'-member')}`);check('Source revocation prevents download',(await post({source:src,ids:[ids[1]]})).status()===404);query(`UPDATE workspace_memberships SET status='active' WHERE id=${lit(src+'-member')}`);
 query(`UPDATE workspace_memberships SET role='team_member' WHERE id=${lit(dest+'-member')}`);check('Destination demotion prevents download',(await post({source:src,ids:[ids[1]]})).status()===403);query(`UPDATE workspace_memberships SET role='owner' WHERE id=${lit(dest+'-member')}`);
 assert.equal(snapshot(),afterFixtureChange);check('Failed downloads perform no source or destination writes',true);
 return afterFixtureChange;
}
