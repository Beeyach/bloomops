import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {message,time} from './_prospect-discovery-fixture.mjs';
const require=createRequire(import.meta.url),wrangler=dirname(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wrangler]}));
test('real workerd backfill bounds listing and metadata under one deadline without live egress',{timeout:40000},async()=>{
 const bundle=await build({bundle:true,write:false,format:'esm',platform:'neutral',stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`
 import {inspectGoogleReplyBackfill} from './lib/bloomops/prospect-reply-backfill.mjs';
 import {context} from './tests/_prospect-discovery-fixture.mjs';
 export default {async fetch(){return Response.json(await inspectGoogleReplyBackfill('synthetic-token',context));}};
 `}});
 let mode='valid',status=200,calls=[];
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2025-05-01',cf:false,logRequests:false,outboundService:async request=>{
  const url=new URL(request.url);calls.push(url.pathname);assert.equal(url.origin,'https://gmail.googleapis.com');assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),'Bearer synthetic-token');assert.equal(await request.text(),'');
  if(url.pathname==='/gmail/v1/users/me/messages'){
   assert.equal(url.searchParams.get('q'),'after:'+(Math.floor(time/1000)-1));assert.equal(url.searchParams.get('includeSpamTrash'),'true');assert.equal(url.searchParams.has('labelIds'),false);
   if(mode==='list-status')return new Response(null,{status,headers:{location:'https://untrusted.example.test'}});
   if(mode==='list-large')return new Response('x'.repeat(65537));
   if(mode==='stall')await new Promise(r=>setTimeout(r,3000));
   return Response.json({messages:[{id:'reply',threadId:'separate-thread'}]});
  }
  assert.equal(url.pathname,'/gmail/v1/users/me/messages/reply');assert.equal(url.searchParams.get('format'),'metadata');assert.equal(url.searchParams.getAll('metadataHeaders').length,9);
  if(mode==='message-status')return new Response(null,{status,headers:{location:'https://untrusted.example.test'}});
  if(mode==='message-large')return new Response('x'.repeat(65537));
  if(mode==='malformed')return new Response('{');
  if(mode==='stall')return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}));
  return Response.json(message('reply',mode==='unassigned'?{'In-Reply-To':'<unknown@example.test>'}:{}));
 }}));
 const invoke=async()=> (await mf.dispatchFetch('http://localhost')).json();
 const fail=r=>{assert.equal(r.status,'unresolved');assert.equal(r.hold,true);assert.equal(r.coverage,'unverified');assert.equal(r.nextHistoryId,null);assert.deepEqual(r.observations,[]);assert.deepEqual(r.unassigned,[]);assert.ok(!JSON.stringify(r).includes('synthetic-token'));};
 try{
  let r=await invoke();assert.equal(r.status,'collected');assert.equal(r.observations.length,1);assert.equal(r.nextHistoryId,null);
  mode='unassigned';r=await invoke();assert.equal(r.status,'collected');assert.equal(r.unassigned.length,1);assert.equal(r.observations.length,0);
  for(mode of ['list-status','message-status'])for(status of [204,206,301,302,303,307,308,401,403,404,429,503]){const n=calls.length;fail(await invoke());assert.equal(calls.length-n,mode==='list-status'?1:2);}
  for(mode of ['list-large','message-large','malformed'])fail(await invoke());
  mode='stall';const before=Date.now();fail(await invoke());assert.ok(Date.now()-before>=14000);assert.ok(Date.now()-before<18000,'listing and stalled body share the15-second total deadline');
 }finally{await mf.dispose();}
});
