import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './_systems-generation.mjs';
import { APP_URL, all, run } from './_bloomops-db.mjs';
import { addProjectAssignment } from '../lib/bloomops/project-assignments.mjs';
async function http(ctx) {
  const t = await fixture(ctx, { auth: true }), cookies = {};
  t.call = async (endpoint = '', { user = 'ellen', body = {}, raw, origin = APP_URL, projectId = t.projectId, query = '' } = {}) => {
    if (user && !cookies[user]) cookies[user] = (await t.signIn(`${user}@example.com`)).cookie;
    globalThis[Symbol.for('__cloudflare-context__')] = { env: t.env, cf: {}, ctx: {} };
    const route = await import(`../app/api/bloomops/projects/[id]/blueprint${endpoint}/route.js`);
    const method = endpoint ? 'POST' : 'GET';
    return route[method](new Request(`${APP_URL}/api/bloomops/projects/${projectId}/blueprint${endpoint}${query}`, {
      method, headers: { ...(user ? { cookie: cookies[user] } : {}), origin, 'content-type': 'application/json' },
      ...(endpoint ? { body: raw ?? JSON.stringify(body) } : {}),
    }), { params: Promise.resolve({ id: projectId }) });
  };
  return t;
}
for (const endpoint of ['', '/preview', '/generate']) {
  test(`blueprint ${endpoint || 'options'} protects identity, origin, workspace and role`, async ctx => {
    const t = await http(ctx), before = t.state();
    const anon = await t.call(endpoint, { user: null }); assert.equal(anon.status, 401); assert.equal(anon.headers.get('cache-control'), 'no-store');
    if (endpoint) assert.equal((await t.call(endpoint, { origin: 'https://evil.example' })).status, 403);
    const denied = [];
    for (const [user, projectId] of [['james', t.projectId], ['foreign', t.projectId], ['ellen', 'missing']]) {
      const r = await t.call(endpoint, { user, projectId }); assert.equal(r.status, 404); denied.push(await r.text());
    }
    assert.equal(new Set(denied).size, 1);
    await addProjectAssignment(t.db, { actor: t.owner, projectId: t.projectId, membershipId: 'm-sam' });
    assert.equal((await t.call(endpoint, { user: 'sam' })).status, 403);
    assert.deepEqual(t.state().slice(1, -1), before.slice(1, -1));
  });
  test(`blueprint ${endpoint || 'options'} rejects query smuggling and revoked sessions`, async ctx => {
    const t = await http(ctx);
    assert.equal((await t.call(endpoint, { query: '?workspaceId=b', body: t.input })).status, 400);
    await t.call('');
    run(t.raw, "UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'");
    assert.equal((await t.call(endpoint, { body: t.input })).status, 403);
  });
}
for (const endpoint of ['/preview', '/generate']) test(`${endpoint} rejects malformed, non-object and unknown input without writes`, async ctx => {
  const t = await http(ctx), before = t.state();
  for (const raw of ['{', 'null', '[]', 'true', '"text"']) {
    const r = await t.call(endpoint, { raw }); assert.equal(r.status, 400); assert.equal(r.headers.get('cache-control'), 'no-store');
  }
  for (const body of [{ ...t.input, workspaceId: 'b' }, { selectedComponentKeys: ['funnel'], plan: {} }, {}]) assert.equal((await t.call(endpoint, { body })).status, 400);
  assert.deepEqual(t.state(), before);
});
test('options and selected preview are bounded, uncached and read-only', async ctx => {
  const t = await http(ctx), before = t.state();
  const options = await t.call(''); assert.equal(options.status, 200); const dto = await options.json();
  assert.deepEqual(Object.keys(dto).sort(), ['blueprintKey', 'components', 'expected', 'ok']); assert.equal(dto.components.length, 14);
  assert.ok(dto.components.every(c => Object.keys(c).sort().join() === 'key,label'));
  const preview = await t.call('/preview', { body: { selectedComponentKeys: ['email', 'sms'] } });
  assert.equal(preview.status, 200); assert.equal(preview.headers.get('cache-control'), 'no-store');
  const data = await preview.json(); assert.equal(data.plan.milestones.length, 1); assert.equal(data.plan.actions.length, 2); assert.equal(data.plan.deliverables.length, 2);
  assert.deepEqual(t.state(), before);
});
test('HTTP confirmation creates once and exact reordered retry returns the committed result', async ctx => {
  const t = await http(ctx), body = { ...t.input, selectedComponentKeys: ['email', 'sms'] };
  const first = await t.call('/generate', { body }); assert.equal(first.status, 201); const committed = await first.json();
  const state = t.state(), retry = await t.call('/generate', { body: { ...body, selectedComponentKeys: ['sms', 'email'] } });
  assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), { ...committed, replayed: true }); assert.deepEqual(t.state(), state);
  assert.equal((await t.call('/generate', { body: { ...body, requestId: crypto.randomUUID() } })).status, 409);
  assert.equal((await t.call('')).status, 409);
});
test('stale preview and invalid selection refuse generation without writing', async ctx => {
  const t = await http(ctx), before = t.state();
  assert.equal((await t.call('/generate', { body: { ...t.input, expected: { ...t.input.expected, projectRevision: 2 } } })).status, 409);
  assert.equal((await t.call('/preview', { body: { selectedComponentKeys: [] } })).status, 400);
  assert.equal((await t.call('/generate', { body: { ...t.input, selectedComponentKeys: ['unknown'] } })).status, 400);
  assert.deepEqual(t.state(), before);
});
test('restricted PM needs the exact Project assignment for HTTP generation', async ctx => {
  const t = await http(ctx); await t.edit(t.projectId, { visibility: 'restricted' });
  assert.equal((await t.call('', { user: 'pm' })).status, 404);
  await addProjectAssignment(t.db, { actor: t.owner, projectId: t.projectId, membershipId: 'm-pm' });
  const options = await t.call('', { user: 'pm' }); assert.equal(options.status, 200);
  assert.equal((await t.call('/generate', { user: 'pm', body: { ...t.input, expected: (await options.json()).expected } })).status, 201);
});
test('late database failure is safe, uncached and rolls back all work', async ctx => {
  const t = await http(ctx), before = t.state();
  run(t.raw, "CREATE TRIGGER fail_generation_http BEFORE INSERT ON activity_events BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL constraint INTERNAL_ID'); END");
  const response = await t.call('/generate', { body: t.input }); assert.equal(response.status, 500);
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.doesNotMatch(await response.text(), /SQL|constraint|PRIVATE|INTERNAL|stack/);
  assert.deepEqual(t.state(), before);
});
test('generated work starts internal and Client blueprint access is refused', async ctx => {
  const t = await http(ctx); await t.edit(t.projectId, { visibility: 'client', clientLabel: 'Your build' });
  t.input.expected = (await (await t.call('')).json()).expected;
  assert.equal((await t.call('/generate', { body: t.input })).status, 201);
  assert.equal(all(t.raw, "SELECT * FROM actions WHERE visibility!='internal'").length, 0);
  assert.equal((await t.call('/preview', { user: 'james', body: { selectedComponentKeys: ['funnel'] } })).status, 404);
});
