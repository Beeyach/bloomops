import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, NOW } from './_work-projections.mjs';
import { setup as onboardingSetup } from './_onboarding.mjs';
import { run, one } from './_bloomops-db.mjs';
import { clientOverview } from '../lib/bloomops/client-overview.mjs';
import { clientServiceSummary, listClientServices } from '../lib/bloomops/services.mjs';
import { onboardingView } from '../lib/bloomops/onboarding-views.mjs';

const view = (t, actor = t.owner, id = 'james', now = NOW) => clientOverview(t.db, actor, id, { now });

test('real engagements, open work and future/overdue dates remain distinct; reads do not write', async () => {
  const t = await setup();
  t.action('late', { due_date: '2026-09-08' }); t.action('next', { due_date: '2026-09-10' });
  t.milestone('today', { target_date: '2026-09-09' });
  t.deliverable('later', { target_date: '2026-09-11' });
  t.action('done', { status: 'done', due_date: '2026-09-09' });
  const before = t.snapshot(), changes = one(t.raw, 'SELECT total_changes() n').n;
  const result = await view(t);
  assert.equal(result.services.items.length, 2);
  assert.equal(result.nextDeadline.id, 'today'); assert.equal(result.nextDeadline.kind, 'milestone');
  assert.equal(result.nextDeadline.href, '/work/projects/website#milestone-today');
  assert.equal(result.overdue.id, 'late'); assert.equal(result.actions.items.length, 2);
  assert.equal(result.requests.state, 'not_created'); assert.deepEqual(t.snapshot(), before);
  assert.equal(one(t.raw, 'SELECT total_changes() n').n, changes);
  assert.doesNotMatch(JSON.stringify(result), /creationRequest|scopeNotes|description|membershipId|workspaceId/);
});

test('deadline ranges use client calendar days; missing dates stay out', async () => {
  const t = await setup(); run(t.raw, "UPDATE bloomops_clients SET timezone='America/Los_Angeles' WHERE id='james'");
  t.action('day', { due_date: '2026-09-08' }); t.action('no-date');
  const result = await view(t); assert.equal(result.today, '2026-09-08'); assert.equal(result.nextDeadline.id, 'day'); assert.equal(result.overdue, null);
  run(t.raw, "UPDATE bloomops_clients SET timezone='Pacific/Kiritimati' WHERE id='james'");
  assert.equal((await view(t)).overdue.id, 'day'); assert.equal((await view(t)).nextDeadline, null);
});

test('dependency blocking suppresses false overdue, keeps upcoming date explicitly blocked', async () => {
  const t = await setup(); t.action('pre'); t.action('blocked', { due_date: '2026-09-08' });
  run(t.raw, "INSERT INTO action_dependencies(workspace_id,project_id,action_id,depends_on_action_id) VALUES('a','website','blocked','pre')");
  let result = await view(t); assert.equal(result.overdue, null); assert.equal(result.actions.items[0].blocked, true);
  run(t.raw, "UPDATE actions SET due_date='2026-09-10' WHERE id='blocked'");
  result = await view(t); assert.equal(result.nextDeadline.blocked, true);
});

test('terminal children and children of terminal projects leave all current/deadline sections', async () => {
  const t = await setup();
  t.project('closed', { status: 'cancelled', target_date: '2026-09-09' });
  t.action('closed-task', { project_id: 'closed', due_date: '2026-09-09' });
  t.milestone('finished', { status: 'completed', target_date: '2026-09-09' });
  t.milestone('skipped', { status: 'skipped', target_date: '2026-09-09' });
  t.deliverable('delivered', { status: 'delivered', target_date: '2026-09-09' });
  t.deliverable('cancelled', { status: 'cancelled', target_date: '2026-09-09' });
  const result = await view(t); assert.deepEqual(result.projects.items.map(x => x.id), ['website']);
  assert.equal(result.actions.items.length, 0); assert.equal(result.nextDeadline, null);
});

test('more than 200 historical projects cannot hide next deadline; work and service lists are bounded', async () => {
  const t = await setup();
  for (let n = 0; n < 220; n++) t.project(`history-${n}`, { status: 'cancelled', target_date: '2026-09-01' });
  for (let n = 0; n < 8; n++) { t.project(`active-${n}`, { target_date: '2027-01-01' }); t.action(`task-${n}`); }
  t.milestone('actual-next', { target_date: '2026-09-09', project_id: 'active-7' });
  for (let n = 0; n < 8; n++) run(t.raw, "INSERT INTO service_engagements(id,workspace_id,client_id,service_type_id,status) VALUES(?,'a','james','type-social','completed')", `old-${n}`);
  const result = await view(t); assert.equal(result.nextDeadline.id, 'actual-next');
  for (const key of ['projects','actions','services']) { assert.equal(result[key].items.length, 5); assert.equal(result[key].hasMore, true); assert.equal(result[key].total, undefined); }
  assert.equal(result.services.items[0].status, 'planned');
});

test('all four deadline types participate, with stable ties and no hidden parent-page scan', async () => {
  const t = await setup(); t.project('dated', { target_date: '2026-09-09' });
  t.milestone('dated', { target_date: '2026-09-09' }); t.action('dated', { due_date: '2026-09-09' }); t.deliverable('dated', { target_date: '2026-09-09' });
  assert.equal((await view(t)).nextDeadline.kind, 'action');
  run(t.raw, "UPDATE actions SET status='cancelled'"); assert.equal((await view(t)).nextDeadline.kind, 'deliverable');
  run(t.raw, "UPDATE deliverables SET status='cancelled'"); assert.equal((await view(t)).nextDeadline.kind, 'milestone');
  run(t.raw, "UPDATE milestones SET status='skipped'"); assert.equal((await view(t)).nextDeadline.kind, 'project');
});

