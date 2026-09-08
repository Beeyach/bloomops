import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_actions.mjs';
import { run } from './_bloomops-db.mjs';
import { evaluate, loadInternalClientResource } from '../lib/bloomops/authorization.mjs';
import { authorizeAction, actionFilterOptions } from '../lib/bloomops/actions.mjs';
import { projectActivity } from '../lib/bloomops/project-activity.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';

test('Action-only assignment grants minimal context without parent, sibling or Milestone access', async () => {
  const t = await setup(), { milestoneId } = await t.add(), { actionId: id } = await t.addAction({ assigneeMembershipId: 'm-sam', milestoneId });
  await t.addAction({ title: 'SECRET_SIBLING' }); const actor = await t.actor('sam'), action = await t.action(id, actor);
  assert.ok(action); assert.equal(action.projectName, 'Launch the website'); assert.equal(action.projectHref, null); assert.equal(action.milestoneName, null);
  assert.equal(await t.get(t.projectId, actor), null); assert.deepEqual((await t.list(actor)).items, []);
  assert.equal(evaluate(actor, { action: 'client.view', resource: await loadInternalClientResource(t.db, 'a', 'james') }).allowed, false);
  assert.deepEqual((await t.actions(actor)).items.map(item => item.id), [id]);
  assert.doesNotMatch(JSON.stringify(action), /SECRET_SIBLING|Discovery|creationRequestId|workspaceId|email|actorUserId/);
  assert.deepEqual(await projectActivity(t.db, actor, t.projectId), []);
});

for (const scope of ['client', 'service', 'project']) test(`canonical ${scope} scope reads Actions but only own assignment grants Team progress`, async () => {
  const t = await setup(), { actionId: id } = await t.addAction();
  const sql = { client: "INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')",
    service: "INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','ghl-service','m-sam')",
    project: `INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a','${t.projectId}','m-sam')` }[scope]; run(t.raw, sql);
  const actor = await t.actor('sam'); assert.ok(await t.action(id, actor));
  const before = t.actionSnapshot(); assert.equal((await t.progress(id, 'waiting', { actor })).reason, 'forbidden');
  for (const input of [{ title: 'Changed' }, { priority: 'high' }, { dueDate: '2026-09-10' }, { assigneeMembershipId: 'm-sam' }, { milestoneId: null }, { visibility: 'restricted' }]) assert.equal((await t.editAction(id, input, { actor })).reason, 'forbidden');
  assert.equal((await t.addAction({}, { actor })).reason, 'forbidden'); assert.deepEqual(t.actionSnapshot(), before);
  await t.editAction(id, { assigneeMembershipId: 'm-sam' }); assert.ok((await t.progress(id, 'waiting', { actor })).ok);
  const resource = (await authorizeAction(t.db, actor, id)).resource;
  assert.equal(evaluate(actor, { action: 'action.progress', resource }).allowed, true);
});

for (const visibility of ['internal', 'restricted']) for (const parentVisibility of ['internal', 'restricted']) test(`direct assigned Team reads ${visibility} Action on ${parentVisibility} Project, without expanding parents`, async () => {
  const t = await setup(); await t.edit(t.projectId, { visibility: parentVisibility });
  const { actionId: id } = await t.addAction({ visibility, assigneeMembershipId: 'm-sam' }), actor = await t.actor('sam');
  assert.ok(await t.action(id, actor)); assert.equal(await t.get(t.projectId, actor), null);
  assert.ok((await t.progress(id, 'in_progress', { actor })).ok);
  assert.equal(await t.action(id, await t.actor('other')), null);
});

for (const user of ['ellen', 'ary', 'pm', 'sam', 'other', 'james', 'foreign']) test(`${user} obeys restricted Action roles and explicit Project assignment`, async () => {
  const t = await setup(), { actionId: id } = await t.addAction({ visibility: 'restricted' }), actor = await t.actor(user);
  assert.equal(Boolean(await t.action(id, actor)), ['ellen', 'ary'].includes(user));
  if (['pm', 'sam'].includes(user)) {
    t.assign(user); const assigned = await t.actor(user); assert.ok(await t.action(id, assigned));
    assert.equal((await t.editAction(id, { title: 'Changed' }, { actor: assigned })).ok, user === 'pm');
  }
});

test('Department membership and Project ownership never grant Actions', async () => {
  const t = await setup(); await t.edit(t.projectId, { ownerMembershipId: 'm-sam' });
  run(t.raw, "INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES('a','systems','m-sam')");
  const { actionId: id } = await t.addAction(), actor = await t.actor('sam');
  assert.equal(await t.action(id, actor), null); assert.deepEqual((await t.actions(actor)).items, []); assert.deepEqual((await actionFilterOptions(t.db, actor)).clientId.items, []);
});

test('reassignment revokes Action-only access immediately; canonical scope retains read but loses progress', async () => {
  const t = await setup(), { actionId: id } = await t.addAction({ assigneeMembershipId: 'm-sam' }), actor = await t.actor('sam');
  assert.ok(await t.action(id, actor)); await t.editAction(id, { assigneeMembershipId: 'm-other' });
  assert.equal(await t.action(id, actor), null); assert.deepEqual((await t.actions(actor)).items, []);
  t.assign(); const scoped = await t.actor('sam'); assert.ok(await t.action(id, scoped));
  assert.equal((await t.progress(id, 'waiting', { actor: scoped })).reason, 'forbidden');
});

