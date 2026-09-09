import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-files.mjs';
import { all, run } from './_bloomops-db.mjs';
import { recordingRequests } from '../lib/bloomops/content-files.mjs';

test('Content recording uses canonical B5 storage and leaves Content and platform facts unchanged', async () => {
  const t = await setup(), before = t.snapshot();
  const result = await t.upload({ visibility: 'client' }); assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(t.stored(result.fileId).status, 'ready'); assert.equal(t.fileEvents(result.fileId).length, 1);
  assert.equal(all(t.raw, 'SELECT * FROM asset_links').length, 0);
  assert.equal(all(t.raw, 'SELECT * FROM content_asset_links').length, 1);
  assert.deepEqual(t.snapshot().slice(0, 1), before.slice(0, 1));
  assert.deepEqual(new Uint8Array(await new Response((await t.download(result.fileId)).body).arrayBuffer()), t.bytes);
});
test('eligible Client uploads only recording with server-selected visibility and safe metadata', async () => {
  const t = await setup(), actor = await t.actor('james');
  const requests = await recordingRequests(t.db, actor); assert.equal(requests.length, 1); assert.deepEqual(Object.keys(requests[0]).sort(), ['id', 'title']);
  const result = await t.upload({}, { actor, portal: true }); assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(t.stored(result.fileId).visibility, 'client');
  assert.deepEqual(Object.keys((await t.files(actor, { portal: true })).items[0]).sort(), ['byteSize', 'filename', 'id', 'mimeType', 'readyAt', 'status']);
  for (const input of [{ purpose: 'asset' }, { visibility: 'client' }, { objectKey: 'forged' }, { sha256: 'forged' }]) assert.equal((await t.upload(input, { actor, portal: true })).reason, 'invalid');
  assert.equal(t.stored(result.fileId).revision, 2);
  assert.equal((await t.item(t.contentId)).stage, 'waiting_for_recording');
});
test('identical response-loss retry converges while altered purpose/details and bytes conflict', async () => {
  const t = await setup(), requestId = crypto.randomUUID(), first = await t.upload({ requestId });
  assert.equal(first.ok, true); const stored = t.stored(first.fileId);
  assert.deepEqual(await t.upload({ requestId }), { ok: true, fileId: first.fileId, unchanged: true });
  for (const change of [{ purpose: 'asset' }, { filename: 'other.mp4' }, { mimeType: 'application/octet-stream' }, { visibility: 'client' }]) assert.equal((await t.upload({ requestId, ...change })).reason, 'conflict');
  assert.equal((await t.upload({ requestId }, { bytes: new Uint8Array(t.bytes.length) })).reason, 'conflict');
  assert.deepEqual(t.stored(first.fileId), stored); assert.equal(t.fileEvents(first.fileId).length, 1);
});
test('same request cannot attach to another accessible Content; parent identity and platform/date facts stay fixed', async () => {
  const t = await setup(), requestId = crypto.randomUUID(), first = await t.upload({ requestId });
  const second = (await t.add({ title: 'Another idea', platforms: ['Instagram'], targetPublishDate: '2026-09-09' })).contentId;
  const before = all(t.raw, 'SELECT * FROM content_items');
  assert.equal((await t.upload({ requestId }, { contentId: second })).reason, 'conflict');
  assert.equal(all(t.raw, 'SELECT * FROM content_asset_links').length, 1); assert.equal(t.fileEvents(first.fileId).length, 1);
  assert.deepEqual(all(t.raw, 'SELECT * FROM content_items'), before);
});
test('metadata, request projection and C3 calendar never probe R2; hidden requests never create overflow', async () => {
  const t = await setup(), actor = await t.actor('james'); await t.upload({ visibility: 'client' });
  const before = t.bucket.calls.length;
  await t.files(); await t.files(actor, { portal: true }); await recordingRequests(t.db, actor);
  const { contentCalendar } = await import('../lib/bloomops/content-calendar.mjs'); await contentCalendar(t.db, t.owner, { start: '2026-09-01', end: '2026-09-30' });
  assert.equal(t.bucket.calls.length, before);
  for (let n = 0; n < 205; n++) run(t.raw, "INSERT INTO content_items(id,workspace_id,client_id,creation_request_id,title,type,visibility,recording_required,stage) VALUES(?,'a','lawrence',?,'Hidden','reel','client',1,'waiting_for_recording')", `hidden-${n}`, crypto.randomUUID());
  assert.equal((await recordingRequests(t.db, actor)).length, 1);
  run(t.raw, "UPDATE content_items SET client_id=client_id WHERE id=?", t.contentId);
  assert.equal(t.bucket.calls.length, before);
});
