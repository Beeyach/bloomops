import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyGoogleGrant,googleFailureCode,GOOGLE_SCOPES} from '../lib/bloomops/prospect-google-provider.mjs';
const config={clientId:'synthetic.apps.googleusercontent.com',clientSecret:'PRIVATE-secret',redirectUri:'http://localhost:8787/api/bloomops/prospecting/google/callback'};
const validToken={access_token:'PRIVATE-access',refresh_token:'PRIVATE-refresh',token_type:'Bearer',scope:GOOGLE_SCOPES.join(' '),expires_in:3600};
const response=value=>Response.json(value);
const grant=fetcher=>verifyGoogleGrant(config,{code:'PRIVATE-code',verifier:'PRIVATE-verifier',senderEmail:'hello@example.test',fetcher});
const provider=(token=validToken)=>async url=>url.endsWith('/token')?response(token):url.endsWith('/profile')?response({emailAddress:'hello@example.test'}):response({sendAs:[{sendAsEmail:'hello@example.test',isPrimary:true}]});
async function failed(fetcher,expected){await assert.rejects(()=>grant(fetcher),error=>{assert.equal(googleFailureCode(error),expected);assert.equal(JSON.stringify(error).includes('PRIVATE'),false);assert.equal(error.message.includes('PRIVATE'),false);return true;});}
test('failure diagnostics do not trust arbitrary error messages or provider-owned codes',()=>{
 for(const error of [new Error('PRIVATE-token'),{code:'token_request'},null,'PRIVATE-token'])assert.equal(googleFailureCode(error),'unexpected');
});
test('transport, HTTP and malformed responses identify only the failed fixed provider stage',async()=>{
 for(const [suffix,stage] of [['/token','token_request'],['/profile','profile_request'],['/sendAs','sender_addresses_request']]){
  for(const kind of ['network','http','json'])await failed(async url=>{
   if(!url.endsWith(suffix))return provider()(url);
   if(kind==='network')throw new Error('PRIVATE-url-and-token');
   return new Response('PRIVATE-response',{status:kind==='http'?403:200});
  },stage+(kind==='network'?'_transport':kind==='http'?'_http_403':'_response'));
 }
});
test('only recognized OAuth error identifiers escape a bounded failed token response',async()=>{
 for(const [body,expected] of [[{error:'invalid_grant',error_description:'PRIVATE credentials'},'token_request_http_400_invalid_grant'],[{error:'PRIVATE credentials'},'token_request_http_400'],[null,'token_request_http_400']])await failed(async()=>new Response(JSON.stringify(body),{status:400}),expected);
 await failed(async()=>new Response('PRIVATE'.repeat(10000),{status:400}),'token_request_http_400');
});
test('incomplete consent cannot continue to mailbox verification and has a bounded diagnostic',async()=>{
 for(const [patch,expected] of [[{access_token:''},'missing_access_token'],[{refresh_token:''},'missing_refresh_token'],[{token_type:42},'token_type'],[{scope:GOOGLE_SCOPES[0]},'required_scopes'],[{expires_in:0},'token_expiry']]){
  const calls=[];await failed(async url=>{calls.push(url);return response({...validToken,...patch});},expected);assert.equal(calls.length,1);
 }
 await failed(provider(null),'missing_access_token');
});
test('malformed or mismatched identity cannot attach a grant or expose provider payloads',async()=>{
 for(const aliases of [null,{sendAs:[null]},{sendAs:[{sendAsEmail:42}]},{sendAs:[{sendAsEmail:'other@example.test',isPrimary:true}]}])await failed(async url=>url.endsWith('/sendAs')?response(aliases):provider()(url),'sender_address');
});
test('diagnostics preserve successful primary-address verification',async()=>{
 const result=await grant(provider());assert.equal(result.accountEmail,'hello@example.test');assert.equal(result.tokens.refreshToken,validToken.refresh_token);
});
test('provider redirects are never followed and stop verification at that endpoint',async()=>{
 for(const [suffix,stage,expectedCalls] of [['/token','token_request',1],['/profile','profile_request',2],['/sendAs','sender_addresses_request',3]]){
  for(const status of [301,302,303,307,308]){
   const calls=[];await failed(async(url,options)=>{
    assert.equal(options.redirect,'manual');calls.push(url);
    return url.endsWith(suffix)?new Response(null,{status,headers:{location:'https://untrusted.example.test/PRIVATE'}}):provider()(url);
   },stage+'_http_'+status);
   assert.equal(calls.length,expectedCalls);assert.ok(calls.every(url=>new URL(url).hostname.endsWith('.googleapis.com')));
  }
 }
});
