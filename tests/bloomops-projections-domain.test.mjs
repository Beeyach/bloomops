import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, NOW } from './_work-projections.mjs';
import { run, one } from './_bloomops-db.mjs';
import { listActions } from '../lib/bloomops/actions.mjs';
import { recentOutputs, homeDeliverables, PROJECT_ATTENTION_LABELS } from '../lib/bloomops/work-projections.mjs';

test('Project summaries derive all child facts and preserve distinct parent/context names', async () => {
  const t = await setup(); t.tree();
  t.milestone('skipped', { status: 'skipped' }); t.milestone('unfinished');
  t.action('review', { status: 'review' }); t.action('waiting', { status: 'waiting' }); t.action('done', { status: 'done', due_date: '2026-09-07' }); t.action('cancelled', { status: 'cancelled' });
  t.deliverable('approved', { status: 'approved' }); t.deliverable('cancelled-output', { status: 'cancelled' });
  const row = await t.summary();
  assert.equal(row.name, 'Project website'); assert.equal(row.clientName, 'james'); assert.equal(row.serviceName, 'social'); assert.equal(row.departmentName, 'social');
  assert.deepEqual(row.milestones, { total: 3, finished: 2, percentage: 67 });
  assert.deepEqual(row.actions, { open: 3, waiting: 1, review: 1, overdue: 1 });
  assert.deepEqual(row.deliverables, { total: 4, planned: 0, inProgress: 0, internalReview: 0, clientReview: 1, approved: 1, delivered: 1, cancelled: 1 });
  assert.equal(row.readyFiles, 1); assert.equal(row.attentionReason, 'Overdue Actions');
});

test('Home and Project summary reads cannot write a lifecycle, counter, event or R2 object', async () => {
  const t = await setup(); t.tree(); const before = t.snapshot(), changes = one(t.raw, 'SELECT total_changes() AS n').n;
  // No object was stored for the fixture: Home must trust D1 readiness for
  // composition, not issue downloads/head checks or perform read repair.
  await t.home(); await t.summaries();
  assert.deepEqual(t.snapshot(), before); assert.equal(one(t.raw, 'SELECT total_changes() AS n').n, changes);
  assert.doesNotMatch(JSON.stringify(await t.home()), /SECRET_KEY|sha256|etag|uploader|lease|creationRequest|metadataJson|OLD_/);
});

test('four bounded Home Action sections are prefixes of the exact B3 views', async () => {
  const t = await setup();
  for (let i = 0; i < 9; i++) { t.action(`today-${i}`, { due_date: '2026-09-09' }); t.action(`late-${i}`, { due_date: '2026-09-08' }); t.action(`waiting-${i}`, { status: 'waiting' }); t.action(`review-${i}`, { status: 'review' }); }
  const home = await t.home();
  for (const [view, section] of Object.entries(home.actions)) {
    const canonical = await listActions(t.db, t.owner, { view }, { now: NOW });
    assert.deepEqual(section.items, canonical.items.slice(0, 4)); assert.equal(section.hasMore, true);
  }
});

test('empty children yield null milestone progress and no attention or recent output', async () => {
  const t = await setup(), row = await t.summary(), home = await t.home();
  assert.equal(row.milestones, null); assert.equal(row.actions.open, 0); assert.equal(row.deliverables.total, 0); assert.equal(row.readyFiles, 0); assert.equal(row.attentionReason, null);
  assert.equal(home.projects.items.length, 0); assert.equal(home.recent.items.length, 0); assert.equal(home.deliverables.items.length, 0);
});

