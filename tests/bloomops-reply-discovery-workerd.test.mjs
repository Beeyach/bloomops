import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {history,message} from './_prospect-discovery-fixture.mjs';
const require=createRequire(import.meta.url),wrangler=dirname(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wrangler]}));

test('real workerd discovery uses fixed metadata GETs, rejects redirects/gaps, and covers the whole walk with one deadline',{timeout:45000},async()=>{
 const bundle=await build({bundle:true,write:false,format:'esm',platform:'neutral',stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`
 import {inspectGoogleReplyChanges} from './lib/bloomops/prospect-reply-discovery.mjs';
 import {context} from './tests/_prospect-discovery-fixture.mjs';
 export default {async fetch(){return Response.json(await inspectGoogleReplyChanges('synthetic-token',context));}};
 `}});
 let mode='valid',status=200,calls=[];
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2025-05-01',cf:false,logRequests:false,
  // No network fallback, D1, account, session or real credential.
  outboundService:async request=>{
   const url=new URL(request.url);calls.push(url.pathname);assert.equal(url.origin,'https://gmail.googleapis.com');assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),'Bearer synthetic-token');assert.equal(await request.text(),'');
   if(url.pathname==='/gmail/v1/users/me/history'){
    assert.equal(url.searchParams.get('startHistoryId'),'9');assert.equal(url.searchParams.get('historyTypes'),'messageAdded');assert.equal(url.searchParams.has('labelId'),false);
    if(mode==='history-status')return new Response(null,{status,headers:{location:'https://untrusted.example.test/collect'}});
    if(mode==='oversized-history')return new Response('x'.repeat(256*1024+1));
    if(mode==='malformed')return new Response('{');
    if(mode==='shared-deadline')await new Promise(r=>setTimeout(r,4000));
    return Response.json(history());
   }
   assert.equal(url.pathname,'/gmail/v1/users/me/messages/reply');assert.equal(url.searchParams.get('format'),'metadata');assert.equal(url.searchParams.getAll('metadataHeaders').length,9);
   if(mode==='message-status')return new Response(null,{status,headers:{location:'https://untrusted.example.test/collect'}});
   if(mode==='oversized-message')return new Response('x'.repeat(64*1024+1));
   if(mode==='shared-deadline')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}));
   return Response.json(message());
  }}));
 const invoke=async()=> (await mf.dispatchFetch('http://localhost')).json();
 const fail=r=>{assert.equal(r.status,'unresolved');assert.equal(r.nextHistoryId,null);assert.equal(r.hold,true);assert.deepEqual(r.observations,[]);assert.ok(!JSON.stringify(r).includes('synthetic-token'));};
 try{
  let r=await invoke();assert.equal(r.status,'observed');assert.equal(r.nextHistoryId,'11');assert.equal(r.observations[0].providerThreadId,'separate-thread');assert.equal(calls.length,2);
  for(mode of ['history-status','message-status'])for(status of [204,206,301,302,303,307,308,401,403,404,429,503]){const n=calls.length;r=await invoke();fail(r);assert.equal(calls.length-n,mode==='history-status'?1:2);if(mode==='history-status'&&status===404)assert.equal(r.reason,'history_gap');}
  for(mode of ['oversized-history','oversized-message','malformed'])fail(await invoke());
  mode='shared-deadline';const started=Date.now();fail(await invoke());const elapsed=Date.now()-started;
  assert.ok(elapsed>=14000,'actual15-second deadline exercised');assert.ok(elapsed<18000,'four-second history request must share the metadata body deadline');
 }finally{await mf.dispose();}
});
