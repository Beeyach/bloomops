import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-files.mjs';
import { run, all, one } from './_bloomops-db.mjs';
import { FILE_LEASE_MS, FILE_MAX_BYTES } from '../lib/bloomops/file-values.mjs';

for (const failure of ['reserve', 'link', 'attempt', 'put-before', 'put-after', 'finalize', 'activity', 'cleanup']) test(`${failure} failure leaves no false Ready and recovers conservatively`, async () => {
  const t = await setup(), requestId = crypto.randomUUID();
  const table = { reserve: 'assets', link: 'content_asset_links', attempt: 'asset_upload_attempts', activity: 'activity_events' }[failure];
  if (table) run(t.raw, `CREATE TRIGGER fail BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'failure'); END`);
  if (failure === 'finalize') run(t.raw, "CREATE TRIGGER fail BEFORE UPDATE ON assets WHEN NEW.status='ready' BEGIN SELECT RAISE(ABORT,'failure'); END");
  if (failure === 'put-before') t.bucket.beforePut = () => { throw new Error('put'); };
  if (['put-after', 'cleanup'].includes(failure)) t.bucket.afterPut = () => { throw new Error('lost put'); };
  if (failure === 'cleanup') t.bucket.beforeDelete = () => { throw new Error('delete'); };
  const result = await t.upload({ requestId }).catch(() => ({ ok: false })); assert.equal(result.ok, false);
  const file = one(t.raw, 'SELECT * FROM assets WHERE creation_request_id=?', requestId);
  if (['reserve', 'link', 'attempt'].includes(failure)) { assert.equal(file, undefined); assert.equal(all(t.raw, 'SELECT * FROM content_asset_links').length, 0); }
  else {
    assert.equal(file.status, 'failed'); assert.equal(file.ready_at, null); assert.equal(t.fileEvents(file.id).length, 0); assert.equal(await t.download(file.id), null);
    assert.equal(t.bucket.objects.has(file.object_key), failure === 'cleanup');
  }
  if (table || failure === 'finalize') run(t.raw, 'DROP TRIGGER fail');
  t.bucket.beforePut = t.bucket.afterPut = t.bucket.beforeDelete = null;
  const recovered = await t.upload({ requestId }); assert.equal(recovered.ok, true);
  assert.equal(t.fileEvents(recovered.fileId).length, 1);
  if (file) { assert.equal(recovered.fileId, file.id); assert.notEqual(t.stored(file.id).object_key, file.object_key); assert.equal(t.bucket.objects.has(file.object_key), false); }
});
for (const evidence of ['key', 'size', 'etag', 'mime', 'sha256']) test(`incorrect R2 ${evidence} never finalizes Ready`, async () => {
  const t = await setup(), put = t.bucket.put.bind(t.bucket);
  t.bucket.put = async (...args) => { const object = await put(...args); if (evidence === 'mime') object.httpMetadata.contentType = 'text/plain'; else if (evidence === 'sha256') object.checksums.sha256 = new Uint8Array(32); else object[evidence] = evidence === 'size' ? 1 : ''; return object; };
  const result = await t.upload(); assert.equal(result.ok, false); assert.equal(all(t.raw, "SELECT * FROM assets WHERE status='ready'").length, 0);
});
test('lost D1 finalize response proves current metadata and bytes without deleting Ready', async () => {
  const t = await setup(), batch = t.db.batch.bind(t.db); let n = 0;
  t.db.batch = async statements => { const result = await batch(statements); if (++n === 2) throw new Error('lost response'); return result; };
  const result = await t.upload(); assert.equal(result.ok, true); assert.equal(result.unchanged, true);
  assert.ok(await t.download(result.fileId)); assert.equal(t.fileEvents(result.fileId).length, 1);
});
test('lost committed reservation retains durable evidence and later recovers the same File', async () => {
  const t = await setup(), batch = t.db.batch.bind(t.db), requestId = crypto.randomUUID(), now = new Date(); let armed = true;
  t.db.batch = async statements => { const result = await batch(statements); if (armed) { armed = false; throw new Error('lost reserve response'); } return result; };
  await assert.rejects(t.upload({ requestId }, { now }), /lost reserve/);
  const row = one(t.raw, 'SELECT * FROM assets'); assert.equal(row.status, 'uploading'); assert.equal(t.bucket.calls.length, 0);
  assert.equal(all(t.raw, 'SELECT * FROM content_asset_links').length, 1); assert.equal(all(t.raw, 'SELECT * FROM asset_upload_attempts').length, 1);
  const recovered = await t.upload({ requestId }, { now: new Date(now.getTime() + FILE_LEASE_MS + 1) });
  assert.equal(recovered.ok, true); assert.equal(recovered.fileId, row.id); assert.notEqual(t.stored(row.id).object_key, row.object_key); assert.equal(t.fileEvents(row.id).length, 1);
});
test('Client eligibility revoked after authorization but before reserve produces no File or R2 write', async () => {
  const t = await setup(), actor = await t.actor('james'), batch = t.db.batch.bind(t.db);
  t.db.batch = async statements => { run(t.raw, "UPDATE content_items SET stage='editing',stage_context=NULL"); return batch(statements); };
  assert.equal((await t.upload({}, { actor, portal: true })).ok, false);
  assert.equal(all(t.raw, 'SELECT * FROM assets').length, 0); assert.equal(all(t.raw, 'SELECT * FROM content_asset_links').length, 0); assert.equal(t.bucket.calls.length, 0);
});
test('simultaneous identical request is protected by the active lease, then converges once', async () => {
  const t = await setup(), requestId = crypto.randomUUID(); let signal, release;
  const started = new Promise(resolve => { signal = resolve; }), gate = new Promise(resolve => { release = resolve; });
  t.bucket.beforePut = async () => { t.bucket.beforePut = null; signal(); await gate; };
  const original = t.upload({ requestId }); await started;
  assert.equal((await t.upload({ requestId })).reason, 'conflict'); release(); const result = await original;
  assert.deepEqual(await t.upload({ requestId }), { ok: true, fileId: result.fileId, unchanged: true });
  assert.equal(all(t.raw, 'SELECT * FROM assets').length, 1); assert.equal(t.fileEvents(result.fileId).length, 1);
});
test('D1 cannot confirm a lost commit: preserve Ready object and known attempt, never blind delete', async () => {
  const t = await setup(), batch = t.db.batch.bind(t.db), select = t.db.select.bind(t.db), update = t.db.update.bind(t.db); let n = 0;
  t.db.batch = async statements => { const result = await batch(statements); if (++n === 2) { t.db.select = t.db.update = () => { throw new Error('D1 unavailable'); }; throw new Error('lost response'); } return result; };
  const result = await t.upload(); assert.equal(result.ok, false);
  t.db.select = select; t.db.update = update;
  const row = one(t.raw, 'SELECT * FROM assets'); assert.equal(row.status, 'ready'); assert.ok(t.bucket.objects.has(row.object_key)); assert.ok(await t.download(row.id));
});
test('late old PUT cannot finalize or delete winning recovery generation', async () => {
  const t = await setup(), requestId = crypto.randomUUID(), now = new Date(); let signal, release;
  const started = new Promise(resolve => { signal = resolve; }), gate = new Promise(resolve => { release = resolve; });
  t.bucket.beforePut = async () => { t.bucket.beforePut = null; signal(); await gate; };
  const old = t.upload({ requestId }, { now }); await started;
  const winner = await t.upload({ requestId }, { now: new Date(now.getTime() + FILE_LEASE_MS + 1) }); release(); await old;
  assert.equal(winner.ok, true); assert.ok(await t.download(winner.fileId)); assert.equal(t.fileEvents(winner.fileId).length, 1);
  assert.equal(all(t.raw, 'SELECT * FROM asset_upload_attempts').length, 2); assert.equal(t.bucket.objects.size, 1);
});
test('archive during PUT fences finalization and visibility cannot prematurely share uploading bytes', async () => {
  const t = await setup();
  t.bucket.afterPut = async () => {
    const file = one(t.raw, 'SELECT * FROM assets');
    assert.equal((await t.change(file.id, 'visibility', { visibility: 'client' })).reason, 'conflict');
    assert.equal((await t.change(file.id, 'archive')).ok, true);
  };
  assert.equal((await t.upload()).ok, false); assert.equal(all(t.raw, "SELECT * FROM activity_events WHERE event_type='FILE_UPLOADED'").length, 0);
  const file = one(t.raw, 'SELECT * FROM assets'); assert.equal(file.status, 'archived'); assert.equal(await t.download(file.id), null);
});
test('visibility/archive race has one CAS winner, no duplicate activity', async () => {
  const t = await setup(), r = await t.upload();
  const results = await Promise.all([t.change(r.fileId, 'visibility', { visibility: 'client', expectedRevision: 2 }), t.change(r.fileId, 'archive', { expectedRevision: 2 })]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(t.fileEvents(r.fileId).length, 2);
});
test('missing Ready object fails downloads/retries without repairing or changing canonical Ready state', async () => {
  const t = await setup(), requestId = crypto.randomUUID(), r = await t.upload({ requestId }), before = t.stored(r.fileId);
  t.bucket.objects.delete(before.object_key); assert.equal(await t.download(r.fileId), null); assert.equal((await t.upload({ requestId })).ok, false); assert.deepEqual(t.stored(r.fileId), before);
});
test('exact 5 MiB server checksum supported; larger and empty bytes refused', async () => {
  const t = await setup(), bytes = new Uint8Array(FILE_MAX_BYTES).fill(7), r = await t.upload({ byteSize: bytes.length, mimeType: 'application/octet-stream' }, { bytes }); assert.equal(r.ok, true);
  assert.equal((await t.upload({ byteSize: FILE_MAX_BYTES + 1 })).reason, 'too_large'); assert.equal((await t.upload({ byteSize: 0 })).reason, 'invalid');
});
