import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { setup } from './_systems.mjs';
import { run } from './_bloomops-db.mjs';
const { WorkSummary } = await import('../components/bloomops/WorkSummary.jsx');
import { configureGhlBlueprint, configureKajabiBlueprint } from '../lib/bloomops/systems-blueprint-setup.mjs';
import { systemsBlueprintOptions } from '../lib/bloomops/systems-blueprint-preparation.mjs';
import { generateSystemsBlueprint } from '../lib/bloomops/systems-blueprint-generation.mjs';
const now = new Date('2026-09-09T00:30:00.000Z');
async function fixture(ctx) {
  const t = await setup(); ctx.after(() => t.raw.close());
  t.row = async (actor = t.owner, filters = {}) => (await t.systems(actor, filters)).projects.items.find(p => p.id === 'ghl');
  t.phase = (id, status = 'upcoming', patch = {}) => t.milestone(id, { project_id: 'ghl', status, ...(status === 'waiting' ? { waiting_reason: 'Awaiting access' } : {}), ...patch });
  t.work = (id, status = 'to_do', patch = {}) => t.action(id, { project_id: 'ghl', status, ...patch });
  t.edge = (dependent, prerequisite) => run(t.raw,"INSERT INTO action_dependencies(workspace_id,project_id,action_id,depends_on_action_id) VALUES('a','ghl',?,?)", dependent, prerequisite);
  return t;
}
test('current phase prefers readable in-progress, then waiting, then upcoming in canonical order', async ctx => {
  const t = await fixture(ctx); t.phase('upcoming'); t.phase('waiting','waiting'); t.phase('active','in_progress'); t.phase('later-active','in_progress');
  assert.deepEqual((await t.row()).currentPhase, { name: 'Milestone active', status: 'in_progress' });
  run(t.raw,"UPDATE milestones SET status='skipped' WHERE status='in_progress'");
  assert.deepEqual((await t.row()).currentPhase, { name: 'Milestone waiting', status: 'waiting' });
  run(t.raw,"UPDATE milestones SET status='completed',waiting_reason=NULL,completed_at=? WHERE id='waiting'",now.toISOString());
  assert.deepEqual((await t.row()).currentPhase, { name: 'Milestone upcoming', status: 'upcoming' });
});
test('empty and all-finished phases remain honest; manual Systems work needs no blueprint', async ctx => {
  const t = await fixture(ctx); assert.equal((await t.row()).currentPhase,null); assert.equal((await t.row()).milestones,null);
  t.phase('complete','completed'); t.phase('skip','skipped'); const row = await t.row();
  assert.equal(row.currentPhase,null); assert.deepEqual(row.milestones,{total:2,finished:2,percentage:100});
  const html = renderToStaticMarkup(WorkSummary({ project: row, execution:true }));
  assert.match(html,/2 of 2 milestones finished/); assert.doesNotMatch(html,/Current phase|Next phase/);
});
for (const status of ['completed','cancelled','archived']) test(`closed ${status} Project never suggests an unfinished current phase`, async ctx => {
  const t = await fixture(ctx); t.phase('not-finished','in_progress');
  run(t.raw,"UPDATE projects SET status=?,completed_at=? WHERE id='ghl'",status,status === 'completed' ? now.toISOString() : null);
  assert.equal((await t.row(t.owner,{status:'all'})).currentPhase,null);
});
test('action counts distinguish completion/cancellation and blocked work never becomes falsely overdue', async ctx => {
  const t = await fixture(ctx); t.work('done','done'); t.work('cancelled','cancelled'); t.work('wait','waiting'); t.work('review','review');
  t.work('prerequisite'); t.work('blocked','to_do',{due_date:'2026-09-01'}); t.edge('blocked','prerequisite');
  const row = await t.row();
  assert.deepEqual(row.actions,{open:4,waiting:1,review:1,overdue:0,total:6,done:1,cancelled:1,blocked:1});
  run(t.raw,"UPDATE actions SET status='done',completed_at=? WHERE id='prerequisite'",now.toISOString());
  assert.equal((await t.row()).actions.blocked,0); assert.equal((await t.row()).actions.overdue,1);
});
test('a cancelled prerequisite still blocks; finished dependents are excluded from the blocked count', async ctx => {
  const t = await fixture(ctx); t.work('cancelled','cancelled'); t.work('dependent'); t.edge('dependent','cancelled');
  assert.equal((await t.row()).actions.blocked,1);
  run(t.raw,"UPDATE actions SET status='cancelled' WHERE id='dependent'"); assert.equal((await t.row()).actions.blocked,0);
});
test('hidden prerequisites only affect the visible blocked boolean, never hidden names or prerequisite counts', async ctx => {
  const t = await fixture(ctx), pm = await t.actor('pm'); t.work('visible');
  t.work('SECRET_ONE','to_do',{visibility:'restricted'}); t.work('SECRET_TWO','to_do',{visibility:'restricted'});
  t.edge('visible','SECRET_ONE'); t.edge('visible','SECRET_TWO');
  const row = await t.row(pm); assert.equal(row.actions.total,1); assert.equal(row.actions.blocked,1);
  assert.doesNotMatch(JSON.stringify(row),/SECRET_ONE|SECRET_TWO|prerequisite|dependsOn/);
  run(t.raw,"UPDATE actions SET status='done',completed_at=? WHERE id='SECRET_ONE'",now.toISOString()); assert.deepEqual(await t.row(pm),row);
});
test('hidden phase/status changes never alter PM summary; explicit assignment reveals it and revocation hides it', async ctx => {
  const t = await fixture(ctx), pm = await t.actor('pm'); t.phase('visible'); const before = await t.row(pm);
  t.phase('SECRET_PHASE','in_progress',{visibility:'restricted'}); assert.deepEqual(await t.row(pm),before);
  t.assign('project','pm','ghl'); assert.equal((await t.row(pm)).currentPhase.name,'Milestone SECRET_PHASE');
  run(t.raw,"DELETE FROM project_assignments WHERE membership_id='m-pm'"); assert.deepEqual(await t.row(pm),before);
});
test('restricted completed/cancelled/blocked actions cannot inflate execution progress', async ctx => {
  const t = await fixture(ctx), pm = await t.actor('pm'); t.work('visible'); const before = await t.row(pm);
  t.work('SECRET_DONE','done',{visibility:'restricted'}); t.work('SECRET_CANCELLED','cancelled',{visibility:'restricted'});
  t.work('SECRET_BLOCKED','to_do',{visibility:'restricted'}); t.edge('SECRET_BLOCKED','visible');
  assert.deepEqual(await t.row(pm),before);
});
for (const scope of ['project','service','client']) test(`current ${scope} unassignment removes Team execution summaries`, async ctx => {
  const t = await fixture(ctx), actor = await t.actor('sam');
  t.phase('phase','in_progress'); t.work('action'); t.assign(scope,'sam',{project:'ghl',service:'ghl-service',client:'james'}[scope]);
  assert.ok(await t.row(actor)); run(t.raw,`DELETE FROM ${scope}_assignments WHERE membership_id='m-sam'`); assert.equal(await t.row(actor),undefined);
});
test('Client, Action-only, foreign and suspended actors cannot acquire execution summaries', async ctx => {
  const t = await fixture(ctx); t.phase('PRIVATE','in_progress'); t.work('own','to_do',{assignee_membership_id:'m-sam'});
  assert.equal(await t.row(await t.actor('sam')),undefined); assert.equal(await t.row(await t.actor('foreign')),undefined);
  assert.equal((await t.systems(await t.actor('james'))).ok,false);
  run(t.raw,"UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'"); assert.equal(await t.row(),undefined);
});
test('default Home/Work summaries and UI keep their existing shape; Systems execution is read-only', async ctx => {
  const t = await fixture(ctx); t.phase('active','in_progress'); t.work('done','done');
  const before=t.snapshot(), work=(await t.summaries(t.owner,{projectId:'ghl'})).items[0], systems=await t.row();
  assert.equal(Object.hasOwn(work,'currentPhase'),false); assert.deepEqual(Object.keys(work.actions).sort(),['open','overdue','review','waiting']);
  const {currentPhase,actions,...base}=systems; assert.deepEqual(base,Object.fromEntries(Object.entries(work).filter(([key])=>key!=='actions')));
  assert.deepEqual(Object.fromEntries(['open','overdue','review','waiting'].map(key=>[key,actions[key]])),work.actions);
  assert.doesNotMatch(renderToStaticMarkup(WorkSummary({project:systems})),/Current phase|Actions done|blocked by dependencies/);
  assert.deepEqual(t.snapshot(),before);
});
test('Systems execution renders usable canonical phase/action/review links and honest completed counts', async ctx => {
  const t = await fixture(ctx); t.phase('QA','in_progress'); t.work('done','done'); t.work('cancel','cancelled'); t.work('wait','waiting'); t.work('review','review'); t.edge('wait','review');
  t.deliverable('output',{project_id:'ghl',status:'internal_review'});
  const html=renderToStaticMarkup(WorkSummary({project:await t.row(),execution:true}));
  for(const text of ['Current phase: Milestone QA','1 of 4 Actions done','1 cancelled','1 blocked by dependencies','in Internal Review']) assert.ok(html.includes(text),text);
  for(const section of ['milestones','actions','deliverables']) assert.ok(html.includes(`/work/projects/ghl#project-${section}-title`));
  assert.match(html,/view=waiting/); assert.match(html,/view=review/); assert.doesNotMatch(html,/QA approved|QA complete|prerequisite/);
});
for (const [platform,configure,selection,phase] of [
  ['GHL',configureGhlBlueprint,['discovery','funnel','qa'],'Discovery'],
  ['Kajabi',configureKajabiBlueprint,['course','checkout','email','qa'],'Course Build'],
]) test(`${platform} generated work feeds phase, dependency and Internal Review summaries`, async ctx => {
  const t = await fixture(ctx); assert.ok((await configure(t.db,{actor:t.owner,input:{serviceTypeId:'type-systems',enabled:true,expectedBinding:null},now})).ok);
  const options=await systemsBlueprintOptions(t.db,{actor:t.owner,projectId:'ghl'});
  const result=await generateSystemsBlueprint(t.db,{actor:t.owner,projectId:'ghl',input:{requestId:crypto.randomUUID(),selectedComponentKeys:selection,expected:options.expected},now}); assert.ok(result.ok);
  const row=await t.row(); assert.deepEqual(row.currentPhase,{name:phase,status:'upcoming'}); assert.equal(row.actions.total,selection.length); assert.ok(row.actions.blocked>0);
  run(t.raw,"UPDATE deliverables SET status='internal_review',revision=revision+1 WHERE project_id='ghl'"); assert.ok((await t.row()).deliverables.internalReview>0);
});
