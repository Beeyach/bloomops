import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_actions.mjs';
import { run } from './_bloomops-db.mjs';
import { actionFilterOptions, normalizeActionFilters } from '../lib/bloomops/actions.mjs';
import { actionCalendarDay } from '../lib/bloomops/action-values.mjs';
const now = new Date('2026-09-09T00:30:00Z');

test('Mine, Today, Upcoming, Waiting, Review, Overdue and All use explicit date/status predicates', async () => {
  const t = await setup(); run(t.raw, "UPDATE bloomops_clients SET timezone='America/Los_Angeles' WHERE id='james'");
  const overdue = t.seedAction('overdue', { due_date: '2026-09-07' }), today = t.seedAction('today', { due_date: '2026-09-08', assignee_membership_id: 'm-sam' }), upcoming = t.seedAction('upcoming', { due_date: '2026-09-09' });
  const blocked = t.seedAction('blocked', { due_date: '2026-09-07' }), waiting = t.seedAction('waiting'), review = t.seedAction('review'), done = t.seedAction('done', { due_date: '2026-09-07' }), cancelled = t.seedAction('cancelled', { due_date: '2026-09-07' });
  await t.depend(blocked, upcoming); await t.progress(waiting, 'waiting'); await t.progress(review, 'in_progress'); await t.progress(review, 'review');
  await t.progress(done, 'in_progress'); await t.progress(done, 'done'); await t.progress(cancelled, 'cancelled');
  const expected = { mine: [], today: [today], upcoming: [upcoming], waiting: [waiting], review: [review], overdue: [overdue], all: [overdue, today, upcoming, blocked, waiting, review, done, cancelled] };
  for (const [view, ids] of Object.entries(expected)) assert.deepEqual((await t.actions(t.owner, { view }, { now })).items.map(item => item.id).sort(), ids.sort(), view);
  assert.deepEqual((await t.actions(await t.actor('sam'), { view: 'mine' }, { now })).items.map(item => item.id), [today]);
  assert.equal((await t.action(blocked, t.owner, { now })).overdue, false);
  assert.equal((await t.action(overdue, t.owner, { now })).overdue, true);
});

test('Client-local day handles opposite sides of midnight, DST and UTC fallback without wall-clock tests', async () => {
  assert.equal(actionCalendarDay(now, 'America/Los_Angeles'), '2026-09-08'); assert.equal(actionCalendarDay(now, 'Asia/Kolkata'), '2026-09-09'); assert.equal(actionCalendarDay(now), '2026-09-09');
  for (const at of ['2026-11-01T08:30:00Z', '2026-11-01T09:30:00Z']) assert.equal(actionCalendarDay(new Date(at), 'America/Los_Angeles'), '2026-11-01');
  const t = await setup(); run(t.raw, "UPDATE bloomops_clients SET timezone='America/Los_Angeles' WHERE id='james'");
  const second = (await t.create({ serviceEngagementId: 'kajabi-service' }, { clientId: 'lawrence' })).projectId;
  run(t.raw, "UPDATE bloomops_clients SET timezone='Asia/Kolkata' WHERE id='lawrence'");
  t.seedAction('west', { due_date: '2026-09-08' }); t.seedAction('east', { project_id: second, due_date: '2026-09-09' });
  assert.deepEqual((await t.actions(t.owner, { view: 'today' }, { now })).items.map(item => item.id), ['west', 'east']);
});

test('all seven filters work relationally and guessed filters reveal no records or foreign facets', async () => {
  const t = await setup(), a = t.seedAction('a1', { assignee_membership_id: 'm-sam', priority: 'urgent' }); await t.progress(a, 'waiting');
  const filters = { clientId: 'james', departmentId: 'systems', serviceEngagementId: 'ghl-service', projectId: t.projectId, assigneeMembershipId: 'm-sam', status: 'waiting', priority: 'urgent' };
  for (const [key, value] of Object.entries(filters)) assert.deepEqual((await t.actions(t.owner, { [key]: value })).items.map(item => item.id), [a]);
  assert.deepEqual((await t.actions(t.owner, filters)).items.map(item => item.id), [a]);
  for (const key of ['clientId', 'departmentId', 'serviceEngagementId', 'projectId', 'assigneeMembershipId']) assert.deepEqual((await t.actions(t.owner, { [key]: 'guessed' })).items, []);
  const facets = await actionFilterOptions(t.db, await t.actor('sam')); assert.deepEqual(facets.clientId.items.map(i => i.name), ['james']); assert.doesNotMatch(JSON.stringify(facets), /lawrence|foreign|email/);
  for (const bad of [{ view: 'bogus' }, { page: -1 }, { page: '2.5' }, { priority: 'critical' }, { status: 'blocked' }, { clientId: [] }, { workspaceId: 'b' }]) assert.equal(normalizeActionFilters(bad).ok, false);
});

test('bounded Work pagination covers hundreds of assignments without large bound-id lists', async () => {
  const t = await setup();
  for (let i = 0; i < 205; i++) {
    const id = `project-${i.toString().padStart(3, '0')}`;
    run(t.raw, "INSERT INTO projects(id,workspace_id,client_id,name) VALUES(?,'a','james',?)", id, id);
    run(t.raw, "INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,'m-sam')", id);
    t.seedAction(`action-${i.toString().padStart(3, '0')}`, { project_id: id });
  }
  const actor = await t.actor('sam'), first = await t.actions(actor), second = await t.actions(actor, { page: 2 });
  assert.equal(first.items.length, 200); assert.equal(first.hasMore, true); assert.equal(second.items.length, 5); assert.equal(second.hasMore, false);
  assert.equal(new Set([...first.items, ...second.items].map(i => i.id)).size, 205);
  const options = await actionFilterOptions(t.db, actor); assert.equal(options.projectId.items.length, 200); assert.equal(options.projectId.hasMore, true);
});

test('Project creation bound is atomic, retry-safe and never returns hidden row counts', async () => {
  const t = await setup(); for (let i = 0; i < 199; i++) t.seedAction(`existing-${i}`, { visibility: 'restricted' });
  const actor = await t.actor('pm'), results = await Promise.all([t.addAction({ title: 'Last' }, { actor }), t.addAction({ title: 'Too many' }, { actor })]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.reason === 'conflict').length, 1); assert.equal(t.actionHistory().length, 1);
  assert.equal((await t.actions(actor)).items.length, 1); assert.doesNotMatch(JSON.stringify(results), /existing-|count|199/);
});
