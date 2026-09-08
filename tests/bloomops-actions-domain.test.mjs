import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_actions.mjs';
import { run } from './_bloomops-db.mjs';
import { transitionAction, updateAction } from '../lib/bloomops/actions.mjs';
import { ACTION_STATUSES, ACTION_TRANSITIONS } from '../lib/bloomops/action-values.mjs';

const lifecycle = {
  to_do: ['in_progress', 'waiting', 'cancelled'],
  in_progress: ['waiting', 'review', 'done', 'cancelled'],
  waiting: ['in_progress', 'review', 'done', 'cancelled'],
  review: ['in_progress', 'done', 'cancelled'], done: [], cancelled: [],
};

test('Actions start To Do / Normal, derive context and keep parent lifecycles independent', async () => {
  const t = await setup(), milestone = await t.add(), parents = t.allParents();
  const result = await t.addAction({ milestoneId: milestone.milestoneId, assigneeMembershipId: 'm-sam' });
  assert.ok(result.ok);
  const action = await t.action(result.actionId);
  assert.equal(action.title, 'Build the landing page'); assert.equal(action.status, 'to_do'); assert.equal(action.priority, 'normal');
  assert.equal(action.assigneeName, 'sam'); assert.equal(action.clientName, 'james'); assert.equal(action.serviceName, 'systems');
  assert.equal(action.dependencyBlocked, false); assert.equal(action.milestoneName, 'Discovery');
  assert.deepEqual(t.allParents(), parents);
  const events = t.actionHistory(); assert.equal(events.length, 1); assert.equal(events[0].client_id, 'james'); assert.equal(events[0].service_engagement_id, 'ghl-service');
  assert.deepEqual((await t.actions()).items.map(item => item.id), [result.actionId]);
  assert.deepEqual(ACTION_STATUSES, Object.keys(lifecycle)); assert.deepEqual(ACTION_TRANSITIONS, lifecycle);
});

for (const [field, value] of [['title', ''], ['title', 'x'.repeat(121)], ['title', {}], ['title', 'bad\0title'], ['title', 'two\nlines'],
  ['description', 'x'.repeat(5001)], ['description', []], ['description', 'bad\x7ftext'], ['priority', 'critical'], ['priority', {}],
  ['visibility', 'client'], ['visibility', 'public'], ['status', 'done'], ['completedAt', 'forged'], ['workspaceId', 'b'], ['projectId', 'other'],
  ['clientId', 'lawrence'], ['serviceEngagementId', 'guessed'], ['departmentId', 'social'], ['revision', 42], ['waitingType', 'client'],
  ['dueDate', '2026-02-30'], ['dueDate', {}], ['dueDate', '2026-13-01'], ['assigneeMembershipId', {}], ['milestoneId', []]]) {
  test(`Action create rejects ${field}=${String(value).slice(0, 18)} without a fact or history`, async () => {
    const t = await setup(), before = t.actionSnapshot();
    assert.equal((await t.addAction({ [field]: value })).ok, false); assert.deepEqual(t.actionSnapshot(), before);
  });
}

for (const from of Object.keys(lifecycle)) for (const to of Object.keys(lifecycle)) test(`Action lifecycle ${from} -> ${to}`, async () => {
  const t = await setup(), { actionId: id } = await t.addAction(), parents = t.allParents();
  if (['review', 'done'].includes(from)) await t.progress(id, 'in_progress');
  if (from !== 'to_do') assert.ok((await t.progress(id, from)).ok);
  const before = await t.action(id), count = t.actionHistory().length;
  const result = await t.progress(id, to), allowed = from === to || lifecycle[from].includes(to);
  assert.equal(result.ok, allowed); assert.equal(t.actionHistory().length, count + (allowed && from !== to ? 1 : 0));
  if (!allowed || from === to) assert.deepEqual(await t.action(id), before);
  else assert.equal(Boolean((await t.action(id)).completedAt), to === 'done');
  assert.deepEqual(t.allParents(), parents);
});

