import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {fixture} from './_prospect-delivery-report-fixture.mjs';
const require=createRequire(import.meta.url),wrangler=dirname(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wrangler]}));
test('real workerd exact-report read has bounded streaming, one deadline and no redirects/retries',{timeout:40000},async()=>{
 const {context,message}=fixture();
 const bundle=await build({bundle:true,write:false,format:'esm',platform:'neutral',stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`
 import {inspectGoogleDeliveryReport} from './lib/bloomops/prospect-delivery-report-provider.mjs';
 export default {async fetch(){return Response.json(await inspectGoogleDeliveryReport('synthetic-token',${JSON.stringify(context)}));}};
 `}});
 let mode='valid',status=200,calls=0;
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2025-05-01',cf:false,logRequests:false,outboundService:async request=>{
  calls++;const url=new URL(request.url);assert.equal(url.origin,'https://gmail.googleapis.com');assert.equal(url.pathname,'/gmail/v1/users/me/messages/dsn-1');
  assert.deepEqual([...url.searchParams],[['format','full'],['fields','id,threadId,labelIds,internalDate,payload']]);
  assert.equal(request.method,'GET');assert.equal(request.headers.get('authorization'),'Bearer synthetic-token');assert.equal(await request.text(),'');
  if(mode==='status')return new Response(null,{status,headers:{location:'https://untrusted.example.test'}});
  if(mode==='oversized')return new Response('x'.repeat(256*1024+1));
  if(mode==='invalid')return new Response('{');
  if(mode==='partial')return Response.json({...message,payload:{}});
  if(mode==='stall'){
   await new Promise(resolve=>setTimeout(resolve,2000));
   return new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{'));}}));
  }
  return Response.json(message);
 }}));
 const invoke=async()=>{const before=calls,result=await(await mf.dispatchFetch('http://localhost')).json();assert.equal(calls,before+1);assert.ok(!JSON.stringify(result).match(/PRIVATE|@|synthetic-token/i));return result;};
 const fail=r=>{assert.equal(r.status,'unresolved');assert.equal(r.hold,true);assert.equal(r.authenticity,'unverified');assert.equal(r.proposal,null);};
 try{
  const result=await invoke();assert.equal(result.status,'associated');assert.equal(result.hold,true);assert.equal(result.authenticity,'unverified');assert.equal(result.proposal.statusCode,'5.1.1');
  mode='status';for(status of [204,206,301,302,303,307,308,401,403,404,429,503])fail(await invoke());
  for(mode of ['oversized','invalid','partial'])fail(await invoke());
  mode='stall';const started=Date.now();fail(await invoke());assert.ok(Date.now()-started>=14000);assert.ok(Date.now()-started<16500);
 }finally{await mf.dispose();}
});
