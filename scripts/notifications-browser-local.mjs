// N2E: reuse the N2D Playwright flows and existing numeric navigation wrapper.
// Starts its own built Worker, in-memory D1/R2 and synthetic identities. No .dev.vars.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildArtifacts,hash,localProcesses} from './notification-build-evidence.mjs';
import {createServer} from 'node:net';
import {notificationPreferencesRegression,captureNotificationIntervals} from './notification-preferences-browser.mjs';
import {createHash,randomUUID} from 'node:crypto';
import {unstable_getMiniflareWorkerOptions} from 'wrangler';
import {setup} from '../tests/_work-projections.mjs';
import {all} from '../tests/_bloomops-db.mjs';
import {navigationRoutes,completedContent} from './navigation-content.mjs';
const root=resolve(process.env.BLOOMOPS_N2E_SOURCE||fileURLToPath(new URL('../',import.meta.url)));
const out=resolve(process.env.BLOOMOPS_BROWSER_EVIDENCE_DIR||'/tmp/bloomops-n2e-verification/browser');mkdirSync(out,{recursive:true});
const performanceOnly=process.argv.includes('--performance-only');
const preferencesOnly=process.argv.includes('--preferences-only'),skipPerformance=preferencesOnly||process.argv.includes('--skip-performance');
const port=await new Promise((resolve,reject)=>{const socket=createServer();socket.once('error',reject);socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const base=`http://localhost:${port}`;
const require=createRequire(import.meta.url),wranglerRoot=dirname(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wranglerRoot]}));
const {chromium}=createRequire(process.env.BLOOMOPS_PLAYWRIGHT_PACKAGE||'/tmp/bloomops-n2e-browser-tools/package.json')('playwright');
const tmp=mkdtempSync('/tmp/bloomops-n2e-browser-'),configPath=join(tmp,'wrangler.jsonc');
const artifacts=buildArtifacts(root);
const expected=process.env.BLOOMOPS_BUILD_IDENTITY?JSON.parse(readFileSync(process.env.BLOOMOPS_BUILD_IDENTITY,'utf8')):null;
if(expected)assert.deepEqual(artifacts,expected.files,'Completed build matches recorded artifacts');
const identity={root,startedAt:new Date().toISOString(),command:[process.execPath,...process.argv.slice(1)],pid:process.pid,port,entrypoint:join(root,'.open-next/worker.js'),wrapper:join(root,'scripts/navigation-perf-worker.mjs'),artifactDigest:hash(JSON.stringify(artifacts)),expectedRevision:expected?.revision||null};
writeFileSync(out+'/artifact-files.json',JSON.stringify(artifacts,null,2));
const source=JSON.parse(readFileSync(join(root,'wrangler.jsonc'),'utf8').replace(/^\s*\/\/.*$/gm,''));
assert.equal(source.vars.BLOOMOPS_ENV,'development');assert.equal(source.vars.BLOOMOPS_MAIL_TRANSPORT,'r2-dev');
const config={name:'bloomops-dev',main:join(root,'scripts/navigation-perf-worker.mjs'),compatibility_date:source.compatibility_date,compatibility_flags:source.compatibility_flags,
 assets:{directory:join(root,'.open-next/assets'),binding:'ASSETS'},vars:{BLOOMOPS_ENV:'development',BLOOMOPS_MAIL_TRANSPORT:'r2-dev',BLOOMOPS_APP_URL:base,PERF1_LOCAL_ONLY:'synthetic-local',PERF1_D1_DELAY_MS:'0'},
 d1_databases:[{binding:'DB',database_name:'n2e-disposable',database_id:'n2e-browser-isolated'}],r2_buckets:[{binding:'FILES',bucket_name:'n2e-browser-files'}],observability:{enabled:false}};
