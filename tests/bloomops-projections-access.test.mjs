import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, NOW } from './_work-projections.mjs';
import { run } from './_bloomops-db.mjs';
import { portalProjects } from '../lib/bloomops/projects.mjs';
import { portalMilestones } from '../lib/bloomops/milestones.mjs';
import { portalDeliverables } from '../lib/bloomops/deliverables.mjs';
import { listFiles } from '../lib/bloomops/files.mjs';
import { homeProjection } from '../lib/bloomops/work-projections.mjs';

const empty = home => Object.values(home.actions).every(s => !s.items.length && !s.hasMore)
  && ['projects','deliverables','recent'].every(key => !home[key].items.length && !home[key].hasMore);

for (const who of ['ellen','ary','pm']) test(`${who} sees current canonical workspace coordination summaries`, async () => {
  const t = await setup(); t.tree(); const home = await t.home(await t.actor(who));
  assert.equal(home.projects.items.length, 1); assert.equal(home.actions.overdue.items.length, 1); assert.equal(home.deliverables.items.length, 1); assert.equal(home.recent.items.length, 2);
});

for (const scope of ['none','department','owner','action','client','service','project','other-service','other-client']) test(`Team ${scope} scope projects exactly its canonical records`, async () => {
  const t = await setup(); t.tree(); t.project('ghl', { service_engagement_id: 'ghl-service' }); t.tree('ghl');
  t.project('kajabi', { client_id: 'lawrence', service_engagement_id: 'kajabi-service' }); t.tree('kajabi');
  if (scope === 'department') run(t.raw, "INSERT INTO department_memberships(workspace_id,department_id,membership_id) VALUES('a','social','m-sam')");
  if (scope === 'owner') run(t.raw, "UPDATE projects SET owner_membership_id='m-sam'");
  if (scope === 'action') t.action('direct', { assignee_membership_id: 'm-sam', due_date: '2026-09-08' });
  if (['client','service','project'].includes(scope)) t.assign(scope);
  if (scope === 'other-service') t.assign('service','sam','ghl-service');
  if (scope === 'other-client') t.assign('client','sam','lawrence');
  const actor = await t.actor('sam'), home = await t.home(actor), summaries = await t.summaries(actor);
  const expected = { none: [], department: [], owner: [], action: [], client: ['ghl','website'], service: ['website'], project: ['website'], 'other-service': ['ghl'], 'other-client': ['kajabi'] }[scope];
  assert.deepEqual(summaries.items.map(row=>row.id).sort(), expected);
  assert.deepEqual(home.projects.items.map(row=>row.id).sort(), expected);
  assert.equal(home.deliverables.items.length, expected.length); assert.equal(home.recent.items.length, expected.length * 2);
  assert.equal(home.actions.overdue.items.length, scope === 'action' ? 1 : expected.length);
  if (scope === 'action') { assert.equal(home.actions.overdue.items[0].id, 'direct'); assert.equal(home.actions.overdue.items[0].projectHref, null); }
  if (!expected.includes('kajabi')) assert.doesNotMatch(JSON.stringify(home), /Project kajabi|kajabi-file|kajabi-deliverable/);
});

for (const who of ['pm','sam']) for (const subject of ['project','milestone','action','deliverable','file']) test(`${who}: restricted ${subject} cannot inflate readable child counts`, async () => {
  const t = await setup(); t.tree(); t.assign('client',who);
  const actor = await t.actor(who);
  const table = { project: 'projects', milestone: 'milestones', action: 'actions', deliverable: 'deliverables', file: 'assets' }[subject];
  const id = subject === 'project' ? t.projectId : `website-${subject}`;
  run(t.raw, `UPDATE ${table} SET visibility='restricted' WHERE id=?`, id);
  const row = await t.summary(actor), home = await t.home(actor);
  if (subject === 'project') { assert.equal(row, undefined); assert.ok(empty(home)); }
  if (subject === 'milestone') assert.equal(row.milestones, null);
  if (subject === 'action') { assert.equal(row.actions.open, 0); assert.equal(home.actions.overdue.items.length, 0); }
  if (subject === 'deliverable') { assert.equal(row.deliverables.clientReview, 0); assert.equal(row.deliverables.total, 1); assert.equal(row.readyFiles, 0); assert.equal(home.deliverables.items.length, 0); assert.equal(home.recent.items.some(i=>i.kind === 'file'), false); }
  if (subject === 'file') { assert.equal(row.readyFiles, 0); assert.equal(home.recent.items.some(i=>i.kind === 'file'), false); }
  t.assign('project',who); assert.equal((await t.summary(actor)).readyFiles, 1); assert.equal((await t.home(actor)).actions.overdue.items.length, 1);
  run(t.raw, 'DELETE FROM project_assignments WHERE membership_id=?', `m-${who}`);
  assert.deepEqual(await t.summary(actor), row, 'removing the explicit grant restores exactly the narrow summary');
});

test('Action-only assignment under a restricted Project grants only the assigned Action', async () => {
  const t = await setup(); t.tree(); run(t.raw, "UPDATE projects SET visibility='restricted'");
  t.action('own', { visibility: 'restricted', assignee_membership_id: 'm-sam', due_date: '2026-09-08' });
  const actor = await t.actor('sam'), home = await t.home(actor);
  assert.deepEqual(home.actions.overdue.items.map(i=>i.id), ['own']); assert.equal(home.actions.overdue.items[0].projectHref, null);
  for (const key of ['projects','deliverables','recent']) assert.deepEqual(home[key], { items: [], hasMore: false });
  assert.deepEqual((await t.summaries(actor)).items, []);
  run(t.raw, "UPDATE actions SET assignee_membership_id='m-other' WHERE id='own'"); assert.ok(empty(await t.home(actor)));
});

