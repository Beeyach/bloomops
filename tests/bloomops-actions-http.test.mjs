import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_actions.mjs';
import { APP_URL, run } from './_bloomops-db.mjs';
const paths = { list: 'actions', project: 'projects/[id]/actions', item: 'actions/[actionId]', status: 'actions/[actionId]/transition', dependencies: 'actions/[actionId]/dependencies', remove: 'actions/[actionId]/dependencies/[dependencyId]' };
async function http() {
  const t = await setup({ auth: true }); t.actionId = (await t.addAction({ assigneeMembershipId: 'm-sam' })).actionId;
  t.targetId = (await t.addAction({ title: 'Prerequisite' })).actionId;
  const cookies = {};
  t.call = async (key, method = 'GET', { user = 'ellen', body = {}, raw, params = {}, query = '', origin = APP_URL } = {}) => {
    if (user && !cookies[user]) cookies[user] = (await t.signIn(`${user}@example.com`)).cookie;
    globalThis[Symbol.for('__cloudflare-context__')] = { env: t.env, cf: {}, ctx: {} };
    const route = await import(`../app/api/bloomops/${paths[key]}/route.js`);
    return route[method](new Request(`${APP_URL}/api/bloomops/${paths[key]}${query}`, { method,
      headers: { ...(user ? { cookie: cookies[user] } : {}), origin, 'content-type': 'application/json' },
      ...method === 'GET' ? {} : { body: raw ?? JSON.stringify(body) } }),
    { params: Promise.resolve({ id: t.projectId, actionId: t.actionId, dependencyId: 'guessed', ...params }) });
  };
  return t;
}

const endpoints = [['list', 'GET'], ['project', 'GET'], ['project', 'POST'], ['item', 'GET'], ['item', 'PATCH'], ['status', 'POST'], ['dependencies', 'GET'], ['dependencies', 'POST'], ['remove', 'DELETE']];
for (const [key, method] of endpoints) test(`${key} ${method} requires real identity, no-store and mutation Origin`, async () => {
  const t = await http(), response = await t.call(key, method, { user: null }); assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'no-store');
  if (method !== 'GET') assert.equal((await t.call(key, method, { origin: 'https://evil.example' })).status, 403);
});

for (const [key, method] of endpoints.filter(([, method]) => method !== 'GET')) test(`${key} ${method} rejects malformed JSON, non-objects and unsupported authority/lifecycle fields`, async () => {
  const t = await http(), before = t.actionSnapshot();
  for (const raw of ['{', 'null', '[]', 'false', '123', '"text"']) { const r = await t.call(key, method, { raw }); assert.equal(r.status, 400); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.doesNotMatch(await r.text(), /SQL|stack|constraint/); }
  for (const field of ['workspaceId', 'projectId', 'clientId', 'serviceEngagementId', 'departmentId', 'actorMembershipId', 'status', 'completedAt', 'revision', 'creationRequestId', 'dependencyBlocked']) assert.equal((await t.call(key, method, { body: { [field]: 'forged' } })).status, 400, field);
  assert.deepEqual(t.actionSnapshot(), before);
});

test('Action DTO is allowlisted and Clients receive no Actions, graph or counts', async () => {
  const t = await http(), response = await t.call('item'), dto = (await response.json()).action;
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(dto).sort(), ['id', 'title', 'description', 'status', 'priority', 'assigneeMembershipId', 'assigneeName', 'assigneeActive', 'dueDate', 'waitingType', 'waitingReason', 'visibility', 'revision', 'completedAt', 'createdAt', 'updatedAt', 'projectId', 'projectName', 'clientId', 'clientName', 'serviceEngagementId', 'serviceName', 'departmentId', 'departmentName', 'dependencyBlocked', 'milestoneId', 'milestoneName', 'projectHref', 'overdue'].sort());
  for (const [key, method] of endpoints) { const r = await t.call(key, method, { user: 'james' }); assert.equal(r.status, key === 'list' ? 403 : 404); assert.doesNotMatch(await r.text(), /Prerequisite|landing page|count|dependencyBlocked/); }
});

test('cross-workspace, unassigned and guessed Action ids have identical no-store 404s', async () => {
  const t = await http(), bodies = [];
  for (const [user, params] of [['foreign', {}], ['other', {}], ['sam', { actionId: t.targetId }], ['sam', { actionId: 'guessed' }]]) {
    const r = await t.call('item', 'GET', { user, params }); assert.equal(r.status, 404); assert.equal(r.headers.get('cache-control'), 'no-store'); bodies.push(await r.text());
  }
  assert.equal(new Set(bodies).size, 1);
});

