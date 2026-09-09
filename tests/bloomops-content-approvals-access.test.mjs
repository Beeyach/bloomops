import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-approvals.mjs';
import { all,run } from './_bloomops-db.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';

for(const role of ['ellen','ary','pm','sam','other','james','lawrence','foreign'])test(`${role} request/withdraw/history uses coordinator and current C1 scope`,async()=>{
  const t=await setup();t.assign('sam','social-service');const actor=await t.actor(role),coordinator=['ellen','ary','pm'].includes(role),readable=coordinator||role==='sam';
  const request=await t.request({}, {actor});assert.equal(request.ok,coordinator);
  const roundId=coordinator?request.roundId:(await t.request()).roundId;
  assert.equal((await t.rounds(actor)).items.length,readable?1:0);
  assert.equal((await t.withdraw(roundId,{}, {actor})).ok,coordinator);
});
for(const who of ['ellen','ary','pm','sam','other','lawrence','foreign'])test(`${who} never gains Client response access`,async()=>{
  const t=await setup();t.assign('sam','social-service');const {roundId}=await t.request(),actor=await t.actor(who),before=t.snapshot();
  assert.equal(await t.portal(roundId,actor),null);assert.deepEqual((await t.requests(actor)).items,[]);assert.equal((await t.respond(roundId,'approved',null,{actor})).reason,'not_found');assert.deepEqual(t.snapshot(),before);
});
const revoke={membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'",role:"UPDATE workspace_memberships SET role='team_member' WHERE id='m-james'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'",contact:"UPDATE client_contacts SET user_id=NULL WHERE user_id='james'",visibility:"UPDATE content_items SET visibility='internal'",service:"UPDATE service_types SET department_id='systems' WHERE id='type-social'",department:"UPDATE departments SET slug='not-social' WHERE id='social'"};
for(const [kind,statement] of Object.entries(revoke))for(const timing of ['before-read','before-batch'])test(`Client ${kind} revocation ${timing} fences response with a stale actor`,async()=>{
  const t=await setup(),{roundId}=await t.request();
  if(timing==='before-read')run(t.raw,statement);else t.beforeBatch(()=>run(t.raw,statement));
  const eventCount=t.history().length;const result=await t.respond(roundId);assert.equal(result.ok,false);assert.equal(t.history().length,eventCount);
  assert.equal(all(t.raw,'SELECT status FROM content_approval_rounds')[0].status,'requested');assert.equal(await t.portal(roundId),null);assert.deepEqual((await t.requests()).items,[]);
});
for(const [kind,statement] of Object.entries({membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-pm'",role:"UPDATE workspace_memberships SET role='team_member' WHERE id='m-pm'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'",visibility:"UPDATE content_items SET visibility='restricted'",service:"UPDATE service_types SET department_id='systems' WHERE id='type-social'"}))test(`coordinator request live ${kind} revocation at commit leaves no snapshot`,async()=>{
  const t=await setup(),actor=await t.actor('pm');t.beforeBatch(()=>run(t.raw,statement));assert.equal((await t.request({}, {actor})).ok,false);
  assert.equal(all(t.raw,'SELECT * FROM content_review_revisions').length,0);assert.equal(all(t.raw,'SELECT * FROM content_approval_rounds').length,0);
});
test('restricted history and withdrawal require current exact assignment; department and Content owner are not grants',async()=>{
  const t=await setup(),{roundId}=await t.request();run(t.raw,"UPDATE content_items SET visibility='restricted',owner_membership_id='m-sam'");
  for(const who of ['pm','sam'])assert.equal((await t.rounds(await t.actor(who))).items.length,0);
  t.assign('pm','social-service');t.assign('sam');const pm=await t.actor('pm'),sam=await t.actor('sam');
  assert.equal((await t.rounds(pm)).items.length,1);assert.equal((await t.rounds(sam)).items.length,1);
  t.beforeBatch(()=>run(t.raw,"DELETE FROM service_assignments WHERE membership_id='m-pm'"));assert.equal((await t.withdraw(roundId,{}, {actor:pm})).ok,false);
  assert.equal((await t.rounds(pm)).items.length,0);assert.equal((await clientActivity(t.db,'a','james',{actor:pm})).filter(e=>/approval/.test(e.title)).length,0);
});
test('completed POST retry remains live-authorized but never exposes historical snapshot through GET',async()=>{
  const t=await setup(),{roundId}=await t.request();await t.respond(roundId);assert.equal(await t.portal(roundId),null);assert.equal((await t.respond(roundId)).unchanged,true);
  run(t.raw,"UPDATE client_contacts SET user_id=NULL WHERE user_id='james'");assert.equal((await t.respond(roundId)).reason,'not_found');
});
test('240 unrelated Client/Service assignments never expand another Content scope or exceed D1 binds',async()=>{
  const t=await setup();for(let i=0;i<240;i++){run(t.raw,'INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES(?,?,?,?)',`large-${i}`,'a',`Large ${i}`,`large-${i}`);run(t.raw,'INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES(?,?,?)','a',`large-${i}`,'m-sam');}
  const actor=await t.actor('sam'),{roundId}=await t.request();assert.equal((await t.rounds(actor)).items.length,0);t.assign('sam');assert.equal((await t.rounds(actor)).items.length,1);
  assert.equal((await t.respond(roundId,'approved',null,{actor})).ok,false);
});
test('ineligible rounds are filtered before the Home limit, overflow and empty state',async()=>{
  const t=await setup(),visible=(await t.request()).roundId;
  const addRequest=async hidden=>{
    const contentId=(await t.add({visibility:'client',title:hidden?'PRIVATE_HIDDEN':'Visible request'})).contentId;
    run(t.raw,"UPDATE content_items SET stage='client_review' WHERE id=?",contentId);
    assert.equal((await t.request({expectedRevision:1},{contentId})).ok,true);
    if(hidden)run(t.raw,"UPDATE content_items SET visibility='internal' WHERE id=?",contentId);
  };
  for(let i=0;i<205;i++)await addRequest(true);
  const only=await t.requests();assert.deepEqual(only.items.map(r=>r.id),[visible]);assert.equal(only.hasMore,false);
  for(let i=0;i<200;i++)await addRequest(false);
  const overflow=await t.requests();assert.equal(overflow.items.length,200);assert.equal(overflow.hasMore,true);assert.doesNotMatch(JSON.stringify(overflow),/PRIVATE/);
  run(t.raw,"UPDATE content_items SET visibility='internal'");assert.deepEqual(await t.requests(),{items:[],hasMore:false});
});
