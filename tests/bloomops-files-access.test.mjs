import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_files.mjs';
import { run, one, all } from './_bloomops-db.mjs';
import { createAction } from '../lib/bloomops/actions.mjs';
import { createDeliverable } from '../lib/bloomops/deliverables.mjs';

for (const who of ['ellen', 'ary', 'pm']) test(`${who} coordinates ordinary reachable Project/Deliverable Files`, async () => {
  const t = await setup(), actor = await t.actor(who), r = await t.upload({ deliverableId: t.deliverableId }, { actor }); assert.ok(r.ok);
  assert.ok(await t.download(r.fileId, actor)); assert.ok((await t.change(r.fileId, 'visibility', { actor, visibility: 'client' })).ok); assert.ok((await t.change(r.fileId, 'archive', { actor })).ok);
});
for (const scope of ['none', 'department', 'owner', 'action', 'other-project', 'other-service', 'client', 'service', 'project']) test(`Team ${scope} scope governs metadata and bytes without granting writes`, async () => {
  const t = await setup(), r = await t.upload({ deliverableId: t.deliverableId });
  if (scope === 'department') run(t.raw, "INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES('a','social','m-sam')");
  if (scope === 'owner') run(t.raw, "UPDATE projects SET owner_membership_id='m-sam' WHERE id=?", t.projectId);
  if (scope === 'action') assert.ok((await createAction(t.db, { actor: t.owner, projectId: t.projectId, requestId: crypto.randomUUID(), input: { title: 'Assigned', assigneeMembershipId: 'm-sam' } })).ok);
  if (scope === 'other-project') run(t.raw, "INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,'m-sam')", (await t.create()).projectId);
  if (['other-service', 'service'].includes(scope)) run(t.raw, "INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a',?,'m-sam')", scope === 'service' ? 'social-service' : 'ghl-service');
  if (scope === 'client') run(t.raw, "INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')");
  if (scope === 'project') t.assign();
  const actor = await t.actor('sam'), canRead = ['client', 'service', 'project'].includes(scope);
  assert.equal(Boolean(await t.file(r.fileId, actor)), canRead); const download = await t.download(r.fileId, actor); assert.equal(Boolean(download), canRead); await download?.body.cancel();
  assert.equal((await t.upload({}, { actor })).ok, false); assert.equal((await t.change(r.fileId, 'archive', { actor })).ok, false); assert.equal((await t.retry(r.fileId, { actor })).ok, false);
});

for (const role of ['pm', 'sam']) for (const restricted of ['project', 'deliverable', 'file']) test(`${role} requires Project assignment for restricted ${restricted}`, async () => {
  const t = await setup(), r = await t.upload({ deliverableId: t.deliverableId, visibility: restricted === 'file' ? 'restricted' : 'client' });
  if (restricted !== 'file') run(t.raw, `UPDATE ${restricted === 'project' ? 'projects' : 'deliverables'} SET visibility='restricted' WHERE id=?`, restricted === 'project' ? t.projectId : t.deliverableId);
  const actor = await t.actor(role); assert.equal(await t.file(r.fileId, actor), null); assert.equal(await t.download(r.fileId, actor), null);
  t.assign(role); assert.ok(await t.file(r.fileId, actor)); const download = await t.download(r.fileId, actor); assert.ok(download); await download.body.cancel();
  run(t.raw, 'DELETE FROM project_assignments WHERE membership_id=?', `m-${role}`); assert.equal(await t.download(r.fileId, actor), null);
});

for (const target of ['foreign-workspace', 'other-project', 'other-client', 'missing', 'action', 'milestone', 'page']) test(`attachment ${target} is denied before any bytes or metadata`, async () => {
  const t = await setup(); let deliverableId = target;
  if (target.startsWith('other') || target === 'foreign-workspace') {
    const foreign = target === 'foreign-workspace', actor = foreign ? await t.actor('foreign') : t.owner;
    const projectId = (await t.create({}, { actor, clientId: foreign ? 'foreign-client' : target === 'other-client' ? 'lawrence' : 'james' })).projectId;
    deliverableId = (await createDeliverable(t.db, { actor, projectId, requestId: crypto.randomUUID(), input: { title: 'Other' } })).deliverableId;
  }
  const before = t.snapshot(); assert.equal((await t.upload({ deliverableId })).reason, 'not_found'); assert.deepEqual(t.snapshot(), before); assert.equal(t.bucket.objects.size, 0);
});

test('cross-workspace and unrelated Client cannot read, download, recover or archive guessed File IDs', async () => {
  const t = await setup(), r = await t.upload({ visibility: 'client' });
  for (const who of ['foreign', 'lawrence']) {
    const actor = await t.actor(who); assert.equal(await t.file(r.fileId, actor, { portal: who === 'lawrence' }), null); assert.equal(await t.download(r.fileId, actor), null);
    assert.equal((await t.upload({}, { actor })).reason, 'not_found'); assert.equal((await t.change(r.fileId, 'archive', { actor })).reason, 'not_found'); assert.equal((await t.retry(r.fileId, { actor })).reason, 'not_found');
  }
});

