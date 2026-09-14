import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportCheckFixture} from './_prospect-report-check-fixture.mjs';
import {all,one,run} from './_bloomops-db.mjs';
import {checkProspectDeliveryReport} from '../lib/bloomops/prospect-report-checks.mjs';
const evidence=t=>t.reportChecks().filter(r=>r.status==='associated');
const count=(t,type)=>one(t.raw,'SELECT count(*) n FROM activity_events WHERE event_type=?',type).n;
test('saved unassigned report becomes immutable safe evidence without rewriting observations or coverage',async c=>{
 const t=await reportCheckFixture(c),state=t.mailstate(),recovery=all(t.raw,'SELECT * FROM prospect_recovery_messages'),observations=all(t.raw,'SELECT * FROM prospect_reply_observations');
 let calls=0;const result=await t.reportCheck({fetcher:async url=>{calls++;assert.ok(url.includes('/messages/dsn-1?'));return Response.json(t.reportMessage);}});
 assert.deepEqual(result,{checked:true,status:'associated',held:true,authenticity:'unverified'});assert.equal(calls,1);
 assert.equal(evidence(t).length,1);assert.equal(evidence(t)[0].delivery_id,t.input.deliveryId);assert.equal(evidence(t)[0].status_code,'5.1.1');
 assert.equal(count(t,'PROSPECT_REPORT_STARTED'),1);assert.equal(count(t,'PROSPECT_REPORT_CHECKED'),1);
 assert.deepEqual(t.mailstate(),state);assert.deepEqual(all(t.raw,'SELECT * FROM prospect_recovery_messages'),recovery);assert.deepEqual(all(t.raw,'SELECT * FROM prospect_reply_observations'),observations);
 assert.equal(t.row().hold_state,'held');assert.equal(one(t.raw,'SELECT reply_revision FROM prospect_report_targets').reply_revision,t.row().revision);
 assert.ok(!JSON.stringify([t.reportChecks(),all(t.raw,'SELECT * FROM prospect_report_targets'),all(t.raw,"SELECT metadata_json FROM activity_events WHERE event_type LIKE 'PROSPECT_REPORT_%'")]).match(/PRIVATE|synthetic-access|raw|diagnostic|inbox@/));
});
test('associated message replay cannot read again',async c=>{const t=await reportCheckFixture(c);await t.reportCheck();t.offset+=31000;let calls=0;assert.ok((await t.reportCheck({fetcher:async()=>{calls++;return Response.json(t.reportMessage);}})).conflict);assert.equal(calls,0);assert.equal(t.reportChecks().length,1);});
test('concurrent claims issue one provider request',async c=>{const t=await reportCheckFixture(c);let calls=0;const results=await Promise.all([1,2].map(()=>t.reportCheck({fetcher:async()=>{calls++;return Response.json(t.reportMessage);}})));assert.equal(calls,1);assert.equal(results.filter(r=>r.checked).length,1);});
test('unresolved checks retain safe failure and enforce cooldown before explicit retry',async c=>{
 const t=await reportCheckFixture(c);assert.equal((await t.reportCheck({fetcher:async()=>new Response(null,{status:503})})).status,'unresolved');
 assert.equal(t.reportChecks()[0].reason,'provider_unavailable');assert.ok((await t.reportCheck()).conflict);t.offset+=31000;assert.equal((await t.reportCheck()).status,'associated');
});
for(const [name,mutate] of [
 ['disabled',t=>t.env.BLOOMOPS_GOOGLE_REPORT_CHECK_ENABLED='false'],['production',t=>t.env.BLOOMOPS_ENV='production'],['foreign configured message',t=>t.env.BLOOMOPS_GOOGLE_REPORT_MESSAGE_ID='other'],['foreign configured run',t=>t.env.BLOOMOPS_GOOGLE_REPORT_RUN_ID='other'],
 ['revoked session',t=>run(t.raw,'DELETE FROM session WHERE id=?',t.session)],['revoked member',t=>run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id=?",t.actor.membershipId)],
 ['inactive account',t=>run(t.raw,'UPDATE prospect_google_connections SET active=0')],['unhealthy account',t=>run(t.raw,"UPDATE prospect_google_connections SET check_status='unresolved'")],
 ['missing identity',t=>{run(t.raw,'DROP TRIGGER prospect_delivery_identities_no_delete');run(t.raw,'PRAGMA foreign_keys=OFF');run(t.raw,'DELETE FROM prospect_delivery_identities');}],
 ['thread lease',t=>run(t.raw,"UPDATE prospect_reply_states SET check_id='busy',check_expires_at=?,check_status='checking',revision=revision+1",new Date(Date.now()+90000).toISOString())],
 ['discovery lease',t=>run(t.raw,"UPDATE prospect_discovery_states SET check_id='busy',check_expires_at=?,check_status='checking',revision=revision+1",new Date(Date.now()+90000).toISOString())],
])test(name+' fails before report transport',async c=>{const t=await reportCheckFixture(c);mutate(t);let calls=0;const result=await t.reportCheck({fetcher:async()=>{calls++;return Response.json(t.reportMessage);}});assert.ok(!result?.checked);assert.equal(calls,0);assert.equal(t.reportChecks().length,0);});
test('strict command/workspace/account/revision/acknowledgement reject before provider access',async c=>{
 const t=await reportCheckFixture(c);let calls=0;
 for(const patch of [{workspaceId:'foreign'},{accountEmail:'other@example.test'},{reviewed:false},{extra:true},{expectedRevision:0},{connectionRevision:99},{senderRevision:99},{recoveryRunId:'other'},{providerMessageId:'other'}]){
  const result=await checkProspectDeliveryReport(t.db,t.actor,t.env,t.session,{...await t.reportInput(),...patch},{fetcher:async()=>{calls++;return Response.json(t.reportMessage);}});assert.ok(!result?.checked);
 }
 for(const role of ['team_member','project_manager','client'])assert.equal(await checkProspectDeliveryReport(t.db,{...t.actor,role},t.env,t.session,await t.reportInput()),null);
 assert.equal(calls,0);assert.equal(t.reportChecks().length,0);
});
for(const [name,mutate] of [
 ['session deletion',t=>run(t.raw,'DELETE FROM session WHERE id=?',t.session)],
 ['membership suspension',t=>run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id=?",t.actor.membershipId)],
 ['membership stamp',t=>run(t.raw,"UPDATE workspace_memberships SET updated_at='changed' WHERE id=?",t.actor.membershipId)],
 ['grant revision',t=>run(t.raw,'UPDATE prospect_google_connections SET revision=revision+1')],
 ['account replacement',t=>run(t.raw,"UPDATE prospect_google_connections SET account_email='other@example.test',revision=revision+1")],
 ['sender revision',t=>run(t.raw,'UPDATE prospect_senders SET revision=revision+1')],
 ['reply revision',t=>run(t.raw,'UPDATE prospect_reply_states SET revision=revision+1')],
 ['mailbox revision',t=>run(t.raw,'UPDATE prospect_discovery_states SET revision=revision+1')],
 ['manual stop',async t=>assert.ok((await t.stop()).stopped)],
 ['expired lease',t=>t.offset+=91000],
])test(name+' during transport discards late evidence',async c=>{
 const t=await reportCheckFixture(c);const result=await t.reportCheck({fetcher:async()=>{await mutate(t);return Response.json(t.reportMessage);}});
 assert.ok(result.conflict);assert.equal(evidence(t).length,0);assert.equal(count(t,'PROSPECT_REPORT_CHECKED'),0);
});
test('expired check is superseded; later read uses a fresh snapshot',async c=>{
 const t=await reportCheckFixture(c);assert.ok((await t.reportCheck({fetcher:async()=>{t.offset+=91000;return Response.json(t.reportMessage);}})).conflict);
 assert.equal((await t.reportCheck()).status,'associated');assert.equal(t.reportChecks().filter(x=>x.status==='superseded').length,1);
});
test('existing manual stops are preserved even when the report associates',async c=>{const t=await reportCheckFixture(c);await t.stop();assert.equal((await t.reportCheck()).status,'associated');assert.equal(t.row().hold_state,'stopped');assert.equal(t.row().stop_reason,'opt_out');});
test('activity failure rolls back terminal evidence and permits recovery only after lease expiry',async c=>{
 const t=await reportCheckFixture(c);run(t.raw,"CREATE TRIGGER reject_report BEFORE INSERT ON activity_events WHEN NEW.event_type='PROSPECT_REPORT_CHECKED' BEGIN SELECT RAISE(ABORT,'report rollback'); END");
 await assert.rejects(()=>t.reportCheck(),/report rollback/);assert.equal(evidence(t).length,0);assert.equal(t.reportChecks()[0].status,'checking');
 run(t.raw,'DROP TRIGGER reject_report');t.offset+=91000;assert.equal((await t.reportCheck()).status,'associated');
});
test('schema rejects terminal/target mutation and foreign saved provenance',async c=>{
 const t=await reportCheckFixture(c);await t.reportCheck();
 for(const sql of ["UPDATE prospect_report_checks SET status_code='5.2.2'","DELETE FROM prospect_report_checks","UPDATE prospect_report_targets SET reply_revision=99","DELETE FROM prospect_report_targets"])
  assert.throws(()=>run(t.raw,sql),/immutable|permanent/);
 const row=t.reportChecks()[0],cols=Object.keys(row),copy={...row,id:crypto.randomUUID(),status:'checking',delivery_id:null,prospect_id:null,action:null,status_code:null,finished_at:null,reason:null,account_email:'foreign@example.test'};
 assert.throws(()=>run(t.raw,'INSERT INTO prospect_report_checks('+cols.join(',')+') VALUES('+cols.map(()=>'?').join(',')+')',...cols.map(k=>copy[k])),/saved terminal recovery/);
 assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);
});

function addDelivery(t){
 const originals=Object.fromEntries(['bloomops_prospects','prospect_outreach_drafts','prospect_outreach_approvals','prospect_deliveries','prospect_delivery_identities'].map(table=>[table,one(t.raw,'SELECT * FROM '+table)]));
 const clone=(table,patch)=>{const value={...originals[table],...patch};run(t.raw,`INSERT INTO ${table}(${Object.keys(value).join(',')}) VALUES(${Object.keys(value).map(()=>'?').join(',')})`,...Object.values(value));};
 return i=>{
  const id=crypto.randomUUID(),prospectId='many-prospect-'+i,draftId='many-draft-'+i,approvalId='many-approval-'+i,rfc='<bloomsi-'+id+'@bloomsi.invalid>';
  clone('bloomops_prospects',{id:prospectId,creation_request_id:crypto.randomUUID()});clone('prospect_outreach_drafts',{id:draftId,prospect_id:prospectId});clone('prospect_outreach_approvals',{id:approvalId,draft_id:draftId});
  clone('prospect_deliveries',{id,prospect_id:prospectId,approval_id:approvalId,message_id:rfc,provider_message_id:'many-sent-'+i,provider_thread_id:'many-thread-'+i});
  clone('prospect_delivery_identities',{id:'many-identity-'+i,prospect_id:prospectId,delivery_id:id,rfc_message_id:rfc,provider_message_id:'many-sent-'+i,provider_thread_id:'many-thread-'+i});
  const hold={...one(t.raw,'SELECT * FROM prospect_reply_states'),prospect_id:prospectId,delivery_id:id};run(t.raw,'INSERT INTO prospect_reply_states('+Object.keys(hold).join(',')+') VALUES('+Object.keys(hold).map(()=>'?').join(',')+')',...Object.values(hold));
  return {id,prospectId};
 };
}
test('100 targets stay within D1 bind limits;101 targets cannot read',async c=>{
 const t=await reportCheckFixture(c),add=addDelivery(t);for(let i=1;i<100;i++)add(i);
 const batch=t.db.batch.bind(t.db);let max=0;t.db.batch=items=>{for(const item of items){max=Math.max(max,item.toSQL().params.length);assert.ok(item.toSQL().params.length<=100);}return batch(items);};
 assert.equal((await t.reportCheck()).status,'associated');assert.equal(all(t.raw,'SELECT * FROM prospect_report_targets').length,100);assert.ok(max>0);
 add(100);let calls=0;t.offset+=31000;assert.ok((await t.reportCheck({fetcher:async()=>{calls++;return Response.json(t.reportMessage);}})).conflict);assert.equal(calls,0);
});
test('new accepted delivery during transport invalidates the complete target snapshot',async c=>{
 const t=await reportCheckFixture(c),add=addDelivery(t);assert.ok((await t.reportCheck({fetcher:async()=>{add(1);return Response.json(t.reportMessage);}})).conflict);assert.equal(evidence(t).length,0);
});
test('conflicting canonical observation cannot attach report to another delivery',async c=>{
 const t=await reportCheckFixture(c),other=addDelivery(t)(1);
 run(t.raw,"INSERT INTO prospect_reply_observations(id,workspace_id,prospect_id,delivery_id,account_email,provider_message_id,received_at,kind,match,observed_by_membership_id) VALUES('conflict','fresh',?,?,'hello@example.test','dsn-1',?,'needs_review','unresolved','dest')",other.prospectId,other.id,new Date(Number(t.reportMessage.internalDate)).toISOString());
 assert.equal((await t.reportCheck()).status,'unresolved');assert.equal(evidence(t).length,0);assert.equal(t.reportChecks()[0].reason,'observation_conflict');
});
test('saved prior assignment conflicting with returned original stays unresolved',async c=>{
 const t=await reportCheckFixture(c),other=addDelivery(t)(1);
 // Simulate an independently collected conflicting assignment without rewriting
 // fixtures through production commands that correctly forbid evidence edits.
 run(t.raw,'DROP TRIGGER prospect_recovery_messages_no_update');run(t.raw,'PRAGMA foreign_keys=OFF');
 run(t.raw,'UPDATE prospect_recovery_messages SET delivery_id=?,prospect_id=?',other.id,other.prospectId);
 assert.equal((await t.reportCheck()).status,'unresolved');assert.equal(evidence(t).length,0);
});
test('revocation after claim prevents the provider request',async c=>{
 const t=await reportCheckFixture(c),batch=t.db.batch.bind(t.db);let calls=0;
 t.db.batch=async items=>{const out=await batch(items);run(t.raw,'DELETE FROM session WHERE id=?',t.session);return out;};
 assert.ok((await t.reportCheck({fetcher:async()=>{calls++;return Response.json(t.reportMessage);}})).conflict);assert.equal(calls,0);
});

test('SQL NULL cannot bypass required terminal reason or associated action',async c=>{
 const t=await reportCheckFixture(c);
 assert.equal((await t.reportCheck({fetcher:async()=>{
  const row=t.reportChecks()[0],time=t.clock().toISOString();
  assert.throws(()=>run(t.raw,"UPDATE prospect_report_checks SET status='unresolved',finished_at=?,reason=NULL WHERE id=?",time,row.id),/CHECK constraint/);
  assert.throws(()=>run(t.raw,"UPDATE prospect_report_checks SET status='associated',finished_at=?,reason='associated',delivery_id=?,prospect_id=?,action=NULL,status_code='5.1.1' WHERE id=?",time,t.input.deliveryId,t.id,row.id),/CHECK constraint/);
  return Response.json(t.reportMessage);
 }})).status,'associated');
});