for (const mutation of [
  "UPDATE workspace_memberships SET status='suspended' WHERE id='m-sam'",
  "UPDATE workspace_memberships SET status='removed' WHERE id='m-sam'",
  "UPDATE workspace_memberships SET role='client' WHERE id='m-sam'",
  "UPDATE workspace_memberships SET user_id='foreign' WHERE id='m-sam'",
  "UPDATE workspaces SET status='suspended' WHERE id='a'",
  "DELETE FROM project_assignments WHERE membership_id='m-sam'",
]) test(`stale actor loses every Home/Work projection after ${mutation}`, async () => {
  const t = await setup(); t.tree(); t.assign(); const actor = await t.actor('sam');
  assert.equal(empty(await t.home(actor)), false); run(t.raw, mutation);
  assert.ok(empty(await t.home(actor))); assert.deepEqual(await t.summaries(actor), { items: [], hasMore: false });
});

for (const scope of ['client','service']) test(`stale ${scope} assignment revocation removes rows, counters and recent titles`, async () => {
  const t = await setup(); t.tree(); t.assign(scope); const actor = await t.actor('sam'); assert.equal(empty(await t.home(actor)), false);
  run(t.raw, `DELETE FROM ${scope}_assignments WHERE membership_id='m-sam'`); assert.ok(empty(await t.home(actor)));
});

test('cross-workspace Projects and guessed IDs expose no rows or child facts', async () => {
  const t = await setup(); t.tree(); const foreign = await t.actor('foreign');
  assert.ok(empty(await t.home(foreign))); assert.deepEqual((await t.summaries(foreign, { projectId: t.projectId })).items, []);
  t.project('foreign-project', { workspace_id: 'b', client_id: 'foreign-client', health: 'at_risk' });
  assert.deepEqual((await t.summaries(t.owner, { projectId: 'foreign-project' })).items, []);
  assert.deepEqual((await t.summaries(t.owner, { clientId: 'foreign-client' })).items, []);
  assert.doesNotMatch(JSON.stringify(await t.home()), /foreign-project|foreign-client/);
});

test('hidden-only children leave the same counts, percentages and empty decisions as no children', async () => {
  const t = await setup(); t.assign('client'); const actor = await t.actor('sam'), before = await t.home(actor), rowBefore = await t.summary(actor);
  t.milestone('hidden-m', { status: 'completed', visibility: 'restricted' }); t.action('hidden-a', { visibility: 'restricted', due_date: '2026-09-08' });
  t.deliverable('hidden-d', { status: 'client_review', visibility: 'restricted' });
  t.file('hidden-f', { visibility: 'restricted' }); t.event('file','hidden-f');
  assert.deepEqual(await t.home(actor), before); assert.deepEqual(await t.summary(actor), rowBefore);
});

test('current restriction and archiving remove successful historical output from Home', async () => {
  const t = await setup(); t.tree(); t.assign('client'); const actor = await t.actor('sam');
  assert.equal((await t.home(actor)).recent.items.length, 2);
  run(t.raw, "UPDATE deliverables SET title='Renamed delivery',visibility='restricted' WHERE id='website-delivered'");
  run(t.raw, "UPDATE assets SET status='archived',archived_at=? WHERE id='website-file'", NOW.toISOString());
  assert.equal((await t.home(actor)).recent.items.length, 0); assert.equal((await t.summary(actor)).readyFiles, 0);
  assert.doesNotMatch(JSON.stringify(await t.home(actor)), /Renamed delivery|website-delivered|website-file|OLD_/);
});

test('Client portal allowlists remain exact; contacts never acquire internal Home/Actions/history', async () => {
  const t = await setup(); t.tree(); const actor = await t.actor('james');
  const projects = await portalProjects(t.db,actor);
  assert.deepEqual(Object.keys(projects[0]).sort(), ['clientId','clientName','completedAt','id','label','statusLabel','targetDate']);
  assert.deepEqual(Object.keys((await portalMilestones(t.db,actor,t.projectId)).items[0]).sort(), ['completedAt','id','label','statusLabel','targetDate']);
  assert.deepEqual(Object.keys((await portalDeliverables(t.db,actor,t.projectId)).items[0]).sort(), ['deliveredAt','id','label','statusLabel','targetDate']);
  assert.deepEqual(Object.keys((await listFiles(t.db,actor,t.projectId,{portal:true})).items[0]).sort(), ['attachmentLabel','byteSize','filename','id','mimeType','readyAt']);
  assert.ok(empty(await t.home(actor))); assert.deepEqual((await t.summaries(actor)).items, []);
  run(t.raw, "UPDATE client_contacts SET user_id=NULL WHERE user_id='james'");
  assert.deepEqual(await portalProjects(t.db,actor), []); assert.equal(await portalMilestones(t.db,actor,t.projectId), null);
  assert.equal(await portalDeliverables(t.db,actor,t.projectId), null); assert.deepEqual((await listFiles(t.db,actor,t.projectId,{portal:true})).items, []);
});

for (const actor of [null, { status: 'active', role: 'owner', scope: null }, { status: 'active', role: 'owner', scope: { kind: 'none' } }]) test(`default deny without a valid internal actor ${JSON.stringify(actor)}`, async () => {
  const t = await setup(); t.tree(); assert.ok(empty(await homeProjection(t.db,actor,{now:NOW})));
});
