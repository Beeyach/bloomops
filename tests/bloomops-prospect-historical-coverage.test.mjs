import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mailboxFixture} from './_prospect-mailbox-fixture.mjs';
import {all,one,run} from './_bloomops-db.mjs';
import {recoverProspectMailbox,checkpointProspectMailbox} from '../lib/bloomops/prospect-mailbox.mjs';
import {getProspectMailboxReview,saveProspectHistoricalCoverage} from '../lib/bloomops/prospect-mailbox-review.mjs';
import {verifyProspectHistoricalCoverage} from '../lib/bloomops/prospect-historical-coverage.mjs';
import {prospectCoverageOverview} from '../lib/bloomops/prospect-overview.mjs';

async function evidence(c,{listing=()=>Response.json({messages:[]}),message=()=>new Response(null,{status:503}),history=()=>Response.json({historyId:'101'})}={}){
 const t=await mailboxFixture(c);Object.assign(t.env,{BLOOMOPS_GOOGLE_RECOVERY_ENABLED:'true',BLOOMOPS_GOOGLE_CHECKPOINT_ENABLED:'true',BLOOMOPS_HISTORICAL_COVERAGE_ENABLED:'true'});let offset=0,calls=[];const clock=()=>new Date(Date.now()+offset),fetcher=async url=>{calls.push(url);const u=new URL(url);if(u.pathname.endsWith('/profile'))return Response.json({emailAddress:'hello@example.test',historyId:'100'});if(u.pathname.endsWith('/messages'))return listing(u);if(u.pathname.endsWith('/history'))return history(u);return message(u,t);};
 const command=async()=>({workspaceId:t.actor.workspaceId,accountEmail:'hello@example.test',expectedRevision:t.mailstate()?.revision||0,connectionRevision:1,senderRevision:1,reviewed:true});
 const recovered=await recoverProspectMailbox(t.db,t.actor,t.env,t.session,await command(),{clock,fetcher});
 const source=one(t.raw,"SELECT id FROM prospect_discovery_runs WHERE kind='recovery' ORDER BY created_at DESC,id DESC LIMIT 1");
 t.checkpoint=async()=>{offset+=1000;return checkpointProspectMailbox(t.db,t.actor,t.env,t.session,{...await command(),sourceRunId:source.id},{clock,fetcher:async()=>{throw Error('provider forbidden')}});};
 t.review=()=>getProspectMailboxReview(t.db,t.actor,t.env);t.calls=calls;t.recovered=recovered;t.source=source;return t;
}

test('complete empty evidence verifies only its exact interval and duplicate promotion is idempotent',async c=>{
 const t=await evidence(c);assert.ok(t.recovered.checked);assert.ok((await t.checkpoint()).checked);const data=await t.review();assert.equal(data.historical.canVerify,true);assert.equal(data.historical.status,'unverified');assert.ok(data.historical.from&&data.historical.through);
 const before=all(t.raw,'SELECT * FROM prospect_reply_states'),requestId=crypto.randomUUID(),input={workspaceId:data.workspaceId,selection:data.historical.selection,requestId,expectedRevision:data.expectedRevision,connectionRevision:data.connectionRevision,senderRevision:data.senderRevision,reviewed:true};
 assert.ok((await saveProspectHistoricalCoverage(t.db,t.actor,t.env,t.session,input)).ok);assert.deepEqual(all(t.raw,'SELECT * FROM prospect_reply_states'),before);assert.ok((await saveProspectHistoricalCoverage(t.db,t.actor,t.env,t.session,input)).unchanged);
 const saved=one(t.raw,'SELECT * FROM prospect_historical_coverages'),source=one(t.raw,"SELECT created_at FROM prospect_discovery_runs WHERE kind='recovery'"),checkpoint=one(t.raw,"SELECT finished_at FROM prospect_discovery_runs WHERE kind='checkpoint'");assert.equal(saved.interval_from,data.historical.from);assert.equal(saved.interval_through,source.created_at);assert.equal(saved.interval_through,data.historical.through);assert.ok(saved.interval_through<checkpoint.finished_at,'a delayed checkpoint cannot extend the verified interval');assert.equal(one(t.raw,'SELECT count(*) n FROM prospect_historical_coverages').n,1);assert.equal(one(t.raw,"SELECT count(*) n FROM activity_events WHERE event_type='PROSPECT_HISTORICAL_COVERAGE_VERIFIED'").n,1);
 assert.throws(()=>run(t.raw,'UPDATE prospect_historical_coverages SET interval_through=interval_through'),/immutable/);assert.throws(()=>run(t.raw,'DELETE FROM prospect_historical_coverages'),/permanent/);assert.throws(()=>run(t.raw,'UPDATE prospect_recovery_scopes SET listed_count=0'),/immutable/);
 const current=await t.review(),overview=await prospectCoverageOverview(t.db,t.actor,'hello@example.test');assert.equal(current.historical.status,'verified');assert.equal(overview.status,'verified');assert.equal(current.coverage,'verified');assert.equal(t.calls.length,3);
});

test('terminal multi-page enumeration and every required metadata read support verification',async c=>{
 const t=await evidence(c,{listing:u=>u.searchParams.has('pageToken')?Response.json({messages:[]}):Response.json({messages:[{id:'sent-message',threadId:'sent-thread'}],nextPageToken:'next'}),message:(_u,t)=>Response.json(t.thread([]).messages[0])});const scope=one(t.raw,'SELECT * FROM prospect_recovery_scopes');assert.equal(scope.listing_pages,2);assert.equal(scope.listed_count,1);assert.equal(scope.metadata_processed_count,1);assert.ok((await t.checkpoint()).checked);assert.equal((await t.review()).historical.canVerify,true);
});

