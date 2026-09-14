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
import {checkProspectDeliveryReport} from '../lib/bloomops/prospect-report-checks.mjs';
import {fixture,encode,dsn} from '../tests/_prospect-delivery-report-fixture.mjs';
import {getRecipientProtection} from '../lib/bloomops/prospect-recipient-protection.mjs';
import {sealGoogle,GOOGLE_SCOPES} from '../lib/bloomops/prospect-google-provider.mjs';
const out=resolve(process.argv[2]),configPath=resolve(process.argv[3]),config=JSON.parse(readFileSync(configPath,'utf8'));
assert.equal(config.d1_databases[0].database_id,'bloomops-p3c1-isolated');
const require=createRequire(import.meta.url),wrangler=dirname(require.resolve('wrangler/package.json')),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wrangler]}));
const checks=[];mkdirSync(out,{recursive:true});const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('ok '+name);};
const mf=new Miniflare(convertV4MiniflareOptions({compatibilityDate:'2025-05-01',cf:false,modules:true,script:'export default {fetch(){return new Response("synthetic only")}}',d1Databases:{DB:'bloomops-p3c1-isolated'},resourcePersistencePath:join(dirname(configPath),'.wrangler/state/v3')}));
try{
 const binding=await mf.getD1Database('DB'),db=bloomOpsDb(binding),first=(sql,...args)=>binding.prepare(sql).bind(...args).first(),run=(sql,...args)=>binding.prepare(sql).bind(...args).run();
 check('Native isolated database has migration37',(await first('SELECT count(*) n FROM d1_migrations')).n===37);
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
 const {message}=fixture();message.internalDate=String(Date.now()+1000);encode(message.payload.parts[1],dsn('inbox@example.test'));encode(message.payload.parts[2],`Message-ID: ${rfc}\r\nFrom: hello@example.test\r\nTo: inbox@example.test\r\n`);
 let offset=31000;const clock=()=>new Date(now+offset),state=()=>first('SELECT * FROM prospect_discovery_states WHERE workspace_id=?',ws);
 env.BLOOMOPS_GOOGLE_RECOVERY_ENABLED='true';
 const mailboxInput=async()=>({workspaceId:ws,accountEmail:'hello@example.test',expectedRevision:(await state())?.revision||0,connectionRevision:1,senderRevision:1,reviewed:true});
 const collect=async()=>recoverProspectMailbox(db,actor,env,session,await mailboxInput(),{clock,fetcher:async url=>{
  const u=new URL(url);if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:'hello@example.test',historyId:'100'});if(u.pathname.endsWith('/messages'))return Response.json({messages:[{id:message.id,threadId:message.threadId}]});if(u.pathname.endsWith('/history'))return Response.json({historyId:'101'});return Response.json({...message,payload:{headers:message.payload.headers}});
 }});
 check('Native saved unassigned report collection succeeds',(await collect()).checked);
 const candidate=await first('SELECT * FROM prospect_recovery_messages WHERE workspace_id=?',ws);
 Object.assign(env,{BLOOMOPS_GOOGLE_REPORT_CHECK_ENABLED:'true',BLOOMOPS_GOOGLE_REPORT_RUN_ID:candidate.run_id,BLOOMOPS_GOOGLE_REPORT_MESSAGE_ID:candidate.provider_message_id});
 const reportInput=async()=>({...await mailboxInput(),recoveryRunId:candidate.run_id,providerMessageId:candidate.provider_message_id});
 const report=async(fetcher=async()=>Response.json(message))=>checkProspectDeliveryReport(db,actor,env,session,await reportInput(),{clock,fetcher});
 const records=async()=> (await binding.prepare('SELECT * FROM prospect_report_checks WHERE workspace_id=? ORDER BY created_at,id').bind(ws).all()).results;
 const before=await state();let reads=0;
 const failed=await Promise.all([1,2].map(()=>report(async()=>{reads++;return new Response(null,{status:503});})));
 check('Native concurrent report claims read once',reads===1&&failed.filter(r=>r.checked).length===1);
 check('Native provider failure stores only unresolved facts',(await records())[0].reason==='provider_unavailable');
 check('Native report cooldown blocks immediate repeat',(await report()).conflict);
 offset+=31000;
 await run("CREATE TRIGGER reject_report_native BEFORE INSERT ON activity_events WHEN NEW.event_type='PROSPECT_REPORT_CHECKED' BEGIN SELECT RAISE(ABORT,'native report rollback'); END");
 await assert.rejects(()=>report(),/native report rollback/);
 check('Native terminal event failure rolls back association',(await records()).filter(x=>x.status==='associated').length===0);
 await run('DROP TRIGGER reject_report_native');offset+=91000;
 check('Native late stop discards report evidence',(await report(async()=>{
  const rr=await first('SELECT * FROM prospect_reply_states WHERE workspace_id=? AND prospect_id=?',ws,input.prospectId);
  assert.ok((await stopProspectOutreach(db,actor,session,{...command,expectedRevision:rr.revision,reason:'opt_out',note:'Synthetic stop.',reviewed:true})).stopped);return Response.json(message);
 })).conflict);
 offset+=91000;
 const originals={};for(const table of ['bloomops_prospects','prospect_outreach_drafts','prospect_outreach_approvals','prospect_deliveries','prospect_delivery_identities','prospect_reply_states'])originals[table]=await first('SELECT * FROM '+table+' WHERE workspace_id=?',ws);
 const clone=(table,patch)=>{const row={...originals[table],...patch};return binding.prepare('INSERT INTO '+table+'('+Object.keys(row).join(',')+') VALUES('+Object.keys(row).map(()=>'?').join(',')+')').bind(...Object.values(row));};
 for(let i=1;i<100;i++){
  const id=crypto.randomUUID(),prospectId=prefix+'-p'+i,draftId=prefix+'-draft'+i,approvalId=prefix+'-approval'+i,messageId='<bloomsi-'+id+'@bloomsi.invalid>',providerId='native-sent-'+i,threadId='native-thread-'+i;
  await binding.batch([clone('bloomops_prospects',{id:prospectId,creation_request_id:crypto.randomUUID()}),clone('prospect_outreach_drafts',{id:draftId,prospect_id:prospectId}),clone('prospect_outreach_approvals',{id:approvalId,draft_id:draftId}),clone('prospect_deliveries',{id,prospect_id:prospectId,approval_id:approvalId,message_id:messageId,provider_message_id:providerId,provider_thread_id:threadId}),clone('prospect_delivery_identities',{id:id+'-identity',prospect_id:prospectId,delivery_id:id,rfc_message_id:messageId,provider_message_id:providerId,provider_thread_id:threadId}),clone('prospect_reply_states',{prospect_id:prospectId,delivery_id:id})]);
 }
 check('Native expired checks recover and associate with100 targets',(await report()).status==='associated');
 const associated=(await records()).find(x=>x.status==='associated');check('Native relational snapshot covers100 targets',(await first('SELECT count(*) n FROM prospect_report_targets WHERE workspace_id=? AND check_id=?',ws,associated.id)).n===100);
 check('Native stopped recipient remains stopped',(await first('SELECT hold_state FROM prospect_reply_states WHERE workspace_id=? AND prospect_id=?',ws,input.prospectId)).hold_state==='stopped');
 check('Native report result preserves all mailbox progress',JSON.stringify(await state())===JSON.stringify(before));
 offset+=31000;check('Native successful report replay cannot read',(await report()).conflict);
 for(const statement of ["UPDATE prospect_report_checks SET status_code='5.2.2' WHERE workspace_id=?","DELETE FROM prospect_report_checks WHERE workspace_id=?","UPDATE prospect_report_targets SET reply_revision=99 WHERE workspace_id=?","DELETE FROM prospect_report_targets WHERE workspace_id=?"])await assert.rejects(()=>run(statement,ws),/immutable|permanent/);
 check('Native report evidence and targets cannot be rewritten',true);
 check('Native foreign keys pass',(await binding.prepare('PRAGMA foreign_key_check').all()).results.length===0);
 writeFileSync(join(out,'native-report.json'),JSON.stringify({checks,workspaceId:ws,providerRequests:'synthetic injected only'},null,2)+'\n');console.log('PASS '+checks.length+' native D1 checks');
}finally{await mf.dispose();}
