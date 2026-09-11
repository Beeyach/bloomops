// LOCAL TEST ENTRY ONLY. No deployment config imports this module. It holds
// disposable fixture sessions and captures only PERF4's fixed sink fields.
import assert from 'node:assert/strict';
import built from '../worker.mjs';
import { handlePerf4Request } from '../lib/bloomops/perf4-worker.mjs';
import { createAuth } from '../lib/bloomops/auth.mjs';
import { channel } from 'node:diagnostics_channel';

const ORIGIN = 'https://perf4.invalid';
const encoder = new TextEncoder();
const fixtures = new Map();
const captures = new Map(), stableEnvironments = new Map();
const routePaths = { home:'/', clients:'/clients', work:'/work', social:'/social', systems:'/systems', team:'/team', ads:'/ads' };
const metrics = ['response','identity','membership','actor','home','systems',
  'wait1','wait2','wait3','wait4','wait5','wait6','wait7','wait8','first','total','elapsed','unattributed'];
const spans = ['identity','membership','actor','home','systems','wait1','wait2','wait3','wait4','wait5','wait6','wait7','wait8'];
const markers = ['PF4_PRIVATE', 'pf4_private', 'private-query', 'private-cookie', 'private-header', 'private-sql', 'private-bind', 'private-body', 'private-error'];
let consoleCalls = 0, consoleLeaks = 0;
// No console values are retained or printed. This replaces the test isolate's
// console methods, NOT Cloudflare logging configuration or application code.
for (const key of ['log','info','warn','error','debug','trace']) console[key] = (...values) => {
  consoleCalls++;
  if (values.some(value => markers.some(marker => String(value).includes(marker)))) consoleLeaks++;
};
function check(ok, code) { assert.ok(ok, code); }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function environment(env, points, overrides = {}) {
  return { ...env, BLOOMOPS_ENV:'staging', BLOOMOPS_APP_URL:ORIGIN,
    BLOOMOPS_PERF4_TIMING:'enabled', BLOOMOPS_MAIL_TRANSPORT:'none',
    PERF4_TIMING:{ writeDataPoint(point) { points.push(structuredClone(point)); } }, ...overrides };
}
function validate(points, id, route, event = 'complete') {
  check(points.length === 3, 'triplet-count');
  for (let i=0; i<3; i++) {
    const p = points[i];
    check(JSON.stringify(Object.keys(p).sort()) === '["blobs","doubles","indexes"]', 'point-keys');
    check(p.indexes.length===1 && p.indexes[0]===id && /^[a-f0-9]{32}$/.test(id), 'point-correlation');
    check(JSON.stringify(p.blobs)===JSON.stringify([['metrics-v1','spans-a-v1','spans-b-v1'][i],route,event]), 'point-enums');
    check(p.doubles.length===[18,20,6][i] && p.doubles.every(x=>Number.isFinite(x)&&(x===-1||(x>=0&&x<=120000))), 'point-numbers');
  }
  check(!markers.some(marker=>JSON.stringify(points).includes(marker)), 'point-privacy');
  const values = Object.fromEntries(metrics.map((name,i)=>[name,points[0].doubles[i]]));
  const offsets = [...points[1].doubles,...points[2].doubles];
  return { metrics:values, spans:Object.fromEntries(spans.map((name,i)=>[name,{start:offsets[i*2],duration:offsets[i*2+1]}])) };
}
function timingHeaders(response) {
  const id=response.headers.get('x-bloomops-timing'), timing=response.headers.get('server-timing');
  check(!markers.some(marker=>(id||'').includes(marker)||(timing||'').includes(marker)), 'header-privacy');
  if(id) {
    check(/^[a-f0-9]{32}$/.test(id), 'header-id');
    check(!/(?:total|first|elapsed|unattributed);/.test(timing), 'initial-header-not-eof');
    check(timing.split(', ').every(v=>/^(response|identity|membership|actor|home|systems|wait[1-8]);dur=\d+\.\d$/.test(v)), 'header-schema');
  }
  return { id,timing, bytes:id ? encoder.encode(`X-Bloomops-Timing: ${id}\r\nServer-Timing: ${timing}\r\n`).byteLength : 0 };
}
async function consume(response, expectedWorkspace) {
  if(!response.body) return {bytes:0,chunks:0,hash:null};
  const reader=response.body.getReader(); let bytes=0,chunks=0;
  // Bodies are not captured. A rolling hash verifies controlled body equality.
  let hash=2166136261, tail='', redirectToSignIn=false, privateRecordSeen=false, expectedWorkspaceSeen=false, foreignWorkspaceSeen=false;
  const decoder=new TextDecoder();
  while(true) {const {value,done}=await reader.read();if(done)break; bytes+=value.byteLength;chunks++;
    const text=tail+decoder.decode(value,{stream:true});
    redirectToSignIn ||= text.includes('NEXT_REDIRECT') && text.includes('/sign-in');
    privateRecordSeen ||= text.includes('PF4_PRIVATE_WORKSPACE');
    if(expectedWorkspace) {
      expectedWorkspaceSeen ||= text.includes(expectedWorkspace);
      const other=expectedWorkspace.endsWith('stress')?'PF4_PRIVATE_WORKSPACE_representative':'PF4_PRIVATE_WORKSPACE_stress';
      foreignWorkspaceSeen ||= text.includes(other);
    }
    tail=text.slice(-256);
    for(const b of value) hash=Math.imul(hash^b,16777619)>>>0;}
  return {bytes,chunks,hash,redirectToSignIn,privateRecordSeen,expectedWorkspaceSeen,foreignWorkspaceSeen};
}
async function issue(env, email) {
  let link;
  const auth=createAuth({env,mailer:{ready:true,transport:'memory',async send(mail) {link=mail.text.match(/https?:\/\/\S+/)[0];}}});
  const requested=await auth.handler(new Request(ORIGIN+'/api/auth/sign-in/magic-link',{method:'POST',headers:{origin:ORIGIN,'content-type':'application/json'},body:JSON.stringify({email,callbackURL:'/'})}));
  check(requested.status===200 && !!link,'issued-local-magic-link');
  const verified=await auth.handler(new Request(link));
  check(verified.status===302,'issued-local-session');
  const cookie=verified.headers.getSetCookie().map(x=>x.split(';')[0]).filter(x=>!x.endsWith('=')).join('; ');
  check(cookie.includes('session_token='),'issued-cookie');
  return cookie;
}
async function appRequest(env, ctx, {scale='representative',route='home', enabled=true,role='owner',path,method='GET',overrides={},headers={},origin=ORIGIN}={}) {
  const points=[];
  const fixture=fixtures.get(scale);
  const request=new Request(origin+(path??routePaths[route]),{method,headers:{cookie:fixture?.cookies[role]||'',rsc:'1',...headers}});
  const effective=environment(env,points,{BLOOMOPS_PERF4_TIMING:enabled?'enabled':'disabled',...overrides});
  const started=performance.now();
  const response=await built.fetch(request,effective,ctx);
  const responseMs=performance.now()-started;
  const initial=timingHeaders(response);
  const consumed=await consume(response,fixture?.ws), eofMs=performance.now()-started;
  check(response.headers.get('server-timing')===initial.timing,'header-snapshot-stable');
  const parsed=initial.id?validate(points,initial.id,route):null;
  if(!initial.id)check(points.length===0,'inactive-sink-empty');
  return {route,enabled,status:response.status,noStore:response.headers.get('cache-control')?.includes('no-store')||false,
    redirect:!!response.headers.get('location'),responseMs,eofMs,...consumed,timingHeaderBytes:initial.bytes,
    points,parsed,id:initial.id};
}

