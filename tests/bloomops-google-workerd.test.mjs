import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {GOOGLE_SCOPES} from '../lib/bloomops/prospect-google-provider.mjs';
const require=createRequire(import.meta.url),wrangler=dirname(require.resolve('wrangler/package.json'));
const {Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wrangler]}));
test('real workerd fetch verifies a grant and rejects redirects without forwarding credentials',async()=>{
 const bundle=await build({bundle:true,write:false,format:'esm',platform:'neutral',stdin:{resolveDir:fileURLToPath(new URL('../',import.meta.url)),contents:`
  import {verifyGoogleGrant,refreshGoogleGrant,googleFailureCode,GOOGLE_SCOPES} from './lib/bloomops/prospect-google-provider.mjs';
  export default {async fetch(request){try{const config={clientId:'synthetic.apps.googleusercontent.com',clientSecret:'synthetic-secret',redirectUri:'http://localhost/callback'},args={code:'synthetic-code',verifier:'synthetic-verifier',senderEmail:'hello@example.test',accountEmail:'hello@example.test',tokens:{refreshToken:'synthetic-old-refresh'},scope:GOOGLE_SCOPES.join(' ')};const grant=await (new URL(request.url).pathname==='/refresh'?refreshGoogleGrant(config,args):verifyGoogleGrant(config,args));return Response.json({accountEmail:grant.accountEmail});}catch(error){return Response.json({error:googleFailureCode(error)});}}};
 `}});
 let redirectAt=null,status=302,calls=[],grantTypes=[];
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2025-05-01',cf:false,logRequests:false,
  // All egress is handled in memory. No real Google request, credentials,
  // database binding, persisted fixture or application session is used.
  outboundService:async request=>{
   const url=new URL(request.url);calls.push(url.pathname);
   assert.ok(['oauth2.googleapis.com','gmail.googleapis.com'].includes(url.hostname),'Unexpected outbound destination');
   if(url.pathname.endsWith(redirectAt||'/never-match'))return new Response(null,{status,headers:{location:'https://untrusted.example.test/collect'}});
   if(url.pathname==='/token'){assert.equal(request.method,'POST');grantTypes.push(new URLSearchParams(await request.text()).get('grant_type'));return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',token_type:'Bearer',expires_in:3600,scope:GOOGLE_SCOPES.join(' ')});}
   assert.equal(request.headers.get('authorization'),'Bearer synthetic-access');
   if(url.pathname.endsWith('/profile'))return Response.json({emailAddress:'hello@example.test'});
   assert.ok(url.pathname.endsWith('/sendAs'));return Response.json({sendAs:[{sendAsEmail:'hello@example.test',isPrimary:true}]});
  }
 }));
 try{
  for(const path of ['/','/refresh']){
   const invoke=async()=>{calls=[];return (await mf.dispatchFetch('http://localhost'+path)).json();};redirectAt=null;
   assert.deepEqual(await invoke(),{accountEmail:'hello@example.test'});assert.equal(calls.length,3);assert.equal(grantTypes.at(-1),path==='/refresh'?'refresh_token':'authorization_code');
   for(const [suffix,stage,count] of [['/token','token_request',1],['/profile','profile_request',2],['/sendAs','sender_addresses_request',3]]){
    redirectAt=suffix;for(status of [301,302,303,307,308]){assert.deepEqual(await invoke(),{error:stage+'_http_'+status});assert.equal(calls.length,count);}
   }
  }
 }finally{await mf.dispose();}
});
