import {pilotFeedbackChecks} from './pilot-feedback-checks.mjs';
// UI refinement: actual layout, navigation timing and editor checks over an isolated completed Worker.
// Starts its own built Worker, in-memory D1/R2 and synthetic identities. No .dev.vars.
import assert from 'node:assert/strict';
import {qaRestrictedSidebar,qaOperationalLayout} from './app-qa-checks.mjs';
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
const root=resolve(process.env.BLOOMOPS_UI_BUILD_ROOT||fileURLToPath(new URL('../',import.meta.url)));
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
let browser,zoomBrowser;const checks=[],errors=[];const check=(name,ok)=>{assert.ok(ok,name);checks.push(name);console.log('ok '+name);};
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
 async function login(user,suppliedContext=null){const ctx=suppliedContext||await browser.newContext({viewport:{width:1440,height:1000}});await ctx.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());const email=user+'@example.com';assert.equal((await ctx.request.post(base+'/api/auth/sign-in/magic-link',{headers:{origin:base},data:{email,callbackURL:'/'}})).status(),200);
  const mail=await bucket.get('dev-mail/'+createHash('sha256').update(email).digest('hex')+'.json');assert.ok(mail);const url=JSON.parse(await mail.text()).text.match(/https?:\/\/\S+/)[0];const parsed=new URL(url);assert.ok(parsed.origin===base&&parsed.pathname==='/api/auth/magic-link/verify',`local auth host/path: ${parsed.host} ${parsed.pathname}`);
  const page=await ctx.newPage();page.on('pageerror',e=>errors.push(reportBrowserError(e)));await page.goto(url,{waitUntil:'networkidle'});return {ctx,page};}
 const owner=await login('ellen');
 await pilotFeedbackChecks({page:owner.page,ctx:owner.ctx,base,check,out});
 check('No runtime errors',errors.length===0);writeFileSync(out+'/results.json',JSON.stringify({checks,errors},null,2));
}catch(error){console.error(reportBrowserError(error));writeFileSync(out+'/failure.json',JSON.stringify({checks,errors,failure:reportBrowserError(error)},null,2));process.exitCode=1;}finally{identity.finishedAt=new Date().toISOString();identity.artifactsUnchanged=hash(JSON.stringify(buildArtifacts(root)))===identity.artifactDigest;writeFileSync(out+'/artifact-identity.json',JSON.stringify(identity,null,2));if(!identity.artifactsUnchanged)process.exitCode=1;await zoomBrowser?.close();await browser?.close();await mf.dispose();rmSync(tmp,{recursive:true,force:true});}
