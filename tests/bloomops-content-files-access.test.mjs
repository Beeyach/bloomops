import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './_content-files.mjs';
import { run } from './_bloomops-db.mjs';
import { recordingRequests } from '../lib/bloomops/content-files.mjs';
import { clientActivity } from '../lib/bloomops/client-activity.mjs';
import { contentFileActivityRows } from '../lib/bloomops/content-file-activity.mjs';

for (const who of ['ellen', 'ary', 'pm', 'sam', 'other', 'james', 'lawrence', 'foreign']) test(`${who}: internal Content File scope never inherits department or ownership grants`, async () => {
  const t = await setup(), actor = await t.actor(who), allowed = ['ellen', 'ary', 'pm'].includes(who);
  const result = await t.upload({}, { actor }); assert.equal(result.ok, allowed);
  const shared = await t.upload({ visibility: 'client' });
  assert.equal((await t.files(actor)).items.length > 0, allowed);
  assert.equal(Boolean(await t.download(shared.fileId, actor)), allowed || who === 'james');
});
for (const who of ['pm', 'sam']) for (const scope of ['client', 'service']) test(`${who} exact ${scope} assignment governs restricted Content and File fulfillment`, async () => {
  const t = await setup(), actor = await t.actor(who);
  run(t.raw, "UPDATE content_items SET visibility='restricted'");
  assert.equal((await t.upload({}, { actor })).reason, 'not_found');
  run(t.raw, scope === 'client' ? "INSERT INTO client_assignments(workspace_id,client_id,membership_id) VALUES('a','james',?)" : "INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','social-service',?)", `m-${who}`);
  const fresh = await t.actor(who), result = await t.upload({ visibility: 'restricted' }, { actor: fresh }); assert.equal(result.ok, true);
  assert.equal((await t.change(result.fileId, 'visibility', { visibility: 'internal', actor: fresh })).ok, true);
  assert.equal((await t.change(result.fileId, 'archive', { actor: fresh })).ok, true);
  run(t.raw, `DELETE FROM ${scope}_assignments WHERE membership_id=?`, `m-${who}`);
  assert.equal((await t.upload({}, { actor: fresh })).reason, 'not_found');
});
for (const grant of ['owner', 'department', 'project', 'action', 'sibling-service']) test(`${grant} alone cannot grant Content File reach`, async () => {
  const t = await setup();
  if (grant === 'owner') run(t.raw, "UPDATE content_items SET owner_membership_id='m-sam'");
  if (grant === 'department') run(t.raw, "INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES('a','social','m-sam')");
  if (grant === 'sibling-service') run(t.raw, "INSERT INTO service_assignments(workspace_id,service_engagement_id,membership_id) VALUES('a','ghl-service','m-sam')");
  if (['project', 'action'].includes(grant)) {
    const id = (await t.create()).projectId;
    if (grant === 'project') run(t.raw, "INSERT INTO project_assignments(workspace_id,project_id,membership_id) VALUES('a',?,'m-sam')", id);
    else run(t.raw, "INSERT INTO actions(workspace_id,project_id,title,assignee_membership_id,creation_request_id) VALUES('a',?,'Task','m-sam',?)", id, crypto.randomUUID());
  }
  assert.equal((await t.upload({}, { actor: await t.actor('sam') })).reason, 'not_found');
});

const revocations = {
  membership: "UPDATE workspace_memberships SET status='suspended' WHERE id='m-james'",
  role: "UPDATE workspace_memberships SET role='team_member' WHERE id='m-james'",
  workspace: "UPDATE workspaces SET status='suspended' WHERE id='a'",
  contact: "UPDATE client_contacts SET user_id=NULL WHERE user_id='james'",
  content: "UPDATE content_items SET visibility='internal'",
  recording: "UPDATE content_items SET recording_required=0",
  stage: "UPDATE content_items SET stage='editing',stage_context=NULL",
  social: "UPDATE departments SET slug='renamed' WHERE id='social'",
};
for (const [kind, query] of Object.entries(revocations)) for (const boundary of ['before', 'put', 'get', 'head']) test(`Client ${kind} revocation ${boundary} refuses stale recording authority`, async () => {
  const t = await setup(), actor = await t.actor('james'), requestId = crypto.randomUUID();
  const revoke = () => run(t.raw, query);
  if (boundary === 'before') {
    revoke(); assert.equal((await t.upload({}, { actor, portal: true })).reason, 'not_found');
  } else if (boundary === 'put') {
    t.bucket.afterPut = revoke;
    assert.equal((await t.upload({}, { actor, portal: true })).ok, false);
  } else {
    const result = await t.upload({ requestId }, { actor, portal: true }); assert.equal(result.ok, true);
    if (boundary === 'get') { t.bucket.beforeGet = revoke; assert.equal(await t.download(result.fileId, actor), null); }
    else { t.bucket.beforeHead = revoke; assert.equal((await t.upload({ requestId }, { actor, portal: true })).ok, false); }
  }
  assert.deepEqual(await recordingRequests(t.db, actor), []);
  assert.deepEqual((await t.files(actor, { portal: true })).items, []);
});
test('current File and Content visibility filters old filenames from both histories; archive removes them', async () => {
  const t = await setup(), actor = await t.actor('pm'), result = await t.upload({ filename: 'PRIVATE_FILE.mp4' });
  const histories = async () => JSON.stringify([await contentFileActivityRows(t.db, actor, { contentId: t.contentId }), await clientActivity(t.db, 'a', 'james', { actor })]);
  assert.match(await histories(), /PRIVATE_FILE/);
  await t.change(result.fileId, 'visibility', { visibility: 'restricted' }); assert.doesNotMatch(await histories(), /PRIVATE_FILE/);
  await t.change(result.fileId, 'visibility', { visibility: 'internal' }); assert.match(await histories(), /PRIVATE_FILE/);
  run(t.raw, "UPDATE content_items SET visibility='restricted'"); assert.doesNotMatch(await histories(), /PRIVATE_FILE/);
  run(t.raw, "UPDATE content_items SET visibility='internal'"); await t.change(result.fileId, 'archive'); assert.doesNotMatch(await histories(), /PRIVATE_FILE/);
});
