import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup } from './_content-files.mjs';
import { all, run } from './_bloomops-db.mjs';

test('0016 adds only fixed Content links, preserves all existing snapshots and original assets CHECK', async () => {
  const read = name => JSON.parse(readFileSync(new URL(`../drizzle/meta/${name}`, import.meta.url)));
  const before = read('0015_snapshot.json'), after = read('0016_snapshot.json');
  assert.equal(after.prevId, before.id); assert.equal(read('_journal.json').entries[16].tag, '0016_c4_content_assets');
  assert.deepEqual(Object.keys(after.tables).filter(k => !before.tables[k]), ['content_asset_links']);
  for (const [key, value] of Object.entries(before.tables)) assert.deepEqual(after.tables[key], value, key);
  assert.doesNotMatch(readFileSync(new URL('../drizzle/0016_c4_content_assets.sql', import.meta.url), 'utf8'), /\b(?:ALTER|DROP)\s+TABLE/i);
  const t = await setup(); assert.equal(all(t.raw, 'PRAGMA table_info(content_asset_links)').length, 5);
  assert.deepEqual(all(t.raw, 'PRAGMA foreign_key_check'), []);
});
test('fixed Content links reject mutation, bad purpose, cross-workspace parents, and both dual-family orders', async () => {
  const t = await setup(), result = await t.upload(), projectId = (await t.create()).projectId;
  assert.throws(() => run(t.raw, 'UPDATE content_asset_links SET content_id=content_id'), /immutable/);
  assert.throws(() => run(t.raw, 'DELETE FROM content_asset_links'), /Archive/);
  assert.throws(() => run(t.raw, "INSERT INTO asset_links(asset_id,workspace_id,project_id) VALUES(?,'a',?)", result.fileId, projectId), /exclusive/);
  const original = t.stored(result.fileId);
  const clone = () => {
    const row = { ...original, id: crypto.randomUUID(), creation_request_id: crypto.randomUUID(), object_key: crypto.randomUUID() };
    run(t.raw, `INSERT INTO assets(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`, ...Object.values(row)); return row.id;
  };
  const projectFile = clone(); run(t.raw, "INSERT INTO asset_links(asset_id,workspace_id,project_id) VALUES(?,'a',?)", projectFile, projectId);
  assert.throws(() => run(t.raw, "INSERT INTO content_asset_links(asset_id,workspace_id,content_id,purpose) VALUES(?,'a',?,'recording')", projectFile, t.contentId), /exclusive/);
  for (const [workspace, contentId, purpose] of [['b', t.contentId, 'recording'], ['a', 'missing', 'recording'], ['a', t.contentId, 'video']])
    assert.throws(() => run(t.raw, 'INSERT INTO content_asset_links(asset_id,workspace_id,content_id,purpose) VALUES(?,?,?,?)', clone(), workspace, contentId, purpose));
});
test('200-file capacity includes archived files and reserves the last slot atomically', async () => {
  const t = await setup(), first = await t.upload(), source = t.stored(first.fileId);
  for (let n = 0; n < 198; n++) {
    const row = { ...source, id: `cap-${n}`, creation_request_id: crypto.randomUUID(), object_key: `cap-key-${n}` };
    run(t.raw, `INSERT INTO assets(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`, ...Object.values(row));
    run(t.raw, "INSERT INTO content_asset_links(asset_id,workspace_id,content_id,purpose) VALUES(?,'a',?,'asset')", row.id, t.contentId);
  }
  await t.change(first.fileId, 'archive');
  const results = await Promise.all([t.upload(), t.upload()]); assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(all(t.raw, 'SELECT * FROM content_asset_links').length, 200); assert.equal((await t.files()).items.length, 199);
});
test('large assignment scopes and both histories remain below actual D1 bind limit', async () => {
  const t = await setup(), prepare = t.d1.prepare.bind(t.d1); let largest = 0;
  t.d1.prepare = query => { const statement = prepare(query); return { ...statement, bind(...args) { largest = Math.max(largest, args.length); assert.ok(args.length <= 100, `${args.length} binds`); return statement.bind(...args); } }; };
  run(t.raw, "INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')");
  const actor = await t.actor('sam'); await t.upload({}, { actor }); await t.files(actor);
  const { clientActivity } = await import('../lib/bloomops/client-activity.mjs'); assert.ok((await clientActivity(t.db, 'a', 'james', { actor })).length); assert.ok(largest > 0);
});
