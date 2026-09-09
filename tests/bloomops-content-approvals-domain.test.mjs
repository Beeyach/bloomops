import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-approvals.mjs';
import { all,run } from './_bloomops-db.mjs';
import { REVIEW_FROZEN_FIELDS,normalizeApproval } from '../lib/bloomops/content-approval-values.mjs';

test('two-round review: frozen allowlist, Client feedback/rework, fresh snapshot, approval and durable earlier round',async()=>{
  const t=await setup(),parents=t.parents(),first=await t.request();assert.equal(first.ok,true);
  const initial=(await t.rounds()).items[0],dto=await t.portal(first.roundId);
  assert.deepEqual(Object.keys(dto).sort(),['id','number','requestedAt','snapshot']);
  assert.deepEqual(Object.keys(dto.snapshot).sort(),['caption','cta','hook','platforms','script','targetPublishDate','title','type']);
  assert.doesNotMatch(JSON.stringify(dto),/PRIVATE|owner|Membership|workspace|stageContext|revision|objectKey/);
  assert.equal((await t.item(t.contentId)).stage,'client_review');
  assert.equal((await t.respond(first.roundId,'changes_requested','Make the opening shorter.')).ok,true);
  const changed=(await t.rounds()).items[0];assert.equal(changed.feedback,'Make the opening shorter.');assert.equal(changed.status,'changes_requested');
  assert.deepEqual(changed.snapshot,initial.snapshot);assert.equal((await t.item(t.contentId)).stageContext,changed.feedback);
  assert.equal(await t.portal(first.roundId),null);assert.deepEqual((await t.requests()).items,[]);
  assert.equal((await t.move('editing')).ok,true);
  assert.equal((await t.edit(t.contentId,{script:'A shorter opening',targetPublishDate:'2026-09-23'})).ok,true);
  assert.equal((await t.platforms(['LinkedIn'])).ok,true);
  assert.equal((await t.move('internal_review')).ok,true);assert.equal((await t.move('client_review')).ok,true);
  const second=await t.request();assert.equal(second.ok,true);
  const history=(await t.rounds()).items;assert.deepEqual(history.map(r=>r.number),[2,1]);assert.deepEqual(history[1],changed);
  assert.notEqual(history[0].revisionId,history[1].revisionId);assert.equal(history[0].snapshot.script,'A shorter opening');assert.deepEqual(history[0].snapshot.platforms,['LinkedIn']);
  assert.equal((await t.respond(second.roundId)).ok,true);assert.equal((await t.item(t.contentId)).stage,'approved');assert.equal((await t.item(t.contentId)).stageContext,null);
  assert.deepEqual(t.parents(),parents);assert.deepEqual((await t.rounds()).items[1],changed);
});
test('request, response and withdrawal retries acknowledge their immutable evidence without duplicate facts',async()=>{
  const t=await setup(),input={requestId:crypto.randomUUID(),expectedRevision:1},first=await t.request(input),before=t.snapshot();
  assert.equal((await t.request(input)).unchanged,true);assert.deepEqual(t.snapshot(),before);
  assert.equal((await t.request({...input,expectedRevision:2})).reason,'conflict');
  assert.equal((await t.withdraw(first.roundId,{expectedRevision:2,reason:'Revise the copy'})).ok,true);
  const withdrawn=t.snapshot();assert.equal((await t.withdraw(first.roundId,{expectedRevision:2,reason:'Revise the copy'})).unchanged,true);assert.deepEqual(t.snapshot(),withdrawn);
  assert.equal((await t.withdraw(first.roundId,{expectedRevision:2,reason:'Different'})).reason,'conflict');
  assert.equal((await t.item(t.contentId)).stage,'client_review');assert.equal((await t.edit(t.contentId,{title:'New title'})).ok,true);
  const second=await t.request();assert.equal((await t.respond(second.roundId,'changes_requested','Please shorten it')).ok,true);
  const finished=t.snapshot();assert.equal((await t.respond(second.roundId,'changes_requested','Please shorten it')).unchanged,true);assert.deepEqual(t.snapshot(),finished);
  assert.equal((await t.respond(second.roundId,'approved')).reason,'conflict');
});
for(const field of REVIEW_FROZEN_FIELDS)test(`Requested freezes ${field} but not live visibility`,async()=>{
  const t=await setup();await t.request();const before=t.snapshot(),current=await t.item(t.contentId);
  const value=field==='type'?'story':field==='targetPublishDate'?'2026-09-24':typeof current[field]==='boolean'?!current[field]:'Changed';
  assert.equal((await t.edit(t.contentId,{[field]:value})).reason,'conflict');assert.deepEqual(t.snapshot(),before);
  assert.equal((await t.edit(t.contentId,{visibility:'internal'})).ok,true);assert.deepEqual((await t.requests()).items,[]);
});
test('Requested freezes C3 platforms and C2 moves; formal approval cannot use generic internal transition',async()=>{
  const t=await setup();assert.equal((await t.move('approved')).ok,false);const first=await t.request(),before=t.snapshot();
  assert.equal((await t.platforms(['YouTube'])).reason,'conflict');assert.equal((await t.move('revision_requested',{context:'Internal bypass'})).reason,'conflict');
  assert.equal((await t.move('approved')).ok,false);assert.deepEqual(t.snapshot(),before);
  assert.equal((await t.withdraw(first.roundId)).ok,true);assert.equal((await t.move('revision_requested',{context:'Team rework'})).ok,true);
});
for(const [kind,sql] of Object.entries({stage:"UPDATE content_items SET stage='editing'",flag:'UPDATE content_items SET client_approval_required=0',visibility:"UPDATE content_items SET visibility='internal'"}))test(`request requires current ${kind}`,async()=>{
  const t=await setup();run(t.raw,sql);const before=t.snapshot();assert.equal((await t.request()).ok,false);assert.deepEqual(t.snapshot(),before);
});
for(const input of [null,[],1,{decision:'withdrawn'},{decision:'approved',feedback:'Do this'},{decision:'changes_requested',feedback:''},{decision:'changes_requested',feedback:'x'.repeat(2001)},{decision:'changes_requested',feedback:'\u0000'},{decision:'changes_requested',feedback:'\ud800'},{decision:'approved',workspaceId:'b'}])test(`exact bounded Client response rejects ${JSON.stringify(input).slice(0,70)}`,()=>assert.equal(normalizeApproval(input,'respond').ok,false));
test('canonical feedback normalization preserves plain text and limit',()=>{
  assert.equal(normalizeApproval({decision:'changes_requested',feedback:' e\u0301\r\nPlease '},'respond').feedback,'é\nPlease');
  assert.equal(normalizeApproval({decision:'changes_requested',feedback:'x'.repeat(2000)},'respond').ok,true);
});
