import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_milestones.mjs';
import { run, one } from './_bloomops-db.mjs';
import { reorderMilestones } from '../lib/bloomops/milestones.mjs';
async function ordered() {const t=await setup();for(const name of ['A','B','C'])await t.add({name});t.items=(await t.list()).items;t.ids=t.items.map(i=>i.id);t.expected=t.items.map(({id,revision})=>({id,revision}));return t;}
const call=(t,orderedIds,expected=t.expected)=>reorderMilestones(t.db,{actor:t.owner,projectId:t.projectId,orderedIds,expected});

test('reorder is deterministic and winning retries keep one event and unchanged revisions',async()=>{
  const t=await ordered(),parents=t.parents(),ids=[...t.ids].reverse();
  assert.ok((await call(t,ids)).ok);assert.deepEqual((await t.list()).items.map(i=>i.id),ids);
  const before=t.snapshot();assert.ok((await call(t,ids)).unchanged);assert.deepEqual(t.snapshot(),before);
  assert.equal(t.history('MILESTONE_ORDER_CHANGED').length,1);assert.deepEqual(t.parents(),parents);
});
for(const kind of ['duplicate','missing','foreign','unknown','bad_revision','missing_revision','mismatched_snapshot','empty','oversized','nonarray'])test(`reorder rejects ${kind} without changing rows or history`,async()=>{
  const t=await ordered(),before=t.snapshot();let ids=[...t.ids].reverse(),expected=t.expected;
  if(kind==='duplicate')ids=[ids[0],ids[0],ids[2]];
  if(kind==='missing'){ids=ids.slice(0,2);expected=expected.filter(e=>ids.includes(e.id));}
  if(kind==='foreign'||kind==='unknown'){ids[0]=kind==='foreign'?(await t.add({}, {projectId:(await t.create()).projectId})).milestoneId:'missing';expected=ids.map(id=>({id,revision:1}));}
  if(kind==='bad_revision')expected=expected.map(e=>({...e,revision:0}));
  if(kind==='missing_revision')expected=expected.map(e=>({id:e.id}));
  if(kind==='mismatched_snapshot')expected=[expected[0],expected[0],expected[2]];
  if(kind==='empty'){ids=[];expected=[];}
  if(kind==='oversized'){ids=Array.from({length:201},(_,i)=>`id-${i}`);expected=ids.map(id=>({id,revision:1}));}
  if(kind==='nonarray')ids={};
  const snapshot=t.snapshot();assert.equal((await call(t,ids,expected)).ok,false);assert.deepEqual(t.snapshot(),snapshot);
  if(kind!=='foreign')assert.deepEqual(snapshot,before);
});
test('concurrent same orders converge and competing orders have one coherent winner',async()=>{
  for(const identical of [true,false]){
    const t=await ordered();const orders=[[...t.ids].reverse(),identical?[...t.ids].reverse():[t.ids[1],t.ids[0],t.ids[2]]];
    const results=await Promise.all(orders.map(ids=>call(t,ids)));
    assert.equal(results.filter(r=>r.ok).length,identical?2:1);assert.equal(t.history('MILESTONE_ORDER_CHANGED').length,1);
    t.items=(await t.list()).items;
    assert.ok(orders.some(ids=>JSON.stringify(ids)===JSON.stringify(t.items.map(i=>i.id))));
    assert.ok(t.items.every(i=>i.revision===2));
  }
});
for(const winner of ['reorder','status'])test(`forced ${winner} winner defeats the stale competing mutation`,async()=>{
  const t=await ordered(),ids=[...t.ids].reverse();
  t.beforeBatch(async()=>{if(winner==='status')await t.transition(t.ids[0],'waiting',{expectedRevision:1});else await call(t,ids);});
  const loser=winner==='status'?await call(t,ids):await t.transition(t.ids[0],'waiting',{expectedRevision:1});
  assert.equal(loser.reason,'conflict');assert.equal(t.history().length,4);assert.equal(t.history('MILESTONE_ORDER_CHANGED').length,winner==='reorder'?1:0);
});
test('a visible creation between read and reorder invalidates the complete snapshot',async()=>{
  const t=await ordered();t.beforeBatch(()=>t.add({name:'Newly created'}));
  assert.equal((await call(t,[...t.ids].reverse())).reason,'conflict');assert.deepEqual((await t.list()).items.map(i=>i.name),['A','B','C','Newly created']);assert.equal(t.history('MILESTONE_ORDER_CHANGED').length,0);
});
test('PM reorders only readable slots; hidden and other Project rows never move or enter history',async()=>{
  const t=await ordered();await t.change(t.ids[1],{visibility:'restricted',name:'Secret'});
  const otherProject=(await t.create()).projectId,other=(await t.add({}, {projectId:otherProject})).milestoneId;
  const hidden=await t.milestone(t.ids[1]),otherBefore=await t.milestone(other,t.owner,otherProject);
  assert.ok((await t.order([t.ids[2],t.ids[0]],{actor:await t.actor('pm')})).ok);
  assert.deepEqual(await t.milestone(t.ids[1]),hidden);assert.deepEqual(await t.milestone(other,t.owner,otherProject),otherBefore);
  assert.deepEqual((await t.list()).items.map(i=>i.id),[t.ids[2],t.ids[1],t.ids[0]]);
  assert.doesNotMatch(t.history('MILESTONE_ORDER_CHANGED')[0].metadata_json,/Secret|orderedIds|total/);
});
test('a late event failure after rows were parked rolls back positions, revisions and receipt',async()=>{
  const t=await ordered(),before=t.snapshot();
  run(t.raw,"CREATE TRIGGER fail_late_activity BEFORE INSERT ON activity_events WHEN NEW.event_type='INJECTED_FAILURE' BEGIN SELECT RAISE(ABORT,'late event failure'); END");
  run(t.raw,`CREATE TRIGGER inject_after_position AFTER UPDATE OF position ON milestones WHEN NEW.position>=3 BEGIN INSERT INTO activity_events(workspace_id,event_type,subject_type,subject_id) VALUES('a','INJECTED_FAILURE','milestone',NEW.id); END`);
  await assert.rejects(()=>call(t,[...t.ids].reverse()));assert.deepEqual(t.snapshot(),before);
});
test('a failure in final position assignment rolls back parked rows and semantic order event',async()=>{
  const t=await ordered(),before=t.snapshot();
  run(t.raw,"CREATE TRIGGER fail_final BEFORE UPDATE OF revision ON milestones BEGIN SELECT RAISE(ABORT,'final stage failure'); END");
  await assert.rejects(()=>call(t,[...t.ids].reverse()));assert.deepEqual(t.snapshot(),before);
});
test('bounded 200-row reorder uses JSON parameters, keeps unique positions and refuses overflow creation',async()=>{
  const t=await setup();for(let i=0;i<200;i++)run(t.raw,"INSERT INTO milestones(id,workspace_id,project_id,creation_request_id,name,position) VALUES(?,'a',?,?,?,?)",`large-${i}`,t.projectId,crypto.randomUUID(),`Large ${i}`,i);
  const items=(await t.list()).items;assert.ok((await t.order(items.map(i=>i.id).reverse())).ok);
  assert.equal((await t.add()).ok,false);assert.equal((await t.list()).items.length,200);
  assert.equal(one(t.raw,'SELECT count(DISTINCT position) n FROM milestones').n,200);
});
