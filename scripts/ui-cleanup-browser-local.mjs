// UI refinement: actual layout, navigation timing and editor checks over an isolated completed Worker.
// Starts its own built Worker, in-memory D1/R2 and synthetic identities. No .dev.vars.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {buildArtifacts,hash,localProcesses} from './notification-build-evidence.mjs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {unstable_getMiniflareWorkerOptions} from 'wrangler';
import {runBootstrap} from '../lib/bloomops/bootstrap.mjs';
import {reportBrowserError} from './client-reports-evidence.mjs';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const out=resolve(process.env.BLOOMOPS_BROWSER_EVIDENCE_DIR||'/tmp/bloomops-ui-verification/browser');mkdirSync(out,{recursive:true});
const port=await new Promise((resolve,reject)=>{const socket=createServer();socket.once('error',reject);socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const base=`http://localhost:${port}`;
const require=createRequire(import.meta.url),wranglerRoot=dirname(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wranglerRoot]}));
const {chromium}=createRequire(process.env.BLOOMOPS_PLAYWRIGHT_PACKAGE||'/tmp/bloomops-n2e-browser-tools/package.json')('playwright');
const tmp=mkdtempSync(join(tmpdir(),'bloomops-ui-browser-')),configPath=join(tmp,'wrangler.jsonc');
const artifacts=buildArtifacts(root);
const expected=process.env.BLOOMOPS_BUILD_IDENTITY?JSON.parse(readFileSync(process.env.BLOOMOPS_BUILD_IDENTITY,'utf8')):null;
if(expected)assert.deepEqual(artifacts,expected.files,'Completed build matches recorded artifacts');
const identity={root,startedAt:new Date().toISOString(),command:[process.execPath,...process.argv.slice(1)],pid:process.pid,port,entrypoint:join(root,'.open-next/worker.js'),wrapper:join(root,'scripts/navigation-perf-worker.mjs'),artifactDigest:hash(JSON.stringify(artifacts)),expectedRevision:expected?.revision||null};
writeFileSync(out+'/artifact-files.json',JSON.stringify(artifacts,null,2));
const source=JSON.parse(readFileSync(join(root,'wrangler.jsonc'),'utf8').replace(/^\s*\/\/.*$/gm,''));
assert.equal(source.vars.BLOOMOPS_ENV,'development');assert.equal(source.vars.BLOOMOPS_MAIL_TRANSPORT,'r2-dev');
const config={name:'bloomops-dev',main:join(root,'scripts/navigation-perf-worker.mjs'),compatibility_date:source.compatibility_date,compatibility_flags:source.compatibility_flags,
 assets:{directory:join(root,'.open-next/assets'),binding:'ASSETS'},vars:{BLOOMOPS_ENV:'development',BLOOMOPS_MAIL_TRANSPORT:'r2-dev',BLOOMOPS_APP_URL:base,PERF1_LOCAL_ONLY:'synthetic-local',PERF1_D1_DELAY_MS:'10'},
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
 await runBootstrap(binding,{workspaceName:'Finance Synthetic QA',workspaceSlug:'n3a-qa',owner:{email:'ellen@example.com',name:'QA Owner'},admin:{email:'ary@example.com',name:'QA Admin'}},{ids:{workspaceId:'a',ownerUserId:'ellen',ownerMembershipId:'m-ellen',adminUserId:'ary',adminMembershipId:'m-ary'}});
 await runBootstrap(binding,{workspaceName:'Finance Other QA',workspaceSlug:'n3a-other',owner:{email:'foreign@example.com',name:'Other Owner'},admin:{email:'other-admin@example.com',name:'Other Admin'}},{ids:{workspaceId:'b',ownerUserId:'foreign',ownerMembershipId:'m-foreign'}});
 // WSL hosts with a failing software GL process can disable that optional
 // rasterizer. DOM interaction, actionability and screenshot assertions remain.
 browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-gpu',...(process.env.BLOOMOPS_DISABLE_SOFTWARE_RASTERIZER==='1'?['--disable-software-rasterizer']:[])]});
 async function login(user){const ctx=await browser.newContext({viewport:{width:1440,height:1000}});await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());const email=user+'@example.com';assert.equal((await ctx.request.post(base+'/api/auth/sign-in/magic-link',{headers:{origin:base},data:{email,callbackURL:'/'}})).status(),200);
  const mail=await bucket.get('dev-mail/'+createHash('sha256').update(email).digest('hex')+'.json');assert.ok(mail);const url=JSON.parse(await mail.text()).text.match(/https?:\/\/\S+/)[0];const parsed=new URL(url);assert.ok(parsed.origin===base&&parsed.pathname==='/api/auth/magic-link/verify',`local auth host/path: ${parsed.host} ${parsed.pathname}`);
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(reportBrowserError(e)));await page.goto(url,{waitUntil:'networkidle'});return {ctx,page};}
 const owner=await login('ellen');
 identity.servedAssets=[];for(const url of await owner.page.locator('script[src]').evaluateAll(nodes=>nodes.map(n=>n.src))){const path=new URL(url).pathname,file=artifacts.find(f=>f.path==='.open-next/assets'+decodeURIComponent(path));assert.ok(file,'served script belongs to completed build');const response=await owner.ctx.request.get(url);assert.equal(response.status(),200);const sha256=hash(await response.body());assert.equal(sha256,file.sha256);identity.servedAssets.push({path,sha256});}
 assert.ok(identity.servedAssets.length);writeFileSync(out+'/artifact-identity.json',JSON.stringify(identity,null,2));

 const page=owner.page;page.setDefaultTimeout(20000);
 const post=async(path,data)=>{const r=await owner.ctx.request.post(base+path,{headers:{origin:base},data});return {status:r.status(),data:await r.json()};};
 const workspace=await post('/api/bloomops/workspaces',{name:'UI Synthetic Prospecting',requestId:randomUUID(),sourceWorkspaceId:'a'});assert.equal(workspace.status,201);
 const workspaceId=workspace.data.workspaceId;assert.equal((await post('/api/bloomops/workspaces/select',{workspaceId})).status,200);
 const timings=[];
 for(const population of ['empty','populated']){
  if(population==='populated')for(let i=0;i<25;i++){const r=await post('/api/bloomops/prospecting',{workspaceId,requestId:randomUUID(),fields:{businessName:'Synthetic garden studio '+i,website:'https://example.invalid',personName:'QA contact',platform:'GoHighLevel'}});assert.equal(r.status,201);}
  for(let i=0;i<4;i++){
   await page.goto(base+'/',{waitUntil:'networkidle'});
   const samples=[];const responseListener=async r=>{if(!r.url().startsWith(base))return;const key=r.headers()['x-perf1-sample'];if(key&&(/prospecting/.test(r.url())))samples.push({path:new URL(r.url()).pathname,id:key});};page.on('response',responseListener);
   await page.evaluate(()=>{performance.clearResourceTimings();window.__uiStart=performance.now();window.__uiFeedback=null;window.__uiReady=null;window.__uiObserver=new MutationObserver(()=>{if(window.__uiFeedback===null&&document.querySelector('.bo-sheet-skeleton,.bo-sheet'))window.__uiFeedback=performance.now()-window.__uiStart;if(document.querySelector('.bo-sheet-scroll[aria-busy="false"]')){window.__uiReady=performance.now()-window.__uiStart;window.__uiObserver.disconnect();}});window.__uiObserver.observe(document.body,{subtree:true,childList:true,attributes:true});});
   await page.locator('nav[aria-label="Main"]').getByRole('link',{name:'Prospecting',exact:true}).click();
   await page.waitForFunction(()=>window.__uiReady!==null);await page.waitForLoadState('networkidle');page.off('response',responseListener);
   const timing=await page.evaluate(()=>({feedbackMs:window.__uiFeedback,usableMs:window.__uiReady,resources:performance.getEntriesByType('resource').filter(r=>r.name.includes('/prospecting')||r.initiatorType==='script').map(r=>({path:new URL(r.name).pathname,startMs:r.startTime-window.__uiStart,durationMs:r.duration,ttfbMs:r.responseStart-r.requestStart}))}));
   for(const sample of samples)sample.detail=await(await owner.ctx.request.get(base+'/__perf1?id='+sample.id)).json();timings.push({population,iteration:i,...timing,samples});
  }
  for(const width of [1440,1280,1024,768,390]){await page.setViewportSize({width,height:1000});await page.screenshot({path:out+'/prospecting-'+population+'-'+width+'.png',fullPage:true});check('Prospecting '+population+' fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:1440,height:1000});
 }

 writeFileSync(out+'/timings.json',JSON.stringify(timings,null,2));
 // Distinct empty/filter recovery with real stored rows.
 await page.goto(base+'/prospecting?q=unmatched-synthetic-name',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'No prospects match these filters',exact:true}).waitFor();
 check('filtered empty results do not expose an empty selection checkbox',await page.getByRole('checkbox',{name:'Select current page',exact:true}).count()===0);
 await page.locator('.bo-sheet-empty').getByRole('button',{name:'Clear filters',exact:true}).click();await page.locator('tbody tr').first().waitFor();check('Clear filters restores existing records',await page.locator('tbody tr').count()===25);
 for(const route of ['/prospecting/skills','/prospecting/skills/audit']){await page.goto(base+route,{waitUntil:'networkidle'});for(const width of [1440,768,390]){await page.setViewportSize({width,height:1000});check(route+' fits '+width,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/'+route.replaceAll('/','-')+'-'+width+'.png',fullPage:true});}}
 await page.setViewportSize({width:1440,height:1000});await post('/api/bloomops/workspaces/select',{workspaceId:'a'});await page.goto(base+'/',{waitUntil:'networkidle'});
 const client=await post('/api/bloomops/clients',{name:'Synthetic client with a long name for layout review',contactName:'QA contact',contactEmail:'portal@example.test',timezone:'Australia/Sydney',requestId:randomUUID(),workspaceId:'a',userId:'ellen'});assert.equal(client.status,201,JSON.stringify(client.data));const clientId=client.data.client.id;
 const serviceType=await binding.prepare("SELECT id FROM service_types WHERE workspace_id='a' AND slug='ghl'").first();const service=await post(`/api/bloomops/clients/${clientId}/services`,{serviceTypeId:serviceType.id,packageName:'QA Systems service'});assert.equal(service.status,201,JSON.stringify(service.data));
 const project=await post(`/api/bloomops/clients/${clientId}/projects`,{name:'Synthetic delivery project with a long name that must wrap without hiding its metadata',serviceEngagementId:service.data.service.id});assert.equal(project.status,201,JSON.stringify(project.data));
 await page.goto(base+'/pages',{waitUntil:'networkidle'});await page.getByRole('button',{name:'New page',exact:true}).click();await page.waitForURL(u=>/^\/pages\/[0-9a-f-]+$/.test(u.pathname));const pagePath=new URL(page.url()).pathname;
 const writingSaved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/bloomops'+pagePath&&r.request().method()==='PUT'&&r.status()===200&&r.request().postDataJSON()?.body?.includes('Saved writing remains editable'));await page.getByRole('textbox',{name:'Page title',exact:true}).fill('Synthetic UI writing workspace');await page.locator('.ProseMirror').fill('Saved writing remains editable during the UI refinement.');await page.getByRole('textbox',{name:'Page title',exact:true}).focus();await writingSaved;await page.getByText('Saved',{exact:true}).waitFor();await page.reload({waitUntil:'networkidle'});await page.locator('.ProseMirror').waitFor();check('Page writing and title persist through the actual editor',await page.getByRole('textbox',{name:'Page title',exact:true}).inputValue()==='Synthetic UI writing workspace'&&await page.locator('.ProseMirror').innerText()==='Saved writing remains editable during the UI refinement.');
 await page.getByText('Page tools: templates and record context',{exact:true}).focus();await page.keyboard.press('Enter');check('Page tools open with keyboard',await page.getByRole('button',{name:'Edit record context',exact:true}).isVisible());await page.getByText('Page tools: templates and record context',{exact:true}).click();
 const layouts=[];
 for(const route of ['/work?tab=projects','/systems','/social','/ads','/team','/finance','/settings',pagePath]){
  await page.goto(base+route,{waitUntil:'networkidle'});
  for(const width of [1440,1280,1024,768,390]){await page.setViewportSize({width,height:1000});
   const dimensions=await page.evaluate(()=>({documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,tabs:[...document.querySelectorAll('.bo-tab-strip')].map(e=>({height:e.clientHeight,scrollHeight:e.scrollHeight,width:e.clientWidth,scrollWidth:e.scrollWidth})),fonts:[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family)}));
   check(route+' no page overflow at '+width,dimensions.documentWidth<=width);check(route+' no vertical tab overflow at '+width,dimensions.tabs.every(t=>t.scrollHeight<=t.height));layouts.push({route,width,...dimensions});
   await page.screenshot({path:out+'/'+(route===pagePath?'page-editor':route.slice(1).replaceAll('?','-').replaceAll('=','-'))+'-'+width+'.png',fullPage:true});
  }
 }
 writeFileSync(out+'/layouts.json',JSON.stringify(layouts,null,2));
 check('no browser runtime errors',errors.length===0);writeFileSync(out+'/results.json',JSON.stringify({checks,errors,timings},null,2));
}catch(error){console.error(reportBrowserError(error));writeFileSync(out+'/failure.json',JSON.stringify({checks,errors,failure:reportBrowserError(error)},null,2));process.exitCode=1;}finally{identity.finishedAt=new Date().toISOString();identity.artifactsUnchanged=hash(JSON.stringify(buildArtifacts(root)))===identity.artifactDigest;writeFileSync(out+'/artifact-identity.json',JSON.stringify(identity,null,2));if(!identity.artifactsUnchanged)process.exitCode=1;await browser?.close();await mf.dispose();rmSync(tmp,{recursive:true,force:true});}
