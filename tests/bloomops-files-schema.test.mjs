import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setup } from './_files.mjs';
import { run, all } from './_bloomops-db.mjs';
import { FILE_MAX_BYTES } from '../lib/bloomops/file-values.mjs';
import { projectActivity } from '../lib/bloomops/project-activity.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';

test('B5 is additive, has matching journal/snapshot and no future subject schemas', () => {
  const read = path => JSON.parse(readFileSync(new URL(`../drizzle/meta/${path}`, import.meta.url)));
  const journal = read('_journal.json'), before = read('0011_snapshot.json'), after = read('0012_snapshot.json');
  assert.ok(journal.entries.length >= 13); assert.equal(journal.entries[12].tag, '0012_b5_files'); assert.equal(after.prevId, before.id);
  assert.deepEqual(Object.keys(after.tables).filter(key => !before.tables[key]).sort(), ['asset_links', 'asset_upload_attempts', 'assets']);
  for (const table of Object.keys(before.tables)) {
    const next = structuredClone(after.tables[table]); if (table === 'deliverables') delete next.indexes.deliverables_ws_project_id_uq;
    assert.deepEqual(next, before.tables[table]);
  }
  const migration = readFileSync(new URL('../drizzle/0012_b5_files.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(migration, /\b(?:ALTER|DROP)\s+TABLE/i); assert.doesNotMatch(migration, /content_item|request_id.*REFERENCES|pages|finance/i);
  assert.equal(Object.keys(after.tables.assets.columns).length, 19); assert.equal(Object.keys(after.tables.asset_links.columns).length, 5); assert.equal(Object.keys(after.tables.asset_upload_attempts.columns).length, 6);
});

async function clone(t, patch = {}) {
  const row = { ...t.stored((await t.upload()).fileId), id: crypto.randomUUID(), creation_request_id: crypto.randomUUID(), object_key: crypto.randomUUID(), ...patch };
  return { row, insert: () => run(t.raw, `INSERT INTO assets(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`, ...Object.values(row)) };
}
for (const [column, value] of [['filename', ''], ['filename', 'a\r\nB'], ['filename', 'a/b'], ['filename', 'a\\b'], ['mime_type', 'text/plain\r\nA'], ['mime_type', 'x'], ['byte_size', 0], ['byte_size', -1], ['byte_size', FILE_MAX_BYTES + 1], ['byte_size', 1.5], ['sha256', 'f'.repeat(63)], ['sha256', 'z'.repeat(64)], ['visibility', 'public'], ['initial_visibility', 'public'], ['status', 'complete'], ['revision', 0], ['creation_request_id', 'bad'], ['ready_at', null], ['etag', null], ['lease_until', '2026-09-08T12:00:00Z'], ['archived_at', '2026-09-08T12:00:00Z']]) test(`database refuses incoherent File ${column}`, async () => {
  const t = await setup(), copy = await clone(t, { [column]: value }); assert.throws(copy.insert, /CHECK/);
});
test('uploader, File, Project and Deliverable foreign keys require the same workspace and Project', async () => {
  const t = await setup(), foreign = await clone(t, { workspace_id: 'b' }); assert.throws(foreign.insert, /FOREIGN KEY/);
  for (const kind of ['workspace', 'project', 'deliverable']) {
    const copy = await clone(t); copy.insert();
    const sibling = (await t.create()).projectId;
    assert.throws(() => run(t.raw, 'INSERT INTO asset_links(asset_id,workspace_id,project_id,deliverable_id) VALUES(?,?,?,?)', copy.row.id, kind === 'workspace' ? 'b' : 'a', kind === 'project' ? 'missing' : sibling, kind === 'deliverable' ? t.deliverableId : null), /FOREIGN KEY/);
  }
});
test('fixed attachments cannot be relinked, removed or duplicated and attempt keys remain durable', async () => {
  const t = await setup(), r = await t.upload({ deliverableId: t.deliverableId });
  assert.throws(() => run(t.raw, 'UPDATE asset_links SET deliverable_id=NULL WHERE asset_id=?', r.fileId), /immutable/);
  assert.throws(() => run(t.raw, 'DELETE FROM asset_links WHERE asset_id=?', r.fileId), /Archive/);
  assert.throws(() => run(t.raw, "INSERT INTO asset_links(asset_id,workspace_id,project_id) VALUES(?,'a',?)", r.fileId, t.projectId), /UNIQUE/);
  assert.throws(() => run(t.raw, "UPDATE asset_upload_attempts SET object_key='forged'"), /immutable/);
  assert.throws(() => run(t.raw, 'DELETE FROM asset_upload_attempts'), /Retain/);
});
test('original request details and failed generations cannot be rewritten into Ready', async () => {
  const t = await setup(), r = await t.upload();
  for (const column of ['filename', 'mime_type', 'byte_size', 'sha256', 'creation_request_id', 'workspace_id', 'uploader_membership_id', 'initial_visibility', 'created_at']) assert.throws(() => run(t.raw, `UPDATE assets SET ${column}=${column} WHERE id=?`, r.fileId), /immutable/);
  assert.throws(() => run(t.raw, "UPDATE assets SET object_key='forged' WHERE id=?", r.fileId), /Invalid File/);
  t.bucket.beforePut = () => { throw new Error('failed'); }; await t.upload();
  assert.throws(() => run(t.raw, "UPDATE assets SET status='ready',etag='x',ready_at='now' WHERE status='failed'"), /Invalid File/);
  assert.throws(() => run(t.raw, "UPDATE assets SET status='uploading',lease_until='later' WHERE status='failed'"), /Invalid File/);
});
test('large scopes and combined histories use bounded relational predicates', async () => {
  const t = await setup(), original = t.d1.prepare.bind(t.d1); let largest = 0;
  t.d1.prepare = query => { const s = original(query); return { ...s, bind(...args) { largest = Math.max(largest, args.length); assert.ok(args.length <= 100, `D1 bind count ${args.length}`); return s.bind(...args); } }; };
  for (let n = 0; n < 220; n++) {
    const id = `scope-${n}`; run(t.raw, "INSERT INTO projects(id,workspace_id,client_id,name) VALUES(?,'a','james','Scoped')", id);
    run(t.raw, "INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,'m-sam')", id);
  }
  t.assign(); const actor = await t.actor('sam'); await t.upload(); assert.equal((await t.list(actor)).items.length, 1);
  assert.ok((await projectActivity(t.db, actor, t.projectId)).length); assert.ok((await clientActivity(t.db, 'a', 'james', { actor })).length); assert.ok(largest > 0);
});
test('Project File capacity is atomic and never changes parent lifecycle', async () => {
  const t = await setup(), first = await t.upload(), template = t.stored(first.fileId), before = t.parents();
  for (let n = 0; n < 198; n++) {
    const row = { ...template, id: `file-${n}`, creation_request_id: crypto.randomUUID(), object_key: `key-${n}` };
    run(t.raw, `INSERT INTO assets(${Object.keys(row).join(',')}) VALUES(${Object.keys(row).map(() => '?').join(',')})`, ...Object.values(row));
    run(t.raw, "INSERT INTO asset_links(asset_id,workspace_id,project_id) VALUES(?,'a',?)", row.id, t.projectId);
  }
  const results = await Promise.all([t.upload(), t.upload()]); assert.equal(results.filter(r => r.ok).length, 1); assert.equal((await t.list()).items.length, 200);
  assert.deepEqual(t.parents(), before); assert.deepEqual(all(t.raw, 'PRAGMA foreign_key_check'), []);
});
