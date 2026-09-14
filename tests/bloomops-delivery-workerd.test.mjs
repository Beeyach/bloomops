import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const require=createRequire(import.meta.url),wrangler=dirname(require.resolve('wrangler/package.json')),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wrangler]}));
test('real workerd send accepts provider IDs and rejects redirects without credential forwarding',async()=>{
 const bundle=await build({bundle:true,write:false,format:'esm',platform:'neutral',stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`import {submitGoogleIntroduction} from './lib/bloomops/prospect-delivery-provider.mjs';export default {async fetch(){return Response.json(await submitGoogleIntroduction('synthetic-access','Message-ID: <synthetic@example.test>\\r\\nTo: inbox@example.test\\r\\n\\r\\nSynthetic message'));}};`}});
 let status=200,calls=0;const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2025-05-01',cf:false,logRequests:false,outboundService:async request=>{calls++;assert.equal(request.url,'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');assert.equal(request.headers.get('authorization'),'Bearer synthetic-access');assert.equal(request.method,'POST');assert.ok(typeof(await request.json()).raw==='string');return status===200?Response.json({id:'message',threadId:'thread'}):new Response(null,{status,headers:{location:'https://untrusted.example.test/collect'}});}}));
 try{assert.deepEqual(await(await mf.dispatchFetch('http://localhost')).json(),{accepted:true,messageId:'message',threadId:'thread'});for(status of [301,302,303,307,308,400,401,403,429,503])assert.deepEqual(await(await mf.dispatchFetch('http://localhost')).json(),{uncertain:true});assert.equal(calls,11);}finally{await mf.dispose();}
});
