import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceFixture} from './_prospect-source-fixture.mjs';
import {run,one,all} from './_bloomops-db.mjs';
import {saveProspectSender} from '../lib/bloomops/prospect-outreach.mjs';
import {beginProspectGoogle,finishProspectGoogle,getProspectGoogle,disconnectProspectGoogle,checkProspectGoogle} from '../lib/bloomops/prospect-google.mjs';
import {googleConfiguration,GOOGLE_SCOPES,openGoogle,sealGoogle,refreshGoogleGrant,googleFailureCode,googleNeedsConsent,googleRefreshedTokens} from '../lib/bloomops/prospect-google-provider.mjs';
const env={BLOOMOPS_ENV:'development',BLOOMOPS_APP_URL:'http://localhost:8787',BLOOMOPS_GOOGLE_CONNECT_ENABLED:'true',BLOOMOPS_GOOGLE_CLIENT_ID:'synthetic.apps.googleusercontent.com',BLOOMOPS_GOOGLE_CLIENT_SECRET:'synthetic-secret',BLOOMOPS_GOOGLE_TOKEN_KEY:'12'.repeat(32)};
const config=googleConfiguration(env),scope=GOOGLE_SCOPES.join(' '),input={workspaceId:'fresh',expectedRevision:1,senderRevision:1};
const token={access_token:'new-access',refresh_token:'new-refresh',scope,token_type:'Bearer',expires_in:3600};
const provider=(patch={})=>async(url,options)=>{
 assert.equal(options.redirect,'manual');
 if(url.endsWith('/token'))return Response.json({...token,...patch.token});
 if(url.endsWith('/profile'))return Response.json({emailAddress:'hello@example.test',...patch.profile});
 assert.ok(url.endsWith('/sendAs'));return Response.json({sendAs:[{sendAsEmail:'hello@example.test',isPrimary:true}],...patch.aliases});
};
const row=t=>one(t.raw,'SELECT * FROM prospect_google_connections');
const contents=async t=>JSON.parse(await openGoogle(config,'fresh:tokens',row(t).token_box));
const checks=t=>one(t.raw,"SELECT count(*) n FROM activity_events WHERE event_type='PROSPECT_GOOGLE_CHECKED'").n;
const cool=t=>run(t.raw,"UPDATE prospect_google_connections SET checked_at='2000-01-01T00:00:00.000Z'");
async function setup(c){
 const t=await sourceFixture(c);t.sessionId='test-session';run(t.raw,'INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)',t.sessionId,'owner','synthetic-session-token',Date.now()+86400000,Date.now(),Date.now());
 await saveProspectSender(t.db,t.actor,{workspaceId:'fresh',expectedRevision:0,fields:{provider:'google_workspace',email:'hello@example.test',displayName:'Ary'}});
 const start=await beginProspectGoogle(t.db,t.actor,env,t.sessionId,{workspaceId:'fresh',senderRevision:1,expectedRevision:0});
 assert.ok((await finishProspectGoogle(t.db,t.actor,env,t.sessionId,{state:new URL(start.url).searchParams.get('state'),code:'synthetic-code'},{fetcher:provider()})).connected);cool(t);return t;
}
const check=(t,options={},payload=input)=>checkProspectGoogle(t.db,t.actor,env,t.sessionId,payload,{fetcher:provider(),...options});
test('check refreshes an expired token, retains omitted refresh/scope and reports no secret fields',async c=>{
 const t=await setup(c),old=await contents(t);old.expiresAt='2000-01-01T00:00:00.000Z';run(t.raw,'UPDATE prospect_google_connections SET token_box=?',await sealGoogle(config,'fresh:tokens',JSON.stringify(old)));
 assert.equal((await getProspectGoogle(t.db,t.actor,env)).status,'check-needed');
 let calls=0;const fetcher=async(url,options)=>{calls++;if(url.endsWith('/token')){assert.equal(options.body.get('grant_type'),'refresh_token');assert.equal(options.body.get('refresh_token'),old.refreshToken);return Response.json({access_token:'fresh-access',token_type:'Bearer',expires_in:3600});}return provider()(url,options);};
 assert.deepEqual(await check(t,{fetcher}),{checked:true,status:'healthy'});assert.equal(calls,3);assert.equal((await contents(t)).refreshToken,old.refreshToken);assert.equal((await contents(t)).accessToken,'fresh-access');
 const status=await getProspectGoogle(t.db,t.actor,env);assert.ok(status.connected&&status.canCheck);assert.equal(status.revision,2);assert.equal(checks(t),1);assert.equal(row(t).check_id,null);assert.ok(!JSON.stringify(status).match(/token|secret|verifier|fresh-access/i));assert.ok(!row(t).token_box.includes('fresh-access'));
 assert.equal(one(t.raw,'SELECT count(*) n FROM gmail_accounts').n,0);assert.equal(one(t.raw,'SELECT count(*) n FROM send_events').n,0);assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);
});
test('successful refresh rotation is retained and a just-completed check cannot repeat provider access',async c=>{
 const t=await setup(c);assert.ok((await check(t,{fetcher:provider({token:{refresh_token:'rotated-refresh'}})})).checked);assert.equal((await contents(t)).refreshToken,'rotated-refresh');let called=false;
 assert.ok((await check(t,{fetcher:()=>{called=true;}},{...input,expectedRevision:2})).conflict);assert.equal(called,false);assert.equal(checks(t),1);
});
test('denied authority, wrong workspace/session/revision and missing config make no provider call or write',async c=>{
 const t=await setup(c),before=JSON.stringify(row(t));let called=false;const options={fetcher:()=>{called=true;}};
 for(const actor of [null,{...t.actor,role:'client'},{...t.actor,role:'team_member'},{...t.actor,role:'project_manager'}])assert.equal(await checkProspectGoogle(t.db,actor,env,t.sessionId,input,options),null);
 assert.equal(await checkProspectGoogle(t.db,{...t.actor,workspaceId:'source',membershipId:'src'},env,t.sessionId,{...input,workspaceId:'source'},options),null);
 for(const patch of [{workspaceId:'other'},{expectedRevision:0},{expectedRevision:7},{senderRevision:9},{extra:true}])assert.ok((await check(t,options,{...input,...patch})).conflict);
 assert.ok((await checkProspectGoogle(t.db,t.actor,env,'wrong-session',input,options)).conflict);
 assert.ok((await checkProspectGoogle(t.db,t.actor,{},t.sessionId,input,options)).unavailable);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'");assert.equal(await check(t,options),null);
 assert.equal(called,false);assert.equal(JSON.stringify(row(t)),before);assert.equal(checks(t),0);
});
test('concurrent checks claim once; disconnect wins over the pending response',async c=>{
 const t=await setup(c);let entered,release,calls=0;const pending=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const first=check(t,{fetcher:async(url,options)=>{calls++;if(url.endsWith('/token')){entered();await gate;}return provider()(url,options);}});await pending;
 assert.equal((await getProspectGoogle(t.db,t.actor,env)).status,'checking');assert.ok((await check(t)).conflict);assert.equal(calls,1);
 assert.ok((await disconnectProspectGoogle(t.db,t.actor,{workspaceId:'fresh',expectedRevision:2})).disconnected);release();assert.ok((await first).conflict);assert.equal(row(t).active,0);assert.equal(row(t).token_box,null);assert.equal(checks(t),0);
});
test('sender, actor, original-authorizer and session changes during a check cannot store a late grant',async c=>{
 for(const mutation of ["UPDATE prospect_senders SET revision=revision+1","UPDATE workspace_memberships SET role='team_member' WHERE id='dest'","UPDATE workspace_memberships SET updated_at='changed' WHERE id='dest'","DELETE FROM session"]){
  const t=await setup(c),box=row(t).token_box;let changed=false;
  const result=await check(t,{fetcher:async(url,options)=>{if(!changed){changed=true;run(t.raw,mutation);}return provider()(url,options);}});
  assert.ok(result.conflict);assert.equal(row(t).token_box,box);assert.equal(checks(t),0);
 }
});
test('a newly reconnected grant wins over a pending refresh',async c=>{
 const t=await setup(c);let entered,release;const pending=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const first=check(t,{fetcher:async(url,options)=>{if(url.endsWith('/token')){entered();await gate;}return provider()(url,options);}});await pending;
 const start=await beginProspectGoogle(t.db,t.actor,env,t.sessionId,{...input,expectedRevision:2});assert.ok(start.url);
 assert.ok((await finishProspectGoogle(t.db,t.actor,env,t.sessionId,{state:new URL(start.url).searchParams.get('state'),code:'synthetic-code'},{fetcher:provider({token:{refresh_token:'reconnected-refresh'}})})).connected);
 release();assert.ok((await first).conflict);assert.equal((await contents(t)).refreshToken,'reconnected-refresh');assert.equal(checks(t),0);
});
test('another administrator cannot keep a revoked original authorizer grant alive',async c=>{
 const t=await setup(c);run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('admin-check','fresh','stranger','admin','active')");
 run(t.raw,'INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)','admin-session','stranger','synthetic-admin-token',Date.now()+86400000,Date.now(),Date.now());
 const actor={...t.actor,membershipId:'admin-check',userId:'stranger',role:'admin'},box=row(t).token_box;let changed=false;
 const result=await checkProspectGoogle(t.db,actor,env,'admin-session',input,{fetcher:async(url,options)=>{if(!changed){changed=true;run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'");}return provider()(url,options);}});
 assert.ok(result.conflict);assert.equal(row(t).token_box,box);assert.equal(checks(t),0);assert.equal((await getProspectGoogle(t.db,actor,env)).connected,false);
});
test('expired leases can recover while late responses cannot complete',async c=>{
 const t=await setup(c);run(t.raw,"UPDATE prospect_google_connections SET check_id='abandoned',check_expires_at='2000-01-01T00:00:00.000Z'");assert.ok((await check(t)).checked);
 cool(t);const box=row(t).token_box,start=Date.now();let n=0;assert.ok((await check(t,{clock:()=>new Date(start+(n++?91000:0))},{...input,expectedRevision:2})).conflict);assert.equal(row(t).token_box,box);assert.equal(checks(t),1);
});
test('invalid refresh grants and reduced consent require reconnect but retain the encrypted grant',async c=>{
 for(const fetcher of [async()=>Response.json({error:'invalid_grant',error_description:'PRIVATE'},{status:400}),provider({token:{scope:GOOGLE_SCOPES[0]}})]){
  const t=await setup(c),box=row(t).token_box;assert.equal((await check(t,{fetcher})).status,'reconnect');assert.equal(row(t).token_box,box);const status=await getProspectGoogle(t.db,t.actor,env);assert.equal(status.status,'reconnect');assert.equal(status.canCheck,false);assert.equal(status.hasStoredGrant,true);assert.equal(checks(t),1);
 }
});
test('transient failures retain grants, distinguish unknown from connected, and allow a later retry',async c=>{
 for(const fetcher of [async()=>{throw new Error('PRIVATE transport');},async()=>new Response('PRIVATE',{status:503}),async()=>Response.json({error:'invalid_client'},{status:400})]){
  const t=await setup(c),box=row(t).token_box;assert.equal((await check(t,{fetcher})).status,'temporary');assert.equal(row(t).token_box,box);const status=await getProspectGoogle(t.db,t.actor,env);assert.equal(status.status,'check-failed');assert.equal(status.connected,false);assert.equal(status.canCheck,true);
  cool(t);assert.equal((await check(t,{}, {...input,expectedRevision:2})).status,'healthy');assert.equal(checks(t),2);
 }
});
test('rotation survives a later temporary identity failure without claiming verified access',async c=>{
 const t=await setup(c);const fetcher=async(url,options)=>url.endsWith('/profile')?new Response(null,{status:503}):provider({token:{refresh_token:'rotated-before-profile-error'}})(url,options);
 assert.equal((await check(t,{fetcher})).status,'temporary');assert.equal((await contents(t)).refreshToken,'rotated-before-profile-error');assert.equal((await getProspectGoogle(t.db,t.actor,env)).connected,false);
 cool(t);assert.ok((await check(t,{fetcher:async(url,options)=>{if(url.endsWith('/token'))assert.equal(options.body.get('refresh_token'),'rotated-before-profile-error');return provider()(url,options);}},{...input,expectedRevision:2})).checked);
});
test('changed account and removed sender permission fail closed after refresh',async c=>{
 for(const patch of [{profile:{emailAddress:'other@example.test'},aliases:{sendAs:[{sendAsEmail:'hello@example.test',verificationStatus:'accepted'}]}},{aliases:{sendAs:[]}}]){
  const t=await setup(c);assert.equal((await check(t,{fetcher:provider(patch)})).status,'reconnect');assert.equal((await getProspectGoogle(t.db,t.actor,env)).connected,false);
 }
});
test('failed completion event rolls back token replacement and permits eventual lease recovery',async c=>{
 const t=await setup(c),box=row(t).token_box;run(t.raw,"CREATE TRIGGER fail_check BEFORE INSERT ON activity_events WHEN NEW.event_type='PROSPECT_GOOGLE_CHECKED' BEGIN SELECT RAISE(ABORT,'fixture'); END;");
 await assert.rejects(()=>check(t));assert.equal(row(t).token_box,box);assert.ok(row(t).check_id);assert.equal(checks(t),0);assert.equal(row(t).revision,2);
});
test('a check invalidates pre-existing OAuth callbacks without consuming their code',async c=>{
 const t=await setup(c),start=await beginProspectGoogle(t.db,t.actor,env,t.sessionId,input);await check(t);let called=false;
 assert.ok((await finishProspectGoogle(t.db,t.actor,env,t.sessionId,{state:new URL(start.url).searchParams.get('state'),code:'synthetic'},{fetcher:()=>{called=true;}})).conflict);assert.equal(called,false);
});
test('malformed refresh values cannot fall back silently; diagnostics never serialize rotated tokens',async()=>{
 const args={tokens:{refreshToken:'old-refresh'},scope,senderEmail:'hello@example.test',accountEmail:'hello@example.test'};
 for(const patch of [{refresh_token:null},{refresh_token:''},{scope:null},{scope:''},{expires_in:'3600'}])await assert.rejects(()=>refreshGoogleGrant(config,{...args,fetcher:provider({token:patch})}));
 await assert.rejects(()=>refreshGoogleGrant(config,{...args,fetcher:async(url,options)=>url.endsWith('/profile')?new Response(null,{status:503}):provider()(url,options)}),error=>{assert.equal(googleFailureCode(error),'profile_request_http_503');assert.equal(googleNeedsConsent(error),false);assert.equal(googleRefreshedTokens(error).refreshToken,'new-refresh');assert.ok(!JSON.stringify(error).includes('new-refresh'));return true;});
});
