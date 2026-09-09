import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-approvals.mjs';
import { all,run } from './_bloomops-db.mjs';

for(const same of [true,false])test(`simultaneous ${same?'identical':'different'} requests create exactly one round and snapshot`,async()=>{
  const t=await setup(),requestId=crypto.randomUUID();
  const results=await Promise.all([t.request({requestId,expectedRevision:1}),t.request({requestId:same?requestId:crypto.randomUUID(),expectedRevision:1})]);
  assert.equal(results.filter(r=>r.ok&&!r.unchanged).length,1);assert.equal(results.filter(r=>r.ok).length,same?2:1);
  assert.equal(all(t.raw,'SELECT * FROM content_review_revisions').length,1);assert.equal((await t.rounds()).items.length,1);
  assert.equal(t.history().filter(r=>r.event_type==='CONTENT_APPROVAL_REQUESTED').length,1);
});
for(const operation of ['edit','platforms','date'])for(const first of ['request','mutation'])test(`request versus ${operation}, ${first} holds write lock first`,async()=>{
  const t=await setup(),mutation=()=>operation==='platforms'?t.platforms(['YouTube'],{input:{expectedRevision:1,platforms:['YouTube']}}):t.edit(t.contentId,operation==='date'?{targetPublishDate:'2026-09-28'}:{script:'Competing script'},{expectedRevision:1});
  let competitor;
  if(first==='mutation')t.beforeBatch(async()=>{competitor=await mutation();});
  else t.beforeBatch(async()=>{competitor=await t.request({expectedRevision:1});});
  const result=first==='mutation'?await t.request({expectedRevision:1}):await mutation();
  assert.equal(competitor.ok,true);assert.equal(result.ok,false);
  assert.equal(all(t.raw,'SELECT * FROM content_review_revisions').length,first==='request'?1:0);
  if(first==='request')assert.equal((await t.rounds()).items[0].snapshot.script,'Review this script');
});
for(const kind of ['same','opposite','withdraw'])test(`Client response versus ${kind} response has one canonical terminal fact`,async()=>{
  const t=await setup(),{roundId}=await t.request(),before=t.history().length;
  const results=await Promise.all([t.respond(roundId),kind==='withdraw'?t.withdraw(roundId,{expectedRevision:2}):t.respond(roundId,kind==='same'?'approved':'changes_requested',kind==='same'?null:'Please revise')]);
  assert.equal(results.filter(r=>r.ok&&!r.unchanged).length,1);if(kind==='same')assert.equal(results.filter(r=>r.ok).length,2);
  const row=(await t.rounds()).items[0];assert.notEqual(row.status,'requested');assert.equal(t.history().length-before,row.status==='withdrawn'?1:2);
  assert.equal((await t.item(t.contentId)).stage,row.status==='withdrawn'?'client_review':row.status==='approved'?'approved':'revision_requested');
});
for(const first of ['response','edit'])test(`response versus allowed ownership edit, ${first} commits first`,async()=>{
  const t=await setup(),{roundId}=await t.request();let competitor;
  if(first==='response')t.beforeBatch(async()=>{competitor=await t.respond(roundId);});
  else t.beforeBatch(async()=>{competitor=await t.edit(t.contentId,{ownerMembershipId:'m-ary'},{expectedRevision:2});});
  const result=first==='response'?await t.edit(t.contentId,{ownerMembershipId:'m-ary'},{expectedRevision:2}):await t.respond(roundId);
  assert.equal(competitor.ok,true);assert.equal(result.ok,false);
  assert.equal((await t.rounds()).items[0].status,first==='response'?'approved':'requested');
});
for(const mutation of ['stage','script','platforms','date'])test(`response races frozen ${mutation}: no reviewed draft can slip through`,async()=>{
  const t=await setup(),{roundId}=await t.request();
  const change=mutation==='stage'?t.move('revision_requested',{context:'Bypass',expectedRevision:2}):mutation==='platforms'?t.platforms(['YouTube'],{input:{platforms:['YouTube'],expectedRevision:2}}):t.edit(t.contentId,mutation==='date'?{targetPublishDate:'2026-09-28'}:{script:'Changed'},{expectedRevision:2});
  const [changed,response]=await Promise.all([change,t.respond(roundId)]);assert.equal(changed.ok,false);assert.equal(response.ok,true);
});
for(const operation of ['request','approve','changes','withdraw'])for(const failure of [...operation==='request'?['revision']:[],'round','semantic',...['approve','changes'].includes(operation)?['stage-event']:[],'content'])test(`${operation}: late ${failure} failure rolls all facts back`,async()=>{
  const t=await setup(),roundId=operation==='request'?null:(await t.request()).roundId;
  const target=failure==='revision'?'INSERT ON content_review_revisions':failure==='round'?`${operation==='request'?'INSERT':'UPDATE'} ON content_approval_rounds`:failure==='content'?'UPDATE ON content_items':`INSERT ON activity_events WHEN NEW.event_type ${failure==='semantic'?"LIKE 'CONTENT_APPROVAL_%'":"= 'CONTENT_STAGE_CHANGED'"}`;
  run(t.raw,`CREATE TRIGGER fail BEFORE ${target} BEGIN SELECT RAISE(ABORT,'late injected failure'); END`);
  const before=t.snapshot();await assert.rejects(operation==='request'?t.request():operation==='withdraw'?t.withdraw(roundId):t.respond(roundId,operation==='changes'?'changes_requested':'approved',operation==='changes'?'Revise':null));assert.deepEqual(t.snapshot(),before);
});
for(const operation of ['request','approve','changes','withdraw'])test(`${operation}: committed response loss converges once on retry`,async()=>{
  const t=await setup(),roundId=operation==='request'?null:(await t.request()).roundId,input={requestId:crypto.randomUUID(),expectedRevision:1},batch=t.db.batch.bind(t.db);let armed=true;
  t.db.batch=async writes=>{const result=await batch(writes);if(armed){armed=false;throw new Error('lost response');}return result;};
  const action=()=>operation==='request'?t.request(input):operation==='withdraw'?t.withdraw(roundId,{expectedRevision:2}):t.respond(roundId,operation==='changes'?'changes_requested':'approved',operation==='changes'?'Shorter':null);
  await assert.rejects(action(),/lost response/);const before=t.snapshot();assert.equal((await action()).unchanged,true);assert.deepEqual(t.snapshot(),before);
});
