#!/usr/bin/env node
// Synthetic built Worker on8788 only. Local R2 magic links never printed.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(process.argv[2]),fixture=JSON.parse(readFileSync(join(root,'browser-fixture.json'),'utf8')),out=join(root,'browser'),base='http://localhost:8788',configPath=fixture.configPath,config=JSON.parse(readFileSync(configPath,'utf8'));
assert.equal(config.d1_databases[0].database_id,'bloomops-p3c1-isolated');mkdirSync(out,{recursive:true});
const cli=args=>execFileSync('npx',['--no-install','wrangler',...args,'--config',configPath],{encoding:'utf8',stdio:['ignore','pipe','pipe']}),query=sql=>JSON.parse(cli(['d1','execute','DB','--local','--command',sql,'--json']))[0].results,lit=s=>"'"+String(s).replaceAll("'","''")+"'";
const {chromium}=createRequire('/tmp/bloomops-pilot-tools/package.json')('playwright'),browser=await chromium.launch({headless:true,args:['--no-sandbox']}),checks=[];
const check=(name,pass)=>{assert.ok(pass,name);checks.push(name);console.log('ok '+name);};
try{
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',()=>errors.push('runtime'));
 await page.emulateMedia({reducedMotion:'reduce'});
 const login=async(email,targetPage,targetContext,callbackURL)=>{
  assert.equal((await targetContext.request.post(base+'/api/auth/sign-in/magic-link',{headers:{origin:base},data:{email,callbackURL}})).status(),200);
  const raw=cli(['r2','object','get','bloomops-files-p3c1-isolated/dev-mail/'+createHash('sha256').update(email).digest('hex')+'.json','--local','--pipe']);
  await targetPage.goto(JSON.parse(raw.slice(raw.indexOf('{'))).text.match(/https?:\/\/\S+/)[0],{waitUntil:'networkidle'});
 };
 await login(fixture.email,page,context,'/prospecting/mailbox/reports');
 const api=base+'/api/bloomops/prospecting/reports',get=async()=> (await context.request.get(api)).json(),post=data=>context.request.post(api+'/confirm',{headers:{origin:base},data});
 const data=await get(),row=data.items[0],input={workspaceId:data.workspaceId,selection:row.selection,expectedRevision:row.replyRevision,connectionRevision:data.connectionRevision,senderRevision:data.senderRevision,reviewed:true,note:'I reviewed the permanent delivery failure in Gmail.'};
 const summary=()=>page.getByText('Review permanent failure',{exact:true}),button=()=>page.getByRole('button',{name:'Confirm and stop outreach',exact:true}),note=()=>page.getByLabel('Evidence reviewed',{exact:true}),ack=()=>page.getByLabel('I reviewed this report and confirm permanent delivery failure.'),reload=()=>page.getByRole('button',{name:'Reload status',exact:true});
 const capture=async name=>{await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(out,name),fullPage:true});};
 check('Saved permanent report can be reviewed with provider reads disabled',row.canConfirm&&row.status==='associated');
 check('Opening reports makes no provider request',JSON.parse(readFileSync(join(root,'provider-log.json'),'utf8')).length===0);
 check('Human review is a closed named disclosure',!await note().isVisible());await summary().focus();await page.keyboard.press('Enter');check('Review opens by keyboard',await note().isVisible());check('Confirmation requires evidence and acknowledgement',await button().isDisabled());
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});check('Review layout fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check('44px confirmation target '+width,await button().evaluate(n=>n.getBoundingClientRect().height>=44));check('16px evidence input '+width,await note().evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=16));await capture('confirm-'+width+'.png');}
 await button().evaluate(n=>n.scrollIntoView({block:'center'}));check('Mobile confirmation is reachable above navigation',await button().evaluate(n=>n.getBoundingClientRect().bottom<innerHeight-90));await page.screenshot({path:join(out,'confirm-controls-320.png')});
 const reportCheck=query("SELECT id FROM prospect_report_checks WHERE workspace_id="+lit(fixture.workspaceId)+" AND status='associated'")[0];
 const forged=await context.request.post(base+'/api/bloomops/prospecting/replies',{headers:{origin:base},data:{action:'stop',workspaceId:data.workspaceId,prospectId:row.prospect.id,deliveryId:fixture.deliveryId,expectedRevision:row.replyRevision,reason:'hard_bounce',note:input.note,reviewed:true,reportCheckId:reportCheck.id,connectionRevision:data.connectionRevision,senderRevision:data.senderRevision}});
 check('Public manual-stop API rejects server-only report linkage',forged.status()===400&&(await get()).items[0].stop===null);
 check('Cross-origin confirmation denied',(await context.request.post(api+'/confirm',{headers:{origin:'https://foreign.example'},data:input})).status()===403);
 check('Oversized confirmation denied',(await post({...input,note:'x'.repeat(5000)})).status()===400);
 for(const patch of [{reviewed:false},{note:''},{selection:'f'.repeat(64)},{workspaceId:'foreign'},{expectedRevision:999},{connectionRevision:999},{senderRevision:999},{reportCheckId:'forged'}])check('Strict confirmation rejects '+Object.keys(patch)[0],[400,409].includes((await post({...input,...patch})).status()));
 for(const role of ['project_manager','team_member','client']){query("UPDATE workspace_memberships SET role="+lit(role)+" WHERE id="+lit(fixture.memberId));check('Confirmation denied for '+role,[401,403,404].includes((await post(input)).status()));}
 query("UPDATE workspace_memberships SET role='owner',status='suspended' WHERE id="+lit(fixture.memberId));check('Suspended owner cannot confirm',[401,403,404].includes((await post(input)).status()));query("UPDATE workspace_memberships SET status='active' WHERE id="+lit(fixture.memberId));
 await note().fill(input.note);check('Evidence alone does not enable confirmation',await button().isDisabled());await ack().check();
 await page.route('**/api/bloomops/prospecting/reports/confirm',r=>r.abort());await button().click();await page.locator('.bo-report-review [role="alert"]:focus').waitFor();check('Network error focuses feedback and retains evidence',await note().inputValue()===input.note&&await ack().isChecked());await capture('error-320.png');await page.unroute('**/api/bloomops/prospecting/reports/confirm');
 let entered,release;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 await page.route('**/api/bloomops/prospecting/reports/confirm',async r=>{entered();await gate;await r.continue();});await button().focus();await page.keyboard.press('Enter');await waiting;check('In-flight confirmation disables repeats and edits',await button().isDisabled()&&await note().isDisabled()&&await reload().isDisabled());release();await page.getByText('Permanent stop saved. No email was sent.',{exact:true}).waitFor();await page.unroute('**/api/bloomops/prospecting/reports/confirm');
 const saved=await get();check('Saved decision is a permanent human stop',saved.items[0].stop.reason==='hard_bounce'&&saved.items[0].stop.note===input.note&&!saved.items[0].canConfirm);check('Report authenticity remains unverified',saved.authenticity==='unverified'&&saved.items[0].status==='associated');check('Duplicate confirmation cannot record another stop',(await post(input)).status()===409);
 const events=query("SELECT metadata_json FROM activity_events WHERE workspace_id="+lit(fixture.workspaceId)+" AND event_type='PROSPECT_OUTREACH_STOPPED'");check('One native D1 stop event retains safe report provenance',events.length===1&&JSON.parse(events[0].metadata_json).source==='manual_report_review'&&Boolean(JSON.parse(events[0].metadata_json).reportCheckId));
 await page.reload({waitUntil:'networkidle'});check('Reload shows saved decision without another form',await page.getByRole('heading',{name:'Human stop decision',exact:true}).isVisible()&&await button().count()===0);
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});check('Saved stop layout fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await capture('saved-'+width+'.png');}
 await page.getByText('Report details',{exact:true}).click();check('Reported failure and human confirmation remain distinct',await page.getByText('Unverified',{exact:true}).isVisible()&&await page.getByText('Confirmed hard bounce',{exact:true}).isVisible());
 check('Confirmation made no provider request',JSON.parse(readFileSync(join(root,'provider-log.json'),'utf8')).length===0);check('No browser runtime errors',errors.length===0);writeFileSync(join(out,'acceptance.json'),JSON.stringify({checks},null,2)+'\n');console.log('PASS '+checks.length+' browser checks');
}finally{await browser.close();}
