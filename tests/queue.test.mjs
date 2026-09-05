import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeKey, backoffMinutes, classifyError, ERROR_KIND, STATUS, KIND, PRIORITY,
  CLAIM_TTL_MINUTES,
} from '../lib/queue.mjs';

// The queue's whole job is to make retries safe. These pin the decisions that
// keep a crashed worker from costing money twice.

test('the same work on the same prospect produces the same key', () => {
  const a = dedupeKey(KIND.VERIFY_SITE, { workspace: 'ary', prospectId: 7 });
  const b = dedupeKey(KIND.VERIFY_SITE, { workspace: 'ary', prospectId: 7 });
  assert.equal(a, b, 'two callers asking for the same thing must collide');
});

test('keys are scoped by workspace and prospect', () => {
  const mine = dedupeKey(KIND.VET, { workspace: 'ary', prospectId: 7 });
  const theirs = dedupeKey(KIND.VET, { workspace: 'ellen', prospectId: 7 });
  const other = dedupeKey(KIND.VET, { workspace: 'ary', prospectId: 8 });
  assert.notEqual(mine, theirs, 'workspaces must never share a key');
  assert.notEqual(mine, other, 'prospects must never share a key');
});

test('different jobs on one prospect do not collide', () => {
  const a = dedupeKey(KIND.SIGNALS, { workspace: 'ary', prospectId: 7 });
  const b = dedupeKey(KIND.VERIFY_SITE, { workspace: 'ary', prospectId: 7 });
  assert.notEqual(a, b);
});

test('backoff grows and is capped', () => {
  assert.equal(backoffMinutes(1), 1);
  assert.equal(backoffMinutes(2), 5);
  assert.equal(backoffMinutes(3), 25);
  assert.ok(backoffMinutes(9) <= 60, 'never waits longer than an hour');
});

test('running out of credits is not a failure', () => {
  // The work is still worth doing, just not now. Treating it as a failure
  // burns the attempts and eventually loses the job.
  const err = new Error('You have run out of credits.');
  assert.equal(classifyError(err), ERROR_KIND.BUDGET);
  assert.equal(classifyError({ budget: true, message: 'anything' }), ERROR_KIND.BUDGET);
});

test('a decision for a person is not retried', () => {
  // Running it again does not make the answer appear.
  assert.equal(classifyError({ human: true, message: 'ambiguous' }), ERROR_KIND.HUMAN);
  assert.equal(classifyError(new Error('Ambiguous: not enough to decide')), ERROR_KIND.HUMAN);
});

test('a missing prospect is permanent, a timeout is not', () => {
  assert.equal(classifyError(new Error('Prospect not found')), ERROR_KIND.PERMANENT);
  assert.equal(classifyError(new Error('No domain')), ERROR_KIND.PERMANENT);
  assert.equal(classifyError(new Error('fetch failed: ETIMEDOUT')), ERROR_KIND.TRANSIENT);
});

test('an unrecognised error is retried rather than abandoned', () => {
  // Giving up on something recoverable is worse than one wasted retry.
  assert.equal(classifyError(new Error('something nobody has seen before')), ERROR_KIND.TRANSIENT);
  assert.equal(classifyError(null), ERROR_KIND.TRANSIENT);
});

test('conversations outrank research in the queue, same as Pick Bee', () => {
  assert.ok(PRIORITY.REPLY > PRIORITY.VET);
  assert.ok(PRIORITY.VET > PRIORITY.VERIFY);
  assert.ok(PRIORITY.VERIFY > PRIORITY.PRESCREEN);
  assert.ok(PRIORITY.PRESCREEN > PRIORITY.SWEEP);
});

test('a claim expires, so a crashed worker does not strand its jobs forever', () => {
  assert.ok(CLAIM_TTL_MINUTES >= 5, 'long enough for the slowest handler');
  assert.ok(CLAIM_TTL_MINUTES <= 60, 'short enough to recover the same day');
});

test('every status a job can hold has a name', () => {
  assert.deepEqual(
    Object.values(STATUS).sort(),
    ['cancelled', 'done', 'failed', 'queued', 'running', 'waiting']
  );
});
