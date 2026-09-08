import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup } from './_actions.mjs';
import { all, run } from './_bloomops-db.mjs';

test('B3 migration and generated snapshot add only two tables and the Milestone composite reference index', async () => {
  const read = path => JSON.parse(readFileSync(new URL(`../drizzle/meta/${path}`, import.meta.url)));
  const journal = read('_journal.json'), before = read('0009_snapshot.json'), after = read('0010_snapshot.json');
  assert.equal(journal.entries.length, 11); assert.equal(journal.entries[10].tag, '0010_b3_actions_dependencies'); assert.equal(after.prevId, before.id);
  assert.deepEqual(Object.keys(after.tables).filter(name => !before.tables[name]).sort(), ['action_dependencies', 'actions']);
  for (const [name, table] of Object.entries(before.tables)) {
    if (name === 'milestones') { assert.deepEqual(after.tables[name].columns, table.columns); assert.equal(Object.keys(after.tables[name].indexes).length, Object.keys(table.indexes).length + 1); }
    else assert.deepEqual(after.tables[name], table, name);
  }
  const migration = readFileSync(new URL('../drizzle/0010_b3_actions_dependencies.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(migration, /\b(?:ALTER|DROP)\s+TABLE/i); assert.match(migration, /WITH RECURSIVE/); assert.match(migration, /BEFORE INSERT ON action_dependencies/);
  const t = await setup(); assert.equal(all(t.raw, 'PRAGMA table_info(actions)').length, 18); assert.equal(all(t.raw, 'PRAGMA table_info(action_dependencies)').length, 6);
  assert.deepEqual(all(t.raw, 'PRAGMA foreign_key_check'), []); assert.equal(all(t.raw, 'PRAGMA quick_check')[0].quick_check, 'ok');
});

for (const [column, value] of [['title', ''], ['title', 'x'.repeat(121)], ['description', ''], ['description', 'x'.repeat(5001)], ['status', 'blocked'], ['priority', 'critical'], ['visibility', 'client'], ['visibility', 'public'], ['revision', 0], ['revision', 1.5], ['creation_request_id', 'bad'], ['due_date', '2026-02-30'], ['due_date', 'invalid'], ['due_date', '2026-13-01'], ['completed_at', 'forged'], ['waiting_type', 'team'], ['waiting_reason', 'uncoordinated']]) test(`database rejects invalid Action ${column}=${String(value).slice(0, 15)}`, async () => {
  const t = await setup(), id = t.seedAction('a1'); assert.throws(() => run(t.raw, `UPDATE actions SET ${column}=? WHERE id=?`, value, id), /CHECK/);
});

test('database enforces exact Project/Milestone workspace parents, assignment workspace and creation uniqueness', async () => {
  const t = await setup(), a = t.seedAction('a1'), b = t.seedAction('b1'), otherProject = (await t.create()).projectId;
  const { milestoneId } = await t.add({}, { projectId: otherProject });
  for (const [column, value] of [['workspace_id', 'b'], ['project_id', 'guessed'], ['milestone_id', milestoneId], ['milestone_id', 'guessed'], ['assignee_membership_id', 'm-foreign']]) assert.throws(() => run(t.raw, `UPDATE actions SET ${column}=? WHERE id=?`, value, a), /FOREIGN KEY/);
  assert.throws(() => run(t.raw, 'UPDATE actions SET creation_request_id=(SELECT creation_request_id FROM actions WHERE id=?) WHERE id=?', a, b), /UNIQUE/);
  for (const patch of ["status='done'", "status='waiting'", "status='waiting',waiting_type='customer',waiting_reason='Feedback'", "status='waiting',waiting_type='client',waiting_reason=''", "status='cancelled',completed_at='forged'"]) assert.throws(() => run(t.raw, `UPDATE actions SET ${patch} WHERE id=?`, a), /CHECK/);
});
