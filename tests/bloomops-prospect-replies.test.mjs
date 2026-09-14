import {test} from 'node:test';
import assert from 'node:assert/strict';
import {repliesFixture} from './_prospect-replies-fixture.mjs';
import {all,one,run} from './_bloomops-db.mjs';
import {getProspectReplies,checkProspectReplies,stopProspectOutreach,prospectReplyOverview} from '../lib/bloomops/prospect-replies.mjs';
import {sealGoogle,googleConfiguration} from '../lib/bloomops/prospect-google-provider.mjs';
const rows=t=>all(t.raw,'SELECT * FROM prospect_reply_observations');
const count=(t,type)=>one(t.raw,'SELECT count(*) n FROM activity_events WHERE event_type=?',type).n;
const later=()=>new Date(Date.now()+31000);
test('provider-returned RFC ancestry persists a reply hold without rewriting the sent receipt',async c=>{
 const t=await repliesFixture(c),before=one(t.raw,'SELECT * FROM prospect_deliveries WHERE id=?',t.input.deliveryId),returnedId='<returned-google-id@example.test>';
 const value=t.thread([t.message('reply',{'In-Reply-To':returnedId})]);value.messages[0].payload.headers.find(h=>h.name==='Message-ID').value=returnedId;
 assert.ok((await t.check({fetcher:async()=>Response.json(value)})).checked);
 assert.equal(t.row().hold_state,'held');assert.equal(t.row().check_status,'checked');assert.equal(rows(t)[0].match,'reply_chain');
 assert.equal(count(t,'PROSPECT_REPLY_OBSERVED'),1);assert.deepEqual(one(t.raw,'SELECT * FROM prospect_deliveries WHERE id=?',t.input.deliveryId),before);
});
for(const size of [64,99])test(`a thread with ${size} observations completes within D1's parameter limit`,async c=>{
 const t=await repliesFixture(c),batch=t.db.batch.bind(t.db);
 t.db.batch=async statements=>{
  for(const statement of statements)assert.ok(statement.toSQL().params.length<=100,'D1 allows at most 100 bound parameters per statement');
  return batch(statements);
 };
 const fetcher=async()=>Response.json(t.thread(Array.from({length:size},(_,i)=>t.message('long-reply-'+i))));
 assert.ok((await t.check({fetcher})).checked);assert.equal(t.row().check_status,'checked');assert.equal(t.row().hold_state,'held');
 assert.equal(rows(t).length,size);assert.equal(count(t,'PROSPECT_REPLY_OBSERVED'),size);assert.equal(count(t,'PROSPECT_REPLY_CHECKED'),1);
 assert.ok((await t.check({fetcher,clock:later})).checked);assert.equal(rows(t).length,size);assert.equal(count(t,'PROSPECT_REPLY_OBSERVED'),size);
});
test('GET is local-only and never prepares state or returns private provider data',async c=>{
 const t=await repliesFixture(c),data=await t.get();assert.equal(data.state,null);assert.equal(data.revision,0);assert.deepEqual(rows(t),[]);
 assert.equal(t.row(),undefined);assert.equal(data.canCheck,true);
 for(const word of ['synthetic-access','synthetic-refresh','tokenBox','snapshotJson','checkId'])assert.ok(!JSON.stringify(data).includes(word));
});
test('explicit check stores exact-thread observations and one durable hold atomically',async c=>{
 const t=await repliesFixture(c);assert.ok((await t.check()).checked);assert.equal(t.row().revision,2);assert.equal(t.row().hold_state,'held');assert.equal(t.row().check_id,null);
 assert.equal(rows(t).length,1);assert.equal(rows(t)[0].kind,'reply_unreviewed');assert.equal(count(t,'PROSPECT_REPLY_OBSERVED'),1);assert.equal(count(t,'PROSPECT_REPLY_CHECKED'),1);
 assert.equal(one(t.raw,'SELECT state FROM prospect_deliveries').state,'accepted');assert.equal(count(t,'PROSPECT_DELIVERY_ATTEMPTED'),1);
});
test('repeated checks deduplicate messages and events; empty later reads never clear a hold',async c=>{
 const t=await repliesFixture(c);await t.check();await t.check({clock:later});assert.equal(rows(t).length,1);assert.equal(count(t,'PROSPECT_REPLY_OBSERVED'),1);assert.equal(count(t,'PROSPECT_REPLY_CHECKED'),2);
 const at=new Date(Date.now()+62000);assert.ok((await t.check({clock:()=>at,fetcher:async()=>Response.json(t.thread([]))})).checked);
 assert.equal(t.row().hold_state,'held');assert.equal(t.row().check_status,'checked');assert.equal(rows(t).length,1);
});
test('unresolved transport creates a durable hold; later empty success cannot clear it',async c=>{
 const t=await repliesFixture(c);const result=await t.check({fetcher:async()=>{throw new Error('private token');}});assert.equal(result.status,'unresolved');assert.equal(t.row().hold_state,'held');assert.equal(t.row().check_status,'unresolved');assert.deepEqual(rows(t),[]);
 await t.check({clock:later,fetcher:async()=>Response.json(t.thread([]))});assert.equal(t.row().hold_state,'held');
});
test('auto responses and delivery reports hold without automatic human or hard-bounce classification',async c=>{
 const t=await repliesFixture(c);await t.check({fetcher:async()=>Response.json(t.thread([t.message('auto',{'Auto-Submitted':'auto-replied'}),t.message('dsn',{'Content-Type':'multipart/report; report-type=delivery-status'})]))});
 assert.deepEqual(rows(t).map(x=>x.kind),['automatic_response','delivery_report']);assert.equal(t.row().hold_state,'held');assert.equal(t.row().stop_reason,null);
});
test('all local configuration gates, acknowledgement and exact revisions deny checks before transport',async c=>{
 const t=await repliesFixture(c),command=await t.command();let calls=0;const fetcher=async()=>{calls++;return Response.json(t.thread());};
 for(const patch of [{BLOOMOPS_ENV:'staging'},{BLOOMOPS_ENV:'production'},{BLOOMOPS_MAIL_TRANSPORT:'resend'},{BLOOMOPS_APP_URL:'https://example.test'},{BLOOMOPS_GOOGLE_REPLY_CHECK_ENABLED:'false'},{BLOOMOPS_GOOGLE_REPLY_DELIVERY_ID:'another'},{BLOOMOPS_GOOGLE_TOKEN_KEY:'bad'}])assert.ok((await checkProspectReplies(t.db,t.actor,{...t.env,...patch},t.session,command,{fetcher})).unavailable);
 for(const patch of [{reviewed:false},{expectedRevision:1},{connectionRevision:99},{senderRevision:99},{deliveryId:'other'},{workspaceId:'foreign'},{recipient:'other@example.test'}])assert.ok((await checkProspectReplies(t.db,t.actor,t.env,t.session,{...command,...patch},{fetcher})).conflict);
 assert.equal(calls,0);assert.equal(t.row(),undefined);assert.equal(count(t,'PROSPECT_REPLY_CHECK_STARTED'),0);
});
test('denied roles, tenants, suspended membership and expired sessions cannot read or mutate',async c=>{
 const t=await repliesFixture(c),command=await t.command();
 for(const actor of [null,{...t.actor,role:'client'},{...t.actor,role:'team_member'},{...t.actor,role:'project_manager'},{...t.actor,workspaceId:'foreign',membershipId:'other'},{...t.actor,workspaceId:'source',membershipId:'src'}]){
  assert.equal(await getProspectReplies(t.db,actor,t.env,t.id),null);assert.equal(await checkProspectReplies(t.db,actor,t.env,t.session,{...command,workspaceId:actor?.workspaceId}),null);
 }
 run(t.raw,'UPDATE session SET expires_at=0');assert.ok((await t.check()).conflict);assert.ok((await t.stop()).conflict);assert.equal(t.row(),undefined);
 run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'");assert.equal(await t.get(),null);
});
test('wrong original account, changed sender, expired or revoked grant cannot contact Google',async c=>{
 for(const mutation of ["UPDATE prospect_google_connections SET account_email='other@example.test'","UPDATE prospect_google_connections SET active=0","UPDATE prospect_google_connections SET check_id='busy'","UPDATE prospect_google_connections SET check_status='temporary'","UPDATE prospect_google_connections SET token_box='bad'","UPDATE prospect_google_connections SET granted_scope='other'","UPDATE prospect_senders SET email='other@example.test'"]){
  const t=await repliesFixture(c);run(t.raw,mutation);let calls=0;assert.ok((await t.check({fetcher:async()=>{calls++;}})).unavailable);assert.equal(calls,0);assert.equal(t.row(),undefined);
 }
});
test('concurrent requests and cooldown contact the provider once',async c=>{
 const t=await repliesFixture(c),command=await t.command();let calls=0;const options={fetcher:async()=>{calls++;return Response.json(t.thread());}};
 const results=await Promise.all([1,2].map(()=>checkProspectReplies(t.db,t.actor,t.env,t.session,command,options)));
 assert.equal(results.filter(x=>x.checked).length,1);assert.equal(calls,1);assert.ok((await t.check(options)).conflict);assert.equal(calls,1);
});
test('late check completion loses to manual stop and cannot attach observations or overwrite evidence',async c=>{
 const t=await repliesFixture(c);const result=await t.check({fetcher:async()=>{assert.ok((await t.stop()).stopped);return Response.json(t.thread());}});
 assert.ok(result.conflict);assert.equal(t.row().hold_state,'stopped');assert.equal(t.row().stop_reason,'opt_out');assert.equal(t.row().check_id,null);assert.deepEqual(rows(t),[]);assert.equal(count(t,'PROSPECT_REPLY_CHECKED'),0);assert.equal(count(t,'PROSPECT_OUTREACH_STOPPED'),1);
});
test('sender/account/member/session revocation during provider access discards observations',async c=>{
 for(const mutation of ["UPDATE prospect_senders SET revision=revision+1","UPDATE prospect_google_connections SET revision=revision+1","UPDATE prospect_google_connections SET active=0","UPDATE workspace_memberships SET updated_at='changed' WHERE id='dest'","UPDATE session SET expires_at=0"]){
  const t=await repliesFixture(c);const result=await t.check({fetcher:async()=>{run(t.raw,mutation);return Response.json(t.thread());}});assert.ok(result.conflict);assert.deepEqual(rows(t),[]);assert.equal(count(t,'PROSPECT_REPLY_CHECKED'),0);
 }
});
test('authority changes before claim and after claim prevent transport',async c=>{
 for(const after of [false,true]){
  const t=await repliesFixture(c),batch=t.db.batch.bind(t.db);let once=true,calls=0;
  t.db.batch=async items=>{if(!after&&once){once=false;run(t.raw,'UPDATE prospect_senders SET revision=revision+1');}const result=await batch(items);if(after&&once){once=false;run(t.raw,'UPDATE prospect_senders SET revision=revision+1');}return result;};
  assert.ok((await t.check({fetcher:async()=>{calls++;return Response.json(t.thread());}})).conflict);assert.equal(calls,0);assert.equal(count(t,'PROSPECT_REPLY_CHECKED'),0);
 }
});
test('expired check lease can recover without accepting the old provider completion',async c=>{
 const t=await repliesFixture(c);const start=Date.now();let time=start;
 const old=await t.check({clock:()=>new Date(time),fetcher:async()=>{time=start+91000;assert.ok((await t.check({clock:()=>new Date(time),fetcher:async()=>Response.json(t.thread([]))})).checked);return Response.json(t.thread());}});
 assert.ok(old.conflict);assert.equal(t.row().check_status,'checked');assert.deepEqual(rows(t),[]);assert.equal(count(t,'PROSPECT_REPLY_CHECKED'),1);
});
test('completion rollback preserves its claim and creates no partial observations/activity',async c=>{
 const t=await repliesFixture(c);run(t.raw,"CREATE TRIGGER reject_completion BEFORE INSERT ON activity_events WHEN NEW.event_type='PROSPECT_REPLY_CHECKED' BEGIN SELECT RAISE(ABORT,'test rollback'); END");
 await assert.rejects(()=>t.check(),/rollback/);assert.deepEqual(rows(t),[]);assert.equal(count(t,'PROSPECT_REPLY_OBSERVED'),0);assert.equal(t.row().check_status,'checking');
});
test('manual stop works disconnected, requires evidence and is immutable/idempotent under retry',async c=>{
 const t=await repliesFixture(c);run(t.raw,'UPDATE prospect_google_connections SET active=0');
 assert.ok((await t.stop('', 'opt_out')).invalid);assert.ok((await t.stop('Read the reply.', 'positive')).invalid);assert.equal(t.row(),undefined);
 assert.ok((await t.stop()).stopped);const before=t.row();assert.ok((await t.stop()).conflict);assert.deepEqual(t.row(),before);assert.equal(count(t,'PROSPECT_OUTREACH_STOPPED'),1);
 assert.throws(()=>run(t.raw,"UPDATE prospect_reply_states SET revision=revision+1,stop_reason='manual'"),/permanent/);assert.throws(()=>run(t.raw,'DELETE FROM prospect_reply_states'),/permanent/);
});
test('each supported human stop reason records provenance and never claims provider classification',async c=>{
 for(const reason of ['opt_out','declined','hard_bounce','manual']){const t=await repliesFixture(c);assert.ok((await t.stop('Evidence reviewed by the operator.',reason)).stopped);assert.equal(t.row().stop_reason,reason);assert.equal(JSON.parse(one(t.raw,"SELECT metadata_json FROM activity_events WHERE event_type='PROSPECT_OUTREACH_STOPPED'").metadata_json).source,'manual_review');}
});
test('database guards preserve held state and observation identity/account/tenant',async c=>{
 const t=await repliesFixture(c);await t.check();assert.throws(()=>run(t.raw,"UPDATE prospect_reply_states SET revision=revision+1,hold_state='clear'"),/permanent/);
 assert.throws(()=>run(t.raw,"UPDATE prospect_reply_observations SET kind='delivery_report'"),/immutable/);assert.throws(()=>run(t.raw,'DELETE FROM prospect_reply_observations'),/permanent/);
 assert.throws(()=>run(t.raw,"INSERT INTO prospect_reply_observations SELECT 'other',workspace_id,prospect_id,delivery_id,'foreign@example.test','other-message',received_at,kind,match,observed_by_membership_id,created_at FROM prospect_reply_observations"),/account/);
 assert.throws(()=>run(t.raw,"UPDATE prospect_reply_states SET revision=revision+1,hold_state='stopped',stop_reason=NULL,stop_note=NULL,stopped_by_membership_id='dest',stopped_at='now'"),/CHECK/);
 assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);
});
test('expired encrypted access and revoked original authorizer block a different current operator',async c=>{
 const t=await repliesFixture(c),command=await t.command();
 const old=one(t.raw,'SELECT token_box FROM prospect_google_connections').token_box;
 const expired=await sealGoogle(googleConfiguration(t.env),'fresh:tokens',JSON.stringify({accessToken:'synthetic-access',refreshToken:'synthetic-refresh',expiresAt:new Date(Date.now()-1000).toISOString()}));
 run(t.raw,'UPDATE prospect_google_connections SET token_box=?',expired);let calls=0;
 assert.ok((await checkProspectReplies(t.db,t.actor,t.env,t.session,command,{fetcher:async()=>{calls++;}})).unavailable);
 run(t.raw,'UPDATE prospect_google_connections SET token_box=?',old);
 run(t.raw,"INSERT INTO user(id,name,email,email_verified) VALUES('grant-owner','Grant Owner','grant-owner@example.test',1)");
 run(t.raw,"INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('grant-member','fresh','grant-owner','admin','active')");
 run(t.raw,"UPDATE prospect_google_connections SET authorized_by_membership_id='grant-member',authorizer_updated_at=(SELECT updated_at FROM workspace_memberships WHERE id='grant-member')");
 const result=await t.check({fetcher:async()=>{calls++;run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='grant-member'");return Response.json(t.thread());}});
 assert.ok(result.conflict);assert.equal(calls,1);assert.deepEqual(rows(t),[]);assert.equal(count(t,'PROSPECT_REPLY_CHECKED'),0);
});
test('stop activity failure rolls back its state instead of leaving an unrecorded stop',async c=>{
 const t=await repliesFixture(c);run(t.raw,"CREATE TRIGGER reject_stop BEFORE INSERT ON activity_events WHEN NEW.event_type='PROSPECT_OUTREACH_STOPPED' BEGIN SELECT RAISE(ABORT,'stop rollback'); END");
 await assert.rejects(()=>t.stop(),/rollback/);assert.equal(t.row(),undefined);assert.equal(count(t,'PROSPECT_OUTREACH_STOPPED'),0);
});
test('a provider message already bound to another prospect cannot move or partially attach',async c=>{
 const t=await repliesFixture(c);
 const clone=(table,patch)=>{const value={...one(t.raw,'SELECT * FROM '+table),...patch};run(t.raw,`INSERT INTO ${table}(${Object.keys(value).map(k=>'"'+k+'"').join(',')}) VALUES(${Object.keys(value).map(()=>'?').join(',')})`,...Object.values(value));};
 clone('bloomops_prospects',{id:'other-prospect',creation_request_id:crypto.randomUUID()});
 clone('prospect_outreach_drafts',{id:'other-draft',prospect_id:'other-prospect'});
 clone('prospect_outreach_approvals',{id:'other-approval',draft_id:'other-draft'});
 clone('prospect_deliveries',{id:'other-delivery',prospect_id:'other-prospect',approval_id:'other-approval',message_id:'<bloomsi-87654321-1234-1234-1234-123456789012@bloomsi.invalid>'});
 run(t.raw,"INSERT INTO prospect_reply_states(workspace_id,prospect_id,delivery_id,revision,hold_state) VALUES('fresh','other-prospect','other-delivery',1,'held')");
 run(t.raw,"INSERT INTO prospect_reply_observations(id,workspace_id,prospect_id,delivery_id,account_email,provider_message_id,received_at,kind,match,observed_by_membership_id) VALUES('other-observation','fresh','other-prospect','other-delivery','hello@example.test','reply','2026-09-13T00:00:00Z','reply_unreviewed','reply_chain','dest')");
 assert.equal((await t.check()).status,'unresolved');assert.equal(t.row().hold_state,'held');assert.equal(rows(t).length,1);assert.equal(rows(t)[0].prospect_id,'other-prospect');assert.equal(count(t,'PROSPECT_REPLY_OBSERVED'),0);
});
test('Overview projects saved conversation state without provider access and denies other roles/tenants',async c=>{
 const t=await repliesFixture(c);let data=await prospectReplyOverview(t.db,t.actor);assert.equal(data.rows[0].holdState,null);
 await t.check();data=await prospectReplyOverview(t.db,t.actor);assert.equal(data.rows[0].holdState,'held');
 await t.stop();run(t.raw,'UPDATE prospect_google_connections SET active=0');data=await prospectReplyOverview(t.db,t.actor);assert.equal(data.rows[0].holdState,'stopped');
 assert.equal(await prospectReplyOverview(t.db,{...t.actor,role:'client'}),null);assert.deepEqual((await prospectReplyOverview(t.db,{...t.actor,workspaceId:'foreign',membershipId:'other'})).rows,[]);
});