test('Team Action-only HTTP progresses own work but cannot change structural fields or dependencies', async () => {
  const t = await http(); assert.equal((await t.call('item', 'GET', { user: 'sam' })).status, 200);
  assert.equal((await t.call('project', 'GET', { user: 'sam' })).status, 404);
  for (const [key, method] of [['item', 'PATCH'], ['dependencies', 'POST'], ['remove', 'DELETE']]) assert.equal((await t.call(key, method, { user: 'sam' })).status, 403);
  const body = { toStatus: 'waiting', waitingType: 'ellen', waitingReason: 'Ellen\nReview the brief', expectedRevision: 1 };
  assert.equal((await t.call('status', 'POST', { user: 'sam', body })).status, 200);
  assert.ok(await t.call('status', 'POST', { user: 'sam', body }).then(r => r.json()).then(r => r.unchanged));
});

for (const change of ['membership', 'workspace', 'role', 'assignment', 'project_scope', 'visibility']) test(`issued Team session rechecks ${change} on every Action request`, async () => {
  const t = await http();
  if (['project_scope', 'visibility'].includes(change)) { await t.editAction(t.actionId, { assigneeMembershipId: null }); run(t.raw, "INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')"); }
  assert.equal((await t.call('item', 'GET', { user: 'sam' })).status, 200);
  const changes = { membership: "UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'", workspace: "UPDATE workspaces SET status='suspended' WHERE id='a'", role: "UPDATE workspace_memberships SET role='client' WHERE id='m-sam'", assignment: `UPDATE actions SET assignee_membership_id='m-other' WHERE id='${t.actionId}'`, project_scope: "DELETE FROM client_assignments WHERE membership_id='m-sam'", visibility: `UPDATE actions SET visibility='restricted' WHERE id='${t.actionId}'` };
  run(t.raw, changes[change]); const r = await t.call('item', 'GET', { user: 'sam' }); assert.equal(r.status, ['membership', 'workspace'].includes(change) ? 403 : 404); assert.equal(r.headers.get('cache-control'), 'no-store');
});

for (const operation of ['create', 'edit', 'status', 'dependency_add', 'dependency_remove']) test(`HTTP Action ${operation} failure is sanitized and atomic`, async () => {
  const t = await http(); let dependencyId;
  if (operation === 'dependency_remove') { await t.depend(t.actionId, t.targetId); dependencyId = (await t.dependencies(t.actionId)).items[0].id; }
  const before = t.actionSnapshot(), revision = (await t.action(t.actionId)).revision;
  run(t.raw, "CREATE TRIGGER fail_http_action BEFORE INSERT ON activity_events WHEN NEW.subject_type='action' BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL INTERNAL_ID constraint'); END");
  const args = { create: ['project', 'POST', { body: { title: 'New', requestId: crypto.randomUUID() } }], edit: ['item', 'PATCH', { body: { title: 'New', expectedRevision: revision } }],
    status: ['status', 'POST', { body: { toStatus: 'in_progress', expectedRevision: revision } }], dependency_add: ['dependencies', 'POST', { body: { dependsOnActionId: t.targetId, expectedRevision: revision } }], dependency_remove: ['remove', 'DELETE', { params: { dependencyId }, body: { expectedRevision: revision } }] }[operation];
  const r = await t.call(...args); assert.equal(r.status, 500); assert.equal(r.headers.get('cache-control'), 'no-store'); assert.doesNotMatch(await r.text(), /PRIVATE|SQL|INTERNAL|constraint|stack/); assert.deepEqual(t.actionSnapshot(), before);
});

test('HTTP retries converge, stale writes and cycles are safe 409s, and filters reject invalid or duplicate parameters', async () => {
  const t = await http(), body = { title: 'Retryable', requestId: crypto.randomUUID() };
  const first = await t.call('project', 'POST', { body }), second = await t.call('project', 'POST', { body });
  assert.equal(first.status, 201); assert.equal(second.status, 201); assert.equal((await first.json()).actionId, (await second.json()).actionId);
  const dependency = { dependsOnActionId: t.targetId, expectedRevision: 1 };
  assert.equal((await t.call('dependencies', 'POST', { body: dependency })).status, 200);
  assert.ok(await t.call('dependencies', 'POST', { body: dependency }).then(r => r.json()).then(r => r.unchanged));
  const cycle = await t.call('dependencies', 'POST', { params: { actionId: t.targetId }, body: { dependsOnActionId: t.actionId, expectedRevision: 1 } });
  assert.equal(cycle.status, 409); assert.doesNotMatch(await cycle.text(), /SQL|landing page|Prerequisite|action_id/);
  assert.equal((await t.call('item', 'PATCH', { body: { title: 'Stale', expectedRevision: 1 } })).status, 409);
  for (const query of ['?view=invalid', '?page=-1', '?view=all&workspaceId=b', '?view=all&view=mine', '?status=blocked']) assert.equal((await t.call('list', 'GET', { query })).status, 400);
  const list = await t.call('list', 'GET', { query: '?view=all&priority=normal' }); assert.equal(list.status, 200); assert.equal((await list.json()).items.length, 3);
});
