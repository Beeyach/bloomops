#!/usr/bin/env node
// Disposable workerd/D1 verification. No deployment, live bindings or network.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync,readFileSync,rmSync,writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname,join } from 'node:path';
import { randomBytes,createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { unstable_getMiniflareWorkerOptions } from 'wrangler';
import { activeFixture } from './perf4-active-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url);
const wranglerRoot=dirname(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions,Log,LogLevel}=require(require.resolve('miniflare',{paths:[wranglerRoot]}));
const args=process.argv.slice(2);
assert.ok(args.length===0||(args.length===2&&args[0]==='--out'&&args[1]),'usage: --out evidence.json');
const temp=mkdtempSync(join(tmpdir(),'bloomops-perf4-active-'));
let mf, networkAttempts=0;
try {
  const sourceConfig=JSON.parse(readFileSync(join(root,'wrangler.jsonc'),'utf8').replace(/^\s*\/\/.*$/gm,''));
  assert.equal(sourceConfig.main,'worker.mjs');
  assert.deepEqual(sourceConfig.observability,{enabled:false,logs:{enabled:false,invocation_logs:false},traces:{enabled:false}});
  const localConfig=join(temp,'wrangler.json');
  writeFileSync(localConfig,JSON.stringify({name:'bloomops-perf4-active-local',
    main:join(root,'worker.mjs'),compatibility_date:sourceConfig.compatibility_date,
    compatibility_flags:sourceConfig.compatibility_flags,
    assets:{directory:join(root,'.open-next/assets'),binding:'ASSETS'},
    observability:{enabled:false,logs:{enabled:false,invocation_logs:false},traces:{enabled:false}},
    d1_databases:[{binding:'DB',database_name:'perf4-disposable-local',database_id:'perf4-disposable-local'}]}));
  const config=unstable_getMiniflareWorkerOptions(localConfig);
  assert.equal(config.externalWorkers.length,0);
  execFileSync(process.execPath,[join(wranglerRoot,'bin/wrangler.js'),'deploy',join(root,'scripts/perf4-active-worker.mjs'),'--dry-run','--no-autoconfig','--config',localConfig,'--outdir',temp],
    {cwd:temp,env:{...process.env,WRANGLER_LOG:'error',WRANGLER_SEND_METRICS:'false'},stdio:'pipe'});
  const options=config.workerOptions;
  delete options.modulesRules;
  mf=new Miniflare(convertV4MiniflareOptions({...options,name:'bloomops-perf4-active-local',modules:true,
    script:readFileSync(join(temp,'perf4-active-worker.js'),'utf8'),cf:false,logRequests:false,log:new Log(LogLevel.NONE),
    resourcePersistencePath:join(temp,'state'),
    d1Databases:{DB:'perf4-disposable-local'},r2Buckets:{FILES:'perf4-disposable-files'},
    bindings:{PERF4_LOCAL_ONLY:'disposable',BLOOMOPS_AUTH_SECRET:randomBytes(32).toString('hex')},
    outboundService:()=>{networkAttempts++;return new Response(null,{status:503});}}));
  const db=await mf.getD1Database('DB');
  const journal=JSON.parse(readFileSync(join(root,'drizzle/meta/_journal.json')));
  for(const {tag}of journal.entries)for(const sql of readFileSync(join(root,`drizzle/${tag}.sql`),'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean))await db.prepare(sql).run();
  async function control(command) {
    const response=await mf.dispatchFetch('http://localhost/__perf4',{method:'POST',body:JSON.stringify(command)});
    const result=await response.json();assert.equal(response.status,200,result.code||'control');return result;
  }

  const fixtures=[];
  for(const scale of ['representative','stress']) {
    const f=activeFixture(scale);
    for(let i=0;i<f.statements.length;i+=75)await db.batch(f.statements.slice(i,i+75).map(sql=>db.prepare(sql)));
    for(const [table,key] of [['bloomops_clients','clients'],['projects','projects'],['milestones','milestones'],['actions','actions'],['deliverables','deliverables'],['content_items','content'],['assets','files'],['project_assignments','projectAssignments']]) {
      const row=await db.prepare(`SELECT count(*) n FROM ${table} WHERE workspace_id=?`).bind(f.ws).first();
      assert.equal(row.n,f.counts[key],'fixture-count');
    }
    await control({op:'init',scale,members:f.members,ws:f.ws});
    fixtures.push({scale,counts:f.counts});
  }
  const checks={};
  for(const op of ['gates','concurrency','revocation','streams']) {
    checks[op]=await control({op});
    console.log(`${op}: ${checks[op].checks} scenarios passed`);
  }
  const rounds=44,warmups=4,rows=[],correlationIds=new Set();
  const byteLength=value=>Buffer.byteLength(value);
  for(const scale of ['representative','stress']) for(let cycle=0;cycle<rounds;cycle++) for(const route of ['home','systems','ads']) {
    for(const enabled of cycle%2?[true,false]:[false,true]) {
      const start=performance.now();
      const response=await mf.dispatchFetch('http://localhost/__perf4',{method:'POST',body:JSON.stringify({op:'forward',options:{scale,route,enabled}})});
      const responseMs=performance.now()-start;
      const reader=response.body.getReader();let bodyBytes=0,chunks=0,firstMs;
      while(true){const part=await reader.read();if(part.done)break;firstMs??=performance.now()-start;bodyBytes+=part.value.byteLength;chunks++;}
      const eofMs=performance.now()-start;
      assert.equal(response.status,200,'paired-request-status');
      assert.ok(response.headers.get('cache-control').includes('no-store'));
      const id=response.headers.get('x-bloomops-timing');
      assert.equal(!!id,enabled,'paired-activation');
      if(id){assert.ok(!correlationIds.has(id),'unique-correlation-id');correlationIds.add(id);}
      const timing=response.headers.get('server-timing');
      assert.ok(!timing||!/(?:first|total|elapsed|unattributed);/.test(timing),'initial-header-only');
      const headerBytes=[...response.headers].reduce((n,[k,v])=>n+byteLength(k+': '+v+'\r\n'),0);
      const timingHeaderBytes=enabled?byteLength('x-bloomops-timing: '+id+'\r\nserver-timing: '+timing+'\r\n'):0;
      const points=enabled?(await control({op:'take',id,route})).points:[];
      rows.push({scale,cycle,route,enabled,responseMs,firstMs,eofMs,headerBytes,timingHeaderBytes,bodyBytes,chunks,sinkPoints:points.length,points});
    }
  }
  const distribution=values=>{
    const a=[...values].sort((a,b)=>a-b),n=a.length,round=x=>Number(x.toFixed(3));
    return {n,median:round(n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2),min:round(a[0]),p95:round(a[Math.ceil(n*.95)-1]),max:round(a[n-1])};
  };
  const summary=[];
  for(const scale of ['representative','stress'])for(const route of ['home','systems','ads']) {
    const selected=rows.filter(r=>r.scale===scale&&r.route===route&&r.cycle>=warmups);
    const off=selected.filter(r=>!r.enabled),on=selected.filter(r=>r.enabled);
    const result={scale,route,off:{},on:{},pairedDelta:{}};
    for(const key of ['responseMs','firstMs','eofMs','headerBytes','timingHeaderBytes','bodyBytes','sinkPoints']) {
      result.off[key]=distribution(off.map(r=>r[key]));result.on[key]=distribution(on.map(r=>r[key]));
      result.pairedDelta[key]=distribution(on.map(r=>r[key]-off.find(o=>o.cycle===r.cycle)[key]));
    }
    summary.push(result);
  }
  const state=await control({op:'capture-state'});
  assert.equal(state.pending,0,'no-missing-or-duplicate-completions');
  assert.equal(state.consoleLeaks,0,'no-console-markers');
  assert.equal(state.consoleCalls,0,'no-console-calls');
  assert.equal(networkAttempts,0,'no-external-network');
  assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0,'fixture-foreign-keys');
  const sourcePaths=['worker.mjs','lib/bloomops/perf4-worker.mjs','lib/bloomops/server-timing.mjs','wrangler.jsonc',
    'scripts/perf4-active-local.mjs','scripts/perf4-active-worker.mjs','scripts/perf4-active-fixture.mjs'];
  const evidence={kind:'PERF4-active-built-workerd',startingSha:'623e3041d3af14ddfaab4dcd337ce9ae95454b11',
    node:process.versions.node,sourceSha256:Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(join(root,p))).digest('hex')])),
    compatibilityDate:sourceConfig.compatibility_date,compatibilityFlags:sourceConfig.compatibility_flags,
    miniflare:require(require.resolve('miniflare/package.json',{paths:[wranglerRoot]})).version,
    builtWorkerSha256:createHash('sha256').update(readFileSync(join(root,'.open-next/worker.js'))).digest('hex'),
    bundledHarnessSha256:createHash('sha256').update(readFileSync(join(temp,'perf4-active-worker.js'))).digest('hex'),
    fixtures,checks,rounds,warmups,retained:rows.filter(r=>r.cycle>=warmups).length,total:rows.length,
    method:'Paired alternating off/on RSC HTTP requests to the built custom Worker in workerd; Node monotonic header/first-byte/EOF timings. Separate stable on/off server environments share real disposable D1. Sink capture retrieval excluded from timing. No browser DOM/paint, network throttling or artificial D1 latency.',
    limitations:'Local workerd and local capture sink only. No real Analytics Engine delivery, compression/edge network or staging claim. Stream fault/cancel tests drive the production adapter with controlled responses inside workerd. No response contents or request metadata retained.',
    networkAttempts,console:state,completion:{onRequests:rows.filter(r=>r.enabled).length,uniqueIds:correlationIds.size,
      pointsAttempted:rows.reduce((n,r)=>n+r.sinkPoints,0),missing:0,duplicates:0,unexpectedOff:0},summary,rows};
  const outIndex=process.argv.indexOf('--out');
  const out=outIndex>=0?process.argv[outIndex+1]:join(root,'docs/evidence/PERF4_active_runtime.json');
  writeFileSync(out,JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({scenarios:Object.values(checks).reduce((n,r)=>n+r.checks,0),retained:evidence.retained,total:evidence.total,networkAttempts,console:state,
    overhead:summary.map(r=>({scale:r.scale,route:r.route,responseDelta:r.pairedDelta.responseMs.median,eofDelta:r.pairedDelta.eofMs.median,bodyDelta:r.pairedDelta.bodyBytes.median,headerDelta:r.pairedDelta.headerBytes.median}))}));
} finally {await mf?.dispose();rmSync(temp,{recursive:true,force:true});}
