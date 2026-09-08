import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_deliverables.mjs';
import { all, run } from './_bloomops-db.mjs';
import { createDeliverable } from '../lib/bloomops/deliverables.mjs';

// Independent contract oracle: every state pair, including terminal refusals.
const matrix = { planned:['in_progress','cancelled'],in_progress:['internal_review','cancelled'],internal_review:['in_progress','client_review','approved','cancelled'],client_review:['in_progress','approved','cancelled'],approved:['delivered','cancelled'],delivered:[],cancelled:[] };
for (const from of Object.keys(matrix)) for (const to of Object.keys(matrix)) test(`Deliverable lifecycle ${from} → ${to}`, async () => {
  const t=await setup(),{deliverableId:id}=await t.add();
  const stamp='2026-09-08T12:00:00.000Z';
  run(t.raw,'UPDATE deliverables SET status=?,delivered_at=? WHERE id=?',from,from==='delivered'?stamp:null,id);
  const before=t.snapshot(),result=await t.transition(id,to,{now:new Date('2026-09-09T12:00:00Z')});
  if(from===to){assert.ok(result.unchanged);assert.deepEqual(t.snapshot(),before);}
  else if(matrix[from].includes(to)){
    assert.ok(result.ok,JSON.stringify(result));const current=await t.item(id);assert.equal(current.status,to);assert.equal(current.revision,2);
    assert.equal(current.deliveredAt,to==='delivered'?'2026-09-09T12:00:00.000Z':null);
    assert.equal(t.history('DELIVERABLE_STATUS_CHANGED').length,1);
  }else{assert.equal(result.reason,'invalid_transition');assert.deepEqual(t.snapshot(),before);}
});

test('Deliverables start Planned, normalize fields and leave nonempty B3 work and all parents unchanged',async()=>{
  const t=await setup();await t.seedWork();const parents=t.parents();
  const {deliverableId:id}=await t.add({title:'  Funnel handoff  ',clientLabel:' Your funnel ',description:' Build\nReview\tQA ',targetDate:'2026-09-20'});
  assert.deepEqual(await t.item(id),{id,projectId:t.projectId,title:'Funnel handoff',clientLabel:'Your funnel',description:'Build\nReview\tQA',targetDate:'2026-09-20',status:'planned',visibility:'internal',deliveredAt:null,revision:1,createdAt:(await t.item(id)).createdAt,updatedAt:(await t.item(id)).updatedAt});
  await t.change(id,{title:'Funnel',description:null,clientLabel:null,targetDate:null,visibility:'client'});
  for(const status of ['in_progress','internal_review','client_review','in_progress','internal_review','approved','delivered'])assert.ok((await t.transition(id,status)).ok);
  assert.ok((await t.change(id,{title:'Corrected after delivery'})).ok);
  assert.deepEqual(t.parents(),parents);assert.equal(t.history('DELIVERABLE_CREATED').length,1);
  const event=t.history()[0];assert.equal(event.client_id,'james');assert.equal(event.service_engagement_id,'ghl-service');assert.equal(event.subject_type,'deliverable');
  assert.deepEqual(Object.keys(JSON.parse(event.metadata_json).details).sort(),['clientLabel','description','targetDate','title','visibility']);
});

