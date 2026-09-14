import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailboxFixture} from './_prospect-mailbox-fixture.mjs';
import {all,one,run} from './_bloomops-db.mjs';
import {recoverProspectMailbox,checkpointProspectMailbox,checkProspectMailbox} from '../lib/bloomops/prospect-mailbox.mjs';
async function fixture(c,{unassigned=false,failed=false}={}){
 const t=await mailboxFixture(c);t.offset=0;t.clock=()=>new Date(Date.now()+t.offset);t.env.BLOOMOPS_GOOGLE_RECOVERY_ENABLED='true';t.env.BLOOMOPS_GOOGLE_CHECKPOINT_ENABLED='true';
 t.fetch=async url=>{const u=new URL(url);if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:'hello@example.test',historyId:'100'});if(u.pathname.endsWith('/messages'))return Response.json({messages:unassigned?[{id:'unknown',threadId:'unknown-thread'}]:[]});if(u.pathname.endsWith('/history'))return failed?new Response(null,{status:404}):Response.json({historyId:'102'});return Response.json({...t.message('unknown',{'In-Reply-To':'<foreign@example.test>'}),threadId:'unknown-thread'});};
 t.recover=()=>recoverProspectMailbox(t.db,t.actor,t.env,t.session, t.mailcommandInput,{fetcher:t.fetch,clock:t.clock});
 t.collect=async()=>{t.mailcommandInput=await t.mailcommand();return t.recover();};await t.collect();
 t.source=()=>one(t.raw,"SELECT * FROM prospect_discovery_runs WHERE kind='recovery' ORDER BY created_at DESC,id DESC");
 t.checkpoints=()=>all(t.raw,'SELECT * FROM prospect_monitoring_checkpoints');
 t.cpinput=async()=>({...await t.mailcommand(),sourceRunId:t.source().id});
 t.checkpoint=async(options={})=>checkpointProspectMailbox(t.db,t.actor,t.env,t.session,await t.cpinput(),{clock:t.clock,fetcher:()=>{throw Error('No provider read permitted');},...options});
 return t;
}
test('checkpoint advances future cursor only, retaining source, older-mail uncertainty and held decisions',async c=>{
 const t=await fixture(c),source=t.source(),collection=all(t.raw,'SELECT * FROM prospect_recovery_collections'),observations=all(t.raw,'SELECT * FROM prospect_reply_observations');assert.equal(t.mailstate().history_id,null);
 assert.ok((await t.checkpoint()).checked);assert.equal(t.mailstate().history_id,'102');assert.equal(t.mailstate().baseline_history_id,'102');assert.equal(t.mailstate().coverage_status,'gap');assert.equal(t.row().hold_state,'held');assert.equal(t.checkpoints().length,1);
 assert.deepEqual(t.source(),source);assert.deepEqual(all(t.raw,'SELECT * FROM prospect_recovery_collections'),collection);assert.deepEqual(all(t.raw,'SELECT * FROM prospect_reply_observations'),observations);assert.equal(one(t.raw,"SELECT count(*) n FROM activity_events WHERE event_type='PROSPECT_MONITORING_CHECKPOINT'").n,1);
 const calls=[];t.offset=31000;assert.ok((await checkProspectMailbox(t.db,t.actor,t.env,t.session,await t.mailcommand(),{clock:t.clock,fetcher:async url=>{calls.push(new URL(url));return Response.json({historyId:'105'});}})).checked);assert.equal(calls.length,1);assert.equal(calls[0].searchParams.get('startHistoryId'),'102');assert.equal(t.mailstate().coverage_status,'gap');assert.equal(t.row().hold_state,'held');
});
test('an existing baseline and gap survive a newer checkpoint',async c=>{
 const t=await mailboxFixture(c);await t.mailcheck({fetcher:async()=>Response.json({emailAddress:'hello@example.test',historyId:'9'})});t.env.BLOOMOPS_GOOGLE_RECOVERY_ENABLED='true';t.env.BLOOMOPS_GOOGLE_CHECKPOINT_ENABLED='true';const clock=()=>new Date(Date.now()+31000);
 await recoverProspectMailbox(t.db,t.actor,t.env,t.session,await t.mailcommand(),{clock,fetcher:async url=>url.includes('/profile')?Response.json({emailAddress:'hello@example.test',historyId:'100'}):url.includes('/history?')?Response.json({historyId:'102'}):Response.json({messages:[]})});
 const source=one(t.raw,"SELECT id FROM prospect_discovery_runs WHERE kind='recovery'");assert.ok((await checkpointProspectMailbox(t.db,t.actor,t.env,t.session,{...await t.mailcommand(),sourceRunId:source.id},{clock})).checked);assert.equal(t.mailstate().baseline_history_id,'9');assert.equal(t.mailstate().history_id,'102');assert.equal(t.mailstate().coverage_status,'gap');
});
for(const [name,options] of [['unassigned messages',{unassigned:true}],['expired history',{failed:true}]])test(name+' never becomes a monitoring checkpoint',async c=>{const t=await fixture(c,options);assert.ok((await t.checkpoint()).conflict);assert.equal(t.checkpoints().length,0);assert.equal(t.mailstate().history_id,null);});
test('expired collection, wrong source and revisions cannot save a checkpoint',async c=>{
 const t=await fixture(c),input=await t.cpinput();for(const patch of [{sourceRunId:'foreign'},{expectedRevision:999},{connectionRevision:999},{senderRevision:999},{reviewed:false},{workspaceId:'foreign'},{accountEmail:'other@example.test'},{cursor:'999'}]){const result=await checkpointProspectMailbox(t.db,t.actor,t.env,t.session,{...input,...patch});assert.ok(result.conflict||result.unavailable,JSON.stringify(patch));}t.offset=300001;assert.ok((await t.checkpoint()).conflict);assert.equal(t.checkpoints().length,0);
});
test('disabled/local scope gates never write or invoke a provider',async c=>{
 const t=await fixture(c),input=await t.cpinput();for(const patch of [{BLOOMOPS_ENV:'staging'},{BLOOMOPS_GOOGLE_DISCOVERY_ENABLED:'false'},{BLOOMOPS_GOOGLE_CHECKPOINT_ENABLED:'false'},{BLOOMOPS_GOOGLE_DISCOVERY_WORKSPACE_ID:'foreign'},{BLOOMOPS_GOOGLE_DISCOVERY_ACCOUNT_EMAIL:'other@example.test'}])assert.ok((await checkpointProspectMailbox(t.db,t.actor,{...t.env,...patch},t.session,input)).unavailable);assert.equal(t.checkpoints().length,0);
});
test('permanent stops remain stopped; later decisions invalidate an old collection',async c=>{
 const t=await fixture(c);await t.stop();assert.ok((await t.checkpoint()).conflict);t.offset=31000;await t.collect();assert.ok((await t.checkpoint()).checked);assert.equal(t.row().hold_state,'stopped');assert.equal(t.row().stop_reason,'opt_out');
});
test('duplicate concurrent checkpoints save one immutable point',async c=>{
 const t=await fixture(c),input=await t.cpinput(),results=await Promise.all([1,2].map(()=>checkpointProspectMailbox(t.db,t.actor,t.env,t.session,input)));assert.equal(results.filter(x=>x.checked).length,1);assert.equal(t.checkpoints().length,1);assert.ok((await t.checkpoint()).conflict);assert.throws(()=>run(t.raw,'UPDATE prospect_monitoring_checkpoints SET source_run_id=source_run_id'),/immutable/);assert.throws(()=>run(t.raw,'DELETE FROM prospect_monitoring_checkpoints'),/retained/);
});
for(const [name,mutation] of [['member suspended',"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'"],['session expired',"UPDATE session SET expires_at=0"],['account replaced',"UPDATE prospect_google_connections SET revision=revision+1,account_email='other@example.test'"],['sender revised',"UPDATE prospect_senders SET revision=revision+1"]])test('pre-claim '+name+' denies checkpoint',async c=>{
 const t=await fixture(c),batch=t.db.batch.bind(t.db);t.db.batch=async statements=>{run(t.raw,mutation);return batch(statements);};assert.ok((await t.checkpoint()).conflict);assert.equal(t.checkpoints().length,0);assert.equal(t.mailstate().history_id,null);
});
test('checkpoint and claim roll back together on provenance failure',async c=>{
 const t=await fixture(c),state=t.mailstate(),reply=t.row(),events=all(t.raw,'SELECT * FROM activity_events');run(t.raw,"CREATE TRIGGER fail_checkpoint BEFORE INSERT ON prospect_monitoring_checkpoints BEGIN SELECT RAISE(ABORT,'injected'); END");await assert.rejects(t.checkpoint(),/injected/);assert.deepEqual(t.mailstate(),state);assert.deepEqual(t.row(),reply);assert.deepEqual(all(t.raw,'SELECT * FROM activity_events'),events);
});
test('denied roles and foreign workspaces cannot access the checkpoint command',async c=>{const t=await fixture(c),input=await t.cpinput();for(const actor of [null,{...t.actor,role:'client'},{...t.actor,role:'team_member'},{...t.actor,role:'project_manager'},{...t.actor,workspaceId:'foreign',membershipId:'other'}]){const result=await checkpointProspectMailbox(t.db,actor,t.env,t.session,input);assert.ok(result===null||result.conflict);};assert.equal(t.checkpoints().length,0);});