test('incomplete listing, cap overflow and missing metadata cannot create supporting evidence',async c=>{
 const cases=[
  {name:'pagination',listing:u=>Response.json({messages:[],nextPageToken:'page-'+(u.searchParams.get('pageToken')||'1')})},
  {name:'cap',listing:u=>u.searchParams.has('pageToken')?Response.json({messages:[{id:'overflow',threadId:'overflow-thread'}]}):Response.json({messages:Array.from({length:40},(_,i)=>({id:'listed-'+i,threadId:'thread-'+i})),nextPageToken:'next'})},
  {name:'metadata',listing:()=>Response.json({messages:[{id:'missing',threadId:'missing-thread'}]})},
 ];
 for(const item of cases){const t=await evidence(c,{listing:item.listing});assert.equal(one(t.raw,'SELECT count(*) n FROM prospect_recovery_scopes').n,0,item.name);assert.equal(one(t.raw,'SELECT count(*) n FROM prospect_historical_coverages').n,0,item.name);assert.ok(t.mailstate().last_reason&&t.mailstate().last_reason!=='recovery_collected',item.name);}
});

test('incomplete catch-up and legacy scope absence stay explicitly unverified',async c=>{
 const partial=await evidence(c,{history:()=>new Response(null,{status:404})});assert.equal(one(partial.raw,'SELECT catchup_status FROM prospect_recovery_collections').catchup_status,'unresolved');assert.ok((await partial.checkpoint()).conflict);assert.equal((await partial.review()).historical.reason,'checkpoint');
 const legacy=await evidence(c);assert.ok((await legacy.checkpoint()).checked);run(legacy.raw,'DROP TRIGGER prospect_recovery_scopes_no_delete');run(legacy.raw,'DELETE FROM prospect_recovery_scopes');const view=await legacy.review();assert.equal(view.historical.canVerify,false);assert.equal(view.historical.reason,'evidence');
});

test('wrong account, tenant, stale connection and forged evidence are rejected without changing holds',async c=>{
 const t=await evidence(c);await t.checkpoint();const data=await t.review(),checkpoint=one(t.raw,'SELECT * FROM prospect_monitoring_checkpoints'),before=all(t.raw,'SELECT * FROM prospect_reply_states'),base={workspaceId:t.actor.workspaceId,requestId:crypto.randomUUID(),accountEmail:'hello@example.test',sourceRunId:checkpoint.source_run_id,checkpointRunId:checkpoint.run_id,expectedRevision:data.expectedRevision,connectionRevision:1,senderRevision:1,reviewed:true};
 assert.ok((await verifyProspectHistoricalCoverage(t.db,t.actor,t.session,{...base,accountEmail:'other@example.test'})).conflict);assert.ok((await verifyProspectHistoricalCoverage(t.db,{...t.actor,workspaceId:'foreign',membershipId:'other'},t.session,{...base,workspaceId:'foreign'})).conflict);
 run(t.raw,'UPDATE prospect_google_connections SET revision=revision+1');assert.ok((await saveProspectHistoricalCoverage(t.db,t.actor,t.env,t.session,{workspaceId:data.workspaceId,selection:data.historical.selection,requestId:crypto.randomUUID(),expectedRevision:data.expectedRevision,connectionRevision:data.connectionRevision,senderRevision:data.senderRevision,reviewed:true})).conflict);assert.deepEqual(all(t.raw,'SELECT * FROM prospect_reply_states'),before);assert.equal(one(t.raw,'SELECT count(*) n FROM prospect_historical_coverages').n,0);
});

test('replaced evidence and changed actor authority reject a stale promotion',async c=>{
 const replaced=await evidence(c);await replaced.checkpoint();const stale=await replaced.review();const newer=await recoverProspectMailbox(replaced.db,replaced.actor,replaced.env,replaced.session,{workspaceId:stale.workspaceId,accountEmail:'hello@example.test',expectedRevision:stale.expectedRevision,connectionRevision:stale.connectionRevision,senderRevision:stale.senderRevision,reviewed:true},{clock:()=>new Date(Date.now()+60000),fetcher:async url=>{const path=new URL(url).pathname;if(path.endsWith('/profile'))return Response.json({emailAddress:'hello@example.test',historyId:'101'});if(path.endsWith('/messages'))return Response.json({messages:[]});if(path.endsWith('/history'))return Response.json({historyId:'102'});throw Error('unexpected provider mock');}});assert.ok(newer.checked);
 const request={workspaceId:stale.workspaceId,selection:stale.historical.selection,requestId:crypto.randomUUID(),expectedRevision:stale.expectedRevision,connectionRevision:stale.connectionRevision,senderRevision:stale.senderRevision,reviewed:true};assert.ok((await saveProspectHistoricalCoverage(replaced.db,replaced.actor,replaced.env,replaced.session,request)).conflict);assert.equal(one(replaced.raw,'SELECT count(*) n FROM prospect_historical_coverages').n,0);
 const authority=await evidence(c);await authority.checkpoint();const current=await authority.review();run(authority.raw,"UPDATE workspace_memberships SET updated_at='2099-01-01T00:00:00.000Z' WHERE id=?",authority.actor.membershipId);assert.ok((await saveProspectHistoricalCoverage(authority.db,authority.actor,authority.env,authority.session,{workspaceId:current.workspaceId,selection:current.historical.selection,requestId:crypto.randomUUID(),expectedRevision:current.expectedRevision,connectionRevision:current.connectionRevision,senderRevision:current.senderRevision,reviewed:true})).conflict);assert.equal(one(authority.raw,'SELECT count(*) n FROM prospect_historical_coverages').n,0);
});