for (const change of ['membership', 'role', 'workspace', 'parent_visibility', 'scope', 'child_visibility']) for (const operation of ['create', 'edit', 'status', 'dependency_add', 'dependency_remove']) test(`${operation} rechecks ${change} under the Action write lock`, async () => {
  const t = await setup(), { actionId: a } = await t.addAction(), { actionId: b } = await t.addAction();
  if (operation === 'dependency_remove') await t.depend(a, b);
  const edge = (await t.dependencies(a)).items[0];
  if (change === 'scope') { t.assign('pm'); await t.edit(t.projectId, { visibility: 'restricted' }); }
  const actor = await t.actor('pm'), before = t.actionHistory().length;
  const changes = { membership: "UPDATE workspace_memberships SET status='suspended' WHERE id='m-pm'", role: "UPDATE workspace_memberships SET role='client' WHERE id='m-pm'",
    workspace: "UPDATE workspaces SET status='suspended' WHERE id='a'", parent_visibility: `UPDATE projects SET visibility='restricted' WHERE id='${t.projectId}'`,
    scope: "DELETE FROM project_assignments WHERE membership_id='m-pm'", child_visibility: `UPDATE actions SET visibility='restricted' WHERE id='${a}'` };
  t.beforeBatch(() => run(t.raw, changes[change]));
  const operations = { create: () => t.addAction({}, { actor }), edit: () => t.editAction(a, { title: 'Failed' }, { actor }), status: () => t.progress(a, 'waiting', { actor }),
    dependency_add: () => t.depend(a, b, { actor }), dependency_remove: () => t.removeDependency(a, edge.id, { actor }) };
  const result = await operations[operation]();
  if (operation === 'create' && change === 'child_visibility') assert.ok(result.ok);
  else { assert.equal(result.ok, false); assert.equal(t.actionHistory().length, before); }
});

for (const canonicalScope of [false, true]) test(`Team reassignment at write lock revokes progress, canonical scope ${canonicalScope}`, async () => {
  const t = await setup(), { actionId: id } = await t.addAction({ assigneeMembershipId: 'm-sam' });
  if (canonicalScope) t.assign(); const actor = await t.actor('sam'), before = t.actionHistory().length;
  t.beforeBatch(() => run(t.raw, "UPDATE actions SET assignee_membership_id='m-other' WHERE id=?", id));
  assert.equal((await t.progress(id, 'waiting', { actor })).ok, false); assert.equal(t.actionHistory().length, before); assert.equal((await t.action(id)).status, 'to_do');
});

for (const operation of ['create', 'edit']) for (const reference of ['assignee', 'milestone']) test(`${operation} rechecks live ${reference} eligibility under the write lock`, async () => {
  const t = await setup(), { actionId: id } = await t.addAction(), { milestoneId } = await t.add();
  const actor = await t.actor('pm'), before = t.actionHistory().length;
  t.beforeBatch(() => reference === 'assignee' ? run(t.raw, "UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'") : run(t.raw, "UPDATE milestones SET visibility='restricted' WHERE id=?", milestoneId));
  const input = reference === 'assignee' ? { assigneeMembershipId: 'm-sam' } : { milestoneId };
  const result = operation === 'create' ? await t.addAction(input, { actor }) : await t.editAction(id, input, { actor });
  assert.equal(result.ok, false); assert.equal(t.actionHistory().length, before);
});

for (const operation of ['add', 'remove']) test(`dependency ${operation} rechecks target visibility under the committing lock`, async () => {
  const t = await setup(), a = t.seedAction('a1'), b = t.seedAction('b1'); if (operation === 'remove') await t.depend(a, b);
  const edge = (await t.dependencies(a)).items[0], actor = await t.actor('pm'), before = t.actionHistory().length;
  t.beforeBatch(() => run(t.raw, "UPDATE actions SET visibility='restricted' WHERE id=?", b));
  const result = operation === 'add' ? await t.depend(a, b, { actor }) : await t.removeDependency(a, edge.id, { actor });
  assert.equal(result.ok, false); assert.equal(t.actionHistory().length, before);
});

test('Project and Client history follow current Action visibility, scope and active membership', async () => {
  const t = await setup(), { actionId: id } = await t.addAction({ title: 'SECRET_HISTORY' }); t.assign('pm');
  const actor = await t.actor('pm');
  const histories = async () => JSON.stringify([await projectActivity(t.db, actor, t.projectId), await clientActivity(t.db, 'a', 'james', { actor })]);
  assert.match(await histories(), /SECRET_HISTORY/); await t.editAction(id, { visibility: 'restricted' }); assert.match(await histories(), /SECRET_HISTORY/);
  run(t.raw, "DELETE FROM project_assignments WHERE membership_id='m-pm'"); assert.doesNotMatch(await histories(), /SECRET_HISTORY/);
  t.assign('pm'); run(t.raw, "UPDATE workspace_memberships SET status='suspended' WHERE id='m-pm'"); assert.doesNotMatch(await histories(), /SECRET_HISTORY/);
  assert.doesNotMatch(JSON.stringify(await clientActivity(t.db, 'a', 'james', { actor: await t.actor('james') })), /SECRET_HISTORY|Action/);
});
