import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_actions.mjs';
import { all, run } from './_bloomops-db.mjs';

test('self edges, duplicates, two-way and long back-edge cycles are refused without lifecycle changes', async () => {
  const t = await setup(), ids = Array.from({ length: 180 }, (_, i) => t.seedAction(`chain-${i}`)), parents = t.allParents();
  for (let i = 1; i < ids.length; i++) run(t.raw, "INSERT INTO action_dependencies(workspace_id,project_id,action_id,depends_on_action_id) VALUES('a',?,?,?)", t.projectId, ids[i], ids[i - 1]);
  const before = t.actionSnapshot();
  assert.equal((await t.depend(ids[0], ids[179])).reason, 'cycle'); assert.equal((await t.depend(ids[0], ids[0])).reason, 'cycle');
  assert.ok((await t.depend(ids[179], ids[178])).unchanged);
  assert.deepEqual(t.actionSnapshot(), before); assert.deepEqual(t.allParents(), parents);
  assert.throws(() => run(t.raw, "INSERT INTO action_dependencies(workspace_id,project_id,action_id,depends_on_action_id) VALUES('a',?,?,?)", t.projectId, ids[0], ids[179]), /action_dependency_cycle/);
});

test('diamonds converge without duplicate traversal and still reject back-edges', async () => {
  const t = await setup(), [a, b, c, d] = ['a1', 'b1', 'c1', 'd1'].map(id => t.seedAction(id));
  for (const [source, target] of [[a, b], [a, c], [b, d], [c, d]]) assert.ok((await t.depend(source, target)).ok);
  const before = t.actionSnapshot(); assert.equal((await t.depend(d, a)).reason, 'cycle'); assert.deepEqual(t.actionSnapshot(), before);
});

for (const size of [2, 3, 6]) test(`${size} competing cycle additions cannot commit a cycle`, async () => {
  const t = await setup(), ids = Array.from({ length: size }, (_, i) => t.seedAction(`node-${i}`));
  const results = await Promise.all(ids.map((id, index) => t.depend(id, ids[(index + 1) % size], { expectedRevision: 1 })));
  assert.equal(results.filter(r => r.ok).length, size - 1); assert.equal(results.filter(r => r.reason === 'cycle').length, 1);
  assert.equal(all(t.raw, 'SELECT * FROM action_dependencies').length, size - 1); assert.equal(t.actionHistory().length, size - 1);
});

test('duplicate concurrent add/remove converges, stale competitors conflict, and delayed remove preserves a re-added edge', async () => {
  const t = await setup(), a = t.seedAction('a1'), b = t.seedAction('b1'), c = t.seedAction('c1');
  assert.ok((await Promise.all([t.depend(a, b, { expectedRevision: 1 }), t.depend(a, b, { expectedRevision: 1 })])).every(r => r.ok));
  assert.equal(t.actionHistory('ACTION_DEPENDENCY_ADDED').length, 1);
  assert.equal((await t.depend(a, c, { expectedRevision: 1 })).reason, 'conflict');
  const edge = (await t.dependencies(a)).items[0], expectedRevision = (await t.action(a)).revision;
  assert.ok((await Promise.all([t.removeDependency(a, edge.id, { expectedRevision }), t.removeDependency(a, edge.id, { expectedRevision })])).every(r => r.ok));
  assert.equal(t.actionHistory('ACTION_DEPENDENCY_REMOVED').length, 1);
  await t.depend(a, b); assert.ok((await t.removeDependency(a, edge.id, { expectedRevision })).unchanged);
  assert.equal((await t.dependencies(a)).items.length, 1); assert.notEqual((await t.dependencies(a)).items[0].id, edge.id);
});