test('request keys converge after later edits and inactive assignment, but cannot be reused for different details', async () => {
  const t = await setup(), requestId = crypto.randomUUID(), input = { assigneeMembershipId: 'm-sam', description: 'First line\nSecond line', dueDate: '2028-02-29' };
  const results = await Promise.all([t.addAction(input, { requestId }), t.addAction(input, { requestId })]);
  assert.ok(results.every(r => r.ok)); assert.equal(results[0].actionId, results[1].actionId);
  await t.editAction(results[0].actionId, { title: 'Updated' });
  run(t.raw, "UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'");
  assert.ok((await t.addAction(input, { requestId })).unchanged);
  assert.equal((await t.addAction({ title: 'Reused key' }, { requestId })).reason, 'conflict');
  assert.equal(t.actionHistory('ACTION_CREATED').length, 1);
  assert.notEqual((await t.addAction()).actionId, results[0].actionId);
  for (const key of [null, '', {}, 'guessed']) assert.equal((await t.addAction({}, { requestId: key })).ok, false);
});

test('details and assignment record distinct facts; identical edits and Done retries converge', async () => {
  const t = await setup(), { actionId: id } = await t.addAction();
  const options = { actor: t.owner, actionId: id, expectedRevision: 1, input: { title: 'Updated', priority: 'urgent', assigneeMembershipId: 'm-sam' } };
  assert.ok((await Promise.all([updateAction(t.db, options), updateAction(t.db, options)])).every(r => r.ok));
  assert.equal(t.actionHistory('ACTION_DETAILS_UPDATED').length, 1); assert.equal(t.actionHistory('ACTION_ASSIGNEE_CHANGED').length, 1);
  assert.equal((await t.action(id)).revision, 2);
  assert.equal((await t.editAction(id, { title: 'Stale' }, { expectedRevision: 1 })).reason, 'conflict');
  await t.progress(id, 'in_progress'); const expectedRevision = (await t.action(id)).revision;
  const results = await Promise.all(['2026-09-08T12:00:00Z', '2026-09-08T12:00:00.050Z'].map(at => transitionAction(t.db, { actor: t.owner, actionId: id, toStatus: 'done', expectedRevision, now: new Date(at) })));
  assert.ok(results.every(r => r.ok)); assert.equal(t.actionHistory('ACTION_STATUS_CHANGED').length, 2);
  const completedAt = (await t.action(id)).completedAt;
  assert.ok((await t.progress(id, 'done', { expectedRevision })).unchanged); assert.equal((await t.action(id)).completedAt, completedAt);
  assert.equal((await t.progress(id, 'cancelled')).ok, false);
});

