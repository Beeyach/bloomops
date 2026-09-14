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
import {sealGoogle,GOOGLE_SCOPES} from '../lib/bloomops/prospect-google-provider.mjs';
const out=resolve(process.argv[2]),configPath=resolve(process.argv[3]),config=JSON.parse(readFileSync(configPath,'utf8'));
assert.equal(config.d1_databases[0].database_id,'bloomops-p3c1-isolated');
const require=createRequire(import.meta.url),wrangler=dirname(require.resolve('wrangler/package.json')),{Miniflare,convertV4MiniflareOptions}=require(require.resolve('miniflare',{paths:[wrangler]}));
const checks=[];mkdirSync(out,{recursive:true});const check=(name,value)=>{assert.ok(value,name);checks.push(name);console.log('ok '+name);};
const mf=new Miniflare(convertV4MiniflareOptions({compatibilityDate:'2025-05-01',cf:false,modules:true,script:'export default {fetch(){return new Response("synthetic only")}}',d1Databases:{DB:'bloomops-p3c1-isolated'},resourcePersistencePath:join(dirname(configPath),'.wrangler/state/v3')}));
try{
 const binding=await mf.getD1Database('DB'),db=bloomOpsDb(binding),first=(sql,...args)=>binding.prepare(sql).bind(...args).first(),run=(sql,...args)=>binding.prepare(sql).bind(...args).run();
 check('Native isolated database has migration32',(await first('SELECT count(*) n FROM d1_migrations')).n===32);
 const prefix='p3c2-'+crypto.randomUUID().slice(0,8),ws=prefix+'-ws',user=prefix+'-owner',member=prefix+'-member',session=prefix+'-session',email=user+'@example.test',now=Date.now();
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
 const browser=await create('Garden test inbox'),review=await prepareProspectDelivery(db,actor,browser),secondary=await create('Garden preparation test');
 writeFileSync(join(out,'browser-fixture.json'),JSON.stringify({workspaceId:ws,userId:user,memberId:member,email,prospectId:browser.prospectId,deliveryId:review.deliveryId,secondaryId:secondary.prospectId,recipient:'inbox@example.test',configPath},null,2)+'\n');
 check('Legacy sends and accounts remain empty',(await first('SELECT count(*) n FROM send_events')).n===0&&(await first('SELECT count(*) n FROM gmail_accounts')).n===0);
 check('Native foreign keys are clean',(await binding.prepare('PRAGMA foreign_key_check').all()).results.length===0);
 writeFileSync(join(out,'native-results.json'),JSON.stringify({passed:checks.length,checks,nativeD1:true,provider:'injected synthetic responses'},null,2)+'\n');
}finally{await mf.dispose();}
