import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportCheckFixture} from './_prospect-report-check-fixture.mjs';
import {all,one,run} from './_bloomops-db.mjs';
import {getProspectReportReview,confirmProspectReport} from '../lib/bloomops/prospect-report-review.mjs';
import {stopProspectOutreach,stopProspectOutreachForReport} from '../lib/bloomops/prospect-replies.mjs';
import {encode,dsn} from './_prospect-delivery-report-fixture.mjs';
const view=t=>getProspectReportReview(t.db,t.actor,t.env);
const command=data=>({workspaceId:data.workspaceId,selection:data.items[0].selection,expectedRevision:data.items[0].replyRevision,connectionRevision:data.connectionRevision,senderRevision:data.senderRevision,reviewed:true,note:'I reviewed the permanent failure in Gmail.'});
const stops=t=>all(t.raw,"SELECT * FROM activity_events WHERE event_type='PROSPECT_OUTREACH_STOPPED'");
const setup=async c=>{const t=await reportCheckFixture(c);assert.equal((await t.reportCheck()).status,'associated');t.confirm=async input=>confirmProspectReport(t.db,t.actor,t.env,t.session,input??command(await view(t)));return t;};
test('human confirmation links immutable report provenance to one permanent stop without provider access',async c=>{
 const t=await setup(c),before=t.reportChecks(),data=await view(t);assert.equal(data.items[0].canConfirm,true);
 // No live settings/grant health needed for a protective human stop.
 t.env.BLOOMOPS_GOOGLE_REPORT_CHECK_ENABLED='false';run(t.raw,"UPDATE prospect_google_connections SET check_status='temporary'");
 const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error('No provider request allowed');};try{assert.ok((await t.confirm()).stopped);}finally{globalThis.fetch=originalFetch;}
 const after=await view(t);assert.equal(after.items[0].canConfirm,false);assert.equal(after.items[0].stop.reason,'hard_bounce');assert.equal(after.items[0].stop.note,'I reviewed the permanent failure in Gmail.');assert.equal(after.authenticity,'unverified');assert.deepEqual(t.reportChecks(),before);
 assert.equal(stops(t).length,1);assert.deepEqual(JSON.parse(stops(t)[0].metadata_json),{deliveryId:before[0].delivery_id,reason:'hard_bounce',source:'manual_report_review',reportCheckId:before[0].id});assert.ok((await t.confirm(command(data))).conflict);
});
test('missing acknowledgement/note, stale revisions, foreign selection and raw provenance are rejected',async c=>{
 const t=await setup(c),input=command(await view(t));
 for(const patch of [{reviewed:false},{note:''},{note:' '},{note:'x'.repeat(1001)},{note:'bad\u0000note'},{workspaceId:'foreign'},{selection:'f'.repeat(64)},{expectedRevision:0},{connectionRevision:999},{senderRevision:999},{reportCheckId:t.reportChecks()[0].id},{reason:'manual'}]){const result=await t.confirm({...input,...patch});assert.ok(result?.conflict||result?.invalid,JSON.stringify(patch));}
 assert.equal(stops(t).length,0);assert.equal(t.row().hold_state,'held');
});
for(const [action,status] of [['delayed','4.1.1'],['delivered','2.0.0'],['failed','4.1.1']])test('reported '+action+' '+status+' cannot be confirmed as permanent failure',async c=>{
 const t=await reportCheckFixture(c);encode(t.reportMessage.payload.parts[1],dsn(t.fields.recipient).replace('Action: failed','Action: '+action).replace('Status: 5.1.1','Status: '+status));assert.equal((await t.reportCheck()).status,'associated');const data=await view(t);assert.equal(data.items[0].canConfirm,false);assert.ok((await confirmProspectReport(t.db,t.actor,t.env,t.session,command(data))).conflict);assert.equal(stops(t).length,0);
});
test('unresolved report cannot gain a stop through forged internal linkage',async c=>{
 const t=await reportCheckFixture(c);await t.reportCheck({fetcher:async()=>new Response(null,{status:503})});const data=await view(t),input={workspaceId:t.actor.workspaceId,prospectId:t.id,deliveryId:t.input.deliveryId,expectedRevision:t.row().revision,reason:'hard_bounce',note:'Reviewed',reviewed:true,reportCheckId:t.reportChecks()[0].id,connectionRevision:data.connectionRevision,senderRevision:data.senderRevision};const {reportCheckId,connectionRevision,senderRevision,...manual}=input;assert.ok((await stopProspectOutreachForReport(t.db,t.actor,t.session,manual,{reportCheckId,connectionRevision,senderRevision})).conflict);assert.equal(stops(t).length,0);
});
for(const [name,mutation] of [['suspended member',"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'"],['expired session',"UPDATE session SET expires_at=0"],['changed account',"UPDATE prospect_google_connections SET revision=revision+1,account_email='other@example.test'"],['disconnected account',"UPDATE prospect_google_connections SET revision=revision+1,active=0"],['changed sender',"UPDATE prospect_senders SET revision=revision+1"]])test('atomic stop guard rejects '+name,async c=>{
 const t=await setup(c),input=command(await view(t)),batch=t.db.batch.bind(t.db);t.db.batch=async statements=>{run(t.raw,mutation);return batch(statements);};const result=await t.confirm(input);assert.ok(result?.conflict||result===null);assert.equal(stops(t).length,0);assert.equal(t.row().hold_state,'held');
});
test('simultaneous confirmation commits one stop and one provenance event',async c=>{
 const t=await setup(c),input=command(await view(t)),results=await Promise.all([t.confirm(input),t.confirm(input)]);assert.equal(results.filter(x=>x.stopped).length,1);assert.equal(stops(t).length,1);
});
test('activity or stop failure rolls the whole decision back',async c=>{
 const t=await setup(c);run(t.raw,"CREATE TRIGGER deny_stop BEFORE UPDATE ON prospect_reply_states WHEN NEW.hold_state='stopped' BEGIN SELECT RAISE(ABORT,'injected'); END");await assert.rejects(t.confirm(),/injected/);assert.equal(stops(t).length,0);assert.equal(t.row().hold_state,'held');
});
test('denied roles and foreign workspaces never confirm',async c=>{
 const t=await setup(c),input=command(await view(t));for(const actor of [null,{...t.actor,role:'client'},{...t.actor,role:'team_member'},{...t.actor,role:'project_manager'},{...t.actor,workspaceId:'foreign'}])assert.equal(await confirmProspectReport(t.db,actor,t.env,t.session,input),null);assert.equal(stops(t).length,0);
});
test('report stop remains under native D1 parameter limits',async c=>{
 const t=await setup(c),batch=t.db.batch.bind(t.db);t.db.batch=async statements=>{for(const s of statements)assert.ok(s.toSQL().params.length<=100);return batch(statements);};assert.ok((await t.confirm()).stopped);
});