async function gates(env,ctx) {
  let checks=0;
  for(const route of Object.keys(routePaths)) {
    const r=await appRequest(env,ctx,{route});
    check(r.id && r.points.length===3,'allowlisted-built-route'); checks++;
  }
  const cases=[
    {path:'/not-allowlisted'}, {path:'/api/auth/get-session'}, {path:'/api/health'},
    {path:'/clients/nested-private-query'}, {path:'/systems/nested'}, {path:'/sign-in'},
    {method:'POST'}, {method:'HEAD'}, {origin:'https://wrong.invalid'},
    {overrides:{BLOOMOPS_APP_URL:'http://perf4.invalid'}},
    {overrides:{PERF4_TIMING:undefined}},
    {overrides:{BLOOMOPS_ENV:'production'}}, {overrides:{BLOOMOPS_ENV:'development'}},
    {overrides:{BLOOMOPS_ENV:undefined,BLOOMOPS_PERF4_TIMING:undefined}},
    {overrides:{BLOOMOPS_PERF4_TIMING:undefined}}, {overrides:{BLOOMOPS_PERF4_TIMING:'true'}},
    {enabled:false,path:'/?BLOOMOPS_PERF4_TIMING=enabled&private-query=1',headers:{'BLOOMOPS_ENV':'staging','BLOOMOPS_PERF4_TIMING':'enabled','x-perf4-timing':'enabled','x-private':'private-header'}},
  ];
  for(const options of cases) {const r=await appRequest(env,ctx,options);check(!r.id && r.points.length===0,'built-bypass-gate');checks++;}
  const r=await appRequest(env,ctx,{route:'systems',path:'/systems/?private-query=1',headers:{'x-private':'private-header',cookie:fixtures.get('representative').cookies.owner+'; private-cookie=1'}});
  check(!!r.id,'allowlisted-trailing-slash-query');checks++;
  return {checks,allowlisted:7,bypass:cases.length,trailingSlash:1};
}
function stages(r, route, waits) {
  check(r.status===200 && !r.redirectToSignIn && r.noStore,'authorized-built-response');
  check(r.expectedWorkspaceSeen && !r.foreignWorkspaceSeen,'concurrent-workspace-body-isolation');
  const m=r.parsed.metrics;
  check(m.identity>=0 && m.actor>=0 && m.membership===-1,'joined-identity-actor-stages');
  check((route==='home'?m.home>=0:m.home===-1)&&(route==='systems'?m.systems>=0:m.systems===-1),'projection-stage-isolation');
  check(m.response>=0 && m.first>=m.response && m.total>=m.first && m.elapsed===-1,'response-first-eof-order');
  for(let i=1;i<=8;i++) check(i<=waits?m['wait'+i]>=0:m['wait'+i]===-1,'native-wait-ordinals');
  for(const span of Object.values(r.parsed.spans))if(span.start>=0)check(span.start+span.duration<=m.total+0.2,'span-completes-before-eof');
  return true;
}
async function concurrency(env,ctx) {
  const ids=new Set(), rows=[];
  for(let round=0;round<8;round++) {
    const start=performance.now();
    const group=await Promise.all([
      {route:'home',scale:'representative'}, {route:'systems',scale:'stress'},
      {route:'ads',scale:'representative'}, {route:'home',scale:'stress',enabled:false},
    ].map(async options=>{
      const begin=performance.now()-start;
      const r=await appRequest(env,ctx,options);
      const end=performance.now()-start;
      if(options.enabled!==false) {
        stages(r,options.route,options.route==='ads'?1:3);
        check(!ids.has(r.id),'concurrent-unique-id');ids.add(r.id);
      } else check(!r.id && r.points.length===0,'concurrent-inactive-no-sink');
      return {route:options.route,enabled:options.enabled!==false,begin,end,id:r.id,points:r.points};
    }));
    check(Math.max(...group.map(r=>r.begin)) < Math.min(...group.map(r=>r.end)),'built-requests-overlap');
    rows.push(group);
  }
  return {checks:32,rounds:8,requests:32,active:24,inactive:8,uniqueIds:ids.size,rows};
}
async function revocation(env,ctx) {
  const f=fixtures.get('representative'), member=f.members.admin;
  const get=()=>appRequest(env,ctx,{route:'systems',role:'admin'});
  const results=[];
  let r=await get();check(r.status===200&&!r.redirectToSignIn,'active-admin-authorized');
  check(r.parsed.metrics.actor>=0 && r.parsed.metrics.wait4>=0,'admin-current-capability-stage');
  results.push({case:'authorized',status:r.status,denied:false,points:r.points});
  const denied=async name=>{
    const a=await get();
    check(a.redirect||a.redirectToSignIn,'next-request-revocation-denied');
    check(!a.privateRecordSeen,'revoked-private-records-absent');
    check(a.id && a.parsed.metrics.identity>=0,'revocation-still-timed');
    results.push({case:name,status:a.status,denied:true,points:a.points});
  };
  await env.DB.prepare("UPDATE workspace_memberships SET status='suspended' WHERE id=?").bind(member.membership).run();
  await denied('membership-suspended');
  await env.DB.prepare("UPDATE workspace_memberships SET status='active' WHERE id=?").bind(member.membership).run();
  r=await get();check(r.status===200&&!r.redirectToSignIn,'reactivated-next-request');
  results.push({case:'reactivated',status:r.status,denied:false,points:r.points});
  const row=await env.DB.prepare('SELECT workspace_id FROM workspace_memberships WHERE id=?').bind(member.membership).first();
  await env.DB.prepare('DELETE FROM workspace_memberships WHERE id=?').bind(member.membership).run();
  await denied('membership-deleted');
  await env.DB.prepare("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,'admin','active')").bind(member.membership,row.workspace_id,member.id).run();
  r=await get();check(r.status===200&&!r.redirectToSignIn,'restored-membership-next-request');
  results.push({case:'membership-restored',status:r.status,denied:false,points:r.points});
  await env.DB.prepare('DELETE FROM session WHERE user_id=?').bind(member.id).run();
  await denied('session-deleted');
  return {checks:6,issuedCookieReused:true,results};
}
async function streamChecks(env) {
  const results=[], nav=channel('bloomops.navigation');
  const subscribed=c=>typeof c.hasSubscribers==='function'?c.hasSubscribers():c.hasSubscribers;
  check(subscribed(nav)===false,'subscriber-initially-detached');
  const run=async (handler,route='systems',overrides={})=>{
    const points=[], effective=environment(env,points,overrides);
    const response=await handlePerf4Request(new Request(ORIGIN+routePaths[route]+'?private-query=1',{
      headers:{cookie:'private-cookie', 'x-private':'private-header','user-agent':'PF4_PRIVATE_USER_AGENT'}}),effective,{},handler);
    return {response,points,initial:timingHeaders(response)};
  };
  const sameHeaders=(a,b)=>JSON.stringify([...a].filter(([k])=>!['server-timing','x-bloomops-timing'].includes(k)))===JSON.stringify([...b]);
  for(const status of [200,307,401,403,404,500,204,304]) {
    const make=()=>new Response([204,304].includes(status)?null:encoder.encode('private-body\u0000\u00ff'),{
      status,statusText:'Fixture status',headers:[['cache-control','no-store'],['location','/private-query'],
        ['set-cookie','one=private-cookie; Path=/; HttpOnly'],['set-cookie','two=private-cookie; Expires=Wed, 21 Oct 2037 07:28:00 GMT'],['x-private','private-header']]});
    const original=make(), baseline=await consume(make());
    const {response,points,initial}=await run(()=>original);
    check(response.status===status && response.statusText===original.statusText,'stream-status-text');
    check(sameHeaders(response.headers,original.headers),'stream-original-headers');
    check(JSON.stringify(response.headers.getSetCookie())===JSON.stringify(original.headers.getSetCookie()),'stream-set-cookies');
    const actual=await consume(response);
    check(actual.bytes===baseline.bytes&&actual.hash===baseline.hash,'stream-body-bytes');
    validate(points,initial.id,'systems');results.push({case:'response-'+status,status,points});
  }
  {
    let release,produced=0,cancelled=false;
    const gate=new Promise(resolve=>{release=resolve;});
    const {response,points,initial}=await run((_request,measured)=>{
      nav.publish({stage:'identity',event:'start'});
      const stream=new ReadableStream({async pull(controller) {
        if(produced===0) {produced++;controller.enqueue(encoder.encode('first-private-body'));return;}
        await gate;
        if(cancelled)return;
        if(produced===1) {
          await measured.DB.prepare('SELECT ? AS value /* private-sql */').bind('private-bind').first();
          nav.publish({stage:'identity',event:'end'});
          nav.publish({stage:'systems',event:'start'});
          await measured.DB.batch([measured.DB.prepare('SELECT 1'),measured.DB.prepare('SELECT 2')]);
          nav.publish({stage:'systems',event:'end'});
          nav.publish({stage:'PF4_PRIVATE_LABEL',event:'start'});
          produced++;controller.enqueue(encoder.encode('last-private-body'));controller.close();
        }
      },cancel(){cancelled=true;}});
      return new Response(stream,{headers:{'cache-control':'no-store'}});
    });
    const reader=response.body.getReader(),first=await reader.read();
    check(new TextDecoder().decode(first.value)==='first-private-body','first-chunk-unchanged');
    check(produced===1&&points.length===0,'no-buffering-or-premature-eof');
    check(!initial.timing.includes('identity;'),'late-identity-not-in-initial-header');
    release();let bytes=first.value.byteLength;
    while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;}
    check(bytes===encoder.encode('first-private-bodylast-private-body').byteLength,'late-body-bytes');
    const p=validate(points,initial.id,'systems');
    check(p.metrics.identity>=0&&p.metrics.systems>=0&&p.metrics.wait1>=0&&p.metrics.wait2>=0,'post-header-stage-propagation');
    check(response.headers.get('server-timing')===initial.timing,'late-header-snapshot');
    results.push({case:'delayed-stream-native-d1',points});
  }
  {
    let produced=0;
    const {response,points,initial}=await run(()=>new Response(new ReadableStream({pull(c){
      if(produced===64){c.close();return;}produced++;c.enqueue(new Uint8Array(4096).fill(7));
    }})));
    await delay(10);
    check(produced<64 && points.length===0,'backpressure-bounded-producer');
    const prefetched=produced,reader=response.body.getReader();let chunks=0,bytes=0;
    while(true){const v=await reader.read();if(v.done)break;chunks++;bytes+=v.value.byteLength;await delay(1);}
    check(chunks===64&&bytes===64*4096,'slow-consumer-completes');validate(points,initial.id,'systems');
    results.push({case:'backpressure',prefetched,chunks,bytes,points});
  }
  for(const pending of [false,true]) {
    let reasonSeen,release,produced=0;
    const reason=Error('private-error-cancel'),gate=new Promise(resolve=>{release=resolve;});
    const {response,points,initial}=await run(()=>new Response(new ReadableStream({async pull(c){
      if(produced++===0){c.enqueue(encoder.encode('private-body'));return;}
      await gate;
    },cancel(reason){reasonSeen=reason;release();}})));
    const reader=response.body.getReader();await reader.read();
    const read=pending?reader.read():null;
    await reader.cancel(reason);if(read)await read;
    check(reasonSeen===reason,'cancel-reason-forwarded');
    const p=validate(points,initial.id,'systems','cancel');check(p.metrics.total===-1&&p.metrics.elapsed>=0,'cancel-not-eof');
    await delay(1);check(points.length===3,'cancel-exactly-once');
    results.push({case:pending?'cancel-pending-read':'cancel',points});
  }
  {
    const failure=Error('private-error-read');let reads=0;
    const {response,points,initial}=await run(()=>new Response(new ReadableStream({pull(c){
      if(reads++===0)c.enqueue(encoder.encode('private-body'));else c.error(failure);
    }})));
    const reader=response.body.getReader();let caught;
    try{while(!(await reader.read()).done){}}catch(error){caught=error;}
    check(caught===failure,'read-error-preserved');
    const p=validate(points,initial.id,'systems','error');check(p.metrics.total===-1&&p.metrics.elapsed>=0,'read-error-not-eof');
    results.push({case:'read-error',points});
  }
  {
    const failure=Error('private-error-before-response'),points=[];let caught;
    try{await handlePerf4Request(new Request(ORIGIN+'/'),environment(env,points),{},()=>{throw failure;});}catch(error){caught=error;}
    check(caught===failure&&points.length===0,'pre-response-error-preserved');results.push({case:'pre-response-error',points});
  }
  for(const asyncFailure of [false,true]) {
    let attempts=0;const before=consoleCalls;
    const {response}=await run(()=>new Response('private-body'),'systems',{PERF4_TIMING:{writeDataPoint(){
      attempts++;if(asyncFailure)return Promise.reject(Error('private-error-sink'));throw Error('private-error-sink');
    }}});
    const r=await consume(response);await delay(1);
    check(r.bytes===12&&attempts===3&&consoleCalls===before,'sink-failure-isolation');
    results.push({case:asyncFailure?'async-sink-error':'sync-sink-error',attempts});
  }
  check(subscribed(nav)===false,'subscriber-cleanup');
  check(consoleLeaks===0,'no-console-marker-leak');
  return {checks:results.length,results,consoleCalls,consoleLeaks,subscriberAfter:subscribed(nav)};
}

