import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_files.mjs';
import { run, one, all } from './_bloomops-db.mjs';
import { FILE_LEASE_MS, FILE_MAX_BYTES, validateFileInput, fileDisposition } from '../lib/bloomops/file-values.mjs';
import { projectActivity } from '../lib/bloomops/project-activity.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';

test('reserve precedes bytes, Ready follows checksum confirmation, one event and unchanged parents', async () => {
  const t = await setup(), parents = t.parents();
  t.bucket.beforePut = () => { const row = one(t.raw, 'SELECT * FROM assets'); assert.equal(row.status, 'uploading'); assert.equal(t.events().length, 0); assert.equal(all(t.raw, 'SELECT * FROM asset_links').length, 1); };
  const result = await t.upload({ visibility: 'client', deliverableId: t.deliverableId }); assert.ok(result.ok);
  const file = t.stored(result.fileId); assert.equal(file.status, 'ready'); assert.equal(file.revision, 2); assert.ok(file.ready_at); assert.ok(file.etag);
  assert.equal(t.bucket.objects.size, 1); assert.match(file.object_key, /^bloomops-files\/a\//); assert.doesNotMatch(file.object_key, /handoff|PRIVATE/);
  assert.equal(await new Response((await t.download(result.fileId)).body).text(), 'BloomOps handoff'); assert.equal(t.events('FILE_UPLOADED').length, 1);
  assert.deepEqual(t.parents(), parents); assert.doesNotMatch(JSON.stringify(await t.file(result.fileId)), /objectKey|sha256|lease|requestId|uploaderMembership/);
  assert.doesNotMatch(t.events()[0].metadata_json, /bloomops-files|objectKey|etag|bucket/);
  assert.equal(t.events()[0].client_id, 'james'); assert.equal(t.events()[0].service_engagement_id, 'social-service');
});

test('response-loss retries keep one File, object, readiness event and timestamp after a visibility edit', async () => {
  const t = await setup(), requestId = crypto.randomUUID(); const first = await t.upload({ requestId });
  await t.change(first.fileId, 'visibility', { visibility: 'client' }); const before = t.stored(first.fileId), events = t.events();
  const retry = await t.upload({ requestId }); assert.ok(retry.unchanged); assert.equal(retry.fileId, first.fileId);
  assert.deepEqual(t.stored(first.fileId), before); assert.deepEqual(t.events(), events); assert.equal(t.bucket.calls.filter(c => c[0] === 'put').length, 1);
});
for (const changed of ['filename', 'mimeType', 'byteSize', 'visibility', 'deliverableId', 'bytes', 'projectId']) test(`incompatible retry ${changed} cannot overwrite bytes or identity`, async () => {
  const t = await setup(), requestId = crypto.randomUUID(), first = await t.upload({ requestId }), before = t.snapshot();
  const patch = { filename: 'different.txt', mimeType: 'text/html', byteSize: t.bytes.length + 1, visibility: 'client', deliverableId: t.deliverableId };
  const extra = changed === 'bytes' ? { bytes: new Uint8Array(t.bytes.length).fill(65) } : changed === 'byteSize' ? { bytes: new Uint8Array(t.bytes.length + 1) } : changed === 'projectId' ? { projectId: (await t.create()).projectId } : {};
  const r = await t.upload({ requestId, ...(Object.hasOwn(patch, changed) ? { [changed]: patch[changed] } : {}) }, extra);
  assert.equal(r.reason, 'conflict'); assert.deepEqual(t.snapshot().slice(0, 3), before.slice(0, 3)); assert.equal(t.events('FILE_UPLOADED').length, 1); assert.ok(await t.download(first.fileId));
});

test('concurrent duplicate reservations admit one writer and later retries converge', async () => {
  const t = await setup(), requestId = crypto.randomUUID();
  const results = await Promise.all([t.upload({ requestId }), t.upload({ requestId }), t.upload({ requestId })]);
  assert.equal(new Set(results.filter(r => r.ok).map(r => r.fileId)).size, 1); assert.ok(results.every(r => r.ok || r.reason === 'conflict'));
  assert.equal(all(t.raw, 'SELECT * FROM assets').length, 1); assert.equal(t.bucket.objects.size, 1); assert.equal(t.events('FILE_UPLOADED').length, 1); assert.ok((await t.upload({ requestId })).unchanged);
});

for (const boundary of ['reserve', 'link', 'attempt']) test(`D1 ${boundary} failure reserves no partial File and writes no bytes`, async () => {
  const t = await setup(), before = t.snapshot(), table = { reserve: 'assets', link: 'asset_links', attempt: 'asset_upload_attempts' }[boundary];
  run(t.raw, `CREATE TRIGGER fail BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL'); END`);
  await assert.rejects(t.upload()); assert.deepEqual(t.snapshot(), before); assert.equal(t.bucket.calls.length, 0);
});

for (const boundary of ['put-before', 'put-after', 'put-null', 'put-size', 'put-checksum', 'finalize', 'activity', 'cleanup']) test(`${boundary} failure never yields false Ready and identical retry recovers`, async () => {
  const t = await setup(), requestId = crypto.randomUUID(), put = t.bucket.put;
  if (boundary === 'put-before') t.bucket.beforePut = () => { throw new Error('PRIVATE_R2'); };
  if (['put-after', 'cleanup'].includes(boundary)) t.bucket.afterPut = () => { throw new Error('PRIVATE_R2'); };
  if (boundary === 'cleanup') t.bucket.beforeDelete = () => { throw new Error('PRIVATE_CLEANUP'); };
  if (['put-null', 'put-size', 'put-checksum'].includes(boundary)) t.bucket.put = async (...args) => { const result = await put(...args); if (boundary === 'put-null') return null; if (boundary === 'put-size') result.size++; else result.checksums.sha256 = new ArrayBuffer(32); return result; };
  if (boundary === 'finalize') run(t.raw, "CREATE TRIGGER fail BEFORE UPDATE ON assets WHEN NEW.status='ready' BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL'); END");
  if (boundary === 'activity') run(t.raw, "CREATE TRIGGER fail BEFORE INSERT ON activity_events WHEN NEW.subject_type='file' BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL'); END");
  const r = await t.upload({ requestId }); assert.equal(r.reason, 'upload_failed'); const file = one(t.raw, 'SELECT * FROM assets');
  assert.equal(file.status, 'failed'); assert.equal(file.ready_at, null); assert.equal(t.events('FILE_UPLOADED').length, 0); assert.equal(await t.download(file.id), null);
  assert.equal(t.bucket.objects.size, boundary === 'cleanup' ? 1 : 0); assert.equal(all(t.raw, 'SELECT * FROM asset_upload_attempts').length, 1);
  t.bucket.beforePut = t.bucket.afterPut = t.bucket.beforeDelete = null; t.bucket.put = put;
  if (['finalize', 'activity'].includes(boundary)) run(t.raw, 'DROP TRIGGER fail');
  const recovered = await t.upload({ requestId }); assert.ok(recovered.ok); assert.equal(recovered.fileId, file.id); assert.notEqual(t.stored(file.id).object_key, file.object_key);
  assert.equal(t.bucket.objects.size, 1); assert.equal(t.events('FILE_UPLOADED').length, 1); assert.ok(await t.download(file.id));
});

test('lost finalize commit response preserves the confirmed Ready object and event', async () => {
  const t = await setup(), batch = t.db.batch.bind(t.db); let n = 0;
  t.db.batch = async writes => { const r = await batch(writes); if (++n === 2) throw new Error('response lost'); return r; };
  const r = await t.upload(); assert.ok(r.ok); assert.ok(r.unchanged); assert.equal(t.bucket.objects.size, 1); assert.equal(t.events('FILE_UPLOADED').length, 1);
  assert.equal(t.bucket.calls.filter(c => c[0] === 'delete').length, 0);
});

test('uncertain reserve response remains Uploading without bytes and recovers after lease expiry', async () => {
  const t = await setup(), batch = t.db.batch.bind(t.db), requestId = crypto.randomUUID(), now = new Date(); let first = true;
  t.db.batch = async writes => { const r = await batch(writes); if (first) { first = false; throw new Error('response lost'); } return r; };
  await assert.rejects(t.upload({ requestId }, { now })); assert.equal(t.bucket.objects.size, 0); const row = one(t.raw, 'SELECT * FROM assets');
  assert.equal(row.status, 'uploading'); assert.equal((await t.upload({ requestId }, { now })).reason, 'conflict');
  const retry = await t.upload({ requestId }, { now: new Date(now.getTime() + FILE_LEASE_MS + 1) }); assert.ok(retry.ok); assert.equal(retry.fileId, row.id);
});

test('D1 unavailable during finalize and cleanup retains known key without deleting uncertain bytes', async () => {
  const t = await setup(), batch = t.db.batch.bind(t.db); let n = 0;
  t.db.batch = async writes => { if (++n === 2) { run(t.raw, "CREATE TRIGGER fail BEFORE UPDATE ON assets BEGIN SELECT RAISE(ABORT,'offline'); END"); throw new Error('offline'); } return batch(writes); };
  const r = await t.upload(); assert.equal(r.reason, 'upload_failed'); const file = one(t.raw, 'SELECT * FROM assets'); assert.equal(file.status, 'uploading'); assert.equal(await t.download(file.id), null); assert.equal(t.bucket.objects.size, 1);
  run(t.raw, 'DROP TRIGGER fail'); assert.ok((await t.retry(file.id, { now: new Date(Date.parse(file.lease_until) + 1) })).ok); assert.equal(t.bucket.objects.size, 1);
});

test('late expired writer and cleanup cannot overwrite or delete the winning recovery generation', async () => {
  const t = await setup(), now = new Date(), requestId = crypto.randomUUID(); let started, release;
  const waiting = new Promise(resolve => { started = resolve; }), gate = new Promise(resolve => { release = resolve; }); let first = true;
  t.bucket.beforePut = async () => { if (first) { first = false; started(); await gate; } };
  const original = t.upload({ requestId }, { now }); await waiting;
  const recovered = await t.upload({ requestId }, { now: new Date(now.getTime() + FILE_LEASE_MS + 1) }); assert.ok(recovered.ok); const key = t.stored(recovered.fileId).object_key;
  release(); await original;
  assert.equal(t.stored(recovered.fileId).object_key, key); assert.equal(t.bucket.objects.size, 1); assert.ok(await t.download(recovered.fileId)); assert.equal(t.events('FILE_UPLOADED').length, 1);
});

test('archive during PUT fences finalization; Ready archive retains bytes and response-loss retry is a no-op', async () => {
  const t = await setup(); t.bucket.afterPut = async () => { const row = one(t.raw, 'SELECT * FROM assets'); assert.ok((await t.change(row.id, 'archive')).ok); };
  const r = await t.upload(); assert.equal(r.reason, 'upload_failed'); const first = one(t.raw, 'SELECT * FROM assets'); assert.equal(first.status, 'archived'); assert.equal(t.bucket.objects.size, 0); assert.equal(t.events('FILE_UPLOADED').length, 0);
  t.bucket.afterPut = null; const second = await t.upload(); const ready = t.stored(second.fileId);
  assert.ok((await t.change(second.fileId, 'archive')).ok); const before = t.snapshot(); assert.ok((await t.change(second.fileId, 'archive', { expectedRevision: ready.revision })).unchanged);
  assert.deepEqual(t.snapshot(), before); assert.equal(t.bucket.objects.size, 1); assert.equal(await t.download(second.fileId), null); assert.equal((await t.list()).items.length, 0); assert.equal((await t.retry(second.fileId)).reason, 'conflict');
});

test('missing or mismatching object behind Ready is a safe read failure with no repair or history', async () => {
  const t = await setup(), r = await t.upload(), stored = t.stored(r.fileId), before = t.snapshot();
  const object = t.bucket.objects.get(stored.object_key); object.object.size++;
  assert.equal(await t.download(r.fileId), null); t.bucket.objects.delete(stored.object_key); assert.equal(await t.download(r.fileId), null);
  assert.deepEqual(t.snapshot(), before);
});

test('bounded orphan recovery rotates past persistently failing cleanup keys', async () => {
  const t = await setup(); t.bucket.afterPut = () => { throw new Error('lost put'); }; t.bucket.beforeDelete = () => { throw new Error('delete unavailable'); };
  await t.upload(); const id = one(t.raw, 'SELECT id FROM assets').id;
  for (let n = 0; n < 12; n++) await t.retry(id);
  const keys = all(t.raw, 'SELECT object_key FROM asset_upload_attempts WHERE asset_id=?', id).map(row => row.object_key);
  t.bucket.afterPut = null; t.bucket.calls.length = 0;
  assert.ok((await t.retry(id)).ok);
  // Cleanup still fails, but each key gets a turn instead of the first ten
  // failures starving the others. Keys remain recorded, never falsely clean.
  assert.ok(keys.every(key => t.bucket.calls.some(([method, checked]) => method === 'delete' && checked === key)));
  t.bucket.beforeDelete = null; await t.retry(id); await t.retry(id);
  assert.equal(t.bucket.objects.size, 1); assert.ok(await t.download(id));
});

for (const op of ['archive', 'visibility']) test(`${op} atomically rolls back on late activity failure, identical retries converge and stale competing edits conflict`, async () => {
  const t = await setup(), r = await t.upload(), before = t.snapshot();
  run(t.raw, "CREATE TRIGGER fail BEFORE INSERT ON activity_events WHEN NEW.subject_type='file' BEGIN SELECT RAISE(ABORT,'late'); END");
  await assert.rejects(t.change(r.fileId, op, { visibility: 'client' })); assert.deepEqual(t.snapshot(), before); run(t.raw, 'DROP TRIGGER fail');
  const revision = t.stored(r.fileId).revision, results = await Promise.all([t.change(r.fileId, op, { visibility: 'client', expectedRevision: revision }), t.change(r.fileId, op, { visibility: 'client', expectedRevision: revision })]);
  assert.ok(results.every(x => x.ok)); assert.equal(t.events(op === 'archive' ? 'FILE_ARCHIVED' : 'FILE_VISIBILITY_CHANGED').length, 1);
  assert.equal((await t.change(r.fileId, 'visibility', { visibility: 'restricted', expectedRevision: revision })).reason, 'conflict');
});

for (const [key, value] of [
  ['filename', ''], ['filename', ' '.repeat(2)], ['filename', '..'], ['filename', 'x'.repeat(181)], ['filename', 'a/b'], ['filename', 'a\\b'], ['filename', 'bad\r\nX: y'], ['filename', 'a\x00b'], ['filename', 'a\x7fb'], ['filename', 'a\u202eb'], ['filename', '\ud800'],
  ['mimeType', ''], ['mimeType', 'text/plain\r\nX:y'], ['mimeType', 'text/plain;evil=1'], ['mimeType', 'a/'.concat('x'.repeat(127))], ['mimeType', {}],
  ['byteSize', 0], ['byteSize', -1], ['byteSize', 1.5], ['byteSize', FILE_MAX_BYTES + 1], ['byteSize', '1'], ['requestId', 'bad'], ['visibility', 'public'], ['workspaceId', 'b'], ['objectKey', 'dev-mail/secrets'], ['bucket', 'production'], ['subjectType', 'page']
]) test(`upload rejects unsafe ${key} ${String(value).slice(0, 20)}`, async () => {
  const t = await setup(), before = t.snapshot(); const r = await t.upload({ [key]: value }); assert.equal(r.ok, false); assert.deepEqual(t.snapshot(), before); assert.equal(t.bucket.calls.length, 0);
});

test('safe international filename, Unicode, MIME normalization and attachment headers', () => {
  const value = validateFileInput({ requestId: crypto.randomUUID(), filename: 'Café "launch" 😀.pdf', mimeType: 'Application/PDF', byteSize: 1 }); assert.ok(value.ok); assert.equal(value.value.mimeType, 'application/pdf');
  const header = fileDisposition(value.value.filename); assert.match(header, /^attachment; filename="[A-Za-z0-9 ._()-]+"; filename\*=UTF-8''/); assert.match(header, /Caf%C3%A9/); assert.doesNotMatch(header, /[\r\n]/);
});

test('Project and Client activity obey current File and Deliverable visibility', async () => {
  const t = await setup(), r = await t.upload({ filename: 'SECRET_FILE.txt', deliverableId: t.deliverableId });
  run(t.raw, "INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')"); const actor = await t.actor('sam');
  const history = async () => JSON.stringify([await projectActivity(t.db, actor, t.projectId), await clientActivity(t.db, 'a', 'james', { actor })]);
  assert.match(await history(), /SECRET_FILE/); await t.change(r.fileId, 'visibility', { visibility: 'restricted' }); assert.doesNotMatch(await history(), /SECRET_FILE/);
  await t.change(r.fileId, 'visibility', { visibility: 'internal' }); run(t.raw, "UPDATE deliverables SET visibility='restricted' WHERE id=?", t.deliverableId); assert.doesNotMatch(await history(), /SECRET_FILE/);
});