test('direct stop cannot link another report or change its stop reason',async c=>{
 const t=await setup(c),data=await view(t),base={workspaceId:t.actor.workspaceId,prospectId:t.id,deliveryId:t.input.deliveryId,expectedRevision:t.row().revision,reason:'hard_bounce',note:'Reviewed',reviewed:true,reportCheckId:t.reportChecks()[0].id,connectionRevision:data.connectionRevision,senderRevision:data.senderRevision};
 for(const patch of [{reportCheckId:'foreign-report'},{deliveryId:'foreign-delivery'},{reason:'manual'},{connectionRevision:999},{senderRevision:999}]){const result=await stopProspectOutreach(t.db,t.actor,t.session,{...base,...patch});assert.ok(result?.conflict||result?.invalid);}
 assert.equal(stops(t).length,0);
});

test('public manual stop rejects valid report linkage and preserves the manual path',async c=>{
 const t=await setup(c),data=await view(t),manual={workspaceId:t.actor.workspaceId,prospectId:t.id,deliveryId:t.input.deliveryId,expectedRevision:t.row().revision,reason:'hard_bounce',note:'Reviewed',reviewed:true},source={reportCheckId:t.reportChecks()[0].id,connectionRevision:data.connectionRevision,senderRevision:data.senderRevision};
 assert.ok((await stopProspectOutreach(t.db,t.actor,t.session,{...manual,...source})).invalid);assert.equal(stops(t).length,0);
 assert.ok((await stopProspectOutreach(t.db,t.actor,t.session,manual)).stopped);assert.equal(JSON.parse(stops(t)[0].metadata_json).source,'manual_review');assert.ok(!JSON.parse(stops(t)[0].metadata_json).reportCheckId);
});
