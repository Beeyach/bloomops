#!/usr/bin/env node
// Serves the built Worker with disposable Overview data and blocks provider egress.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
const root=resolve(new URL('..',import.meta.url).pathname),evidence=resolve(process.argv[2]),require=createRequire(root+'/package.json'),wranglerRoot=dirname(require.resolve('wrangler/package.json')),fixture=JSON.parse(readFileSync(join(evidence,'browser-fixture.json'))),providerLog=join(evidence,'provider-log.json');let mf,temp;
try{
 const config=unstable(),options=config.workerOptions;Object.assign(options.bindings,{BLOOMOPS_APP_URL:'http://localhost:8788',BLOOMOPS_AUTH_SECRET:'overview-synthetic-auth-secret-0123456789',BLOOMOPS_GOOGLE_CONNECT_ENABLED:'true',BLOOMOPS_GOOGLE_CLIENT_ID:'synthetic.apps.googleusercontent.com',BLOOMOPS_GOOGLE_CLIENT_SECRET:'synthetic-secret',BLOOMOPS_GOOGLE_TOKEN_KEY:'12'.repeat(32),PERF1_LOCAL_ONLY:'synthetic-local',PERF1_D1_DELAY_MS:'0'});options.d1Databases.DB.id='bloomops-p3c1-isolated';options.r2Buckets.FILES.id='bloomops-files-p3c1-isolated';
 temp=mkdtempSync(join(tmpdir(),'bloomops-overview-preview-'));execFileSync(process.execPath,[join(wranglerRoot,'bin/wrangler.js'),'deploy','scripts/navigation-perf-worker.mjs','--dry-run','--no-autoconfig','--config',join(root,'wrangler.jsonc'),'--outdir',temp],{cwd:root,env:{...process.env,WRANGLER_LOG:'error'},stdio:'pipe'});delete options.modulesRules;
 const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wranglerRoot]}));mf=new Miniflare(convertV4MiniflareOptions({...options,name:'bloomops-overview-local',modules:true,script:readFileSync(join(temp,'navigation-perf-worker.js'),'utf8'),host:'127.0.0.1',port:8788,cf:false,logRequests:false,resourcePersistencePath:join(evidence,'isolated/.wrangler/state/v3'),outboundService:async request=>{const rows=JSON.parse(readFileSync(providerLog));rows.push(new URL(request.url).hostname);writeFileSync(providerLog,JSON.stringify(rows));return new Response(null,{status:403});}}));await mf.ready;console.log('Prospecting Overview isolated Worker ready on 8788 for '+fixture.workspaceId+'.');await new Promise(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
}finally{await mf?.dispose();if(temp)rmSync(temp,{recursive:true,force:true});}
function unstable(){const {unstable_getMiniflareWorkerOptions}=require('wrangler');return unstable_getMiniflareWorkerOptions(join(root,'wrangler.jsonc'));}
