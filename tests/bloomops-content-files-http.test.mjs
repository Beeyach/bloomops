import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-files.mjs';
import { APP_URL, run, all } from './_bloomops-db.mjs';
import { FILE_METADATA_HEADER, FILE_MAX_BYTES } from '../lib/bloomops/file-values.mjs';

const paths = { list: 'content/[contentId]/files', item: 'content/[contentId]/files/[fileId]', retry: 'content/[contentId]/files/[fileId]/retry',
  portal: 'portal/recordings/[contentId]/files', portalRetry: 'portal/recordings/[contentId]/files/[fileId]/retry', download: 'files/[fileId]/download', b5: 'files/[fileId]' };
async function http() {
  const t = await setup({ auth: true }), cookies = {};
  t.fileId = (await t.upload({ visibility: 'client' })).fileId;
  t.call = async (key, method = 'GET', { user = 'ellen', body = {}, raw, input, params = {}, origin = APP_URL, headers = {}, query = '' } = {}) => {
    if (user && !cookies[user]) cookies[user] = (await t.signIn(`${user}@example.com`)).cookie;
    globalThis[Symbol.for('__cloudflare-context__')] = { env: t.env, cf: {}, ctx: {} };
    const upload = method === 'POST', retry = /retry/i.test(key);
    const meta = input || (retry ? { filename: 'recording.mp4', mimeType: 'video/mp4', byteSize: t.bytes.length } : t.input());
    const route = await import(`../app/api/bloomops/${paths[key]}/route.js`);
    return route[method](new Request(`${APP_URL}/api/bloomops/${paths[key]}${query}`, { method,
      headers: { ...user ? { cookie: cookies[user] } : {}, origin, 'content-type': upload ? 'application/octet-stream' : 'application/json',
        ...upload ? { [FILE_METADATA_HEADER]: encodeURIComponent(JSON.stringify(meta)) } : {}, ...headers },
      ...method === 'GET' ? {} : { body: raw ?? (upload ? t.bytes : JSON.stringify(body)) } }), { params: Promise.resolve({ contentId: t.contentId, fileId: t.fileId, ...params }) });
  }; return t;
}
for (const [key, method] of [['list','GET'], ['list','POST'], ['item','PATCH'], ['retry','POST'], ['portal','GET'], ['portal','POST'], ['portalRetry','POST'], ['download','GET']]) test(`${key} ${method}: session, Origin, query and hidden parent checks precede body parsing`, async () => {
  const t = await http();
  const unauth = await t.call(key, method, { user: null }); assert.equal(unauth.status, 401); assert.match(unauth.headers.get('cache-control'), /no-store/);
  const user = key.startsWith('portal') ? 'james' : 'ellen';
  if (method !== 'GET') assert.equal((await t.call(key, method, { user, origin: 'https://evil.example' })).status, 403);
  const denied = await t.call(key, method, { user: 'foreign', raw: '{', params: { contentId: 'hidden', fileId: 'hidden' } }); assert.equal(denied.status, 404);
  // Portal retry of an internal uploader is not authorized, even with a valid ID.
  if (key !== 'portalRetry') assert.equal((await t.call(key, method, { user, query: '?unknown=1' })).status, 400);
});
test('portal uploads, own retry and opaque shared download use exact allowlists and private attachment headers', async () => {
  const t = await http(), input = t.input(), created = await t.call('portal', 'POST', { user: 'james', input });
  assert.equal(created.status, 201); const id = (await created.json()).fileId;
  assert.equal((await t.call('portalRetry', 'POST', { user: 'james', params: { fileId: id } })).status, 200);
  const response = await t.call('portal', 'GET', { user: 'james' }), dto = await response.json();
  assert.equal(dto.items.length, 2); for (const item of dto.items) assert.deepEqual(Object.keys(item).sort(), ['byteSize','filename','id','mimeType','readyAt','status']);
  assert.doesNotMatch(JSON.stringify(dto), /PRIVATE|revision|visibility|purpose|sha256|objectKey|lease|uploader|service/);
  const bytes = await t.call('download', 'GET', { user: 'james', params: { fileId: id } }); assert.equal(bytes.status, 200);
  assert.deepEqual(new Uint8Array(await bytes.arrayBuffer()), t.bytes); assert.equal(bytes.headers.get('cache-control'), 'private, no-store');
  assert.match(bytes.headers.get('content-disposition'), /^attachment;/); assert.equal(bytes.headers.get('x-content-type-options'), 'nosniff'); assert.match(bytes.headers.get('content-security-policy'), /sandbox/);
  for (const [key, method] of [['list','GET'],['list','POST'],['item','PATCH'],['retry','POST'],['b5','PATCH']]) assert.equal((await t.call(key, method, { user: 'james' })).status, 404);
});
for (const key of ['list', 'portal', 'retry', 'portalRetry']) test(`${key} exact metadata rejects storage authority, malformed and oversized bodies`, async () => {
  const t = await http(), portal = key.startsWith('portal'), retry = /retry/i.test(key), user = portal ? 'james' : 'ellen';
  if (key === 'portalRetry') t.fileId = (await (await t.call('portal', 'POST', { user })).json()).fileId;
  const original = retry ? { filename: 'recording.mp4', mimeType: 'video/mp4', byteSize: t.bytes.length } : t.input();
  const before = all(t.raw, 'SELECT * FROM assets');
  for (const header of ['null','[]','false','1','{','%bad','x'.repeat(4097)]) assert.equal((await t.call(key, 'POST', { user, headers: { [FILE_METADATA_HEADER]: header } })).status, 400);
  for (const field of ['workspaceId','contentId','projectId','deliverableId','objectKey','sha256','status','uploaderMembershipId', ...portal ? ['visibility'] : [], ...retry ? ['purpose','requestId'] : []])
    assert.equal((await t.call(key, 'POST', { user, input: { ...original, [field]: 'forged' } })).status, 400, field);
  for (const change of [{ filename: 'a\r\nX:y' }, { filename: '../x' }, { mimeType: {} }, { byteSize: {} }, { byteSize: 0 }])
    assert.equal((await t.call(key, 'POST', { user, input: { ...original, ...change } })).status, 400);
  assert.equal((await t.call(key, 'POST', { user, input: { ...original, byteSize: FILE_MAX_BYTES + 1 } })).status, 413);
  for (const raw of [new Uint8Array(1), new Uint8Array(t.bytes.length + 1)]) assert.equal((await t.call(key, 'POST', { user, input: original, raw })).status, 400);
  assert.deepEqual(all(t.raw, 'SELECT * FROM assets'), before);
});
for (const boundary of ['put', 'get', 'head']) for (const [kind, sql] of Object.entries({ contact: "UPDATE client_contacts SET user_id=NULL WHERE user_id='james'", stage: "UPDATE content_items SET stage='editing',stage_context=NULL", file: "UPDATE assets SET visibility='internal'", membership: "UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'" })) test(`issued Client session: ${kind} revoked during R2 ${boundary} never returns success bytes`, async () => {
  const t = await http(), input = t.input();
  const response = await t.call('portal', 'POST', { user: 'james', input }); assert.equal(response.status, 201); const fileId = (await response.json()).fileId;
  t.bucket[boundary === 'put' ? 'afterPut' : boundary === 'get' ? 'beforeGet' : 'beforeHead'] = () => run(t.raw, sql);
  const r = await t.call(boundary === 'get' ? 'download' : 'portal', boundary === 'get' ? 'GET' : 'POST', { user: 'james', input: boundary === 'head' ? input : t.input(), params: { fileId } });
  assert.equal(r.status, 404); assert.match(r.headers.get('cache-control'), /no-store/); assert.doesNotMatch(await r.text(), /PRIVATE|SQL|stack|bucket/);
});
test('Team can mutate only Content family with current assignment; B5 route remains inaccessible', async () => {
  const t = await http(); run(t.raw, "INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','social-service','m-sam')");
  assert.equal((await t.call('list','POST',{user:'sam'})).status,201);
  assert.equal((await t.call('item','PATCH',{user:'sam',body:{operation:'visibility',visibility:'internal',expectedRevision:2}})).status,200);
  assert.equal((await t.call('b5','PATCH',{user:'sam',body:{operation:'archive',expectedRevision:3}})).status,404);
  run(t.raw, "DELETE FROM service_assignments WHERE membership_id='m-sam'"); assert.equal((await t.call('retry','POST',{user:'sam'})).status,404);
});