function forward(env,ctx,options) {
  const enabled=options.enabled===true;
  let effective=stableEnvironments.get(enabled);
  if(!effective) {
    effective=environment(env,[],{BLOOMOPS_PERF4_TIMING:enabled?'enabled':'disabled',PERF4_TIMING:{writeDataPoint(point){
      const id=point.indexes[0];
      if(!captures.has(id))captures.set(id,[]);
      captures.get(id).push(structuredClone(point));
      check(captures.size<2048,'bounded-local-capture');
    }}});
    stableEnvironments.set(enabled,effective);
  }
  const fixture=fixtures.get(options.scale);
  const request=new Request(ORIGIN+routePaths[options.route],{headers:{rsc:'1',cookie:fixture.cookies.owner}});
  return built.fetch(request,effective,ctx);
}

export default {async fetch(request,env,ctx) {
  if(env.PERF4_LOCAL_ONLY!=='disposable' || new URL(request.url).hostname!=='localhost' || request.method!=='POST')return new Response(null,{status:403});
  try {
    const command=await request.json();
    if(command.op==='init') {
      const effective=environment(env,[]),cookies={};
      for(const role of ['owner','admin']) cookies[role]=await issue(effective,command.members[role].email);
      fixtures.set(command.scale,{members:command.members,cookies,ws:command.ws});
      return Response.json({ok:true,sessions:2});
    }
    if(command.op==='forward') return await forward(env,ctx,command.options);
    if(command.op==='take') {
      const points=captures.get(command.id)||[];validate(points,command.id,command.route);captures.delete(command.id);
      return Response.json({points});
    }
    if(command.op==='capture-state') return Response.json({pending:captures.size,consoleCalls,consoleLeaks});
    if(command.op==='gates') return Response.json(await gates(env,ctx));
    if(command.op==='concurrency') return Response.json(await concurrency(env,ctx));
    if(command.op==='revocation') return Response.json(await revocation(env,ctx));
    if(command.op==='streams') return Response.json(await streamChecks(env));
    if(command.op==='request') return Response.json(await appRequest(env,ctx,command.options));
    return Response.json({ok:false,code:'unknown-operation'},{status:400});
  } catch(error) {
    // Only fixed assertion names escape. Never actual values, exception text,
    // stacks, SQL, URLs, cookies or the input command.
    const code=error?.code==='ERR_ASSERTION' && /^[a-z0-9-]+$/.test(error.message)?error.message:'runtime-exception';
    return Response.json({ok:false,code},{status:500});
  }
}};