test('portal is an exact safe allowlist; only Ready shared rows and safe attachment labels exist', async () => {
  const t = await setup(), client = await t.actor('james');
  const shared = await t.upload({ visibility: 'client', deliverableId: t.deliverableId });
  await t.upload({ filename: 'INTERNAL_FILE.txt' }); await t.upload({ filename: 'RESTRICTED_FILE.txt', visibility: 'restricted' });
  t.bucket.beforePut = () => { throw new Error('failed'); }; await t.upload({ filename: 'FAILED_FILE.txt', visibility: 'client' }); t.bucket.beforePut = null;
  const archived = await t.upload({ filename: 'ARCHIVED_FILE.txt', visibility: 'client' }); await t.change(archived.fileId, 'archive');
  const dto = await t.list(client, { portal: true }); assert.equal(dto.items.length, 1); assert.deepEqual(Object.keys(dto), ['items']);
  assert.deepEqual(Object.keys(dto.items[0]).sort(), ['attachmentLabel', 'byteSize', 'filename', 'id', 'mimeType', 'readyAt']); assert.equal(dto.items[0].attachmentLabel, 'Your website');
  assert.doesNotMatch(JSON.stringify(dto), /INTERNAL|RESTRICTED|FAILED|ARCHIVED|PRIVATE|uploader|objectKey|status|revision|projectId|deliverableId|workspace|sha256|lease/);
  assert.ok(await t.download(shared.fileId, client)); run(t.raw, 'UPDATE deliverables SET client_label=NULL WHERE id=?', t.deliverableId);
  assert.equal((await t.list(client, { portal: true })).items[0].attachmentLabel, 'Deliverable');
});

const clientRevocations = {
  membership: "UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'",
  workspace: "UPDATE workspaces SET status='suspended' WHERE id='a'",
  role: "UPDATE workspace_memberships SET role='team_member' WHERE id='m-james'",
  identity: "UPDATE workspace_memberships SET user_id='foreign' WHERE id='m-james'",
  contact: "UPDATE client_contacts SET user_id=NULL WHERE user_id='james'",
  project: "UPDATE projects SET visibility='internal'",
  deliverable: "UPDATE deliverables SET visibility='restricted'",
  file: "UPDATE assets SET visibility='internal'",
};
for (const [kind, query] of Object.entries(clientRevocations)) for (const during of [false, true]) test(`Client ${kind} revocation ${during ? 'during R2 get' : 'before reads'} denies metadata and bytes to a stale actor`, async () => {
  const t = await setup(), client = await t.actor('james'), r = await t.upload({ visibility: 'client', deliverableId: t.deliverableId });
  if (during) t.bucket.beforeGet = () => run(t.raw, query); else run(t.raw, query);
  assert.equal(await t.download(r.fileId, client), null); assert.equal(await t.file(r.fileId, client, { portal: true }), null); assert.equal((await t.list(client, { portal: true })).items.length, 0);
});

for (const scope of ['client', 'service', 'project']) test(`stale Team ${scope} assignment revocation denies metadata and in-flight bytes`, async () => {
  const t = await setup(), r = await t.upload();
  const statements = { client: "INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james','m-sam')", service: "INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','social-service','m-sam')" };
  if (scope === 'project') t.assign(); else run(t.raw, statements[scope]); const actor = await t.actor('sam');
  t.bucket.beforeGet = () => run(t.raw, `DELETE FROM ${scope}_assignments WHERE membership_id='m-sam'`);
  assert.equal(await t.download(r.fileId, actor), null); assert.equal(await t.file(r.fileId, actor), null);
});

for (const kind of ['membership', 'role', 'workspace', 'project', 'deliverable', 'file', 'assignment']) test(`PM ${kind} revocation during upload prevents readiness and cleans its failed generation`, async () => {
  const t = await setup(); if (kind === 'assignment') t.assign('pm'); const actor = await t.actor('pm');
  const queries = { membership: "UPDATE workspace_memberships SET status='suspended' WHERE id='m-pm'", role: "UPDATE workspace_memberships SET role='team_member' WHERE id='m-pm'", workspace: "UPDATE workspaces SET status='suspended' WHERE id='a'", project: "UPDATE projects SET visibility='restricted'", deliverable: "UPDATE deliverables SET visibility='restricted'", file: "UPDATE assets SET visibility='restricted'", assignment: "DELETE FROM project_assignments WHERE membership_id='m-pm'" };
  t.bucket.afterPut = () => run(t.raw, queries[kind]);
  const r = await t.upload({ deliverableId: t.deliverableId, visibility: kind === 'assignment' ? 'restricted' : 'internal' }, { actor });
  assert.equal(r.ok, false); assert.equal(one(t.raw, 'SELECT status FROM assets').status, 'failed'); assert.equal(t.events('FILE_UPLOADED').length, 0); assert.equal(t.bucket.objects.size, 0);
});

test('reservation rechecks live scope inside the committing batch', async () => {
  const t = await setup(), actor = await t.actor('pm'), batch = t.db.batch.bind(t.db); let first = true;
  t.db.batch = async writes => { if (first) { first = false; run(t.raw, "UPDATE deliverables SET visibility='restricted'"); } return batch(writes); };
  const r = await t.upload({ deliverableId: t.deliverableId }, { actor }); assert.equal(r.ok, false); assert.equal(all(t.raw, 'SELECT * FROM assets').length, 0); assert.equal(t.bucket.calls.length, 0);
});