test('read model resolves only an opaque current selection and hides cursors',async c=>{
 const {getProspectMailboxReview,saveProspectMonitoringCheckpoint}=await import('../lib/bloomops/prospect-mailbox-review.mjs'),t=await fixture(c),data=await getProspectMailboxReview(t.db,t.actor,t.env);assert.equal(data.checkpoint.canSave,true);assert.match(data.checkpoint.selection,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(data).match(/sourceRunId|historyId|history_id|synthetic-access|snapshotJson/));
 const input={workspaceId:data.workspaceId,selection:data.checkpoint.selection,expectedRevision:data.expectedRevision,connectionRevision:data.connectionRevision,senderRevision:data.senderRevision,reviewed:true};
 for(const patch of [{selection:'f'.repeat(64)},{sourceRunId:t.source().id},{accountEmail:'hello@example.test'},{reviewed:false}])assert.ok((await saveProspectMonitoringCheckpoint(t.db,t.actor,t.env,t.session,{...input,...patch})).conflict);
 assert.ok((await saveProspectMonitoringCheckpoint(t.db,t.actor,t.env,t.session,input)).checked);const after=await getProspectMailboxReview(t.db,t.actor,t.env);assert.ok(after.checkpoint.savedAt);assert.equal(after.checkpoint.reason,'used');assert.equal(after.coverage,'unverified');
});
test('a newer collection invalidates an older selection',async c=>{
 const {getProspectMailboxReview,saveProspectMonitoringCheckpoint}=await import('../lib/bloomops/prospect-mailbox-review.mjs'),t=await fixture(c),old=await getProspectMailboxReview(t.db,t.actor,t.env);t.offset=31000;await t.collect();
 const input={workspaceId:old.workspaceId,selection:old.checkpoint.selection,expectedRevision:old.expectedRevision,connectionRevision:old.connectionRevision,senderRevision:old.senderRevision,reviewed:true};assert.ok((await saveProspectMonitoringCheckpoint(t.db,t.actor,t.env,t.session,input)).conflict);assert.equal(t.checkpoints().length,0);
});
for(const [name,change] of [['expired collection',t=>{t.offset=300001;}],['expired lease',t=>{t.offset=91000;}],['stop decision',async t=>{await t.stop();}],['revoked authority',t=>run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'")]])test('post-claim '+name+' prevents cursor completion',async c=>{
 const t=await fixture(c),batch=t.db.batch.bind(t.db);let entered=false;t.db.batch=async statements=>{const result=await batch(statements);if(!entered){entered=true;await change(t);}return result;};assert.ok((await t.checkpoint()).conflict);assert.equal(t.mailstate().history_id,null);assert.equal(one(t.raw,"SELECT count(*) n FROM activity_events WHERE event_type='PROSPECT_MONITORING_CHECKPOINT'").n,0);assert.equal(one(t.raw,"SELECT status FROM prospect_discovery_runs WHERE kind='checkpoint'").status,'checking');
});
test('completion rollback never presents a claimed point as saved',async c=>{
 const {getProspectMailboxReview}=await import('../lib/bloomops/prospect-mailbox-review.mjs'),t=await fixture(c);run(t.raw,"CREATE TRIGGER fail_finish BEFORE UPDATE ON prospect_discovery_states WHEN NEW.history_id IS NOT OLD.history_id BEGIN SELECT RAISE(ABORT,'finish failed'); END");await assert.rejects(t.checkpoint(),/finish failed/);assert.equal(t.mailstate().history_id,null);assert.equal(one(t.raw,"SELECT status FROM prospect_discovery_runs WHERE kind='checkpoint'").status,'checking');assert.equal(one(t.raw,"SELECT count(*) n FROM activity_events WHERE event_type='PROSPECT_MONITORING_CHECKPOINT'").n,0);const data=await getProspectMailboxReview(t.db,t.actor,t.env);assert.equal(data.checkpoint.savedAt,null);assert.equal(data.checkpoint.canSave,false);
});
test('SQL completion rejects a cursor outside the linked collection',async c=>{
 const t=await fixture(c),batch=t.db.batch.bind(t.db);let claimed=false,denied=false;t.db.batch=async statements=>{const result=await batch(statements);if(!claimed){claimed=true;try{run(t.raw,"UPDATE prospect_discovery_runs SET status='checked',result_history_id='999',reason='checkpoint_saved',finished_at=? WHERE kind='checkpoint'",new Date().toISOString());}catch(e){denied=/linked monitoring checkpoint/.test(e.message);}}return result;};assert.ok((await t.checkpoint()).checked);assert.ok(denied);assert.equal(t.mailstate().history_id,'102');
});
test('all checkpoint statements stay within D1 parameter limits',async c=>{const t=await fixture(c),batch=t.db.batch.bind(t.db);t.db.batch=async statements=>{for(const s of statements)assert.ok(s.toSQL().params.length<=100);return batch(statements);};assert.ok((await t.checkpoint()).checked);});
for(const age of [300000,300001])test('checkpoint freshness boundary at '+age+'ms',async c=>{
 const {getProspectMailboxReview}=await import('../lib/bloomops/prospect-mailbox-review.mjs'),t=await fixture(c),instant=Date.parse(t.source().finished_at)+age;
 c.mock.method(Date,'now',()=>instant);t.clock=()=>new Date(instant);
 const view=await getProspectMailboxReview(t.db,t.actor,t.env);
 assert.equal(view.checkpoint.canSave,age===300000);assert.equal(view.checkpoint.reason,age===300000?null:'expired');
 const result=await t.checkpoint();assert.equal(Boolean(result.checked),age===300000);assert.equal(t.checkpoints().length,age===300000?1:0);
});
test('an unfinished newer attempt preserves the last successful starting point',async c=>{
 const {getProspectMailboxReview}=await import('../lib/bloomops/prospect-mailbox-review.mjs'),t=await fixture(c);
 assert.ok((await t.checkpoint()).checked);const saved=(await getProspectMailboxReview(t.db,t.actor,t.env)).checkpoint.savedAt;
 t.offset=31000;await t.collect();
 run(t.raw,"CREATE TRIGGER fail_new_checkpoint BEFORE UPDATE ON prospect_discovery_runs WHEN NEW.kind='checkpoint' AND NEW.status='checked' BEGIN SELECT RAISE(ABORT,'new finish failed'); END");
 await assert.rejects(t.checkpoint(),/new finish failed/);
 const data=await getProspectMailboxReview(t.db,t.actor,t.env);assert.equal(data.checkpoint.savedAt,saved);assert.equal(data.checkpoint.incomplete,true);assert.equal(data.checkpoint.canSave,false);assert.equal(t.mailstate().history_id,'102');assert.equal(t.row().hold_state,'held');
});
