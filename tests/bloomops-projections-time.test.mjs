import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, NOW } from './_work-projections.mjs';
import { run } from './_bloomops-db.mjs';
import { homeDeliverables, recentOutputs } from '../lib/bloomops/work-projections.mjs';

for (const [instant, west, east, utc] of [
  ['2026-09-09T00:30:00Z','2026-09-08','2026-09-09','2026-09-09'],
  ['2026-09-09T20:00:00Z','2026-09-09','2026-09-10','2026-09-09'],
  ['2026-03-08T09:59:00Z','2026-03-08','2026-03-08','2026-03-08'],
  ['2026-03-08T10:01:00Z','2026-03-08','2026-03-08','2026-03-08'],
  ['2026-11-01T08:30:00Z','2026-11-01','2026-11-01','2026-11-01'],
  ['2026-11-01T09:30:00Z','2026-11-01','2026-11-01','2026-11-01'],
]) test(`Home uses Client-local days at ${instant}, including midnight/DST boundaries`, async () => {
  const t = await setup(), now = new Date(instant);
  run(t.raw, "UPDATE bloomops_clients SET timezone='America/Los_Angeles' WHERE id='james'");
  run(t.raw, "UPDATE bloomops_clients SET timezone='Asia/Kolkata' WHERE id='lawrence'");
  t.project('east', { client_id: 'lawrence' });
  run(t.raw, "INSERT INTO bloomops_clients(id,workspace_id,name,slug) VALUES('utc-client','a','UTC client','utc-client')");
  t.project('utc', { client_id: 'utc-client' });
  t.action('west-today', { due_date: west }); t.action('east-today', { project_id: 'east', due_date: east }); t.action('utc-today', { project_id: 'utc', due_date: utc });
  t.action('past', { due_date: '2026-01-01' }); t.action('future', { due_date: '2027-01-01' });
  const home = await t.home(t.owner, { now });
  assert.deepEqual(home.actions.today.items.map(i=>i.id).sort(), ['east-today','utc-today','west-today']);
  assert.deepEqual(home.actions.overdue.items.map(i=>i.id), ['past']);
  assert.equal((await t.summary(t.owner,{now})).actions.overdue, 1);
});

test('hidden unresolved and cancelled prerequisites suppress ordinary overdue without exposing them', async () => {
  const t = await setup(); t.assign('client');
  t.action('visible', { due_date: '2026-09-08' }); t.action('hidden-prerequisite', { visibility: 'restricted', status: 'cancelled' });
  run(t.raw, "INSERT INTO action_dependencies(workspace_id,project_id,action_id,depends_on_action_id) VALUES('a',?,'visible','hidden-prerequisite')", t.projectId);
  const actor = await t.actor('sam'), home = await t.home(actor), row = await t.summary(actor);
  assert.equal(row.actions.open, 1); assert.equal(row.actions.overdue, 0); assert.equal(home.actions.overdue.items.length, 0);
  assert.doesNotMatch(JSON.stringify(home), /hidden-prerequisite/);
  // Canonical dependency removal immediately changes the read model; no due
  // date or Project status has to be rewritten to make overdue accurate.
  run(t.raw, "DELETE FROM action_dependencies WHERE action_id='visible'");
  assert.equal((await t.summary(actor)).actions.overdue, 1); assert.equal((await t.home(actor)).actions.overdue.items[0].id, 'visible');
});

test('Deliverable fourteen-day horizon is a Client calendar interval across DST, inclusive at the end', async () => {
  const t = await setup(), now = new Date('2026-03-01T07:30:00Z');
  run(t.raw, "UPDATE bloomops_clients SET timezone='America/Los_Angeles' WHERE id='james'");
  // It is Feb 28 locally; +14 calendar days is March 14 despite the DST jump.
  t.deliverable('last-day', { target_date: '2026-03-14' }); t.deliverable('too-far', { target_date: '2026-03-15' });
  t.deliverable('past', { target_date: '2026-02-27' });
  assert.deepEqual((await homeDeliverables(t.db,t.owner,{now})).items.map(i=>i.id), ['past','last-day']);
});

test('recent output uses fourteen elapsed days, refuses future events and orders ties deterministically', async () => {
  const t = await setup(), cutoff = new Date(NOW.getTime()-14*86400000);
  for (const [id,at] of [['edge',cutoff],['old',new Date(cutoff.getTime()-1)],['future',new Date(NOW.getTime()+1)],['now-a',NOW],['now-b',NOW]]) {
    t.file(id); t.event('file',id,{at:at.toISOString()});
  }
  const first = await recentOutputs(t.db,t.owner,{now:NOW}), second = await recentOutputs(t.db,t.owner,{now:NOW});
  assert.deepEqual(first,second); assert.deepEqual(first.items.map(i=>i.id).sort(), ['edge','now-a','now-b']);
  assert.equal(first.items.at(-1).id,'edge'); assert.ok(first.items[0].eventId > first.items[1].eventId);
});
