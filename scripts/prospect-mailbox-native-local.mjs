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
import {checkProspectMailbox,getProspectDiscoveryState,recoverProspectMailbox,getProspectRecovery} from '../lib/bloomops/prospect-mailbox.mjs';
import {getRecipientProtection} from '../lib/bloomops/prospect-recipient-protection.mjs';
import {sealGoogle,GOOGLE_SCOPES} from '../lib/bloomops/prospect-google-provider.mjs';
const out=resolve(process.argv[2]),configPath=resolve(process.argv[3]),config=JSON.parse(readFileSync(configPath,'utf8'));
assert.equal(config.d1_databases[0].database_id,'bloomops-p3c1-isolated');
const require=createRequire(import.meta.url),wrangler=dirname(require.resolve('wrangler/package.json')),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wrangler]}));
const checks=[];mkdirSync(out,{recursive:true});const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('ok '+name);};
const mf=new Miniflare(convertV4MiniflareOptions({compatibilityDate:'2025-05-01',cf:false,modules:true,script:'export default {fetch(){return new Response("synthetic only")}}',d1Databases:{DB:'bloomops-p3c1-isolated'},resourcePersistencePath:join(dirname(configPath),'.wrangler/state/v3')}));
try{
 const binding=await mf.getD1Database('DB'),db=bloomOpsDb(binding),first=(sql,...args)=>binding.prepare(sql).bind(...args).first(),run=(sql,...args)=>binding.prepare(sql).bind(...args).run();
 check('Native isolated database has migration36',(await first('SELECT count(*) n FROM d1_migrations')).n===36);
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
 const state=()=>first('SELECT * FROM prospect_discovery_states WHERE workspace_id=?',ws),reply=()=>first('SELECT * FROM prospect_reply_states WHERE workspace_id=? AND prospect_id=?',ws,input.prospectId);
 let offset=0,requests=0;
 const profile=async()=>{requests++;return Response.json({emailAddress:'hello@example.test',historyId:'9'});};
 const mailInput=async()=>({workspaceId:ws,accountEmail:'hello@example.test',expectedRevision:(await state())?.revision||0,connectionRevision:1,senderRevision:1,reviewed:true});
 const checkMail=async(fetcher=profile)=>checkProspectMailbox(db,actor,env,session,await mailInput(),{fetcher,clock:()=>new Date(now+offset)});
 const firstInput=await mailInput();
 const parallel=await Promise.all([1,2].map(()=>checkProspectMailbox(db,actor,env,session,firstInput,{fetcher:profile,clock:()=>new Date(now)})));
 check('Native mailbox claims permit one baseline request',requests===1&&parallel.filter(x=>x.checked).length===1);
 check('Native baseline keeps unverified coverage and holds recipient',(await state()).history_id==='9'&&(await state()).coverage_status==='unverified'&&(await getRecipientProtection(db,actor,'inbox@example.test')).kind==='held');
 check('Native snapshot records current identity and reply revision',(await first('SELECT count(*) n FROM prospect_discovery_targets WHERE workspace_id=?',ws)).n===1&&(await first('SELECT reply_revision FROM prospect_discovery_targets WHERE workspace_id=?',ws)).reply_revision===(await reply()).revision);
 check('Native cooldown refuses immediate provider access',(await checkMail()).conflict&&requests===1);
 const incoming=id=>({id,threadId:'different-thread',labelIds:['INBOX'],internalDate:String(Date.now()+1000),payload:{headers:[{name:'Message-ID',value:'<'+id+'@example.test>'},{name:'In-Reply-To',value:rfc},{name:'From',value:'inbox@example.test'}]}});
 const changes=async url=>{const u=new URL(url);if(u.pathname.endsWith('/history')){const start=BigInt(u.searchParams.get('startHistoryId'));return Response.json({history:[{id:String(start+1n),messagesAdded:[{message:{id:'native-mailbox-reply',threadId:'different-thread'}}]}],historyId:String(start+2n)});}return Response.json(incoming('native-mailbox-reply'));};
 offset+=31000;check('Native cross-thread evidence and progress complete atomically',(await checkMail(changes)).checked&&(await state()).history_id==='11'&&(await first('SELECT count(*) n FROM prospect_reply_observations WHERE workspace_id=?',ws)).n===1);
 offset+=31000;await checkMail(changes);
 check('Native history replay deduplicates observation and event',(await first('SELECT count(*) n FROM prospect_reply_observations WHERE workspace_id=?',ws)).n===1&&(await first("SELECT count(*) n FROM activity_events WHERE workspace_id=? AND event_type='PROSPECT_REPLY_OBSERVED'",ws)).n===1);
 offset+=31000;await checkMail(async()=>new Response(null,{status:404}));
 check('Native expired history preserves cursor and records coverage gap',(await state()).history_id==='13'&&(await state()).coverage_status==='gap');
 offset+=31000;await checkMail(async()=>Response.json({historyId:'14'}));
 check('Native later empty result cannot remove a gap or recipient hold',(await state()).coverage_status==='gap'&&(await reply()).hold_state==='held');
 offset+=31000;const stopped=await checkMail(async()=>{const current=await reply();assert.ok((await stopProspectOutreach(db,actor,session,{...command,expectedRevision:current.revision,reason:'opt_out',note:'Synthetic owner stop.',reviewed:true})).stopped);return Response.json({historyId:'15'});});
 check('Native in-flight manual stop prevents progress and preserves stop',stopped.conflict&&(await state()).history_id==='14'&&(await reply()).hold_state==='stopped');
 offset+=91000;await checkMail(async()=>Response.json({historyId:'16'}));
 check('Native expired run recovery supersedes the old lease',(await state()).history_id==='16'&&(await first("SELECT count(*) n FROM prospect_discovery_runs WHERE workspace_id=? AND status='superseded'",ws)).n===1&&(await reply()).hold_state==='stopped');
 await run("CREATE TRIGGER reject_mailbox_native BEFORE INSERT ON activity_events WHEN NEW.workspace_id='"+ws+"' AND NEW.event_type='PROSPECT_DISCOVERY_CHECKED' BEGIN SELECT RAISE(ABORT,'native rollback'); END");
 offset+=31000;await assert.rejects(()=>checkMail(async()=>Response.json({historyId:'17'})),/native rollback/);
 check('Native batch failure retains old progress and recoverable lease',(await state()).history_id==='16'&&(await state()).check_status==='checking');
 await run('DROP TRIGGER reject_mailbox_native');
 offset+=91000;await checkMail(async()=>Response.json({historyId:'18'}));

 const originals={};for(const table of ['bloomops_prospects','prospect_outreach_drafts','prospect_outreach_approvals','prospect_deliveries','prospect_delivery_identities'])originals[table]=await first('SELECT * FROM '+table+' WHERE workspace_id=?',ws);
 const clone=(table,patch)=>{const value={...originals[table],...patch};return binding.prepare('INSERT INTO '+table+'('+Object.keys(value).join(',')+') VALUES('+Object.keys(value).map(()=>'?').join(',')+')').bind(...Object.values(value));};
 for(let i=1;i<100;i++){
  const id=crypto.randomUUID(),prospectId=prefix+'-many-'+i,draftId=id+'-draft',approvalId=id+'-approval',messageId='<bloomsi-'+id+'@bloomsi.invalid>',providerId='many-sent-'+i,threadId='many-thread-'+i;
  await binding.batch([clone('bloomops_prospects',{id:prospectId,creation_request_id:crypto.randomUUID()}),clone('prospect_outreach_drafts',{id:draftId,prospect_id:prospectId}),clone('prospect_outreach_approvals',{id:approvalId,draft_id:draftId}),clone('prospect_deliveries',{id,prospect_id:prospectId,approval_id:approvalId,message_id:messageId,provider_message_id:providerId,provider_thread_id:threadId}),clone('prospect_delivery_identities',{id:id+'-identity',prospect_id:prospectId,delivery_id:id,rfc_message_id:messageId,provider_message_id:providerId,provider_thread_id:threadId})]);
 }
 const messages=Array.from({length:40},(_,i)=>incoming('native-many-'+i));
 offset+=31000;const many=await checkMail(async url=>url.includes('/history?')?Response.json({history:[{id:'19',messagesAdded:messages.map(m=>({message:{id:m.id,threadId:m.threadId}}))}],historyId:'20'}):Response.json(messages.find(m=>url.includes('/messages/'+m.id+'?'))));
 check('Native D1 atomically holds and snapshots100 deliveries',many.checked&&(await first('SELECT count(*) n FROM prospect_discovery_targets WHERE workspace_id=? AND run_id=(SELECT id FROM prospect_discovery_runs WHERE workspace_id=? ORDER BY created_at DESC LIMIT 1)',ws,ws)).n===100);
 check('Native D1 saves40 observations with the complete cursor',(await state()).history_id==='20'&&(await first('SELECT count(*) n FROM prospect_reply_observations WHERE workspace_id=?',ws)).n===41);

 env.BLOOMOPS_GOOGLE_RECOVERY_ENABLED='true';
 const assigned=Array.from({length:40},(_,i)=>incoming('native-recovery-reply-'+i));
 const unassigned=Array.from({length:40},(_,i)=>{const m=incoming('native-recovery-unassigned-'+i);m.payload.headers.find(x=>x.name==='In-Reply-To').value='<unassigned@example.test>';return m;});
 const recoveryFetch=async url=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:'hello@example.test',historyId:'100'});
  if(u.pathname.endsWith('/messages'))return Response.json({messages:assigned.map(m=>({id:m.id,threadId:m.threadId}))});
  if(u.pathname.endsWith('/history'))return Response.json({history:[{id:'101',messagesAdded:unassigned.map(m=>({message:{id:m.id,threadId:m.threadId}}))}],historyId:'102'});
  return Response.json([...assigned,...unassigned].find(m=>u.pathname.endsWith('/'+m.id)));
 };
 const collect=async(fetcher=recoveryFetch)=>recoverProspectMailbox(db,actor,env,session,await mailInput(),{fetcher,clock:()=>new Date(now+offset)});
 offset+=31000;await collect();
 const saved=await first('SELECT * FROM prospect_recovery_collections WHERE workspace_id=?',ws);
 check('Native recovery saves immutable collection and catch-up boundaries',saved.start_history_id==='100'&&saved.catchup_history_id==='102'&&saved.matched_count===40&&saved.unassigned_count===40);
 check('Native recovery holds100 targets without resetting cursor',(await state()).history_id==='20'&&(await reply()).hold_state==='stopped');
 check('Native recovery preserves80 assigned/unassigned evidence rows',(await first('SELECT count(*) n FROM prospect_recovery_messages WHERE workspace_id=?',ws)).n===80);
 offset+=31000;await collect();
 check('Native recovery replay deduplicates canonical observations',(await first('SELECT count(*) n FROM prospect_reply_observations WHERE workspace_id=?',ws)).n===81&&(await first('SELECT count(*) n FROM prospect_recovery_collections WHERE workspace_id=?',ws)).n===2);
 offset+=31000;await collect(async url=>url.includes('/history?')?new Response(null,{status:404}):recoveryFetch(url));
 check('Native failed catch-up keeps explicit incomplete collection',(await getProspectRecovery(db,actor,'hello@example.test')).catchupStatus==='unresolved'&&(await state()).history_id==='20');
 await run("CREATE TRIGGER reject_recovery_native BEFORE INSERT ON activity_events WHEN NEW.workspace_id='"+ws+"' AND NEW.event_type='PROSPECT_RECOVERY_COLLECTED' BEGIN SELECT RAISE(ABORT,'native recovery rollback'); END");
 offset+=31000;await assert.rejects(()=>collect(),/native recovery rollback/);
 check('Native recovery activity failure rolls back evidence',(await first('SELECT count(*) n FROM prospect_recovery_collections WHERE workspace_id=?',ws)).n===3&&(await state()).check_status==='checking');
 await run('DROP TRIGGER reject_recovery_native');
 offset+=91000;await collect();
 for(const statement of ['UPDATE prospect_recovery_collections SET matched_count=0 WHERE workspace_id=?','DELETE FROM prospect_recovery_messages WHERE workspace_id=?'])await assert.rejects(()=>run(statement,ws),/immutable|permanent/);
 check('Native recovery evidence is immutable after sealing',(await first('SELECT count(*) n FROM prospect_recovery_collections WHERE workspace_id=?',ws)).n===4);
 const before=await state();
 check('Native status excludes raw mailbox progress and identities',!JSON.stringify(await getProspectDiscoveryState(db,actor,'hello@example.test')).match(/historyId|checkId|identityId|synthetic/));
 for(const statement of ["UPDATE prospect_discovery_states SET revision=revision+1,history_id='19' WHERE workspace_id=?","UPDATE prospect_discovery_runs SET reason='changed' WHERE workspace_id=?","DELETE FROM prospect_discovery_targets WHERE workspace_id=?"])await assert.rejects(()=>run(statement,ws),/permanent|immutable/);
 check('Native schema rejects cursor and provenance rewrites',(await state()).history_id===before.history_id);
 check('Native database foreign keys are intact',(await binding.prepare('PRAGMA foreign_key_check').all()).results.length===0);
 writeFileSync(join(out,'native-mailbox.json'),JSON.stringify({checks,workspaceId:ws,providerRequests:'synthetic injected only'},null,2)+'\n');
 console.log('PASS '+checks.length+' native D1 checks');
}finally{await mf.dispose();}
