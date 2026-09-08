import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_files.mjs';
import { APP_URL, run, one } from './_bloomops-db.mjs';
import { FILE_MAX_BYTES, FILE_METADATA_HEADER } from '../lib/bloomops/file-values.mjs';
import { readFileUpload } from '../lib/bloomops/file-api.mjs';

const paths = { list: 'projects/[id]/files', item: 'files/[fileId]', retry: 'files/[fileId]/retry', download: 'files/[fileId]/download', portal: 'portal/projects/[id]/files', portalItem: 'portal/files/[fileId]' };
async function http() {
  const t = await setup({ auth: true }); t.fileId = (await t.upload({ visibility: 'client', deliverableId: t.deliverableId })).fileId;
  const cookies = {};
  t.call = async (key, method = 'GET', { user = 'ellen', body = {}, raw, params = {}, origin = APP_URL, headers = {}, input } = {}) => {
    if (user && !cookies[user]) cookies[user] = (await t.signIn(`${user}@example.com`)).cookie;
    globalThis[Symbol.for('__cloudflare-context__')] = { env: t.env, cf: {}, ctx: {} };
    const upload = (key === 'list' || key === 'retry') && method === 'POST';
    const meta = input || (key === 'retry' ? { filename: 'handoff.txt', mimeType: 'text/plain', byteSize: t.bytes.length } : t.input());
    const route = await import(`../app/api/bloomops/${paths[key]}/route.js`);
    return route[method](new Request(`${APP_URL}/api/bloomops/${paths[key]}`, { method,
      headers: { ...(user ? { cookie: cookies[user] } : {}), origin, 'content-type': upload ? 'application/octet-stream' : 'application/json', ...(upload ? { [FILE_METADATA_HEADER]: encodeURIComponent(JSON.stringify(meta)) } : {}), ...headers },
      ...(method === 'GET' ? {} : { body: raw ?? (upload ? t.bytes : JSON.stringify(body)) }) }), { params: Promise.resolve({ id: t.projectId, fileId: t.fileId, ...params }) });
  }; return t;
}
for (const [key, method] of [['list', 'GET'], ['list', 'POST'], ['item', 'GET'], ['item', 'PATCH'], ['retry', 'POST'], ['download', 'GET'], ['portal', 'GET'], ['portalItem', 'GET']]) test(`${key} ${method} requires session identity, no-store and mutation Origin protection`, async () => {
  const t = await http(), r = await t.call(key, method, { user: null }); assert.equal(r.status, 401); assert.match(r.headers.get('cache-control'), /no-store/);
  if (method !== 'GET') assert.equal((await t.call(key, method, { origin: 'https://evil.example' })).status, 403);
});
test('Client metadata/download uses allowlists and protected attachment headers', async () => {
  const t = await http(), list = await t.call('portal', 'GET', { user: 'james' }); assert.equal(list.status, 200);
  const dto = await list.json(); assert.deepEqual(Object.keys(dto.items[0]).sort(), ['attachmentLabel', 'byteSize', 'filename', 'id', 'mimeType', 'readyAt']);
  for (const [key, method] of [['item', 'GET'], ['item', 'PATCH'], ['retry', 'POST'], ['list', 'GET'], ['list', 'POST']]) assert.equal((await t.call(key, method, { user: 'james' })).status, 404);
  const download = await t.call('download', 'GET', { user: 'james' }); assert.equal(download.status, 200); assert.equal(await download.text(), 'BloomOps handoff');
  assert.equal(download.headers.get('content-type'), 'text/plain'); assert.equal(download.headers.get('content-length'), String(t.bytes.length));
  assert.equal(download.headers.get('cache-control'), 'private, no-store'); assert.equal(download.headers.get('x-content-type-options'), 'nosniff'); assert.match(download.headers.get('content-disposition'), /^attachment; filename=/);
  assert.equal(download.headers.get('cross-origin-resource-policy'), 'same-origin'); assert.doesNotMatch(JSON.stringify([...download.headers]), /bloomops-files|objectKey|sha256|bucket|uploader/);
});
test('guessed/foreign/hidden/non-ready/missing-object downloads are identical no-store 404s', async () => {
  const t = await http(), hidden = (await t.upload({ visibility: 'restricted' })).fileId, archived = (await t.upload({ visibility: 'client' })).fileId;
  await t.change(archived, 'archive'); t.bucket.beforePut = () => { throw new Error('fail'); }; await t.upload({ visibility: 'client' }); t.bucket.beforePut = null;
  const failed = one(t.raw, "SELECT id FROM assets WHERE status='failed'").id, answers = [];
  for (const [user, fileId] of [['foreign', t.fileId], ['lawrence', t.fileId], ['james', hidden], ['james', archived], ['james', failed], ['james', 'unknown'], ['james', 'dev-mail/secrets'], ['james', t.stored(t.fileId).object_key]]) {
    const r = await t.call('download', 'GET', { user, params: { fileId } }); assert.equal(r.status, 404); assert.match(r.headers.get('cache-control'), /no-store/); answers.push(await r.text());
  }
  t.bucket.objects.delete(t.stored(t.fileId).object_key); const missing = await t.call('download', 'GET', { user: 'james' }); assert.equal(missing.status, 404); answers.push(await missing.text());
  assert.equal(new Set(answers).size, 1);
});
for (const key of ['list', 'retry']) test(`${key} rejects malformed, non-object and forbidden metadata without mutation`, async () => {
  const t = await http(), before = t.snapshot();
  for (const header of ['{', 'null', '[]', 'false', '123', '"text"', '%garbled', 'x'.repeat(4097)]) {
    const r = await t.call(key, 'POST', { headers: { [FILE_METADATA_HEADER]: header } }); assert.equal(r.status, 400); assert.match(r.headers.get('cache-control'), /no-store/);
  }
  for (const field of ['workspaceId', 'objectKey', 'bucket', 'projectId', 'clientId', 'uploaderMembershipId', 'status', 'etag', 'sha256', 'readyAt', 'subjectType', 'purpose', 'links']) {
    const input = { ...t.input(), [field]: 'forged' }; if (key === 'retry') { delete input.requestId; delete input.visibility; }
    const r = await t.call(key, 'POST', { input }); assert.equal(r.status, 400, field);
  }
  for (const field of ['mimeType', 'byteSize']) {
    const input = { ...t.input(), [field]: { toString: 'not a function', valueOf: 'not a function' } };
    if (key === 'retry') { delete input.requestId; delete input.visibility; }
    const r = await t.call(key, 'POST', { input }); assert.equal(r.status, 400, `${field} must be rejected without coercion`);
    assert.match(r.headers.get('cache-control'), /no-store/);
  }
  assert.deepEqual(t.snapshot(), before);
});
test('actual body is bounded independently of supplied lengths; invalid encodings and content types are refused', async () => {
  const t = await http(), before = t.snapshot();
  for (const headers of [{ 'content-length': '1' }, { 'content-length': '-1' }, { 'content-length': 'nonsense' }, { 'content-encoding': 'gzip' }, { 'content-type': 'multipart/form-data' }, { 'content-type': 'text/html' }]) assert.equal((await t.call('list', 'POST', { headers })).status, 400);
  assert.equal((await t.call('list', 'POST', { headers: { 'content-length': String(FILE_MAX_BYTES + 1) } })).status, 413);
  assert.equal((await t.call('list', 'POST', { input: t.input({ byteSize: FILE_MAX_BYTES + 1 }) })).status, 413);
  for (const bytes of [new Uint8Array(1), new Uint8Array(t.bytes.length + 1)]) assert.equal((await t.call('list', 'POST', { raw: bytes })).status, 400);
  let cancelled = false, pulls = 0;
  const req = new Request(APP_URL, { method: 'POST', duplex: 'half', headers: { 'content-type': 'application/octet-stream', [FILE_METADATA_HEADER]: encodeURIComponent(JSON.stringify(t.input({ byteSize: FILE_MAX_BYTES }))) },
    body: new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(FILE_MAX_BYTES + 1)); }, cancel() { cancelled = true; } }) });
  assert.equal((await readFileUpload(req)).response.status, 413); assert.ok(cancelled); assert.ok(pulls <= 2); assert.deepEqual(t.snapshot(), before);
});
test('body stream read failure and exact positive maximum are handled without unbounded buffering', async () => {
  const t = await setup();
  const request = body => new Request(APP_URL, { method: 'POST', duplex: 'half', headers: { 'content-type': 'application/octet-stream', [FILE_METADATA_HEADER]: encodeURIComponent(JSON.stringify(t.input({ byteSize: FILE_MAX_BYTES }))) }, body });
  const broken = request(new ReadableStream({ pull() { throw new Error('stream broke'); } })); assert.equal((await readFileUpload(broken)).response.status, 400);
  const max = await readFileUpload(request(new Uint8Array(FILE_MAX_BYTES))); assert.equal(max.bytes.length, FILE_MAX_BYTES);
});
for (const kind of ['reserve', 'finalize', 'put', 'get', 'delete']) test(`HTTP ${kind} failure is sanitized and never serves incomplete bytes`, async () => {
  const t = await http();
  if (kind === 'reserve') run(t.raw, "CREATE TRIGGER fail BEFORE INSERT ON assets BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL constraint'); END");
  if (kind === 'finalize') run(t.raw, "CREATE TRIGGER fail BEFORE UPDATE ON assets WHEN NEW.status='ready' BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL constraint'); END");
  if (['put', 'delete'].includes(kind)) t.bucket.afterPut = () => { throw new Error('PRIVATE_R2 bucket'); };
  if (kind === 'delete') t.bucket.beforeDelete = () => { throw new Error('PRIVATE_DELETE bucket'); };
  if (kind === 'get') t.bucket.beforeGet = () => { throw new Error('PRIVATE_GET bucket'); };
  const r = await t.call(kind === 'get' ? 'download' : 'list', kind === 'get' ? 'GET' : 'POST'); assert.equal(r.status, 500); assert.match(r.headers.get('cache-control'), /no-store/); assert.doesNotMatch(await r.text(), /PRIVATE|SQL|bucket|constraint|stack|objectKey/);
});
for (const change of ['membership', 'role', 'contact', 'project', 'deliverable', 'file']) test(`issued Client session loses metadata and bytes after ${change} revocation`, async () => {
  const t = await http(); assert.equal((await t.call('portalItem', 'GET', { user: 'james' })).status, 200);
  const q = { membership: "UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'", role: "UPDATE workspace_memberships SET role='team_member' WHERE id='m-james'", contact: "UPDATE client_contacts SET user_id=NULL WHERE user_id='james'", project: "UPDATE projects SET visibility='internal'", deliverable: "UPDATE deliverables SET visibility='internal'", file: "UPDATE assets SET visibility='restricted'" }[change]; run(t.raw, q);
  for (const route of ['portalItem', 'download']) assert.equal((await t.call(route, 'GET', { user: 'james' })).status, change === 'membership' ? 403 : 404);
});
test('HTTP upload retries converge, incompatible bytes conflict and Team writes are denied', async () => {
  const t = await http(), input = t.input(), a = await t.call('list', 'POST', { input }), b = await t.call('list', 'POST', { input }); assert.equal(a.status, 201); assert.equal(b.status, 201); assert.equal((await a.json()).fileId, (await b.json()).fileId);
  assert.equal((await t.call('list', 'POST', { input, raw: new Uint8Array(t.bytes.length) })).status, 409);
  t.assign(); assert.equal((await t.call('item', 'GET', { user: 'sam' })).status, 200);
  for (const [route, method] of [['list', 'POST'], ['item', 'PATCH'], ['retry', 'POST']]) assert.equal((await t.call(route, method, { user: 'sam' })).status, 403);
});
test('metadata edits reject malformed JSON, forbidden authority and unsupported relinking', async () => {
  const t = await http(), before = t.snapshot();
  for (const raw of ['{', 'null', '[]', 'true', '2']) assert.equal((await t.call('item', 'PATCH', { raw })).status, 400);
  for (const field of ['objectKey', 'workspaceId', 'filename', 'projectId', 'deliverableId', 'status', 'byteSize', 'links']) assert.equal((await t.call('item', 'PATCH', { body: { [field]: 'bad' } })).status, 400);
  assert.equal((await t.call('item', 'PATCH', { body: { operation: 'archive', expectedRevision: 2, visibility: 'client' } })).status, 400); assert.deepEqual(t.snapshot(), before);
});
