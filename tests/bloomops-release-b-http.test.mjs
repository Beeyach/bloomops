import './_jsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_files.mjs';
import { APP_URL, all } from './_bloomops-db.mjs';
import { createMilestone } from '../lib/bloomops/milestones.mjs';
import { createAction } from '../lib/bloomops/actions.mjs';
import { addProjectAssignment } from '../lib/bloomops/project-assignments.mjs';

async function http(t) {
  const f = await setup({ auth: true });
  t.after(() => f.raw.close());
  const cookies = {};
  f.milestoneId = (await createMilestone(f.db, { actor: f.owner, projectId: f.projectId, requestId: crypto.randomUUID(), input: { name: 'Visible milestone', visibility: 'client' } })).milestoneId;
  f.actionId = (await createAction(f.db, { actor: f.owner, projectId: f.projectId, requestId: crypto.randomUUID(), input: { title: 'Internal Action' } })).actionId;
  f.fileId = (await f.upload({ visibility: 'client' })).fileId;
  f.assignmentId = (await addProjectAssignment(f.db, { actor: f.owner, projectId: f.projectId, membershipId: 'm-sam' })).assignmentId;
  f.call = async (path, method = 'GET', { user = 'ellen', query = '', body, params = {} } = {}) => {
    if (user && !cookies[user]) cookies[user] = (await f.signIn(`${user}@example.com`)).cookie;
    globalThis[Symbol.for('__cloudflare-context__')] = { env: f.env, cf: {}, ctx: {} };
    const route = await import(`../app/api/bloomops/${path}/route.js`);
    return route[method](new Request(`${APP_URL}/api/bloomops/${path}${query}`, { method, headers: { ...(user ? { cookie: cookies[user] } : {}), origin: APP_URL, 'content-type': 'application/json' }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) }),
      { params: Promise.resolve({ id: path.startsWith('clients/') ? 'james' : f.projectId, milestoneId: f.milestoneId, actionId: f.actionId, deliverableId: f.deliverableId, fileId: f.fileId, assignmentId: f.assignmentId, ...params }) });
  };
  return f;
}

for (const [path, method, body] of [
  ['clients/[id]/projects', 'POST', { name: 'Reject entire request' }],
  ['projects/[id]', 'PATCH', { name: 'Reject entire request', expectedRevision: 1 }],
  ['projects/[id]/transition', 'POST', { toStatus: 'ready', expectedRevision: 1 }],
  ['projects/[id]/assignments', 'POST', { membershipId: 'm-other' }],
  ['projects/[id]/assignments/[assignmentId]', 'PATCH', { assignmentRole: 'lead' }],
]) test(`B7 exact Project body: ${method} ${path} refuses unknown fields atomically`, async t => {
  const f = await http(t);
  const snapshot = () => [f.parents(), f.snapshot(), all(f.raw, 'SELECT * FROM project_assignments ORDER BY rowid')];
  const before = snapshot();
  const response = await f.call(path, method, { body: { ...body, workspaceId: 'b', unknown: true } });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(snapshot(), before);
});

const readPaths = [
  'projects', 'clients/[id]/projects', 'projects/[id]', 'projects/[id]/assignments',
  'projects/[id]/milestones', 'projects/[id]/milestones/[milestoneId]',
  'projects/[id]/actions', 'actions/[actionId]', 'actions/[actionId]/dependencies',
  'projects/[id]/deliverables', 'projects/[id]/deliverables/[deliverableId]',
  'projects/[id]/files', 'files/[fileId]', 'files/[fileId]/download',
  'portal/projects', 'portal/projects/[id]', 'portal/projects/[id]/milestones',
  'portal/projects/[id]/milestones/[milestoneId]', 'portal/projects/[id]/deliverables',
  'portal/projects/[id]/deliverables/[deliverableId]', 'portal/projects/[id]/files', 'portal/files/[fileId]',
];
for (const path of readPaths) test(`B7 exact query: ${path} rejects invented filters after authorization`, async t => {
  const f = await http(t), user = path.startsWith('portal/') ? 'james' : 'ellen';
  const good = await f.call(path, 'GET', { user });
  assert.equal(good.status, 200); await good.arrayBuffer();
  const before = f.snapshot();
  const response = await f.call(path, 'GET', { user, query: '?workspaceId=b&unknown=true' });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await response.text(), /SQL|constraint|stack|bloomops-files/);
  assert.equal((await f.call(path, 'GET', { user: null, query: '?unknown=true' })).status, 401);
  assert.deepEqual(f.snapshot(), before);
});
test('B7 Project filters reject duplicates while documented status and Client filters work', async t => {
  const f = await http(t);
  assert.equal((await f.call('projects', 'GET', { query: '?status=planned&clientId=james' })).status, 200);
  assert.equal((await f.call('projects', 'GET', { query: '?status=planned&status=completed' })).status, 400);
});
