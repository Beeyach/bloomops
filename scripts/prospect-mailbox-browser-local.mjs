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
 const empty=JSON.parse(readFileSync(join(root,'empty-fixture.json'),'utf8')),emptyContext=await browser.newContext(),emptyPage=await emptyContext.newPage();await emptyPage.setViewportSize({width:390,height:844});
 assert.equal((await emptyContext.request.post(base+'/api/auth/sign-in/magic-link',{headers:{origin:base},data:{email:empty.email,callbackURL:'/prospecting/overview'}})).status(),200);
 const emptyRaw=cli(['r2','object','get','bloomops-files-p3c1-isolated/dev-mail/'+createHash('sha256').update(empty.email).digest('hex')+'.json','--local','--pipe']);await emptyPage.goto(JSON.parse(emptyRaw.slice(emptyRaw.indexOf('{'))).text.match(/https?:\/\/\S+/)[0],{waitUntil:'networkidle'});
 check('Empty Overview offers mailbox review',await emptyPage.getByRole('link',{name:'Mailbox review',exact:true}).isVisible()&&await emptyPage.getByRole('heading',{name:'Conversations',exact:true}).count()===0);await emptyPage.screenshot({path:join(out,'overview-empty-390.png'),fullPage:true});
 await emptyPage.getByRole('link',{name:'Mailbox review',exact:true}).click();await emptyPage.waitForURL('**/prospecting/mailbox');check('Empty Overview link reaches mailbox review',await emptyPage.getByRole('heading',{name:'No mailbox review yet',exact:true}).isVisible());await emptyContext.close();
 const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',()=>errors.push('runtime'));await page.emulateMedia({reducedMotion:'reduce'});
 const capture=async name=>{await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(out,name),fullPage:true});};
 const headers={origin:base};assert.equal((await context.request.post(base+'/api/auth/sign-in/magic-link',{headers,data:{email:fixture.email,callbackURL:'/prospecting/mailbox'}})).status(),200);
 const raw=cli(['r2','object','get','bloomops-files-p3c1-isolated/dev-mail/'+createHash('sha256').update(fixture.email).digest('hex')+'.json','--local','--pipe']);
 await page.goto(JSON.parse(raw.slice(raw.indexOf('{'))).text.match(/https?:\/\/\S+/)[0],{waitUntil:'networkidle'});
 const api=base+'/api/bloomops/prospecting/mailbox',get=async()=> (await context.request.get(api)).json(),post=data=>context.request.post(api,{headers,data});
 const input=async()=>{const d=await get();return {workspaceId:d.workspaceId,accountEmail:d.accountEmail,expectedRevision:d.expectedRevision,connectionRevision:d.connectionRevision,senderRevision:d.senderRevision,reviewed:true};};
 const button=()=>page.getByRole('button',{name:'Check available mail',exact:true}),ack=()=>page.getByLabel('Collect message headers from this account. No email will be sent.'),reload=()=>page.getByRole('button',{name:'Reload status',exact:true});
 check('Empty page names its purpose without provider access',await page.getByRole('heading',{name:'Mailbox review',exact:true}).isVisible()&&await page.getByRole('heading',{name:'No mailbox review yet',exact:true}).isVisible()&&JSON.parse(readFileSync(join(root,'provider-log.json'),'utf8')).length===0);
 check('Explicit read-only acknowledgement is required',await button().isDisabled());check('Overview remains active in contextual navigation',await page.locator('a[href="/prospecting/overview"][aria-current="page"]').count()>0);
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});check('No overflow at '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check('44px check target at '+width,await button().evaluate(n=>n.getBoundingClientRect().height>=44));check('Readable acknowledgement at '+width,await ack().locator('..').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=16));await capture('empty-'+width+'.png');
 }
 check('Cross-origin POST denied',(await context.request.post(api,{headers:{origin:'https://foreign.example'},data:await input()})).status()===403);
 check('Oversized body denied',(await post({...await input(),padding:'x'.repeat(5000)})).status()===400);
 for(const patch of [{reviewed:false},{workspaceId:'foreign'},{expectedRevision:999},{historyId:'100'},{recipient:'other@example.test'}])check('Strict input denied '+Object.keys(patch)[0],(await post({...await input(),...patch})).status()===409);
 check('Wrong account denied',[409,503].includes((await post({...await input(),accountEmail:'other@example.test'})).status()));
 await ack().check();await page.route('**/api/bloomops/prospecting/mailbox',r=>r.abort('failed'));await button().click();await page.locator('.bo-mailbox-review [role="alert"]:focus').waitFor();check('Network error is focused and offers reload',await reload().isEnabled());await capture('error-320.png');await page.unroute('**/api/bloomops/prospecting/mailbox');
 await reload().click();await page.getByText('Status updated.',{exact:true}).waitFor();await ack().check();
 let entered,release;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 await page.route('**/api/bloomops/prospecting/mailbox',async r=>{if(r.request().method()==='POST'){entered();await gate;}await r.continue();});
 await button().focus();await page.keyboard.press('Enter');await waiting;check('Busy state prevents repeated commands',await button().isDisabled()&&await reload().isDisabled());release();
 await page.getByText('Collection saved. Outreach holds remain in place.',{exact:true}).waitFor();await page.unroute('**/api/bloomops/prospecting/mailbox');
 let data=await get();check('Saved assigned/unassigned counts are exact',data.latest.matchedCount===1&&data.latest.unassignedCount===1&&data.latest.catchupStatus==='complete');
 check('Coverage stays unverified with no resume action',await page.getByText('Older mail unverified',{exact:true}).isVisible()&&await page.getByRole('button',{name:/resume|send email/i}).count()===0);
 check('Cooldown rejects a repeated direct POST',(await post(await input())).status()===409);
 check('Public DTO omits raw correspondence and provider progress',!JSON.stringify(data).match(/providerMessageId|startHistoryId|catchupHistoryId|synthetic-access|payload|snapshotJson/));
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});await ack().scrollIntoViewIfNeeded();check('Acknowledgement stays visible at '+width,await ack().locator('..').locator('span').isVisible());check('Account text has room at '+width,await page.locator('.bo-mailbox-account h2').evaluate(n=>n.getBoundingClientRect().width>=160));check('Saved layout fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await capture('saved-'+width+'.png');}
 await page.getByText('Saved collections',{exact:true}).focus();await page.keyboard.press('Enter');check('Saved history opens by keyboard',await page.locator('.bo-mailbox-history').getAttribute('open')!==null);
 // Only this synthetic fixture's cooldown is cleared to exercise another outcome.
 query("UPDATE prospect_discovery_states SET revision=revision+1,checked_at=NULL WHERE workspace_id="+lit(fixture.workspaceId));writeFileSync(join(root,'provider-mode.txt'),'gap');
 await reload().click();await page.getByText('Status updated.',{exact:true}).waitFor();await ack().check();await button().click();await page.getByText('Recent changes could not be fully checked. The available-message collection is saved.',{exact:true}).waitFor();
 data=await get();check('Failed catch-up is explicit and retains saved history',data.latest.catchupStatus==='unresolved'&&data.history.length===2);
 await capture('incomplete-320.png');writeFileSync(join(root,'provider-mode.txt'),'valid');
 await page.route('**/api/bloomops/prospecting/mailbox',async r=>{if(r.request().method()==='GET')return r.fulfill({json:{...data,canRecover:false,reason:'disabled'}});return r.continue();});await reload().click();await page.getByText('Live mailbox review is not available yet.',{exact:true}).waitFor();check('Unavailable UI disables acknowledgement and checking',await ack().isDisabled()&&await button().isDisabled());await capture('disabled-320.png');await page.unroute('**/api/bloomops/prospecting/mailbox');
 await page.getByRole('link',{name:'Sender setup',exact:true}).click();await page.waitForURL('**/prospecting/sender');check('Sender setup links back to mailbox review',await page.getByRole('link',{name:'Mailbox review',exact:true}).isVisible());await page.getByRole('link',{name:'Mailbox review',exact:true}).click();await page.waitForURL('**/prospecting/mailbox');
 for(const role of ['project_manager','team_member','client']){query("UPDATE workspace_memberships SET role="+lit(role)+" WHERE id="+lit(fixture.memberId));check('GET denied for '+role,[401,403,404].includes((await context.request.get(api)).status()));check('POST denied for '+role,[401,403,404].includes((await post({})).status()));}
 query("UPDATE workspace_memberships SET role='owner',status='suspended' WHERE id="+lit(fixture.memberId));check('Suspended owner denied',[401,403,404].includes((await context.request.get(api)).status()));query("UPDATE workspace_memberships SET status='active' WHERE id="+lit(fixture.memberId));
 check('No runtime errors',errors.length===0);writeFileSync(join(out,'acceptance.json'),JSON.stringify({checks,captures:14},null,2)+'\n');console.log('PASS '+checks.length+' browser checks');
}finally{await browser.close();}
