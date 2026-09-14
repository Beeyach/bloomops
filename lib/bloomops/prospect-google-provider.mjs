// Dedicated Google configuration and fixed, bounded provider calls. No legacy
// credential fallback, SDK dependency, mailbox read, send or watch operation.
export const GOOGLE_SCOPES=['https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send'];
export const GOOGLE_CALLBACK='/api/bloomops/prospecting/google/callback';
const encode=new TextEncoder();
const failureCodes=new Set(['token_request','missing_access_token','missing_refresh_token','token_type','required_scopes','token_expiry','profile_request','sender_addresses_request','sender_address','account_changed']);
const oauthErrors=['invalid_grant','invalid_client','unauthorized_client','invalid_request','unsupported_grant_type'];
for(const stage of ['token_request','profile_request','sender_addresses_request']){
 for(const reason of ['transport','response'])failureCodes.add(stage+'_'+reason);
 for(let status=300;status<=599;status++)failureCodes.add(stage+'_http_'+status);
}
for(const error of oauthErrors)failureCodes.add('token_request_http_400_'+error);
class GoogleGrantError extends Error { constructor(code){super('Google connection verification failed.');this.code=code;} }
// Only fixed application-owned codes may enter diagnostics. Provider messages,
// response bodies, URLs, account addresses and credentials are never included.
export const googleFailureCode=error=>error instanceof GoogleGrantError&&failureCodes.has(error.code)?error.code:'unexpected';
export const googleNeedsConsent=error=>['token_request_http_400_invalid_grant','required_scopes','sender_address','account_changed','profile_request_http_401','sender_addresses_request_http_401'].includes(googleFailureCode(error));
export const googleRefreshedTokens=error=>error instanceof GoogleGrantError?error.refreshedTokens:null;
const validToken=v=>typeof v==='string'&&v.length>0&&v.length<=16384&&!/[\u0000-\u0020\u007f]/.test(v);
export function storedGoogleTokens(value){try{const v=JSON.parse(value);return validToken(v?.accessToken)&&validToken(v.refreshToken)&&typeof v.expiresAt==='string'&&Number.isFinite(Date.parse(v.expiresAt))?v:null;}catch{return null;}}
export const hex=bytes=>[...bytes].map(n=>n.toString(16).padStart(2,'0')).join('');
export const randomSecret=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export async function digest(value){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(value))));}
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
export function googleConfiguration(env={}){
 let origin;try{const u=new URL(env.BLOOMOPS_APP_URL);if(u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='https:'||(env.BLOOMOPS_ENV==='development'&&u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname))))return null;origin=u.origin;}catch{return null;}
 if(env.BLOOMOPS_GOOGLE_CONNECT_ENABLED!=='true'||typeof env.BLOOMOPS_GOOGLE_CLIENT_ID!=='string'||!env.BLOOMOPS_GOOGLE_CLIENT_ID.endsWith('.apps.googleusercontent.com')||/\s/.test(env.BLOOMOPS_GOOGLE_CLIENT_ID)||!env.BLOOMOPS_GOOGLE_CLIENT_SECRET||!/^[0-9a-f]{64}$/i.test(env.BLOOMOPS_GOOGLE_TOKEN_KEY||''))return null;
 return {clientId:env.BLOOMOPS_GOOGLE_CLIENT_ID,clientSecret:env.BLOOMOPS_GOOGLE_CLIENT_SECRET,key:env.BLOOMOPS_GOOGLE_TOKEN_KEY,redirectUri:origin+GOOGLE_CALLBACK};
}
async function keyFor(config){return crypto.subtle.importKey('raw',Uint8Array.from(config.key.match(/../g),v=>parseInt(v,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function sealGoogle(config,context,value){const iv=crypto.getRandomValues(new Uint8Array(12)),key=await keyFor(config),ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encode.encode('bloomsi-google:'+context)},key,encode.encode(value));return 'v1.'+b64(iv)+'.'+b64(new Uint8Array(ct));}
export async function openGoogle(config,context,box){try{const [v,iv,ct,...rest]=box.split('.');if(v!=='v1'||rest.length)return null;return new TextDecoder('utf-8',{fatal:true}).decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(iv),additionalData:encode.encode('bloomsi-google:'+context)},await keyFor(config),unb64(ct)));}catch{return null;}}
export async function googleAuthUrl(config,{state,verifier,email}){
 const challenge=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encode.encode(verifier))));
 return 'https://accounts.google.com/o/oauth2/v2/auth?'+new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:GOOGLE_SCOPES.join(' '),access_type:'offline',prompt:'consent',state,login_hint:email,code_challenge:challenge,code_challenge_method:'S256'});
}
async function responseJson(response){
 const reader=response.body?.getReader();if(!reader)throw new Error('Missing Google response.');let size=0,chunks=[];
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536){await reader.cancel();throw new Error('Google response is too large.');}chunks.push(value);}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
async function request(fetcher,url,options={},stage){
 // Workers supports manual/follow only. Never follow a provider redirect:
 // the !ok guard below rejects 3xx without forwarding credentials elsewhere.
 let response;try{response=await fetcher(url,{...options,redirect:'manual',signal:AbortSignal.timeout(15000)});}catch{throw new GoogleGrantError(stage+'_transport');}
 if(!response.ok){
  let suffix='';
  if(stage==='token_request'&&response.status===400){try{const body=await responseJson(response);if(oauthErrors.includes(body?.error))suffix='_'+body.error;}catch{}}
  else{try{await response.body?.cancel();}catch{}}
  throw new GoogleGrantError(stage+'_http_'+response.status+suffix);
 }
 try{return await responseJson(response);}catch{throw new GoogleGrantError(stage+'_response');}
}
export async function verifyGoogleGrant(config,{code,verifier,senderEmail,fetcher=fetch}){
 const token=await request(fetcher,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code,code_verifier:verifier,client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,grant_type:'authorization_code'})},'token_request');
 const tokens=validatedTokens(token);
 return {...await verifyIdentity(fetcher,tokens.accessToken,senderEmail),tokens};
}
function validatedTokens(token,previous){
 if(!validToken(token?.access_token))throw new GoogleGrantError('missing_access_token');
 const refresh=token.refresh_token===undefined?previous?.refreshToken:token.refresh_token;
 if(!validToken(refresh))throw new GoogleGrantError('missing_refresh_token');
 if(typeof token.token_type!=='string'||token.token_type.toLowerCase()!=='bearer')throw new GoogleGrantError('token_type');
 const scope=token.scope===undefined?previous?.scope:token.scope;
 if(typeof scope!=='string'||!GOOGLE_SCOPES.every(s=>scope.split(/\s+/).includes(s)))throw new GoogleGrantError('required_scopes');
 if(!Number.isFinite(token.expires_in)||token.expires_in<=0||token.expires_in>86400)throw new GoogleGrantError('token_expiry');
 return {accessToken:token.access_token,refreshToken:refresh,expiresAt:new Date(Date.now()+token.expires_in*1000).toISOString()};
}
async function verifyIdentity(fetcher,accessToken,senderEmail){
 const headers={authorization:'Bearer '+accessToken};
 const account=await request(fetcher,'https://gmail.googleapis.com/gmail/v1/users/me/profile',{headers},'profile_request'),aliases=await request(fetcher,'https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs',{headers},'sender_addresses_request');
 const address=v=>typeof v==='string'&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
 if(!address(account?.emailAddress)||!Array.isArray(aliases?.sendAs)||!aliases.sendAs.some(a=>typeof a?.sendAsEmail==='string'&&a.sendAsEmail.toLowerCase()===senderEmail&&(a.isPrimary===true?account.emailAddress.toLowerCase()===senderEmail:a.verificationStatus==='accepted')))throw new GoogleGrantError('sender_address');
 return {accountEmail:account.emailAddress.toLowerCase(),scope:GOOGLE_SCOPES.join(' ')};
}
export async function refreshGoogleGrant(config,{tokens,scope,senderEmail,accountEmail,fetcher=fetch}){
 if(!validToken(tokens?.refreshToken))throw new GoogleGrantError('missing_refresh_token');
 const response=await request(fetcher,'https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({refresh_token:tokens.refreshToken,client_id:config.clientId,client_secret:config.clientSecret,grant_type:'refresh_token'})},'token_request');
 const refreshed=validatedTokens(response,{refreshToken:tokens.refreshToken,scope});
 try{const identity=await verifyIdentity(fetcher,refreshed.accessToken,senderEmail);if(identity.accountEmail!==accountEmail)throw new GoogleGrantError('account_changed');return {...identity,tokens:refreshed};}
 catch(error){if(error instanceof GoogleGrantError)Object.defineProperty(error,'refreshedTokens',{value:refreshed});throw error;}
}
