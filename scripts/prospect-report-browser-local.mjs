#!/usr/bin/env node
// Synthetic built Worker on8788 only. Local R2 magic links never printed.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
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
 const empty=JSON.parse(readFileSync(join(root,'empty-fixture.json'),'utf8')),emptyContext=await browser.newContext(),emptyPage=await emptyContext.newPage();
 await login(empty.email,emptyPage,emptyContext,'/prospecting/mailbox/reports');check('Empty account has a truthful report screen',await emptyPage.getByRole('heading',{name:'No saved reports to review',exact:true}).isVisible());await emptyPage.setViewportSize({width:390,height:900});await emptyPage.screenshot({path:join(out,'empty-390.png'),fullPage:true});await emptyContext.close();
 await login(fixture.email,page,context,'/prospecting/mailbox/reports');
 const api=base+'/api/bloomops/prospecting/reports',get=async()=> (await context.request.get(api)).json(),post=data=>context.request.post(api,{headers:{origin:base},data});
 const input=async()=>{const d=await get();return {workspaceId:d.workspaceId,selection:d.items[0].selection,expectedRevision:d.expectedRevision,connectionRevision:d.connectionRevision,senderRevision:d.senderRevision,reviewed:true};};
 const button=()=>page.getByRole('button',{name:'Check report',exact:true}),ack=()=>page.getByLabel('Read this report’s contents to check its original message.'),reload=()=>page.getByRole('button',{name:'Reload status',exact:true});
 const capture=async name=>{await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:join(out,name),fullPage:true});};
 check('Saved reports render without a provider request',JSON.parse(readFileSync(join(root,'provider-log.json'),'utf8')).length===0);
 check('Overview navigation remains active',await page.locator('a[href="/prospecting/overview"][aria-current="page"]').count()>0);
 check('Body-read acknowledgement is required',await button().isDisabled()&&await ack().isEnabled());
 const data=await get();check('DTO hides raw provider IDs and correspondence',!JSON.stringify(data).match(/dsn-1|new-thread|providerMessageId|recoveryRunId|PRIVATE|synthetic-access|rfcMessageId|tokenBox/));
 for(const width of [1440,1024,768,390,320]){
  await page.setViewportSize({width,height:1000});check('Pending page fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check('44px check target '+width,await button().evaluate(n=>n.getBoundingClientRect().height>=44));check('Readable acknowledgement '+width,await ack().locator('..').evaluate(n=>parseFloat(getComputedStyle(n).fontSize)>=16));await capture('pending-'+width+'.png');
 }
 check('Cross-origin POST denied',(await context.request.post(api,{headers:{origin:'https://foreign.example'},data:await input()})).status()===403);
 check('Oversized POST denied',(await post({...await input(),padding:'x'.repeat(5000)})).status()===400);
 for(const patch of [{reviewed:false},{workspaceId:'foreign'},{selection:'f'.repeat(64)},{expectedRevision:999},{connectionRevision:999},{providerMessageId:'dsn-1'},{accountEmail:'other@example.test'}])check('Strict command rejected '+Object.keys(patch)[0],(await post({...await input(),...patch})).status()===409);
 await ack().check();await page.route('**/api/bloomops/prospecting/reports',r=>r.abort('failed'));await button().click();await page.locator('.bo-report-review [role="alert"]:focus').waitFor();check('Network failure focuses feedback and permits reload',await reload().isEnabled());await capture('error-320.png');await page.unroute('**/api/bloomops/prospecting/reports');
 await reload().click();await page.getByText('Status updated.',{exact:true}).waitFor();await ack().check();
 writeFileSync(join(root,'provider-mode.txt'),'failed');let entered,release;const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 await page.route('**/api/bloomops/prospecting/reports',async r=>{if(r.request().method()==='POST'){entered();await gate;}await r.continue();});await button().focus();await page.keyboard.press('Enter');await waiting;check('In-flight command prevents repeats',await button().isDisabled()&&await reload().isDisabled());release();
 await page.getByText('No reliable match was saved. Outreach stays on hold.',{exact:true}).waitFor();await page.unroute('**/api/bloomops/prospecting/reports');
 check('Provider failure stays unresolved',(await get()).items[0].status==='unresolved');check('Cooldown rejects immediate replay',(await post(await input())).status()===409);await capture('unresolved-320.png');
 // The domain cooldown is real; wait for it instead of rewriting immutable rows.
 await page.waitForTimeout(31000);writeFileSync(join(root,'provider-mode.txt'),'valid');await reload().click();await page.getByText('Status updated.',{exact:true}).waitFor();await ack().check();await button().click();
 await page.getByText('Original message matched. Human confirmation is still needed.',{exact:true}).waitFor();
 const matched=await get();check('Matching is saved but remains unauthenticated and held',matched.items[0].status==='associated'&&matched.authenticity==='unverified'&&matched.held);
 check('Review conversation is reachable without send/resume controls',await page.getByRole('link',{name:'Review conversation',exact:true}).isVisible()&&await page.getByRole('button',{name:/resume|send email/i}).count()===0);
 check('Prospect uses garden avatar without initials',await page.locator('.bo-report-identity .bo-prospect-garden').count()===1&&await page.locator('.bo-prospect-avatar').innerText()==='');
 await page.reload({waitUntil:'networkidle'});check('Completed report does not suggest checking again',await page.getByText('Wait briefly, then reload status before checking again.',{exact:true}).count()===0);
 for(const width of [1440,1024,768,390,320]){await page.setViewportSize({width,height:1000});check('Matched layout fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check('Identity precedes business name '+width,await page.locator('.bo-report-identity').evaluate(n=>n.firstElementChild.classList.contains('bo-prospect-avatar')));await capture('matched-'+width+'.png');}
 await page.getByText('Delivery failed',{exact:true}).evaluate(n=>n.scrollIntoView({block:'center'}));check('Mobile outcome is reachable above navigation',await page.getByText('Delivery failed',{exact:true}).evaluate(n=>{const r=n.getBoundingClientRect();return r.top>=0&&r.bottom<innerHeight-90;}));
 await page.getByText('Report details',{exact:true}).focus();await page.keyboard.press('Enter');check('Report detail disclosure works by keyboard',await page.getByText('Unverified',{exact:true}).isVisible());await capture('details-320.png');
 await page.route('**/api/bloomops/prospecting/reports',async r=>r.request().method()==='GET'?r.fulfill({json:{...matched,items:[{...matched.items[0],status:'pending',canCheck:false,reason:'disabled',prospect:null,action:null,statusCode:null}],reason:null}}):r.continue());await reload().click();await page.getByText('Reading report contents is not available yet.',{exact:true}).waitFor();check('Disabled state has no usable check or acknowledgement',await button().isDisabled()&&await ack().count()===0);await capture('disabled-320.png');await page.unroute('**/api/bloomops/prospecting/reports');
 await page.getByRole('link',{name:'Back to Mailbox review',exact:true}).click();await page.waitForURL('**/prospecting/mailbox');check('Mailbox links to Delivery reports',await page.getByRole('link',{name:'Delivery reports',exact:true}).isVisible());await page.getByRole('link',{name:'Delivery reports',exact:true}).click();await page.waitForURL('**/prospecting/mailbox/reports');
 // Playwright aborts intercepted /favicon.ico internally, before route handlers.
 // Use actual loopback HTTP with no interception to exercise the unchanged avatar.
 const saved=await get(),prospect=saved.items[0].prospect;
 const good=createServer((req,res)=>{res.writeHead(200,{'content-type':'image/svg+xml'});res.end('<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#56bfa1"/></svg>');});
 const bad=createServer((req,res)=>{res.writeHead(404);res.end();});
 await Promise.all([new Promise(r=>good.listen(0,'127.0.0.1',r)),new Promise(r=>bad.listen(0,'127.0.0.1',r))]);
 try{
  const website=port=>query("UPDATE bloomops_prospects SET revision=revision+1,website="+lit('http://127.0.0.1:'+port)+" WHERE id="+lit(prospect.id)+" AND workspace_id="+lit(saved.workspaceId));
  website(good.address().port);await reload().click();await page.locator('.bo-report-identity').scrollIntoViewIfNeeded();await page.locator('.bo-prospect-favicon.is-loaded').waitFor();check('Existing favicon detection displays a successful website icon',await page.locator('.bo-prospect-favicon').getAttribute('referrerpolicy')==='no-referrer');
  website(bad.address().port);await reload().click();await page.getByText('Status updated.',{exact:true}).waitFor();await page.waitForFunction(()=>!document.querySelector('.bo-prospect-favicon'));check('Failed website icon retains the garden SVG',await page.locator('.bo-prospect-garden').count()===1);
 }finally{query("UPDATE bloomops_prospects SET revision=revision+1,website="+(prospect.website===null?'NULL':lit(prospect.website))+" WHERE id="+lit(prospect.id)+" AND workspace_id="+lit(saved.workspaceId));await Promise.all([new Promise(r=>good.close(r)),new Promise(r=>bad.close(r))]);}
 for(const role of ['project_manager','team_member','client']){query("UPDATE workspace_memberships SET role="+lit(role)+" WHERE id="+lit(fixture.memberId));check('GET denied for '+role,[401,403,404].includes((await context.request.get(api)).status()));check('POST denied for '+role,[401,403,404].includes((await post({})).status()));}
 query("UPDATE workspace_memberships SET role='owner',status='suspended' WHERE id="+lit(fixture.memberId));check('Suspended owner denied',[401,403,404].includes((await context.request.get(api)).status()));query("UPDATE workspace_memberships SET status='active' WHERE id="+lit(fixture.memberId));
 check('No runtime errors',errors.length===0);writeFileSync(join(out,'acceptance.json'),JSON.stringify({checks},null,2)+'\n');console.log('PASS '+checks.length+' browser checks');
}finally{await browser.close();}
