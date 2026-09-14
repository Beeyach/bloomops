import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailboxFixture} from './_prospect-mailbox-fixture.mjs';
import {all,one,run} from './_bloomops-db.mjs';
import {recoverProspectMailbox,getProspectRecovery} from '../lib/bloomops/prospect-mailbox.mjs';
const later=(ms=31000)=>()=>new Date(Date.now()+ms);
const records=t=>all(t.raw,'SELECT * FROM prospect_recovery_collections');
const messages=t=>all(t.raw,'SELECT * FROM prospect_recovery_messages');
const observations=t=>all(t.raw,'SELECT * FROM prospect_reply_observations');
const count=(t,type)=>one(t.raw,'SELECT count(*) n FROM activity_events WHERE event_type=?',type).n;
async function fixture(c,options){
 const t=await mailboxFixture(c,options);t.env.BLOOMOPS_GOOGLE_RECOVERY_ENABLED='true';
 const listReply={...t.message('recovered-reply'),threadId:'different-thread'},unknown={...t.message('unassigned',{'In-Reply-To':'<unknown@example.test>'}),threadId:'other-thread'};
 const get=id=>id==='recovered-reply'?listReply:unknown;
 t.fetch=async url=>{const u=new URL(url);if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:'hello@example.test',historyId:'100'});if(u.pathname.endsWith('/messages'))return Response.json({messages:[listReply,unknown].map(x=>({id:x.id,threadId:x.threadId}))});if(u.pathname.endsWith('/history')){assert.equal(u.searchParams.get('startHistoryId'),'100');return Response.json({history:[{id:'101',messagesAdded:[{message:{id:unknown.id,threadId:unknown.threadId}}]}],historyId:'102'});}return Response.json(get(u.pathname.split('/').at(-1)));};
 t.recover=async opts=>recoverProspectMailbox(t.db,t.actor,t.env,t.session,await t.mailcommand(),{fetcher:t.fetch,...opts});
 return t;
}
test('recovery saves assigned/unassigned evidence and catch-up without resetting discovery progress',async c=>{
 const t=await fixture(c);await t.mailcheck();assert.equal((await t.recover({clock:later()})).status,'unresolved');
 const saved=records(t)[0];assert.equal(saved.start_history_id,'100');assert.equal(saved.catchup_history_id,'102');assert.equal(saved.catchup_status,'complete');assert.equal(saved.matched_count,1);assert.equal(saved.unassigned_count,1);assert.equal(messages(t).length,2);assert.equal(observations(t).length,1);assert.equal(t.mailstate().history_id,'9');assert.equal(t.mailstate().baseline_history_id,'9');assert.equal(t.mailstate().coverage_status,'gap');assert.equal(t.row().hold_state,'held');
 assert.equal(one(t.raw,"SELECT kind FROM prospect_discovery_runs WHERE reason='recovery_collected'").kind,'recovery');
 const dto=await getProspectRecovery(t.db,t.actor,'hello@example.test');assert.equal(dto.catchupStatus,'complete');assert.equal(dto.matchedCount,1);assert.equal(dto.coverage,'unverified');assert.ok(!JSON.stringify(dto).match(/synthetic|provider|HistoryId|checkId|identity|accountEmail/));
});
test('recovery before initial baseline never seeds operational progress',async c=>{
 const t=await fixture(c);await t.recover();assert.equal(t.mailstate().history_id,null);assert.equal(t.mailstate().baseline_history_id,null);assert.equal(records(t).length,1);
});
test('replay retains per-run provenance but canonical observations/events deduplicate',async c=>{
 const t=await fixture(c);await t.recover();const original=records(t)[0];await t.recover({clock:later()});assert.equal(records(t).length,2);assert.deepEqual(records(t)[0],original);assert.equal(messages(t).length,4);assert.equal(observations(t).length,1);assert.equal(count(t,'PROSPECT_REPLY_OBSERVED'),1);assert.equal(count(t,'PROSPECT_DISCOVERY_HELD'),1);
});
test('failed catch-up saves the completed collection with an explicit unresolved boundary',async c=>{
 const t=await fixture(c);await t.recover({fetcher:async url=>url.includes('/history?')?new Response(null,{status:404}):t.fetch(url)});
 assert.equal(records(t)[0].catchup_status,'unresolved');assert.equal(records(t)[0].catchup_history_id,null);assert.equal(records(t)[0].reason,'history_gap');assert.equal(messages(t).length,2);assert.equal(observations(t).length,1);assert.equal(t.mailstate().history_id,null);
});
test('missing registry, profile and collection failures save only a held terminal run',async c=>{
 for(const mode of ['identity','profile','listing']){const t=await fixture(c,{registered:mode!=='identity'});let calls=0;await t.recover({fetcher:async url=>{calls++;if(mode==='profile'||url.includes('/messages?'))return new Response(null,{status:503});return t.fetch(url);}});assert.equal(records(t).length,0);assert.equal(messages(t).length,0);assert.equal(t.row().hold_state,'held');assert.equal(t.mailstate().check_status,'unresolved');if(mode==='identity')assert.equal(calls,0);}
});
test('recovery requires its explicit local gate and current authorized account/session',async c=>{
 const t=await fixture(c);let calls=0;const input=await t.mailcommand(),options={fetcher:async()=>{calls++;}};
 for(const patch of [{BLOOMOPS_GOOGLE_RECOVERY_ENABLED:'false'},{BLOOMOPS_GOOGLE_DISCOVERY_ENABLED:'false'},{BLOOMOPS_ENV:'staging'},{BLOOMOPS_GOOGLE_DISCOVERY_ACCOUNT_EMAIL:'other@example.test'}])assert.ok((await recoverProspectMailbox(t.db,t.actor,{...t.env,...patch},t.session,input,options)).unavailable);
 for(const role of ['client','team_member','project_manager']){assert.equal(await recoverProspectMailbox(t.db,{...t.actor,role},t.env,t.session,input,options),null);assert.equal(await getProspectRecovery(t.db,{...t.actor,role},'hello@example.test'),null);}
 assert.equal(await getProspectRecovery(t.db,{...t.actor,workspaceId:'foreign'},'hello@example.test'),null);
 assert.ok((await recoverProspectMailbox(t.db,t.actor,t.env,'wrong',input,options)).conflict);assert.equal(calls,0);assert.equal(t.mailstate(),undefined);
});
test('competing normal and recovery commands share one lease',async c=>{
 const t=await fixture(c),input=await t.mailcommand();let calls=0;const results=await Promise.all([1,2].map(()=>recoverProspectMailbox(t.db,t.actor,t.env,t.session,input,{fetcher:async url=>{calls++;assert.ok((await t.mailcheck()).conflict);return t.fetch(url);}})));
 assert.equal(results.filter(x=>x.checked).length,1);assert.equal(records(t).length,1);assert.equal(calls,6);
});
test('revocation/stop at each provider stage prevents later stages and saving evidence',async c=>{
 for(const stage of ['profile','messages','history'])for(const stop of [false,true]){
  const t=await fixture(c);let calls=[];const result=await t.recover({fetcher:async url=>{calls.push(url);const u=new URL(url);if(u.pathname.endsWith('/'+stage)){if(stop)await t.stop();else run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='dest'");}return t.fetch(url);}});
  assert.ok(result.conflict);assert.equal(records(t).length,0);assert.equal(messages(t).length,0);assert.equal(observations(t).length,0);assert.equal(t.mailstate().history_id,null);if(stage==='profile')assert.equal(calls.length,1);if(stage==='messages')assert.ok(!calls.some(url=>url.includes('/history?')));if(stop)assert.equal(t.row().hold_state,'stopped');
 }
});
test('expired recovery is superseded; late completion cannot attach evidence',async c=>{
 const t=await fixture(c);let offset=0,nested=false;
 const old=await t.recover({clock:()=>new Date(Date.now()+offset),fetcher:async url=>{if(!nested&&url.includes('/history?')){nested=true;offset=91000;assert.ok((await t.recover({clock:()=>new Date(Date.now()+offset)})).checked);}return t.fetch(url);}});
 assert.ok(old.conflict);assert.equal(records(t).length,1);assert.equal(one(t.raw,"SELECT count(*) n FROM prospect_discovery_runs WHERE status='superseded'").n,1);
});
test('conflicting evidence across listing and history saves no partial collection',async c=>{
 const t=await fixture(c);let catchup=false;
 await t.recover({fetcher:async url=>{if(url.includes('/history?'))catchup=true;const response=await t.fetch(url);if(catchup&&url.includes('/messages/unassigned?')){const data=await response.json();data.internalDate=String(Number(data.internalDate)+1);return Response.json(data);}return response;}});
 assert.equal(t.mailstate().last_reason,'recovery_conflict');assert.equal(records(t).length,0);assert.equal(observations(t).length,0);
});
test('existing canonical attribution cannot be replaced by an unassigned proposal',async c=>{
 const t=await fixture(c);await t.check({clock:later(),fetcher:async()=>Response.json(t.thread([t.message('unassigned')]))});
 await t.recover();assert.equal(t.mailstate().last_reason,'observation_conflict');assert.equal(records(t).length,0);assert.equal(messages(t).length,0);assert.equal(observations(t).length,1);
});
for(const type of ['PROSPECT_REPLY_OBSERVED','PROSPECT_DISCOVERY_CHECKED','PROSPECT_RECOVERY_COLLECTED'])test(type+' failure rolls back collection, messages and observations together',async c=>{
 const t=await fixture(c);run(t.raw,`CREATE TRIGGER reject_recovery BEFORE INSERT ON activity_events WHEN NEW.event_type='${type}' BEGIN SELECT RAISE(ABORT,'recovery rollback'); END`);await assert.rejects(()=>t.recover(),/recovery rollback/);assert.equal(records(t).length,0);assert.equal(messages(t).length,0);assert.equal(observations(t).length,0);assert.equal(t.mailstate().check_status,'checking');assert.equal(t.row().hold_state,'held');
});
test('sealed collection/messages and recovery run kind are immutable and tenant-scoped',async c=>{
 const t=await fixture(c);await t.recover();
 for(const query of ["UPDATE prospect_recovery_collections SET matched_count=0","DELETE FROM prospect_recovery_collections","UPDATE prospect_recovery_messages SET kind='needs_review'","DELETE FROM prospect_recovery_messages","UPDATE prospect_discovery_runs SET kind='discovery'"]){assert.throws(()=>run(t.raw,query),/immutable|permanent|identity/);}
 const value=messages(t)[0];assert.throws(()=>run(t.raw,'INSERT INTO prospect_recovery_messages(workspace_id,run_id,provider_message_id,provider_thread_id,received_at,kind) VALUES(?,?,?,?,?,?)',value.workspace_id,value.run_id,'extra','thread',value.received_at,'needs_review'),/active collection/);
 assert.throws(()=>run(t.raw,'INSERT INTO prospect_recovery_messages(workspace_id,run_id,provider_message_id,provider_thread_id,received_at,kind) VALUES(?,?,?,?,?,?)','foreign',value.run_id,'extra','thread',value.received_at,'needs_review'),/active collection|FOREIGN KEY/);
 assert.deepEqual(all(t.raw,'PRAGMA foreign_key_check'),[]);
});
test('all recovery batch statements fit D1 parameter limits',async c=>{
 const t=await fixture(c),batch=t.db.batch.bind(t.db);t.db.batch=items=>{for(const item of items)assert.ok(item.toSQL().params.length<=100,item.toSQL().params.length);return batch(items);};await t.recover();assert.equal(records(t).length,1);
});
test('database count sealing rejects missing evidence and rolls back the whole completion',async c=>{
 const t=await fixture(c),batch=t.db.batch.bind(t.db);let removed=false;
 t.db.batch=items=>batch(items.filter(item=>{if(!removed&&item.toSQL().sql.startsWith('insert into "prospect_recovery_messages"')){removed=true;return false;}return true;}));
 await assert.rejects(()=>t.recover(),/must be complete/);assert.ok(removed);assert.equal(records(t).length,0);assert.equal(messages(t).length,0);assert.equal(observations(t).length,0);assert.equal(t.mailstate().check_status,'checking');
});
test('recovery completion cannot promote its own run to an operational cursor result',async c=>{
 const t=await fixture(c);let denied=false;
 await t.recover({fetcher:async url=>{if(url.includes('/profile?')){assert.throws(()=>run(t.raw,"UPDATE prospect_discovery_runs SET status='checked',result_history_id='100',reason='wrong',finished_at=? WHERE kind='recovery'",new Date().toISOString()),/cannot change/);denied=true;}return t.fetch(url);}});
 assert.ok(denied);assert.equal(t.mailstate().history_id,null);
});
