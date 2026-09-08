import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_milestones.mjs';
import { run, all } from './_bloomops-db.mjs';
import { createMilestone, transitionMilestone, updateMilestone } from '../lib/bloomops/milestones.mjs';
import { MILESTONE_STATUSES, MILESTONE_TRANSITIONS } from '../lib/bloomops/milestone-values.mjs';
// Independent B2 contract: changing the implementation's table must not
// silently change what these lifecycle tests consider valid.
const lifecycle = {
  upcoming: ['in_progress', 'waiting', 'skipped'],
  in_progress: ['waiting', 'completed', 'skipped'],
  waiting: ['in_progress', 'completed', 'skipped'],
  completed: [], skipped: [],
};

for (const [field,value] of [['name',''],['name','x'.repeat(121)],['name',{}],['name','bad\0name'],['clientLabel','x'.repeat(121)],['visibility','public'],['status','completed'],['completedAt','2026-09-08'],['workspaceId','b'],['projectId','other'],['clientId','lawrence'],['position',0],['revision',42],['startDate','2026-02-30'],['startDate',{}],['targetDate','not a date']]) test(`Milestone rejects ${field}=${String(value).slice(0,20)} without a fact/event`, async () => {
  const t=await setup(), before=t.snapshot();
  assert.equal((await t.add({[field]:value})).ok,false); assert.deepEqual(t.snapshot(),before);
});
test('new Milestones append Upcoming; valid leap dates and independent parent facts',async()=>{
  const t=await setup(),parents=t.parents();
  assert.deepEqual(MILESTONE_STATUSES,Object.keys(lifecycle));assert.deepEqual(MILESTONE_TRANSITIONS,lifecycle);
  const {milestoneId:id}=await t.add({startDate:'2028-02-29',targetDate:'2028-03-01'});
  const m=await t.milestone(id); assert.equal(m.status,'upcoming'); assert.equal(m.position,0);assert.equal(m.completedAt,null);assert.equal(m.visibility,'internal');
  assert.equal((await t.add({startDate:'2026-09-10',targetDate:'2026-09-09'})).ok,false);
  const second=await t.add(); assert.equal((await t.milestone(second.milestoneId)).position,1);assert.deepEqual(t.parents(),parents);
  const event=t.history()[0]; assert.equal(event.client_id,'james');assert.equal(event.service_engagement_id,'ghl-service');assert.equal(event.actor_membership_id,'m-ellen');
});
for(const from of Object.keys(lifecycle))for(const to of Object.keys(lifecycle))test(`Milestone lifecycle ${from} -> ${to}`,async()=>{
  const t=await setup(),{milestoneId:id}=await t.add();
  if(from==='completed') {await t.transition(id,'in_progress');await t.transition(id,'completed');}
  else if(from!=='upcoming') await t.transition(id,from);
  const before=await t.milestone(id), events=t.history().length;
  const r=await t.transition(id,to);const allowed=from===to||lifecycle[from].includes(to);
  assert.equal(r.ok,allowed);assert.equal(t.history().length,events+(allowed&&from!==to?1:0));
  if(!allowed||from===to)assert.deepEqual(await t.milestone(id),before);
});
test('create request-key retries converge, survive later edits, reject key reuse and allow intentional same names',async()=>{
  const t=await setup(),requestId=crypto.randomUUID();
  const [a,b]=await Promise.all([t.add({}, {requestId}),t.add({}, {requestId})]);assert.ok(a.ok&&b.ok);assert.equal(a.milestoneId,b.milestoneId);
  assert.equal(t.history('MILESTONE_CREATED').length,1);
  await t.change(a.milestoneId,{name:'Updated later'});
  assert.ok((await t.add({}, {requestId})).unchanged);
  assert.equal((await t.add({name:'Reused key'}, {requestId})).reason,'conflict');
  assert.notEqual((await t.add()).milestoneId,a.milestoneId);assert.equal(t.history('MILESTONE_CREATED').length,2);
  for(const invalid of ['',null,{},'guessed',crypto.randomUUID().replace(/-/g,'')])assert.equal((await t.add({}, {requestId:invalid})).ok,false);
});
test('concurrent distinct creates get unique ordered slots and one event each',async()=>{
  const t=await setup();const results=await Promise.all(Array.from({length:8},()=>t.add()));
  assert.ok(results.every(r=>r.ok));assert.equal(new Set(results.map(r=>r.milestoneId)).size,8);
  assert.deepEqual((await t.list()).items.map(i=>i.position),[0,1,2,3,4,5,6,7]);assert.equal(t.history().length,8);
});
test('identical detail edits and completion retries converge, competing stale writes conflict',async()=>{
  const t=await setup(),{milestoneId:id}=await t.add();
  const opts={actor:t.owner,projectId:t.projectId,milestoneId:id,expectedRevision:1,input:{name:'Launch',clientLabel:'Your launch'}};
  assert.ok((await Promise.all([updateMilestone(t.db,opts),updateMilestone(t.db,opts)])).every(r=>r.ok));
  assert.equal(t.history('MILESTONE_DETAILS_UPDATED').length,1);
  assert.equal((await t.change(id,{name:'Stale'},{expectedRevision:1})).reason,'conflict');
  await t.transition(id,'in_progress');const expectedRevision=(await t.milestone(id)).revision;
  const results=await Promise.all(['2026-09-08T12:00:00Z','2026-09-08T12:00:00.050Z'].map(at=>transitionMilestone(t.db,{actor:t.owner,projectId:t.projectId,milestoneId:id,expectedRevision,toStatus:'completed',now:new Date(at)})));
  assert.ok(results.every(r=>r.ok));assert.equal(t.history('MILESTONE_STATUS_CHANGED').length,2);assert.ok((await t.milestone(id)).completedAt);
  assert.ok((await t.transition(id,'completed',{expectedRevision})).unchanged);assert.equal((await t.transition(id,'skipped')).ok,false);
});
test('same-snapshot competing status and details leave one winner and one event',async()=>{
  const t=await setup(),{milestoneId:id}=await t.add(),before=t.history().length;
  const results=await Promise.all([t.change(id,{name:'New'},{expectedRevision:1}),t.transition(id,'waiting',{expectedRevision:1})]);
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(t.history().length,before+1);assert.equal((await t.milestone(id)).revision,2);
});
test('finishing every Milestone derives finished progress but changes no parent lifecycle',async()=>{
  const t=await setup(),parents=t.parents();assert.equal((await t.list()).progress,null);
  const a=await t.add(),b=await t.add();await t.transition(a.milestoneId,'waiting');await t.transition(a.milestoneId,'completed');await t.transition(b.milestoneId,'skipped');
  assert.deepEqual((await t.list()).progress,{total:2,finished:2,percentage:100});assert.equal((await t.milestone(b.milestoneId)).completedAt,null);
  assert.deepEqual(t.parents(),parents);
});
for(const operation of ['create','edit','status','reorder'])test(`${operation} activity failure rolls back the entire Milestone transaction`,async()=>{
  const t=await setup(),a=await t.add(),b=await t.add(),before=t.snapshot();
  run(t.raw,"CREATE TRIGGER fail_b2 BEFORE INSERT ON activity_events WHEN NEW.subject_type='milestone' BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL activity failure'); END");
  const op={create:()=>t.add(),edit:()=>t.change(a.milestoneId,{name:'Failed'}),status:()=>t.transition(a.milestoneId,'waiting'),reorder:()=>t.order([b.milestoneId,a.milestoneId])}[operation];
  await assert.rejects(op);assert.deepEqual(t.snapshot(),before);
});
for(const change of ['membership','role','workspace','parent_visibility','scope','child_visibility'])for(const op of ['create','edit','status','reorder'])test(`${op} rechecks ${change} at the write lock`,async()=>{
  const t=await setup(),a=await t.add(),b=await t.add();t.assign('pm');
  if(change==='scope') await t.edit(t.projectId,{visibility:'restricted'});
  const actor=await t.actor('pm'),before=t.history().length;
  const queries={membership:"UPDATE workspace_memberships SET status='suspended' WHERE id='m-pm'",role:"UPDATE workspace_memberships SET role='client' WHERE id='m-pm'",workspace:"UPDATE workspaces SET status='suspended' WHERE id='a'",parent_visibility:`UPDATE projects SET visibility='restricted' WHERE id='${t.projectId}'`,scope:"DELETE FROM project_assignments WHERE membership_id='m-pm'",child_visibility:`UPDATE milestones SET visibility='restricted',revision=revision+1 WHERE id='${a.milestoneId}'`};
  // Parent/child restriction denies an otherwise workspace-scoped PM.
  if(['parent_visibility','child_visibility'].includes(change))run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-pm'");
  const parents=t.parents();
  t.beforeBatch(()=>run(t.raw,queries[change]));
  const operation={create:()=>t.add({name:'New'},{actor}),edit:()=>t.change(a.milestoneId,{name:'Failed'},{actor}),status:()=>t.transition(a.milestoneId,'waiting',{actor}),reorder:()=>t.order([b.milestoneId,a.milestoneId],{actor})}[op];
  const result=await operation();
  // Hiding a sibling doesn't revoke creation of a new ordinary Milestone.
  if(op==='create'&&change==='child_visibility')assert.ok(result.ok);
  else {assert.equal(result.ok,false);assert.equal(t.history().length,before);}
  assert.equal(all(t.raw,"SELECT * FROM milestones WHERE name='Failed'").length,0);
  if(change==='child_visibility')assert.deepEqual(t.parents(),parents);
});

test('Waiting requires internal context, accepts multiline text and clears it on leaving',async()=>{
  const t=await setup(),{milestoneId:id}=await t.add();
  for(const reason of [null,'',{},'x'.repeat(1001),'bad\0text'])assert.equal((await t.transition(id,'waiting',{reason})).ok,false);
  const reason='Waiting for Ellen\nFeedback expected tomorrow';assert.ok((await t.transition(id,'waiting',{reason})).ok);assert.equal((await t.milestone(id)).waitingReason,reason);
  assert.ok((await t.transition(id,'waiting',{reason})).unchanged);assert.equal((await t.transition(id,'waiting',{reason:'Different dependency'})).reason,'conflict');
  await t.transition(id,'in_progress');assert.equal((await t.milestone(id)).waitingReason,null);
});
