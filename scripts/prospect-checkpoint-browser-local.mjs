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
 await login(fixture.email,page,context,'/prospecting/mailbox');
 const api=base+'/api/bloomops/prospecting/mailbox',get=async()=> (await context.request.get(api)).json(),post=data=>context.request.post(api+'/checkpoint',{headers:{origin:base},data});
 const data=await get(),input={workspaceId:data.workspaceId,selection:data.checkpoint.selection,expectedRevision:data.expectedRevision,connectionRevision:data.connectionRevision,senderRevision:data.senderRevision,reviewed:true};
 const button=()=>page.getByRole('button',{name:'Save starting point',exact:true}),ack=()=>page.getByLabel('Use this collection as the starting point for future checks.'),reload=()=>page.getByRole('button',{name:'Reload status',exact:true});
 const capture=async name=>{await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(out,name),fullPage:true});};
 check('Fresh completed collection can save a starting point',data.checkpoint.canSave);
 check('Browser receives opaque selection without raw provenance',/^[a-f0-9]{64}$/.test(input.selection)&&!Object.keys(data.checkpoint).some(k=>/runId|historyId|cursor|token/i.test(k)));
 check('Acknowledgement is required',await button().isDisabled());
 check('Provider collection remains disabled',await page.getByRole('button',{name:'Check available mail',exact:true}).isDisabled());
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});check('Checkpoint layout fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check('44px save target '+width,await button().evaluate(n=>n.getBoundingClientRect().height>=44));check('16px acknowledgement '+width,await ack().locator('..').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=16));await capture('checkpoint-'+width+'.png');}
 await button().evaluate(n=>n.scrollIntoView({block:'center'}));check('Mobile save is reachable above navigation',await button().evaluate(n=>n.getBoundingClientRect().bottom<innerHeight-90));await page.screenshot({path:join(out,'checkpoint-controls-320.png')});
 check('Cross-origin checkpoint denied',(await context.request.post(api+'/checkpoint',{headers:{origin:'https://foreign.example'},data:input})).status()===403);
 check('Oversized checkpoint denied',(await post({...input,extra:'x'.repeat(5000)})).status()===400);
 for(const patch of [{reviewed:false},{selection:'f'.repeat(64)},{workspaceId:'foreign'},{expectedRevision:999},{connectionRevision:999},{senderRevision:999},{sourceRunId:'forged'},{historyId:'999'},{accountEmail:'foreign@example.test'}])check('Strict checkpoint rejects '+Object.keys(patch)[0],[400,409].includes((await post({...input,...patch})).status()));
 for(const role of ['project_manager','team_member','client']){query("UPDATE workspace_memberships SET role="+lit(role)+" WHERE id="+lit(fixture.memberId));check('Checkpoint denied for '+role,[401,403,404].includes((await post(input)).status()));}
 query("UPDATE workspace_memberships SET role='owner',status='suspended' WHERE id="+lit(fixture.memberId));check('Suspended owner cannot save',[401,403,404].includes((await post(input)).status()));query("UPDATE workspace_memberships SET status='active' WHERE id="+lit(fixture.memberId));
 await ack().focus();await page.keyboard.press('Space');check('Keyboard acknowledgement enables save',await button().isEnabled());
 await page.route('**/api/bloomops/prospecting/mailbox/checkpoint',r=>r.abort());await button().click();await page.locator('.bo-mailbox-review [role="alert"]:focus').waitFor();check('Network error focuses feedback and retains acknowledgement',await ack().isChecked());await capture('error-320.png');await page.unroute('**/api/bloomops/prospecting/mailbox/checkpoint');
 await reload().click();await page.getByText('Status updated.',{exact:true}).waitFor();check('Reload retains readiness and clears acknowledgement',await button().isDisabled()&&!await ack().isChecked());await ack().check();
 let entered,release,requests=0;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 await page.route('**/api/bloomops/prospecting/mailbox/checkpoint',async r=>{requests++;entered();await gate;await r.continue();});await button().focus();await page.keyboard.press('Enter');await waiting;check('In-flight save disables repeated action and reload',await button().isDisabled()&&await ack().isDisabled()&&await reload().isDisabled());await page.keyboard.press('Enter');release();await page.getByText('Starting point saved. Older mail remains unverified and outreach stays held.',{exact:true}).waitFor();await page.unroute('**/api/bloomops/prospecting/mailbox/checkpoint');check('Keyboard repeat sends one request',requests===1);
 const saved=await get();check('Saved starting point remains separate from older mail coverage',Boolean(saved.checkpoint.savedAt)&&saved.coverage==='unverified'&&!saved.checkpoint.canSave&&saved.checkpoint.reason==='used');check('Duplicate checkpoint rejected',(await post(input)).status()===409);
 const state=query("SELECT history_id,baseline_history_id,coverage_status FROM prospect_discovery_states WHERE workspace_id="+lit(fixture.workspaceId))[0],points=query("SELECT * FROM prospect_monitoring_checkpoints WHERE workspace_id="+lit(fixture.workspaceId)),events=query("SELECT id FROM activity_events WHERE workspace_id="+lit(fixture.workspaceId)+" AND event_type='PROSPECT_MONITORING_CHECKPOINT'");
 check('Native D1 records one checkpoint and activity',points.length===1&&events.length===1);check('Native future cursor advances while gap stays unresolved',state.history_id==='101'&&state.baseline_history_id==='101'&&state.coverage_status==='gap');check('Native recipient remains held',query("SELECT hold_state FROM prospect_reply_states WHERE workspace_id="+lit(fixture.workspaceId))[0].hold_state==='held');
 await page.reload({waitUntil:'networkidle'});check('Reload shows saved point without another action',await page.getByText('Starting point saved',{exact:true}).isVisible()&&await button().count()===0);
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});check('Saved checkpoint fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await capture('saved-'+width+'.png');}
 for(const [reason,text] of [['disabled','Saving a starting point is not available yet.'],['expired','This collection is over five minutes old. Check available mail again.'],['changed','The account or conversations changed. Check available mail again.']]){
  await page.route('**/api/bloomops/prospecting/mailbox',r=>r.fulfill({json:{...saved,checkpoint:{...saved.checkpoint,reason,canSave:false}}}));await reload().click();await page.getByText(text,{exact:true}).waitFor();check('Explicit '+reason+' state prevents saving',await button().isDisabled()&&await ack().isDisabled());await page.unroute('**/api/bloomops/prospecting/mailbox');
 }
 check('Checkpoint makes zero provider requests',JSON.parse(readFileSync(join(root,'provider-log.json'),'utf8')).length===0);check('No browser runtime errors',errors.length===0);writeFileSync(join(out,'acceptance.json'),JSON.stringify({checks},null,2)+'\n');console.log('PASS '+checks.length+' browser checks');
}finally{await browser.close();}