const reasons = [
  [1, t => run(t.raw, "UPDATE projects SET health='at_risk' WHERE id=?", t.projectId)],
  [2, t => run(t.raw, "UPDATE projects SET status='blocked',status_reason='Unexpected issue' WHERE id=?", t.projectId)],
  [3, t => run(t.raw, "UPDATE projects SET health='needs_attention' WHERE id=?", t.projectId)],
  [4, t => run(t.raw, "UPDATE projects SET status='waiting',status_reason='Awaiting signoff' WHERE id=?", t.projectId)],
  [5, t => t.action('late', { due_date: '2026-09-08' })],
  [6, t => t.deliverable('client-review', { status: 'client_review' })],
  [7, t => t.deliverable('internal-review', { status: 'internal_review' })],
  [8, t => t.action('review', { status: 'review' })],
  [9, t => t.action('waiting', { status: 'waiting' })],
];
for (const [rank, seed] of reasons) test(`deterministic attention reason ${rank}: ${PROJECT_ATTENTION_LABELS[rank]}`, async () => {
  const t = await setup(); seed(t); assert.equal((await t.summary()).attentionReason, PROJECT_ATTENTION_LABELS[rank]);
  assert.equal((await t.home()).projects.items[0].id, t.projectId);
});

test('attention priority wins independently of targets; equal reasons order by target/name/id', async () => {
  const t = await setup(); t.action('late', { due_date: '2026-09-08' });
  t.project('risk', { health: 'at_risk', target_date: '2027-01-01' }); t.project('risk-first', { health: 'at_risk', target_date: '2026-09-01' });
  t.project('block', { status: 'blocked', status_reason: 'Blocked', target_date: '2025-01-01' });
  t.deliverable('also-review', { status: 'client_review' });
  const result = await t.summaries(t.owner, { attentionOnly: true });
  assert.deepEqual(result.items.map(row => row.id), ['risk-first','risk','block','website']);
  assert.equal(result.items.at(-1).attentionReason, 'Overdue Actions');
});

for (const status of ['completed','cancelled','archived']) test(`closed ${status} Projects stay in Work but leave attention`, async () => {
  const t = await setup(); t.tree(); run(t.raw, 'UPDATE projects SET health=?,status=?,completed_at=? WHERE id=?', 'at_risk', status, status === 'cancelled' ? null : NOW.toISOString(), t.projectId);
  assert.equal((await t.summary()).attentionReason, null); assert.equal((await t.home()).projects.items.length, 0);
  assert.equal((await t.summaries(t.owner, { status })).items.length, 1);
});

test('Project filters and bounded Work ordering agree with canonical target order', async () => {
  const t = await setup(); t.project('first', { target_date: '2026-09-10', health: 'at_risk' }); t.project('second', { target_date: '2026-09-11', client_id: 'lawrence' });
  assert.deepEqual((await t.summaries()).items.map(row => row.id), ['first','second','website']);
  assert.deepEqual((await t.summaries(t.owner, { clientId: 'james' })).items.map(row => row.id), ['first','website']);
  for (const options of [{ projectId: 'guessed' }, { clientId: 'foreign-client' }, { status: 'archived' }]) assert.equal((await t.summaries(t.owner, options)).items.length, 0);
});

test('recent output comes from canonical events, current names and successful current state', async () => {
  const t = await setup(); t.deliverable('delivered', { status: 'delivered' }); t.event('deliverable','delivered');
  t.file('ready'); t.event('file','ready'); t.file('no-event');
  for (const status of ['uploading','failed','archived']) { t.file(status, { status }); t.event('file',status); }
  t.deliverable('not-delivered', { status: 'client_review' }); t.event('deliverable','not-delivered');
  const recent = await recentOutputs(t.db,t.owner,{now:NOW});
  assert.deepEqual(recent.items.map(row=>row.id).sort(), ['delivered','ready']);
  assert.doesNotMatch(JSON.stringify(recent), /OLD_|SECRET_KEY|uploader|metadata|etag|sha256/);
  assert.equal((await t.summary()).readyFiles, 2, 'Ready metadata without a recent event still counts on its Project');
});

test('delivery composition keeps review and approval apart from dated work and recent delivery', async () => {
  const t = await setup();
  for (const status of ['planned','in_progress','internal_review','client_review','approved','delivered','cancelled']) t.deliverable(status, { status });
  t.deliverable('near', { target_date: '2026-09-23' }); t.deliverable('far', { target_date: '2026-09-24' }); t.deliverable('missed', { target_date: '2026-09-01' });
  assert.deepEqual((await homeDeliverables(t.db,t.owner,{now:NOW})).items.map(row=>row.id), ['client_review','approved','internal_review','missed','near']);
});
