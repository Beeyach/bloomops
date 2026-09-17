#!/usr/bin/env node
// Creates only disposable synthetic Overview records in an isolated local D1.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {bloomOpsDb} from '../lib/bloomops/db.mjs';
import {createProspect,updateProspect} from '../lib/bloomops/prospects.mjs';
import {saveProspectSender,saveProspectOutreach,approveProspectOutreach} from '../lib/bloomops/prospect-outreach.mjs';
import {getProspectDelivery,prepareProspectDelivery,sendProspectIntroduction} from '../lib/bloomops/prospect-delivery.mjs';
import {sealGoogle,GOOGLE_SCOPES} from '../lib/bloomops/prospect-google-provider.mjs';
import {checkProspectMailbox} from '../lib/bloomops/prospect-mailbox.mjs';

const out=resolve(process.argv[2]),configPath=resolve(process.argv[3]),config=JSON.parse(readFileSync(configPath,'utf8'));assert.equal(config.d1_databases[0].database_id,'bloomops-p3c1-isolated');mkdirSync(out,{recursive:true});
const require=createRequire(import.meta.url),wrangler=dirname(require.resolve('wrangler/package.json')),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wrangler]}));
const mf=new Miniflare(convertV4MiniflareOptions({compatibilityDate:'2025-05-01',cf:false,modules:true,script:'export default {fetch(){return new Response("synthetic only")}}',d1Databases:{DB:'bloomops-p3c1-isolated'},resourcePersistencePath:join(dirname(configPath),'.wrangler/state/v3')}));
try{
 const binding=await mf.getD1Database('DB'),db=bloomOpsDb(binding),run=(sql,...args)=>binding.prepare(sql).bind(...args).run(),first=(sql,...args)=>binding.prepare(sql).bind(...args).first();assert.ok((await first('SELECT count(*) n FROM d1_migrations')).n>=57);
 const prefix='overview-'+crypto.randomUUID().slice(0,8),workspaceId=prefix+'-ws',userId=prefix+'-owner',memberId=prefix+'-member',sessionId=prefix+'-session',email=userId+'@example.test',now=Date.now();
 const emptyWorkspaceId=prefix+'-empty-ws',emptyUserId=prefix+'-empty-owner',emptyMemberId=prefix+'-empty-member',emptyEmail=emptyUserId+'@example.test';
 await binding.batch([
  binding.prepare("INSERT INTO workspaces(id,name,slug,purpose) VALUES(?,?,?,'prospecting')").bind(workspaceId,'Synthetic Overview',workspaceId),
  binding.prepare('INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)').bind(userId,'Overview Owner',email),
  binding.prepare("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,'owner','active')").bind(memberId,workspaceId,userId),
  binding.prepare('INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(sessionId,userId,prefix+'-token',now+86400000,now,now),
  binding.prepare("INSERT INTO workspaces(id,name,slug,purpose) VALUES(?,?,?,'prospecting')").bind(emptyWorkspaceId,'Empty Overview',emptyWorkspaceId),
  binding.prepare('INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)').bind(emptyUserId,'Empty Owner',emptyEmail),
  binding.prepare("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,'owner','active')").bind(emptyMemberId,emptyWorkspaceId,emptyUserId),
 ]);
 const actor={workspaceId,membershipId:memberId,userId,role:'owner',status:'active',scope:{kind:'workspace'}},env={BLOOMOPS_ENV:'development',BLOOMOPS_MAIL_TRANSPORT:'r2-dev',BLOOMOPS_APP_URL:'http://localhost:8788',BLOOMOPS_GOOGLE_CONNECT_ENABLED:'true',BLOOMOPS_GOOGLE_CLIENT_ID:'synthetic.apps.googleusercontent.com',BLOOMOPS_GOOGLE_CLIENT_SECRET:'synthetic-secret',BLOOMOPS_GOOGLE_TOKEN_KEY:'12'.repeat(32),BLOOMOPS_GOOGLE_TEST_SEND_ENABLED:'true',BLOOMOPS_GOOGLE_TEST_RECIPIENT:'inbox@example.test',BLOOMOPS_GOOGLE_DISCOVERY_ENABLED:'true',BLOOMOPS_GOOGLE_DISCOVERY_WORKSPACE_ID:workspaceId,BLOOMOPS_GOOGLE_DISCOVERY_ACCOUNT_EMAIL:'hello@example.test'};
 await saveProspectSender(db,actor,{workspaceId,expectedRevision:0,fields:{provider:'google_workspace',email:'hello@example.test',displayName:'Ary at Bloomwired'}});
 const tokenBox=await sealGoogle({key:env.BLOOMOPS_GOOGLE_TOKEN_KEY},workspaceId+':tokens',JSON.stringify({accessToken:'synthetic-access',refreshToken:'synthetic-refresh',expiresAt:new Date(now+3600000).toISOString()}));
 await run("INSERT INTO prospect_google_connections(workspace_id,revision,sender_email,account_email,token_box,granted_scope,active,authorized_by_membership_id,authorizer_updated_at,check_status) SELECT ?,1,'hello@example.test','hello@example.test',?,?,1,id,updated_at,'healthy' FROM workspace_memberships WHERE id=?",workspaceId,tokenBox,GOOGLE_SCOPES.join(' '),memberId);
 const make=async(name,{deliver=false}={})=>{
  const fields={recipient:'inbox@example.test',timeZone:'America/Los_Angeles',subject:'Synthetic Overview review',intro:'Synthetic introduction for local verification only.',followUp2:'Synthetic follow-up two.',followUp3:'Synthetic follow-up three.'};
  const created=await createProspect(db,{actor,input:{workspaceId,requestId:crypto.randomUUID(),fields:{businessName:name,publicEmail:fields.recipient,timeZone:fields.timeZone,fit:'strong',observedFacts:'Synthetic local fixture.',evidenceDate:'2026-09-17',evidenceTarget:'https://example.test',proposedWork:'Review the synthetic exception.'}}});assert.ok(created.ok);
  await updateProspect(db,{actor,id:created.prospectId,input:{workspaceId,expectedRevision:1,fields:{publicEmail:fields.recipient},sources:{publicEmail:{url:'https://example.test/contact',checked:true}}}});
  const base={workspaceId,prospectId:created.prospectId,expectedRevision:0,expectedProfileRevision:2,expectedSenderRevision:1};assert.ok((await saveProspectOutreach(db,actor,{...base,sourceResultId:null,fields})).saved);
  if(!deliver)return {prospectId:created.prospectId};assert.ok((await approveProspectOutreach(db,actor,{...base,expectedRevision:1,reviewed:true})).approved);const view=await getProspectDelivery(db,actor,env,created.prospectId),receipt=await prepareProspectDelivery(db,actor,{workspaceId,prospectId:created.prospectId,approvalId:view.approvalId});env.BLOOMOPS_GOOGLE_TEST_DELIVERY_ID=receipt.deliveryId;assert.ok((await sendProspectIntroduction(db,actor,env,sessionId,{workspaceId,prospectId:created.prospectId,deliveryId:receipt.deliveryId,reviewed:true},{fetcher:async()=>Response.json({id:'message-'+created.prospectId,threadId:'thread-'+created.prospectId})})).processed);return {prospectId:created.prospectId,deliveryId:receipt.deliveryId};
 };
 const held=await make('Held Garden Studio',{deliver:true}),heldAgain=await make('Held Garden Workshop',{deliver:true}),stopped=await make('Stopped Garden Studio',{deliver:true}),draft=await make('Prepared Garden Studio');
 await run("INSERT INTO prospect_reply_states(workspace_id,prospect_id,delivery_id,revision,hold_state,check_status,checked_at) VALUES(?,?,?,1,'held','unresolved','2026-09-17T08:00:00.000Z')",workspaceId,held.prospectId,held.deliveryId);
 await run("INSERT INTO prospect_reply_states(workspace_id,prospect_id,delivery_id,revision,hold_state,check_status,checked_at) VALUES(?,?,?,1,'held','unresolved','2026-09-17T08:02:00.000Z')",workspaceId,heldAgain.prospectId,heldAgain.deliveryId);
 await run("INSERT INTO prospect_reply_states(workspace_id,prospect_id,delivery_id,revision,hold_state,check_status,stop_reason,stop_note,stopped_by_membership_id,stopped_at) VALUES(?,?,?,1,'stopped','never','manual','Owner recorded a contractual pause.',?,'2026-09-17T08:05:00.000Z')",workspaceId,stopped.prospectId,stopped.deliveryId,memberId);
 const discovery=await checkProspectMailbox(db,actor,env,sessionId,{workspaceId,accountEmail:'hello@example.test',expectedRevision:0,connectionRevision:1,senderRevision:1,reviewed:true},{fetcher:async()=>{throw new Error('Provider access was not expected for an incomplete identity registry.');}});assert.equal(discovery.status,'unresolved');assert.equal((await first('SELECT coverage_status status FROM prospect_discovery_states WHERE workspace_id=?',workspaceId)).status,'gap');
 writeFileSync(join(out,'browser-fixture.json'),JSON.stringify({workspaceId,userId,memberId,email,held,heldAgain,stopped,draftId:draft.prospectId,emptyWorkspaceId,emptyUserId,emptyMemberId,emptyEmail,configPath},null,2)+'\n');
}finally{await mf.dispose();}
