#!/usr/bin/env node
// Synthetic-only D1 fixtures in the existing isolated test database, never8787.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {dirname,resolve,join} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {bloomOpsDb} from '../lib/bloomops/db.mjs';
import {loadActor} from '../lib/bloomops/authorization.mjs';
import {resolveWorkspaceAccess} from '../lib/bloomops/membership.mjs';
import {createProspect,updateProspect} from '../lib/bloomops/prospects.mjs';
import {saveProspectSender,saveProspectOutreach,approveProspectOutreach} from '../lib/bloomops/prospect-outreach.mjs';
import {getProspectDelivery,prepareProspectDelivery,sendProspectIntroduction,cancelProspectDelivery} from '../lib/bloomops/prospect-delivery.mjs';
import {getProspectReplies,checkProspectReplies,stopProspectOutreach} from '../lib/bloomops/prospect-replies.mjs';
import {checkProspectMailbox,getProspectDiscoveryState,recoverProspectMailbox,getProspectRecovery,checkpointProspectMailbox} from '../lib/bloomops/prospect-mailbox.mjs';
import {checkProspectDeliveryReport} from '../lib/bloomops/prospect-report-checks.mjs';
import {fixture,encode,dsn} from '/home/ary/Developer/bloomops-prospecting-p2/tests/_prospect-delivery-report-fixture.mjs';
import {getRecipientProtection} from '../lib/bloomops/prospect-recipient-protection.mjs';
import {sealGoogle,GOOGLE_SCOPES} from '../lib/bloomops/prospect-google-provider.mjs';
const out=resolve(process.argv[2]),configPath=resolve(process.argv[3]),config=JSON.parse(readFileSync(configPath,'utf8'));
assert.equal(config.d1_databases[0].database_id,'bloomops-p3c1-isolated');
const require=createRequire('/home/ary/Developer/bloomops-prospecting-p2/package.json'),wrangler=dirname(require.resolve('wrangler/package.json')),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wrangler]}));
const checks=[];mkdirSync(out,{recursive:true});const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('ok '+name);};
const mf=new Miniflare(convertV4MiniflareOptions({compatibilityDate:'2025-05-01',cf:false,modules:true,script:'export default {fetch(){return new Response("synthetic only")}}',d1Databases:{DB:'bloomops-p3c1-isolated'},resourcePersistencePath:join(dirname(configPath),'.wrangler/state/v3')}));
try{
 const binding=await mf.getD1Database('DB'),db=bloomOpsDb(binding),first=(sql,...args)=>binding.prepare(sql).bind(...args).first(),run=(sql,...args)=>binding.prepare(sql).bind(...args).run();
 check('Native isolated database has migration38',(await first('SELECT count(*) n FROM d1_migrations')).n===38);
 const prefix='p3c3d3-'+crypto.randomUUID().slice(0,8),ws=prefix+'-ws',user=prefix+'-owner',member=prefix+'-member',session=prefix+'-session',email=user+'@example.test',now=Date.now();
 await binding.batch([binding.prepare("INSERT INTO workspaces(id,name,slug,purpose) VALUES(?,?,?,'prospecting')").bind(ws,'Garden Prospecting',ws),binding.prepare('INSERT INTO user(id,name,email,email_verified) VALUES(?,?,?,1)').bind(user,'Local Owner',email),binding.prepare("INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES(?,?,?,'owner','active')").bind(member,ws,user),binding.prepare('INSERT INTO session(id,user_id,token,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind(session,user,prefix+'-token',now+86400000,now,now)]);
 const actor=await loadActor(db,await resolveWorkspaceAccess(db,user,{workspaceId:ws})),env={BLOOMOPS_ENV:'development',BLOOMOPS_MAIL_TRANSPORT:'r2-dev',BLOOMOPS_APP_URL:'http://localhost:8788',BLOOMOPS_GOOGLE_CONNECT_ENABLED:'true',BLOOMOPS_GOOGLE_CLIENT_ID:'synthetic.apps.googleusercontent.com',BLOOMOPS_GOOGLE_CLIENT_SECRET:'synthetic-secret',BLOOMOPS_GOOGLE_TOKEN_KEY:'12'.repeat(32),BLOOMOPS_GOOGLE_TEST_SEND_ENABLED:'true',BLOOMOPS_GOOGLE_TEST_RECIPIENT:'inbox@example.test'};
 await saveProspectSender(db,actor,{workspaceId:ws,expectedRevision:0,fields:{provider:'google_workspace',email:'hello@example.test',displayName:'Ary at Bloomwired'}});
 const tokenBox=await sealGoogle({key:env.BLOOMOPS_GOOGLE_TOKEN_KEY},ws+':tokens',JSON.stringify({accessToken:'synthetic-access',refreshToken:'synthetic-refresh',expiresAt:new Date(now+3600000).toISOString()}));
 await run("INSERT INTO prospect_google_connections(workspace_id,revision,sender_email,account_email,token_box,granted_scope,active,authorized_by_membership_id,authorizer_updated_at,check_status) SELECT ?,1,'hello@example.test','hello@example.test',?,?,1,id,updated_at,'healthy' FROM workspace_memberships WHERE id=?",ws,tokenBox,GOOGLE_SCOPES.join(' '),member);
 const create=async name=>{
  const fields={recipient:'inbox@example.test',timeZone:'America/Los_Angeles',subject:'Bloomsi controlled delivery check',intro:'Hi Ary,\n\nThis is a controlled test of Bloomsi email delivery. No reply or action is needed.\n\nAry at Bloomwired',followUp2:'Unused test follow-up.',followUp3:'Unused test follow-up.'};
  const {prospectId}=await createProspect(db,{actor,input:{workspaceId:ws,requestId:crypto.randomUUID(),fields:{businessName:name,publicEmail:fields.recipient,timeZone:fields.timeZone,fit:'strong',observedFacts:'Synthetic controlled inbox.',evidenceDate:'2026-09-13',evidenceTarget:'https://example.test',proposedWork:'Check the controlled introduction.'}}});
  await updateProspect(db,{actor,id:prospectId,input:{workspaceId:ws,expectedRevision:1,fields:{publicEmail:fields.recipient},sources:{publicEmail:{url:'https://example.test/contact',checked:true}}}});
  const revisions={workspaceId:ws,prospectId,expectedRevision:0,expectedProfileRevision:2,expectedSenderRevision:1};assert.ok((await saveProspectOutreach(db,actor,{...revisions,sourceResultId:null,fields})).saved);assert.ok((await approveProspectOutreach(db,actor,{...revisions,expectedRevision:1,reviewed:true})).approved);
  const data=await getProspectDelivery(db,actor,env,prospectId);return {workspaceId:ws,prospectId,approvalId:data.approvalId};
 };
 const input=await create('Native delivery fixture'),prepared=await Promise.all([1,2].map(()=>prepareProspectDelivery(db,actor,input)));
 check('Native preparation retries make one immutable receipt',prepared[0].deliveryId===prepared[1].deliveryId);env.BLOOMOPS_GOOGLE_TEST_DELIVERY_ID=prepared[0].deliveryId;
 const command={workspaceId:ws,prospectId:input.prospectId,deliveryId:prepared[0].deliveryId};let calls=0;
 const results=await Promise.all([1,2].map(()=>sendProspectIntroduction(db,actor,env,session,{...command,reviewed:true},{fetcher:async()=>{calls++;return Response.json({id:'native-message',threadId:'native-thread'});}})));
 check('Native concurrent sends contact the injected provider once',calls===1&&results.filter(r=>r.processed).length===1);
 const row=await first('SELECT * FROM prospect_deliveries WHERE id=?',command.deliveryId);check('Native acceptance preserves provider message and thread',row.state==='accepted'&&row.provider_message_id==='native-message'&&row.provider_thread_id==='native-thread');
 check('Native replay cannot send again',(await sendProspectIntroduction(db,actor,env,session,{...command,reviewed:true})).conflict);
 check('Submitted mail cannot be cancelled as though recalled',(await cancelProspectDelivery(db,actor,command)).conflict);


 Object.assign(env,{BLOOMOPS_GOOGLE_REPLY_CHECK_ENABLED:'true',BLOOMOPS_GOOGLE_REPLY_DELIVERY_ID:command.deliveryId,BLOOMOPS_GOOGLE_DISCOVERY_ENABLED:'true',BLOOMOPS_GOOGLE_DISCOVERY_WORKSPACE_ID:ws,BLOOMOPS_GOOGLE_DISCOVERY_ACCOUNT_EMAIL:'hello@example.test'});
 const replyData=await getProspectReplies(db,actor,env,input.prospectId),rfc='<native-mailbox-original@example.test>';
 const sent={id:'native-message',threadId:'native-thread',labelIds:['SENT'],internalDate:String(now),payload:{headers:[{name:'Message-ID',value:rfc},{name:'From',value:'hello@example.test'},{name:'To',value:'inbox@example.test'}]}};
 assert.ok((await checkProspectReplies(db,actor,env,session,{...command,expectedRevision:replyData.revision,senderRevision:replyData.senderRevision,connectionRevision:replyData.connectionRevision,reviewed:true},{fetcher:async()=>Response.json({id:'native-thread',messages:[sent]})})).checked);
 const verify=process.argv[4]==='--verify';
 if(verify){
  const original={};for(const table of ['bloomops_prospects','prospect_outreach_drafts','prospect_outreach_approvals','prospect_deliveries','prospect_delivery_identities','prospect_reply_states'])original[table]=await first('SELECT * FROM '+table+' WHERE workspace_id=? LIMIT 1',ws);
  const clone=(table,patch)=>{const value={...original[table],...patch},keys=Object.keys(value);return binding.prepare('INSERT INTO '+table+'('+keys.join(',')+') VALUES('+keys.map(()=>'?').join(',')+')').bind(...Object.values(value));};
  for(let i=1;i<100;i++){
   const prospectId=crypto.randomUUID(),draftId=crypto.randomUUID(),approvalId=crypto.randomUUID(),id=crypto.randomUUID(),messageId='<bloomsi-'+id+'@bloomsi.invalid>',providerId='checkpoint-sent-'+i,threadId='checkpoint-thread-'+i;
   await binding.batch([clone('bloomops_prospects',{id:prospectId,creation_request_id:crypto.randomUUID()}),clone('prospect_outreach_drafts',{id:draftId,prospect_id:prospectId}),clone('prospect_outreach_approvals',{id:approvalId,draft_id:draftId}),clone('prospect_deliveries',{id,prospect_id:prospectId,approval_id:approvalId,message_id:messageId,provider_message_id:providerId,provider_thread_id:threadId}),clone('prospect_delivery_identities',{id:id+'-identity',prospect_id:prospectId,delivery_id:id,rfc_message_id:messageId,provider_message_id:providerId,provider_thread_id:threadId}),clone('prospect_reply_states',{prospect_id:prospectId,delivery_id:id})]);
  }
  const r=await getProspectReplies(db,actor,env,input.prospectId);assert.ok((await stopProspectOutreach(db,actor,session,{workspaceId:ws,prospectId:input.prospectId,deliveryId:command.deliveryId,expectedRevision:r.revision,reason:'manual',note:'Synthetic permanent stop',reviewed:true})).stopped);
 }
 let offset=0;const clock=()=>new Date(Date.now()+offset),state=()=>first('SELECT * FROM prospect_discovery_states WHERE workspace_id=?',ws);
 Object.assign(env,{BLOOMOPS_GOOGLE_RECOVERY_ENABLED:'true',BLOOMOPS_GOOGLE_CHECKPOINT_ENABLED:'true'});
 const mailboxInput=async()=>({workspaceId:ws,accountEmail:'hello@example.test',expectedRevision:(await state())?.revision||0,connectionRevision:1,senderRevision:1,reviewed:true});
 const collect=()=>recoverProspectMailbox(db,actor,env,session,mailboxInputValue,{clock,fetcher:async url=>{
  const u=new URL(url);if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:'hello@example.test',historyId:'100'});if(u.pathname.endsWith('/messages'))return Response.json({messages:[]});if(u.pathname.endsWith('/history'))return Response.json({historyId:'101'});throw Error('Unexpected synthetic request');
 }});
 let mailboxInputValue=await mailboxInput();assert.ok((await collect()).checked);const collection=await first('SELECT * FROM prospect_recovery_collections WHERE workspace_id=? ORDER BY created_at DESC LIMIT 1',ws);check('Native complete collection saves with zero unassigned messages',collection?.catchup_status==='complete'&&collection.unassigned_count===0);
 const source=()=>first("SELECT id FROM prospect_discovery_runs WHERE workspace_id=? AND kind='recovery' ORDER BY created_at DESC,id DESC",ws);
 if(verify){
  const before=await source(),cpinput={...await mailboxInput(),sourceRunId:before.id};let providerCalls=0;
  const results=await Promise.all([1,2].map(()=>checkpointProspectMailbox(db,actor,env,session,cpinput,{clock,fetcher:()=>{providerCalls++;throw Error('Forbidden');}})));
  check('Native concurrency commits one checkpoint',results.filter(x=>x.checked).length===1);
  check('Native checkpoint uses no provider request',providerCalls===0);
  const point=await first('SELECT * FROM prospect_monitoring_checkpoints WHERE workspace_id=?',ws);
  check('Native checkpoint snapshots100 targets',(await first('SELECT count(*) n FROM prospect_discovery_targets WHERE workspace_id=? AND run_id=?',ws,point.run_id)).n===100);
  check('Native operational cursor advances while historical gap remains',(await state()).history_id==='101'&&(await state()).coverage_status==='gap');
  check('Native permanent stop is preserved',(await first('SELECT hold_state FROM prospect_reply_states WHERE workspace_id=? AND prospect_id=?',ws,input.prospectId)).hold_state==='stopped');
  check('Native duplicate checkpoint is rejected',(await checkpointProspectMailbox(db,actor,env,session,{...await mailboxInput(),sourceRunId:before.id},{clock})).conflict);
  offset=31000;mailboxInputValue=await mailboxInput();assert.ok((await collect()).checked);const freshSource=await source(),prior=await state();
  await run("CREATE TRIGGER reject_checkpoint_native BEFORE INSERT ON prospect_monitoring_checkpoints BEGIN SELECT RAISE(ABORT,'injected native checkpoint'); END");
  await assert.rejects(checkpointProspectMailbox(db,actor,env,session,{...await mailboxInput(),sourceRunId:freshSource.id},{clock}),/injected native checkpoint/);
  check('Native failed claim rolls back without partial checkpoint',(await first('SELECT count(*) n FROM prospect_monitoring_checkpoints WHERE workspace_id=?',ws)).n===1&&JSON.stringify(await state())===JSON.stringify(prior));await run('DROP TRIGGER reject_checkpoint_native');
  for(const statement of ['UPDATE prospect_monitoring_checkpoints SET source_run_id=source_run_id WHERE workspace_id=?','DELETE FROM prospect_monitoring_checkpoints WHERE workspace_id=?'])await assert.rejects(()=>run(statement,ws),/immutable|retained/);
  check('Native provenance is immutable',true);writeFileSync(join(out,'native-acceptance.json'),JSON.stringify({checks},null,2));console.log('PASS '+checks.length+' native checks');
 }else{
  writeFileSync(join(out,'browser-fixture.json'),JSON.stringify({workspaceId:ws,email,memberId:member,configPath,deliveryId:command.deliveryId,recipient:'inbox@example.test'},null,2));console.log('Synthetic checkpoint browser fixture ready.');
 }
}finally{await mf.dispose();}