test('dependency/status races respect the source revision and never change another lifecycle', async () => {
  const t = await setup(), a = t.seedAction('a1'), b = t.seedAction('b1'), parents = t.allParents();
  const results = await Promise.all([t.depend(a, b, { expectedRevision: 1 }), t.progress(a, 'waiting', { expectedRevision: 1 })]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(t.actionHistory().length, 1); assert.equal((await t.action(b)).status, 'to_do'); assert.deepEqual(t.allParents(), parents);
});

test('Done is the only satisfaction state and graph changes never auto-progress Actions', async () => {
  const t = await setup(), a = t.seedAction('a1'), b = t.seedAction('b1'), c = t.seedAction('c1');
  await t.depend(a, b); await t.depend(a, c);
  await t.progress(b, 'in_progress'); await t.progress(b, 'done'); assert.equal((await t.action(a)).dependencyBlocked, true);
  await t.progress(c, 'waiting'); await t.progress(c, 'done'); assert.equal((await t.action(a)).dependencyBlocked, false); assert.equal((await t.action(a)).status, 'to_do');
  // Manual progress is independent of the graph; no undocumented gate.
  const d = t.seedAction('d1'); await t.depend(a, d); await t.progress(a, 'in_progress'); assert.ok((await t.progress(a, 'done')).ok);
});

test('hidden prerequisite labels and graph disappear, while generic blocking and overdue stay correct', async () => {
  const t = await setup(), a = t.seedAction('Readable', { assignee_membership_id: 'm-sam', due_date: '2026-09-01' }), b = t.seedAction('SECRET_ENDPOINT');
  await t.depend(a, b); const actor = await t.actor('sam');
  assert.deepEqual((await t.dependencies(a, actor)).items, []);
  const dto = await t.action(a, actor, { now: new Date('2026-09-08T12:00:00Z') });
  assert.equal(dto.dependencyBlocked, true); assert.equal(dto.overdue, false); assert.doesNotMatch(JSON.stringify(dto), /SECRET_ENDPOINT/);
  assert.doesNotMatch(JSON.stringify(t.actionHistory('ACTION_DEPENDENCY_ADDED')), /SECRET_ENDPOINT|dependsOnActionId/);
});

test('dependency endpoints are same-workspace / Project, visibility checked and edge updates immutable', async () => {
  const t = await setup(), a = t.seedAction('a1'), otherProject = (await t.create()).projectId;
  const b = t.seedAction('b1', { project_id: otherProject }), hidden = t.seedAction('hidden', { visibility: 'restricted' });
  for (const target of [b, 'guessed']) assert.equal((await t.depend(a, target)).reason, 'not_found');
  assert.equal((await t.depend(a, hidden, { actor: await t.actor('pm') })).reason, 'not_found');
  assert.throws(() => run(t.raw, "INSERT INTO action_dependencies(workspace_id,project_id,action_id,depends_on_action_id) VALUES('a',?,?,?)", t.projectId, a, b), /FOREIGN KEY/);
  assert.throws(() => run(t.raw, "INSERT INTO action_dependencies(workspace_id,project_id,action_id,depends_on_action_id) VALUES('b',?,?,?)", t.projectId, a, hidden), /FOREIGN KEY/);
  await t.depend(a, hidden); const edge = (await t.dependencies(a)).items[0];
  assert.throws(() => run(t.raw, 'UPDATE action_dependencies SET depends_on_action_id=? WHERE id=?', a, edge.id), /immutable/);
});

test('late dependency insert failure rolls back its earlier history receipt', async () => {
  const t = await setup(), a = t.seedAction('a1'), b = t.seedAction('b1'), before = t.actionSnapshot();
  run(t.raw, "CREATE TRIGGER fail_edge BEFORE INSERT ON action_dependencies BEGIN SELECT RAISE(ABORT,'late dependency failure'); END");
  await assert.rejects(() => t.depend(a, b)); assert.deepEqual(t.actionSnapshot(), before);
});

for (const status of ['done', 'cancelled']) test(`prerequisite ${status} racing with edge creation derives the final graph without overwriting either lifecycle`, async () => {
  const t = await setup(), a = t.seedAction('a1', { due_date: '2026-09-01' }), b = t.seedAction('b1');
  await t.progress(b, 'in_progress');
  const results = await Promise.all([t.depend(a, b), t.progress(b, status)]);
  assert.ok(results.every(result => result.ok));
  const action = await t.action(a, t.owner, { now: new Date('2026-09-08T12:00:00Z') });
  assert.equal(action.status, 'to_do'); assert.equal((await t.action(b)).status, status);
  assert.equal(action.dependencyBlocked, status !== 'done'); assert.equal(action.overdue, status === 'done');
});