writeFileSync(configPath,JSON.stringify(config));
execFileSync(process.execPath,[join(wranglerRoot,'bin/wrangler.js'),'deploy','--dry-run','--no-autoconfig','--config',configPath,'--outdir',join(tmp,'bundle')],{cwd:root,env:{...process.env,WRANGLER_LOG:'error'},stdio:'pipe',maxBuffer:32*1024*1024});
const options=unstable_getMiniflareWorkerOptions(configPath).workerOptions;delete options.modulesRules;
const mf=new Miniflare(convertV4MiniflareOptions({...options,modules:true,script:readFileSync(join(tmp,'bundle/navigation-perf-worker.js'),'utf8'),host:'127.0.0.1',port,cf:false,logRequests:false}));
let browser;const checks=[],errors=[];const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('ok '+name);};
try{
 await mf.ready;identity.readyAt=new Date().toISOString();identity.processes=localProcesses();identity.bundle={path:join(tmp,'bundle/navigation-perf-worker.js'),sha256:hash(readFileSync(join(tmp,'bundle/navigation-perf-worker.js')))};identity.configuration=config;identity.version=await(await fetch(base+'/api/version')).json();if(expected)assert.equal(identity.version.sha,expected.revision.slice(0,7),'Served build revision');writeFileSync(out+'/artifact-identity.json',JSON.stringify(identity,null,2));
 const binding=await mf.getD1Database('DB'),bucket=await mf.getR2Bucket('FILES');
 const journal=JSON.parse(readFileSync(join(root,'drizzle/meta/_journal.json'),'utf8'));
 await binding.prepare('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TEXT)').run();
 for(const entry of journal.entries){for(const stmt of readFileSync(join(root,`drizzle/${entry.tag}.sql`),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await binding.prepare(stmt).run();await binding.prepare('INSERT INTO d1_migrations(name) VALUES(?)').bind(entry.tag+'.sql').run();}
 const t=await setup();for(const table of ['workspaces','user','workspace_memberships','bloomops_clients','client_contacts','departments','service_types','service_engagements','projects'])for(const row of all(t.raw,`SELECT * FROM ${table}`))await binding.prepare(`INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row)).run();t.raw.close();
 check('isolated built Worker is healthy', (await(await fetch(base+'/api/health')).json()).ok);
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 async function login(user){const ctx=await browser.newContext({viewport:{width:1440,height:1000}});await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());const email=user+'@example.com';assert.equal((await ctx.request.post(base+'/api/auth/sign-in/magic-link',{headers:{origin:base},data:{email,callbackURL:'/'}})).status(),200);
  const mail=await bucket.get('dev-mail/'+createHash('sha256').update(email).digest('hex')+'.json');assert.ok(mail);const url=JSON.parse(await mail.text()).text.match(/https?:\/\/\S+/)[0];const parsed=new URL(url);assert.ok(parsed.origin===base&&parsed.pathname==='/api/auth/magic-link/verify',`local auth host/path: ${parsed.host} ${parsed.pathname}`);
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url,{waitUntil:'networkidle'});return {ctx,page};}
 const owner=await login('ellen');
 identity.servedAssets=[];for(const url of await owner.page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.src))){const path=new URL(url).pathname,file=artifacts.find(f=>f.path==='.open-next/assets'+decodeURIComponent(path));assert.ok(file,'served script belongs to completed build');const response=await owner.ctx.request.get(url);assert.equal(response.status(),200);const sha256=hash(await response.body());assert.equal(sha256,file.sha256);identity.servedAssets.push({path,sha256});}
 assert.ok(identity.servedAssets.length);writeFileSync(out+'/artifact-identity.json',JSON.stringify(identity,null,2));
 if(!performanceOnly){
  const regression=await login('ary'),aryCookies=await regression.ctx.cookies(),ownerCookies=await owner.ctx.cookies();await regression.page.addInitScript(captureNotificationIntervals);
  await binding.prepare("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('m-ary-b','b','ary','admin','active')").run();
  await notificationPreferencesRegression({page:regression.page,base,check,selectUser:async user=>{await regression.ctx.clearCookies();await regression.ctx.addCookies(user==='owner'?ownerCookies:aryCookies);},selectWorkspace:async workspaceId=>{const result=await regression.ctx.request.post(base+'/api/bloomops/workspaces/select',{headers:{origin:base},data:{workspaceId}});assert.equal(result.status(),200);}});
  await regression.ctx.close();
 }
 if(!skipPerformance){
 // Matching read-only document navigation; server and browser timings kept separate.
 const performance=[];for(const width of [1440,390]){await owner.page.setViewportSize({width,height:1000});for(const [route,heading] of [['/','Home'],['/clients','Clients'],['/work','Work']]){
  const samples=[];for(let i=0;i<7;i++){const started=Date.now(),response=await owner.page.goto(base+route,{waitUntil:'networkidle'});assert.equal(response.status(),200);const body=await response.body();const metric=await(await owner.ctx.request.get(base+'/__perf1?id='+response.headers()['x-perf1-sample'])).json();assert.ok(metric);samples.push({elapsedMs:Date.now()-started,completeMs:metric.completeMs,statements:metric.statements,invocations:metric.invocations,depth:metric.depth,bytes:body.length});}
  performance.push({route,width,warmups:2,samples});}}
 // Reuse the repository's completed-content definition for actual SPA clicks.
 const clicks=[];await owner.page.setViewportSize({width:1440,height:1000});await owner.page.goto(base+'/systems',{waitUntil:'networkidle'});let clickAt;await owner.page.exposeFunction('n2eClick',at=>{clickAt=at;});
 for(let round=0;round<7;round++)for(const route of navigationRoutes('website').slice(0,3)){
  clickAt=null;await owner.page.evaluate(()=>document.addEventListener('click',()=>window.n2eClick(performance.timeOrigin+performance.now()),{capture:true,once:true}));
  const responsePromise=owner.page.waitForResponse(r=>new URL(r.url()).pathname===route.path&&['document','fetch'].includes(r.request().resourceType())&&!r.request().headers()['next-router-prefetch']);
  await owner.page.locator(`nav[aria-label="Main"] a[href="${route.path}"]`).filter({visible:true}).first().click();const response=await responsePromise;assert.equal(response.status(),200);const content=await completedContent(owner.page,route);assert.ok(clickAt);
  const metric=await(await owner.ctx.request.get(base+'/__perf1?id='+response.headers()['x-perf1-sample'])).json();assert.ok(metric.completeMs!==undefined);clicks.push({round,route:route.label,visibleMs:content.visibleAt-clickAt,renderedRows:content.renderedRows,completeMs:metric.completeMs,statements:metric.statements,invocations:metric.invocations,depth:metric.depth});
 }
 writeFileSync(out+'/performance.json',JSON.stringify({root,warmups:2,method:'matching built Worker; document navigation/networkidle and desktop navigation-perf completedContent SPA clicks; no injected latency',performance,clicks},null,2));
 }
 if(!performanceOnly&&!preferencesOnly){
 const ary=await login('ary'),james=await login('james'),sam=await login('sam');
 const api='/api/bloomops/notifications',discussion='/api/bloomops/discussions/project/website';
 const post=async(ctx,path,data)=>{const r=await ctx.request.post(base+path,{headers:{origin:base},data});return {status:r.status(),data:await r.json()};};
 const input=patch=>({workspaceId:'a',requestId:randomUUID(),threadId:null,body:'Synthetic notification QA',audience:'internal',mentions:[],...patch});
 const inbox=async ctx=>(await(await ctx.request.get(base+api)).json());
 const command=async(ctx,patch)=>post(ctx,api,{...(await inbox(ctx)).scope,...patch});
 const rootInput=input({mentions:['m-ary']});const rootMsg=await post(owner.ctx,discussion,rootInput);assert.equal(rootMsg.status,200);await post(owner.ctx,discussion,rootInput);
 check('real HTTP mention retry produces one delivery',(await inbox(ary.ctx)).items.length===1);
 await ary.page.goto(base+'/notifications',{waitUntil:'networkidle'});await ary.page.getByRole('heading',{name:'Notifications',exact:true}).waitFor();
 for(const width of [1440,1024,768,390,320]){await ary.page.setViewportSize({width,height:1000});check(`inbox ${width} no overflow`,await ary.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await ary.page.screenshot({path:out+`/inbox-${width}.png`,fullPage:true});}
 await ary.page.setViewportSize({width:1440,height:1000});await ary.page.getByRole('button',{name:/Mark read:/}).focus();await ary.page.keyboard.press('Enter');await ary.page.getByText('0 unread',{exact:true}).waitFor();check('keyboard marks read',true);await ary.page.getByRole('button',{name:/Mark unread:/}).click();await ary.page.getByText('1 unread',{exact:true}).waitFor();check('UI marks unread',true);
 let failMuteLoad=true;await ary.page.route('**/api/bloomops/notifications?settings=true&threadId=*',route=>{if(!failMuteLoad)return route.continue();failMuteLoad=false;return route.fulfill({status:503,contentType:'application/json',body:'{}'});});
 await ary.page.getByRole('button',{name:/ellen mentioned you/}).click();await ary.page.waitForURL('**/discussions/project/website?threadId=*');check('open independently authorized discussion',new URL(ary.page.url()).searchParams.get('threadId')===rootMsg.data.threadId);
 await ary.page.getByRole('button',{name:'Retry notification settings',exact:true}).click();await ary.page.getByRole('button',{name:'Mute thread',exact:true}).click();check('thread settings recover from initial failure',true);await ary.page.getByRole('button',{name:'Unmute thread',exact:true}).waitFor();await post(owner.ctx,discussion,input({threadId:rootMsg.data.threadId,mentions:['m-ary']}));check('UI mute suppresses mention',(await inbox(ary.ctx)).items.length===1);
 await ary.page.getByRole('button',{name:'Unmute thread',exact:true}).click();await ary.page.getByRole('button',{name:'Mute thread',exact:true}).waitFor();
 await post(ary.ctx,discussion,input({threadId:rootMsg.data.threadId}));check('prior author reply notification',(await inbox(owner.ctx)).items.length===1);
 await ary.page.goto(base+'/notifications',{waitUntil:'networkidle'});await ary.page.getByRole('button',{name:'Preferences',exact:true}).click();await ary.page.getByRole('checkbox',{name:'Mentions',exact:true}).click();await ary.page.getByText('Preference saved.',{exact:true}).waitFor();check('preference reflects confirmed server state',!await ary.page.getByRole('checkbox',{name:'Mentions',exact:true}).isChecked());await post(owner.ctx,discussion,input({threadId:rootMsg.data.threadId,mentions:['m-ary']}));check('enabled reply wins when mentions disabled',(await inbox(ary.ctx)).items.some(n=>n.category==='replies'));
 await ary.page.getByRole('button',{name:'Refresh',exact:true}).click();await ary.page.getByText('1 unread',{exact:true}).waitFor();await ary.page.getByRole('button',{name:'Mark all read',exact:true}).click();await ary.page.getByText('0 unread',{exact:true}).waitFor();check('UI mark-all read',true);
 const task=await post(owner.ctx,'/api/bloomops/projects/website/actions',{requestId:randomUUID(),title:'Notification browser task',assigneeMembershipId:'m-sam'});check('actual task create endpoint',task.status===200||task.status===201);check('actual assignment appears in assignee inbox',(await inbox(sam.ctx)).items.some(n=>n.category==='assignments'));
 const taskNotice=(await inbox(sam.ctx)).items.find(n=>n.category==='assignments');const taskOpen=await command(sam.ctx,{action:'open',id:taskNotice.id});check('assignment opens authorized canonical task',taskOpen.status===200&&(await sam.ctx.request.get(base+taskOpen.data.href)).status()===200);
 const reassigned=await owner.ctx.request.patch(base+'/api/bloomops/actions/'+taskNotice.targetId,{headers:{origin:base},data:{expectedRevision:1,assigneeMembershipId:'m-other'}});assert.equal(reassigned.status(),200);check('reassignment hides removed assignee history',(await inbox(sam.ctx)).items.length===0);check('removed assignee stale link is denied',(await command(sam.ctx,{action:'open',id:taskNotice.id})).status===404&&(await sam.ctx.request.get(base+taskOpen.data.href)).status()===404);
 const tree=async()=>(await(await owner.ctx.request.get(base+'/api/bloomops/pages/tree')).json());
 const createPage=async parentId=>{const r=await post(owner.ctx,'/api/bloomops/pages',{workspaceId:'a',requestId:randomUUID(),parentId,expectedTreeRevision:(await tree()).revision});assert.equal(r.status,201);return r.data.id;};
 const pageRoot=await createPage(null),pageChild=await createPage(pageRoot);
 const share=async(id,permission)=>{const r=await owner.ctx.request.put(base+`/api/bloomops/pages/${id}/sharing`,{headers:{origin:base},data:{workspaceId:'a',expectedTreeRevision:(await tree()).revision,kind:'grant',membershipId:'m-james',permission}});assert.equal(r.status(),200);};
 await share(pageRoot,'comment');const pageApi=`/api/bloomops/pages/${pageChild}/comments`,pageFirst={workspaceId:'a',requestId:randomUUID(),threadId:null,expectedRevision:null,body:'Synthetic Page question'};
 assert.equal((await post(james.ctx,pageApi,pageFirst)).status,200);const pageReply={...pageFirst,requestId:randomUUID(),threadId:pageFirst.requestId,expectedRevision:1,body:'Synthetic Page answer'};assert.equal((await post(owner.ctx,pageApi,pageReply)).status,200);await post(owner.ctx,pageApi,pageReply);
 const pageNotice=(await inbox(james.ctx)).items.find(n=>n.type==='page');check('Page inherited permission and retry deliver one reply',!!pageNotice&&(await inbox(james.ctx)).items.length===1);
 await james.page.goto(base+'/portal/notifications',{waitUntil:'networkidle'});await james.page.getByRole('button',{name:/replied to your conversation/}).click();await james.page.waitForURL(`**/portal/pages/${pageChild}?discussion=*`);await james.page.getByRole('dialog').waitFor();await james.page.getByText('Synthetic Page answer',{exact:true}).waitFor();check('Page destination opens exact discussion',true);
 await james.page.getByRole('button',{name:'Mute thread',exact:true}).click();await james.page.getByRole('button',{name:'Unmute thread',exact:true}).waitFor();await post(owner.ctx,pageApi,{...pageReply,requestId:randomUUID(),expectedRevision:2});check('Page UI mute suppresses later replies',(await inbox(james.ctx)).items.length===1);
 await james.page.keyboard.press('Escape');check('Page dialog closes by keyboard',await james.page.getByRole('dialog').count()===0);await share(pageChild,'none');check('Page explicit deny removes inherited inbox delivery',(await inbox(james.ctx)).items.length===0);check('Page stale open reauthorizes',(await command(james.ctx,{action:'open',id:pageNotice.id})).status===404);check('Page stale destination denies access',(await james.ctx.request.get(base+pageNotice.href)).status()===404);
 const shared=await post(owner.ctx,discussion,input({audience:'client',mentions:['m-james']}));assert.equal(shared.status,200);await james.page.goto(base+'/portal/notifications',{waitUntil:'networkidle'});await james.page.getByRole('heading',{name:'Notifications',exact:true}).waitFor();const sharedId=(await inbox(james.ctx)).items[0].id;check('Client inbox receives only shared discussion',(await inbox(james.ctx)).items.length===1);
 await binding.prepare("UPDATE projects SET visibility='internal' WHERE id='website'").run();await james.page.getByRole('button',{name:'Refresh',exact:true}).click();await james.page.getByText('No notifications yet',{exact:true}).waitFor();check('revocation clears visible inbox and count',(await inbox(james.ctx)).unread===0);check('old open fails after revocation',(await command(james.ctx,{action:'open',id:sharedId})).status===404);
 check('foreign origin write refused',(await ary.ctx.request.post(base+api,{headers:{origin:'https://foreign.invalid'},data:{action:'markAll'}})).status()===403);
 check('query cannot select another recipient',(await ary.ctx.request.get(base+api+'?userId=james')).status()===400);check('duplicate query is rejected',(await ary.ctx.request.get(base+api+'?page=1&page=2')).status()===400);
 let releaseRead;const heldRead=new Promise(resolve=>{releaseRead=resolve;});await ary.page.route('**/api/bloomops/notifications?category=*',async route=>{await heldRead;await route.continue();});await ary.page.getByRole('button',{name:'Refresh',exact:true}).click();await ary.page.getByText('Updating…',{exact:true}).waitFor();check('loading preserves current rows',await ary.page.getByRole('button',{name:/replied to your conversation/}).count()>0);releaseRead();await ary.page.getByRole('button',{name:'Refresh',exact:true}).waitFor();await ary.page.unroute('**/api/bloomops/notifications?category=*');
 const phone=await browser.newContext({storageState:await ary.ctx.storageState(),viewport:{width:390,height:844},isMobile:true,hasTouch:true});await phone.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());const phonePage=await phone.newPage();phonePage.on('pageerror',e=>errors.push(e.message));await phonePage.goto(base+'/notifications',{waitUntil:'networkidle'});await phonePage.getByRole('button',{name:'Unread',exact:true}).tap();await phonePage.getByText('You’re all caught up',{exact:true}).waitFor();check('touch unread filter and empty state',true);const target=await phonePage.getByRole('button',{name:'Refresh',exact:true}).boundingBox();check('phone primary control has 44px touch height',target.height>=44);await phone.close();
 await ary.page.route('**/api/bloomops/notifications?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic retry check'})}));await ary.page.getByRole('button',{name:'Refresh',exact:true}).click();await ary.page.getByRole('alert').filter({hasText:'Synthetic retry check'}).waitFor();check('read error has a retry control',await ary.page.getByRole('button',{name:'Refresh',exact:true}).isEnabled());await ary.page.unroute('**/api/bloomops/notifications?*');
 }
 check('browser has no runtime errors',errors.length===0);writeFileSync(out+'/results.json',JSON.stringify({checks,errors},null,2));
}catch(error){writeFileSync(out+'/results.json',JSON.stringify({checks,errors,failure:error.message},null,2));console.error(String(error.message).replace(/https?:\/\/\S*magic-link\S*/g,'[local auth URL]'));process.exitCode=1;}finally{identity.finishedAt=new Date().toISOString();identity.artifactsUnchanged=hash(JSON.stringify(buildArtifacts(root)))===identity.artifactDigest;writeFileSync(out+'/artifact-identity.json',JSON.stringify(identity,null,2));if(!identity.artifactsUnchanged)process.exitCode=1;await browser?.close();await mf.dispose();}