test('competing detail and status writes preserve one winner and one history event', async () => {
  const t = await setup(), { actionId: id } = await t.addAction(), before = t.actionHistory().length;
  const results = await Promise.all([t.editAction(id, { title: 'New' }, { expectedRevision: 1 }), t.progress(id, 'waiting', { expectedRevision: 1 })]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(t.actionHistory().length, before + 1); assert.equal((await t.action(id)).revision, 2);
});

test('Waiting requires the explicit type and multiline explanation; leaving clears both', async () => {
  const t = await setup(), { actionId: id } = await t.addAction();
  for (const waitingType of [null, '', {}, 'customer']) assert.equal((await t.progress(id, 'waiting', { waitingType })).ok, false);
  for (const waitingReason of [null, '', {}, 'x'.repeat(1001), 'bad\0reason']) assert.equal((await t.progress(id, 'waiting', { waitingReason })).ok, false);
  for (const waitingType of ['client', 'ellen', 'ary', 'team', 'external', 'dependency', 'other']) {
    assert.ok((await t.progress(id, 'waiting', { waitingType })).ok);
    assert.equal((await t.action(id)).waitingType, waitingType);
    assert.match((await t.action(id)).waitingReason, /\n/);
    assert.ok((await t.progress(id, 'waiting', { waitingType })).unchanged);
    assert.equal((await t.progress(id, 'waiting', { waitingType, waitingReason: 'Competing change' })).reason, 'conflict');
    await t.progress(id, 'in_progress'); assert.equal((await t.action(id)).waitingType, null); assert.equal((await t.action(id)).waitingReason, null);
  }
});

test('cross-Project or hidden Milestones and foreign/client/inactive assignees fail leak-safely', async () => {
  const t = await setup(), sibling = (await t.create()).projectId;
  const foreignMilestone = (await t.add({}, { projectId: sibling })).milestoneId;
  const hidden = (await t.add({ visibility: 'restricted' })).milestoneId;
  for (const milestoneId of [foreignMilestone, hidden, 'guessed']) assert.equal((await t.addAction({ milestoneId }, { actor: await t.actor('pm') })).reason, 'not_found');
  run(t.raw, "UPDATE workspace_memberships SET status='suspended' WHERE id='m-other'");
  for (const assigneeMembershipId of ['m-foreign', 'm-james', 'm-other', 'guessed']) assert.equal((await t.addAction({ assigneeMembershipId })).reason, 'not_found');
});

for (const operation of ['create', 'edit', 'status', 'assign', 'dependency_add', 'dependency_remove']) test(`Action ${operation} activity failure rolls back all business facts`, async () => {
  const t = await setup(), { actionId: a } = await t.addAction(), { actionId: b } = await t.addAction();
  await t.depend(a, b); const edge = (await t.dependencies(a)).items[0]; await t.removeDependency(a, edge.id);
  if (operation === 'dependency_remove') await t.depend(a, b);
  const currentEdge = (await t.dependencies(a)).items[0], before = t.actionSnapshot();
  run(t.raw, "CREATE TRIGGER fail_b3 BEFORE INSERT ON activity_events WHEN NEW.subject_type='action' BEGIN SELECT RAISE(ABORT,'PRIVATE_SQL activity failure'); END");
  const operations = { create: () => t.addAction(), edit: () => t.editAction(a, { title: 'Failed' }), status: () => t.progress(a, 'waiting'), assign: () => t.editAction(a, { assigneeMembershipId: 'm-sam' }), dependency_add: () => t.depend(a, b), dependency_remove: () => t.removeDependency(a, currentEdge.id) };
  await assert.rejects(operations[operation]); assert.deepEqual(t.actionSnapshot(), before);
});

test('an inactive assignee remains historical responsibility while ordinary edits remain possible', async () => {
  const t = await setup(), { actionId: id } = await t.addAction({ assigneeMembershipId: 'm-sam' });
  run(t.raw, "UPDATE workspace_memberships SET status='removed' WHERE id='m-sam'");
  assert.ok((await t.editAction(id, { title: 'Keep responsibility', assigneeMembershipId: 'm-sam' })).ok);
  assert.equal((await t.action(id)).assigneeMembershipId, 'm-sam'); assert.equal((await t.action(id)).assigneeActive, false);
  assert.ok((await t.editAction(id, { assigneeMembershipId: null })).ok); assert.equal((await t.action(id)).assigneeMembershipId, null);
});

test('Done satisfies dependencies; cancelled stays unresolved and removal preserves status', async () => {
  const t = await setup(), { actionId: a } = await t.addAction(), { actionId: b } = await t.addAction();
  assert.ok((await t.depend(a, b)).ok);
  assert.equal((await t.action(a)).dependencyBlocked, true);
  await t.progress(b, 'cancelled'); assert.equal((await t.action(a)).dependencyBlocked, true);
  const edge = (await t.dependencies(a)).items[0]; assert.equal(edge.actionId, b); assert.equal(edge.satisfied, false);
  assert.ok((await t.removeDependency(a, edge.id)).ok); assert.equal((await t.action(a)).dependencyBlocked, false);
  assert.equal((await t.action(a)).status, 'to_do');
});
