import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {inspectGoogleReplyBaseline} from '../lib/bloomops/prospect-reply-discovery.mjs';
const require=createRequire(import.meta.url),wrangler=dirname(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wrangler]}));
test('baseline validates input before any transport and rejects noncanonical or imprecise cursors',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return Response.json({});};
 for(const [token,email] of [['','hello@example.test'],['synthetic token','hello@example.test'],['synthetic','HELLO@example.test'],['synthetic','invalid']])assert.equal((await inspectGoogleReplyBaseline(token,email,{fetcher})).reason,'invalid_context');
 assert.equal(calls,0);
 for(const historyId of [null,1,'0','01','-1','1.0','1'.repeat(26)]){const r=await inspectGoogleReplyBaseline('synthetic','hello@example.test',{fetcher:async()=>Response.json({emailAddress:'hello@example.test',historyId})});assert.equal(r.status,'unresolved');assert.equal(r.nextHistoryId,null);}
});
test('real workerd baseline uses one bounded profile GET and never retries or follows redirects',{timeout:35000},async()=>{
 const bundle=await build({bundle:true,write:false,format:'esm',platform:'neutral',stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`
 import {inspectGoogleReplyBaseline} from './lib/bloomops/prospect-reply-discovery.mjs';
 export default {async fetch(){return Response.json(await inspectGoogleReplyBaseline('synthetic-token','hello@example.test'));}};
 `}});
 let mode='valid',status=200,calls=0;
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2025-05-01',cf:false,logRequests:false,outboundService:async request=>{
  calls++;const url=new URL(request.url);assert.equal(url.origin,'https://gmail.googleapis.com');assert.equal(url.pathname,'/gmail/v1/users/me/profile');assert.equal(url.searchParams.get('fields'),'emailAddress,historyId');assert.equal([...url.searchParams].length,1);assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),'Bearer synthetic-token');assert.equal(await request.text(),'');
  if(mode==='status')return new Response(null,{status,headers:{location:'https://untrusted.example.test'}});
  if(mode==='oversized')return new Response('x'.repeat(64*1024+1));
  if(mode==='invalid')return new Response('{');
  if(mode==='stall')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}));
  return Response.json({emailAddress:mode==='foreign'?'foreign@example.test':'hello@example.test',historyId:'9007199254740999'});
 }}));
 const invoke=async()=>{const before=calls,r=await(await mf.dispatchFetch('http://localhost')).json();assert.equal(calls,before+1);assert.ok(!JSON.stringify(r).includes('synthetic-token'));return r;};
 const fail=r=>{assert.equal(r.status,'unresolved');assert.equal(r.hold,true);assert.equal(r.nextHistoryId,null);assert.deepEqual(r.observations,[]);};
 try{
  const r=await invoke();assert.equal(r.status,'observed');assert.equal(r.nextHistoryId,'9007199254740999');assert.equal(r.hold,true);assert.deepEqual(r.observations,[]);
  mode='status';for(status of [204,206,301,302,303,307,308,401,403,404,429,503])fail(await invoke());
  for(mode of ['oversized','invalid','foreign'])fail(await invoke());
  mode='stall';const before=Date.now();fail(await invoke());assert.ok(Date.now()-before>=14000);assert.ok(Date.now()-before<18000);
 }finally{await mf.dispose();}
});