for(const input of [null,[],false,'text',4,{title:''},{title:'x'.repeat(121)},{title:'bad\nline'},{title:3},{clientLabel:'x'.repeat(121)},{clientLabel:[]},{description:'x'.repeat(5001)},{description:'bad\x00'},{description:{}},{targetDate:'2026-02-30'},{targetDate:'2026-13-01'},{targetDate:4},{visibility:'public'},{status:'delivered'},{projectId:'forged'},{workspaceId:'forged'},{assigneeMembershipId:'m-sam'},{milestoneId:'forged'},{deliveredAt:'forged'},{revision:3},{creationRequestId:'forged'}])test(`invalid Deliverable input ${JSON.stringify(input).slice(0,65)}`,async()=>{
  const t=await setup(),before=t.snapshot();const result=await createDeliverable(t.db,{actor:t.owner,projectId:t.projectId,input,requestId:crypto.randomUUID()});assert.equal(result.reason,'invalid');assert.deepEqual(t.snapshot(),before);
});
for(const requestId of [null,undefined,'bad','aaaaaaaa-aaaa-1aaa-aaaa-aaaaaaaaaaaa',3])test(`Deliverable creation refuses invalid retry key ${requestId}`,async()=>{
  const t=await setup(),before=t.snapshot();assert.equal((await t.add({}, {requestId})).reason,'invalid');assert.deepEqual(t.snapshot(),before);
});
for(const expectedRevision of [0,-1,1.5,'1',null,Number.MAX_SAFE_INTEGER+1])test(`Deliverable edits/status require a real positive revision: ${expectedRevision}`,async()=>{
  const t=await setup(),{deliverableId:id}=await t.add(),before=t.snapshot();
  assert.equal((await t.change(id,{title:'New'},{expectedRevision})).reason,'invalid');assert.equal((await t.transition(id,'in_progress',{expectedRevision})).reason,'invalid');assert.deepEqual(t.snapshot(),before);
});
test('same-name creates are independent; response-loss keys converge after edits and conflict on changed initial details',async()=>{
  const t=await setup(),requestId=crypto.randomUUID(),a=await t.add({}, {requestId});
  const b=await t.add();assert.notEqual(a.deliverableId,b.deliverableId);
  await t.change(a.deliverableId,{title:'Edited later'});const before=t.snapshot();
  const retry=await t.add({}, {requestId});assert.ok(retry.unchanged);assert.equal(retry.deliverableId,a.deliverableId);
  assert.equal((await t.add({title:'Other initial details'}, {requestId})).reason,'conflict');assert.deepEqual(t.snapshot(),before);
  const projectId=(await t.create()).projectId;assert.ok((await t.add({}, {requestId,projectId})).ok);
});
test('identical concurrent creates and delivery transitions commit one fact and one event',async()=>{
  const t=await setup(),requestId=crypto.randomUUID();
  const results=await Promise.all(Array.from({length:6},()=>t.add({}, {requestId})));assert.ok(results.every(r=>r.ok));assert.equal(new Set(results.map(r=>r.deliverableId)).size,1);
  const id=results[0].deliverableId;assert.equal(t.history('DELIVERABLE_CREATED').length,1);
  for(const state of ['in_progress','internal_review','approved'])await t.transition(id,state);
  const delivered=await Promise.all(Array.from({length:4},(_,i)=>t.transition(id,'delivered',{expectedRevision:4,now:new Date(`2026-09-08T12:00:0${i}Z`)})));
  assert.ok(delivered.every(r=>r.ok));assert.equal((await t.item(id)).revision,5);assert.equal(t.history('DELIVERABLE_STATUS_CHANGED').length,4);
  const before=t.snapshot();assert.ok((await t.transition(id,'delivered',{expectedRevision:4})).unchanged);assert.deepEqual(t.snapshot(),before);
});
test('competing create keys with incompatible details yield one winner',async()=>{
  const t=await setup(),requestId=crypto.randomUUID();const results=await Promise.all([t.add({title:'A'},{requestId}),t.add({title:'B'},{requestId})]);
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.reason==='conflict').length,1);assert.equal(t.history().length,1);
});
for(const race of ['edit/edit','status/status','edit/status'])test(`competing Deliverable ${race} uses one revision and no loser history`,async()=>{
  const t=await setup(),{deliverableId:id}=await t.add();
  const calls={ 'edit/edit':[()=>t.change(id,{title:'A'},{expectedRevision:1}),()=>t.change(id,{title:'B'},{expectedRevision:1})], 'status/status':[()=>t.transition(id,'in_progress',{expectedRevision:1}),()=>t.transition(id,'cancelled',{expectedRevision:1})], 'edit/status':[()=>t.change(id,{description:'New'},{expectedRevision:1}),()=>t.transition(id,'in_progress',{expectedRevision:1})] }[race];
  const results=await Promise.all(calls.map(call=>call()));assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.filter(r=>r.reason==='conflict').length,1);assert.equal((await t.item(id)).revision,2);assert.equal(t.history().length,2);
});
test('identical detail retry converges while a stale competing detail conflicts',async()=>{
  const t=await setup(),{deliverableId:id}=await t.add();await t.change(id,{title:'Updated',visibility:'client'},{expectedRevision:1});const before=t.snapshot();
  assert.ok((await t.change(id,{title:'Updated',visibility:'client'},{expectedRevision:1})).unchanged);assert.equal((await t.change(id,{title:'Lost update'},{expectedRevision:1})).reason,'conflict');assert.deepEqual(t.snapshot(),before);
  assert.deepEqual(JSON.parse(t.history('DELIVERABLE_DETAILS_UPDATED')[0].metadata_json).fields,['title','visibility']);
});
for(const op of ['create','edit','status'])for(const fail of ['activity','fact'])test(`late ${fail} failure rolls back Deliverable ${op}`,async()=>{
  const t=await setup(),{deliverableId:id}=await t.add(),before=t.snapshot();
  run(t.raw,fail==='activity'?"CREATE TRIGGER fail_b4 BEFORE INSERT ON activity_events WHEN NEW.subject_type='deliverable' BEGIN SELECT RAISE(ABORT,'late failure'); END":`CREATE TRIGGER fail_b4 BEFORE ${op==='create'?'INSERT':'UPDATE'} ON deliverables BEGIN SELECT RAISE(ABORT,'late failure'); END`);
  await assert.rejects(()=>op==='create'?t.add():op==='edit'?t.change(id,{title:'New'}):t.transition(id,'in_progress'));assert.deepEqual(t.snapshot(),before);
});
for(const op of ['create','edit','status'])for(const revocation of ['membership','workspace','role','parent',...(op==='create'?[]:['child']),'assignment'])test(`live ${revocation} revocation refuses committing Deliverable ${op}`,async()=>{
  const t=await setup();t.assign('pm');const actor=await t.actor('pm'),{deliverableId:id}=await t.add();
  if(revocation==='assignment')await t.change(id,{visibility:'restricted'});
  const queries={membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-pm'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'",role:"UPDATE workspace_memberships SET role='team_member' WHERE id='m-pm'",parent:`UPDATE projects SET visibility='restricted' WHERE id='${t.projectId}'`,child:`UPDATE deliverables SET visibility='restricted' WHERE id='${id}'`,assignment:"DELETE FROM project_assignments WHERE membership_id='m-pm'"};
  if(['parent','child'].includes(revocation))run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-pm'");
  let after;
  t.beforeBatch(()=>{run(t.raw,queries[revocation]);after=t.snapshot();});
  const result=await (op==='create'?t.add({visibility:revocation==='assignment'?'restricted':'internal'},{actor}):op==='edit'?t.change(id,{title:'Lost'},{actor}):t.transition(id,'in_progress',{actor}));
  assert.equal(result.ok,false);assert.deepEqual(t.snapshot(),after);
});
test('Project bound is atomic at 200 and retries still converge at capacity',async()=>{
  const t=await setup(),requestId=crypto.randomUUID(),first=await t.add({}, {requestId});
  for(let i=0;i<198;i++)assert.ok((await t.add({title:`Output ${i}`})).ok);
  const results=await Promise.all([t.add({title:'Last A'}),t.add({title:'Last B'})]);assert.equal(results.filter(r=>r.ok).length,1);assert.equal((await t.list()).items.length,200);
  assert.equal((await t.add()).reason,'conflict');assert.equal((await t.add({}, {requestId})).deliverableId,first.deliverableId);assert.equal(all(t.raw,'SELECT * FROM deliverables').length,200);
});