for (const user of ['ellen','ary','pm']) test(`${user} sees readable current work with their own restricted visibility`, async () => {
  const t = await setup(); t.action('normal'); t.project('secret', { visibility: 'restricted', target_date: '2026-09-09' });
  const result = await view(t, await t.actor(user)); assert.ok(result); assert.equal(result.actions.items.length, 1);
  assert.equal(result.projects.items.some(x => x.id === 'secret'), user !== 'pm');
});

test('client-assigned Team Member sees no restricted siblings; child assignment does not broaden parents', async () => {
  const t = await setup(); t.assign('client');
  t.project('secret', { visibility: 'restricted', target_date: '2026-09-09' });
  t.action('assigned-task', { project_id: 'secret', assignee_membership_id: 'm-sam', visibility: 'restricted', due_date: '2026-09-09' });
  t.milestone('secret-milestone', { visibility: 'restricted', target_date: '2026-09-09' });
  t.deliverable('secret-deliverable', { visibility: 'restricted', target_date: '2026-09-09' });
  const result = await view(t, await t.actor('sam'));
  assert.equal(result.nextDeadline.id, 'assigned-task'); assert.equal(result.nextDeadline.href, '/work/actions/assigned-task');
  assert.deepEqual(result.projects.items.map(x => x.id), ['website']);
  assert.doesNotMatch(JSON.stringify(result), /secret-milestone|secret-deliverable|Project secret/);
});

for (const scope of ['service','project','action','none']) test(`${scope}-only scope cannot open a client's internal overview`, async () => {
  const t = await setup();
  if (scope === 'service' || scope === 'project') t.assign(scope);
  if (scope === 'action') t.action('mine', { assignee_membership_id: 'm-sam' });
  assert.equal(await view(t, await t.actor('sam')), null);
});

test('service summary preserves canonical narrower grants and checks revoked assignments live', async () => {
  const t = await setup(); t.assign('service'); const actor = await t.actor('sam');
  const before = await clientServiceSummary(t.db, actor, 'james');
  assert.deepEqual(before.items.map(x => x.id), (await listClientServices(t.db, actor, 'james')).map(x => x.id));
  assert.deepEqual(before.items.map(x => x.id), ['social-service']);
  run(t.raw, "DELETE FROM service_assignments WHERE membership_id='m-sam'");
  assert.equal((await clientServiceSummary(t.db, actor, 'james')).items.length, 0);
});

test('fresh authority rejects removed assignments, revoked membership, clients and foreign workspaces', async () => {
  const t = await setup(); t.assign('client'); const actor = await t.actor('sam'); assert.ok(await view(t, actor));
  run(t.raw, "DELETE FROM client_assignments WHERE membership_id='m-sam'"); assert.equal(await view(t, actor), null);
  run(t.raw, "UPDATE workspace_memberships SET status='suspended' WHERE id='m-ellen'"); assert.equal(await view(t), null);
  assert.equal(await view(t, await t.actor('james')), null); assert.equal(await view(t, await t.actor('foreign')), null);
  assert.equal(await view(t, await t.actor('ary'), 'foreign-client'), null); assert.equal(await view(t, await t.actor('ary'), 'missing'), null);
});

test('submitted/unverified requests remain open and canonical progress differs from portal submission progress', async () => {
  const t = await onboardingSetup();
  const item = t.items().find(x => x.responsible_party === 'client' && x.verification_required);
  assert.ok(item); assert.equal((await t.mutate(item.logical_key)).ok, true);
  const result = await clientOverview(t.db, t.owner, 'lawrence', { now: NOW });
  const canonical = await onboardingView(t.db, t.owner, 'lawrence');
  assert.deepEqual(result.requests.progress, canonical.progress);
  assert.equal(result.requests.items.find(x => x.id === item.id)?.audience, 'review');
  for (let n = 0; n < 8; n++) t.extra(`optional-${n}`, { required: false });
  const bounded = await clientOverview(t.db, t.owner, 'lawrence', { now: NOW });
  assert.equal(bounded.requests.items.length, 5); assert.equal(bounded.requests.hasMore, true);
  assert.equal(bounded.requests.progress.total, result.requests.progress.total);
});

test('query count and returned summary size do not grow with project history', async () => {
  const t = await setup(); const original = t.d1.prepare; let queries = 0;
  const tracked = stmt => ({ ...stmt, bind: (...args) => tracked(stmt.bind(...args)),
    all: (...args) => { queries++; return stmt.all(...args); }, raw: (...args) => { queries++; return stmt.raw(...args); } });
  t.d1.prepare = (...args) => tracked(original(...args));
  const before = await view(t), baseQueries = queries;
  for (let n = 0; n < 250; n++) t.project(`history-${n}`, { status: 'cancelled' });
  queries = 0; const after = await view(t);
  assert.equal(queries, baseQueries); assert.deepEqual(after, before); assert.ok(queries <= 20, `bounded reads: ${queries}`);
});

test('failed database reads reject instead of becoming a misleading empty overview', async () => {
  const t = await setup();
  t.d1.prepare = () => { throw new Error('Database temporarily unavailable'); };
  await assert.rejects(() => view(t), /Database temporarily unavailable/);
});
