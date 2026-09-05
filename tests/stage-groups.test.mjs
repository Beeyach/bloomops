import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupStages, STAGE_GROUPS } from '../lib/stage-groups.mjs';

// The real stage list shipped in lib/db.js (order preserved).
const DB_STAGES = [
  'New', 'Prescreen', 'Validated', 'Followed', 'Engaged', 'Connected',
  'Story Reply', 'DM 1', 'DM 2', 'DM 3', 'Voice Note', 'Email 1', 'Email 2',
  'Email 3', 'Email 4', 'Email 5', 'Snoozed', 'Rekindled', 'Interested',
  'Proposal Sent', 'Setup Check', 'Client', 'Finished', 'Rejected', 'Lost',
  'Invalid Email',
];

test('buckets stages into the four groups in declared order', () => {
  const groups = groupStages(DB_STAGES);
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g.stages]));
  assert.deepEqual(byKey.pipeline, ['New', 'Prescreen', 'Validated', 'Email 1', 'Email 2', 'Email 3', 'Email 4', 'Email 5', 'Finished']);
  assert.deepEqual(byKey.warm, ['Interested', 'Engaged', 'Rekindled', 'Setup Check', 'Proposal Sent']); // no 'Replied' stage in db
  assert.deepEqual(byKey.closed, ['Client', 'Rejected', 'Lost', 'Invalid Email']);
  assert.deepEqual(byKey.parked, ['Snoozed', 'Followed', 'Connected', 'Story Reply', 'DM 1', 'DM 2', 'DM 3', 'Voice Note']);
});

test('every stage lands in exactly one group — nothing is dropped or duplicated', () => {
  const groups = groupStages(DB_STAGES);
  const flat = groups.flatMap((g) => g.stages);
  assert.equal(flat.length, DB_STAGES.length);
  assert.deepEqual([...flat].sort(), [...DB_STAGES].sort());
});

test('an unknown stage falls into a trailing Other group, never vanishes', () => {
  const groups = groupStages([...DB_STAGES, 'Mystery Stage']);
  const other = groups.find((g) => g.key === 'other');
  assert.deepEqual(other.stages, ['Mystery Stage']);
});

test('empty groups are omitted; empty/null input is safe', () => {
  const groups = groupStages(['New', 'Client']);
  assert.deepEqual(groups.map((g) => g.key), ['pipeline', 'closed']);
  assert.deepEqual(groupStages([]), []);
  assert.deepEqual(groupStages(null), []);
});

test('STAGE_GROUPS covers the four named buckets', () => {
  assert.deepEqual(STAGE_GROUPS.map((g) => g.key), ['pipeline', 'warm', 'closed', 'parked']);
});
