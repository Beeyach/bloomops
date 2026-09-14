#!/usr/bin/env node
// Native local D1, injected synthetic Google responses, no external service.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,resolve,join} from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
import {bloomOpsDb} from '../lib/bloomops/db.mjs';
import {loadActor} from '../lib/bloomops/authorization.mjs';
import {resolveWorkspaceAccess} from '../lib/bloomops/membership.mjs';
import {saveProspectSender} from '../lib/bloomops/prospect-outreach.mjs';
import {beginProspectGoogle,finishProspectGoogle,getProspectGoogle,disconnectProspectGoogle,checkProspectGoogle} from '../lib/bloomops/prospect-google.mjs';
import {GOOGLE_SCOPES,googleConfiguration,openGoogle} from '../lib/bloomops/prospect-google-provider.mjs';
const require=createRequire(import.meta.url),wrangler=dirname(require.resolve('wrangler/package.json')),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wrangler]}));
const out=resolve(process.argv[2]||'/tmp/bloomops-p3b-native'),checks=[];mkdirSync(out,{recursive:true});const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('ok '+name);};
const mf=new Miniflare(convertV4MiniflareOptions({compatibilityDate:'2025-05-01',cf:false,modules:true,script:'export default {fetch(){return new Response("synthetic local only")}}',d1Databases:{DB:'bloomops-dev-local'},resourcePersistencePath:resolve('.wrangler/state/v3')}));
try{
 const binding=await mf.getD1Database('DB'),db=bloomOpsDb(binding);check('Native development database has migration31',(await binding.prepare('SELECT count(*) n FROM d1_migrations').first()).n===31);
 const prefix='p3b-native-'+crypto.randomUUID().slice(0,8),ws=prefix+'-ws',user=prefix+'-owner',member=prefix+'-member',session=prefix+'-session',now=Date.now();
 await binding.batch([binding.prepare("INSERT INTO workspaces(id,name,slug,purpose) VALUES(?,?,?,'prospecting')").bind(ws,'Google local fixture',ws),binding.prepare('INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)').bind(user,'Local Google Owner',user+'@example.test'),binding.prepare("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,'owner','active')").bind(member,ws,user),binding.prepare('INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(session,user,prefix+'-token',now+86400000,now,now)]);
 const actor=await loadActor(db,await resolveWorkspaceAccess(db,user,{workspaceId:ws}));await saveProspectSender(db,actor,{workspaceId:ws,expectedRevision:0,fields:{provider:'google_workspace',email:'hello@bloomwired.io',displayName:'Ary'}});
 const env={BLOOMOPS_ENV:'development',BLOOMOPS_APP_URL:'http://localhost:8787',BLOOMOPS_GOOGLE_CONNECT_ENABLED:'true',BLOOMOPS_GOOGLE_CLIENT_ID:'synthetic.apps.googleusercontent.com',BLOOMOPS_GOOGLE_CLIENT_SECRET:'synthetic-client-secret',BLOOMOPS_GOOGLE_TOKEN_KEY:'12'.repeat(32)};let calls=0;
 const fetcher=async url=>{calls++;return new Response(JSON.stringify(url.endsWith('/token')?{access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600,token_type:'Bearer',scope:GOOGLE_SCOPES.join(' ')}:url.endsWith('/profile')?{emailAddress:'ary@bloomwired.io'}:{sendAs:[{sendAsEmail:'hello@bloomwired.io',verificationStatus:'accepted'}]}),{headers:{'content-type':'application/json'}});};
 const start=async revision=>{const data=await beginProspectGoogle(db,actor,env,session,{workspaceId:ws,senderRevision:1,expectedRevision:revision});assert.ok(data.url);return {state:new URL(data.url).searchParams.get('state'),code:'synthetic-code'};};
 const a=await start(0);check('Start returns only an authorization URL and makes no provider request',calls===0);const pair=await Promise.all([finishProspectGoogle(db,actor,env,session,a,{fetcher}),finishProspectGoogle(db,actor,env,session,a,{fetcher})]);check('Concurrent native callbacks exchange once and attach once',pair.filter(r=>r.connected).length===1&&calls===3);
 const status=await getProspectGoogle(db,actor,env);check('Matching accepted alias is connected',status.connected&&status.accountEmail==='ary@bloomwired.io');const row=await binding.prepare('SELECT token_box FROM prospect_google_connections WHERE workspace_id=?').bind(ws).first();check('Tokens are encrypted and workspace-bound',!row.token_box.includes('synthetic')&&JSON.parse(await openGoogle(googleConfiguration(env),ws+':tokens',row.token_box)).refreshToken==='synthetic-refresh'&&await openGoogle(googleConfiguration(env),'other:tokens',row.token_box)===null);
 check('Native replay is refused without provider access',(await finishProspectGoogle(db,actor,env,session,a,{fetcher})).conflict&&calls===3);
 const pending=await start(1);await disconnectProspectGoogle(db,actor,{workspaceId:ws,expectedRevision:1});check('Disconnect invalidates an outstanding consent callback',(await finishProspectGoogle(db,actor,env,session,pending,{fetcher})).conflict&&calls===3);check('Disconnect removes the stored token',(await binding.prepare('SELECT token_box FROM prospect_google_connections WHERE workspace_id=?').bind(ws).first()).token_box===null);
 const primary=await start(2),primaryFetcher=async(url,options)=>{const response=await fetcher(url,options);return url.endsWith('/profile')?Response.json({emailAddress:'hello@bloomwired.io'}):url.endsWith('/sendAs')?Response.json({sendAs:[{sendAsEmail:'hello@bloomwired.io',isPrimary:true}]}):response;};
 check('Primary mailbox without alias verification status connects on native D1',(await finishProspectGoogle(db,actor,env,session,primary,{fetcher:primaryFetcher})).connected&&(await getProspectGoogle(db,actor,env)).accountEmail==='hello@bloomwired.io');
 await binding.prepare("UPDATE prospect_google_connections SET checked_at='2000-01-01T00:00:00.000Z' WHERE workspace_id=?").bind(ws).run();
 const checked=await Promise.all([1,2].map(()=>checkProspectGoogle(db,actor,env,session,{workspaceId:ws,senderRevision:1,expectedRevision:3},{fetcher:primaryFetcher})));
 check('Concurrent native connection checks refresh once and complete once',checked.filter(r=>r.checked).length===1&&calls===9);
 check('Native successful check stores its one scoped activity event',(await binding.prepare("SELECT count(*) n FROM activity_events WHERE workspace_id=? AND event_type='PROSPECT_GOOGLE_CHECKED'").bind(ws).first()).n===1);
 await disconnectProspectGoogle(db,actor,{workspaceId:ws,expectedRevision:4});
 const revoked=await start(5);await binding.prepare("UPDATE workspace_memberships SET status='suspended' WHERE id=?").bind(member).run();check('Native revocation refuses callback before provider access',(await finishProspectGoogle(db,actor,env,session,revoked,{fetcher})).conflict&&calls===9);check('Revoked actor cannot read connection status',await getProspectGoogle(db,actor,env)===null);
 check('Exactly two connection and two disconnect events',(await binding.prepare("SELECT count(*) n FROM activity_events WHERE workspace_id=? AND event_type IN ('PROSPECT_GOOGLE_CONNECTED','PROSPECT_GOOGLE_DISCONNECTED')").bind(ws).first()).n===4);
 check('Native foreign keys remain clean',(await binding.prepare('PRAGMA foreign_key_check').all()).results.length===0);
 writeFileSync(join(out,'native-results.json'),JSON.stringify({checks,passed:checks.length,workspaceId:ws,nativeD1:true,provider:'injected synthetic responses'},null,2)+'\n');
}finally{await mf.dispose();}
