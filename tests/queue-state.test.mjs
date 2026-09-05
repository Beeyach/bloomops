// A job waiting for its scheduled retry is not a stuck job.
//
// PREPARE_OUTREACH job 522 failed twice on a real bug, the queue wrote
// `run_after` five minutes out exactly as designed, and the retry landed on the
// next cron tick and succeeded. In between, every surface showed the word
// "queued", which is also what a genuinely abandoned job shows. It was reported
// as a stuck queue and a defect that did not exist.
//
// The queue was right. These pin the reporting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  queueStateOf, queueStateCounts, QUEUE_STATE,
  STUCK_RUNNING_MINUTES, DELAYED_READY_MINUTES,
} from '../lib/queue-state.mjs';

// Frozen. Every case below is relative to this instant.
const NOW = new Date('2026-08-12T06:00:00.000Z');
const minutes = (n) => new Date(NOW.getTime() + n * 60_000).toISOString();
const state = (job) => queueStateOf(job, { now: NOW });

const queued = (over = {}) => ({
  id: 1, kind: 'prepare-outreach', status: 'queued',
  attempts: 0, max_attempts: 3, run_after: null, claimed_at: null,
  created_at: minutes(-1), updated_at: minutes(-1), ...over,
});

// ── the six states ───────────────────────────────────────────────────────

test('a new queued job is ready', () => {
  const s = state(queued());
  assert.equal(s.state, QUEUE_STATE.READY);
  assert.equal(s.label, 'Ready to run');
  assert.equal(s.eligibleNow, true);
  assert.equal(s.possiblyStuck, false);
});

test('a failed attempt with a future run_after is waiting for retry', () => {
  const s = state(queued({ attempts: 1, run_after: minutes(4) }));
  assert.equal(s.state, QUEUE_STATE.WAITING_FOR_RETRY);
  assert.equal(s.label, 'Waiting for retry');
  assert.equal(s.eligibleNow, false);
  assert.equal(s.possiblyStuck, false, 'a scheduled retry is never stuck');
  assert.match(s.detail, /Attempt 1 of 3/);
  assert.match(s.detail, /about 4 minutes/);
});

test('it becomes ready exactly when run_after passes', () => {
  assert.equal(state(queued({ attempts: 1, run_after: minutes(1) })).state, QUEUE_STATE.WAITING_FOR_RETRY);
  assert.equal(state(queued({ attempts: 1, run_after: minutes(0) })).state, QUEUE_STATE.READY);
  assert.equal(state(queued({ attempts: 1, run_after: minutes(-1) })).state, QUEUE_STATE.READY);
});

test('later attempts below the ceiling are still waiting, not failing', () => {
  const s = state(queued({ attempts: 2, max_attempts: 3, run_after: minutes(20) }));
  assert.equal(s.state, QUEUE_STATE.WAITING_FOR_RETRY);
  assert.equal(s.retriesRemaining, 1);
});

test('an exhausted job is terminally failed', () => {
  const s = state(queued({ status: 'failed', attempts: 3, max_attempts: 3 }));
  assert.equal(s.state, QUEUE_STATE.TERMINAL_FAILED);
  assert.equal(s.label, 'Failed');
  assert.equal(s.retriesRemaining, 0);
  assert.match(s.detail, /No retries remaining/);
});

test('a recently claimed job is running', () => {
  const s = state(queued({ status: 'running', attempts: 1, claimed_at: minutes(-2) }));
  assert.equal(s.state, QUEUE_STATE.RUNNING);
  assert.equal(s.label, 'Running');
  assert.equal(s.possiblyStuck, false);
});

test('a claim past the lease is possibly stuck', () => {
  const s = state(queued({ status: 'running', attempts: 1, claimed_at: minutes(-(STUCK_RUNNING_MINUTES + 1)) }));
  assert.equal(s.state, QUEUE_STATE.POSSIBLY_STUCK);
  assert.equal(s.possiblyStuck, true);
  // The threshold is the queue's own reclaim window, not a number invented here.
  assert.equal(STUCK_RUNNING_MINUTES, 15);
});

test('a completed job is complete', () => {
  assert.equal(state(queued({ status: 'done' })).state, QUEUE_STATE.COMPLETE);
  assert.equal(state(queued({ status: 'cancelled' })).state, QUEUE_STATE.CANCELLED);
});

// ── the line between waiting and worrying ────────────────────────────────

test('a ready job just past one drain tick is not called stuck', () => {
  // The cron runs every five minutes and takes five jobs per workspace, so a
  // few ticks of waiting is ordinary.
  for (const age of [6, 10, 20, DELAYED_READY_MINUTES - 1]) {
    const s = state(queued({ updated_at: minutes(-age) }));
    assert.equal(s.state, QUEUE_STATE.READY, `${age} minutes old`);
    assert.equal(s.possiblyStuck, false, `${age} minutes old`);
  }
});

test('a ready job well past the cadence is called delayed, not stuck', () => {
  const s = state(queued({ updated_at: minutes(-(DELAYED_READY_MINUTES + 5)) }));
  assert.equal(s.state, QUEUE_STATE.DELAYED);
  assert.equal(s.label, 'Delayed');
  assert.notEqual(s.label, 'Possibly stuck', 'a queue behind on work is not a broken queue');
  assert.equal(DELAYED_READY_MINUTES, 30, 'six cron ticks');
});

// ── job 522, from its preserved row ──────────────────────────────────────

test('job 522 reads as waiting for retry throughout its backoff, never stuck', () => {
  // The row as the queue wrote it: two failed attempts, retry scheduled for
  // 05:25:36Z, claimed at 05:35:26Z, done at 05:35:35Z.
  const during = {
    id: 522, kind: 'prepare-outreach', status: 'queued',
    attempts: 2, max_attempts: 3, run_after: '2026-08-12T05:25:36.455Z',
    claimed_at: null, created_at: '2026-08-12 05:13:04', updated_at: '2026-08-12 05:20:36',
  };
  // Every moment I actually looked at it.
  for (const t of ['2026-08-12T05:20:40Z', '2026-08-12T05:22:00Z', '2026-08-12T05:25:00Z']) {
    const s = queueStateOf(during, { now: new Date(t) });
    assert.equal(s.state, QUEUE_STATE.WAITING_FOR_RETRY, t);
    assert.equal(s.possiblyStuck, false, t);
    assert.equal(s.nextAttemptAt, '2026-08-12T05:25:36.455Z', t);
  }
  // Past run_after but before the next tick: ready, and still not stuck. This
  // is the window I called it stuck in.
  for (const t of ['2026-08-12T05:29:58Z', '2026-08-12T05:31:53Z']) {
    const s = queueStateOf(during, { now: new Date(t) });
    assert.equal(s.state, QUEUE_STATE.READY, t);
    assert.equal(s.possiblyStuck, false, t);
  }
  // And once it finished.
  const after = { ...during, status: 'done', attempts: 3, claimed_at: '2026-08-12T05:35:26.948Z', updated_at: '2026-08-12 05:35:35' };
  assert.equal(queueStateOf(after, { now: new Date('2026-08-12T05:36:00Z') }).state, QUEUE_STATE.COMPLETE);
});

// ── nextAttemptAt is the stored value ────────────────────────────────────

test('nextAttemptAt is the stored run_after, not a recomputed interval', () => {
  // If this recomputed the backoff it would eventually disagree with the runner
  // about when the job actually runs.
  const odd = '2026-08-12T06:07:13.456Z';
  assert.equal(state(queued({ attempts: 1, run_after: odd })).nextAttemptAt, odd);
});

test('a job with no run_after reports no next attempt', () => {
  assert.equal(state(queued()).nextAttemptAt, null);
});

// ── time handling ────────────────────────────────────────────────────────

test('both stored timestamp shapes are understood', () => {
  // The queue writes ISO with a T and a Z in some columns and space-separated
  // in others. Both are UTC.
  const iso = state(queued({ attempts: 1, run_after: '2026-08-12T06:04:00.000Z' }));
  const spaced = state(queued({ attempts: 1, run_after: '2026-08-12 06:04:00' }));
  assert.equal(iso.state, QUEUE_STATE.WAITING_FOR_RETRY);
  assert.equal(spaced.state, QUEUE_STATE.WAITING_FOR_RETRY);
});

test('nothing here depends on a timezone', () => {
  // The state is decided from instants. Rendering is the client's problem.
  const job = queued({ attempts: 1, run_after: minutes(4) });
  const before = process.env.TZ;
  try {
    for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Manila']) {
      process.env.TZ = tz;
      assert.equal(queueStateOf(job, { now: NOW }).state, QUEUE_STATE.WAITING_FOR_RETRY, tz);
      assert.equal(queueStateOf(job, { now: NOW }).nextAttemptAt, job.run_after, tz);
    }
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

test('malformed and missing timestamps fail safely', () => {
  assert.doesNotThrow(() => state(queued({ run_after: 'not-a-date' })));
  assert.doesNotThrow(() => state(queued({ created_at: null, updated_at: null })));
  assert.doesNotThrow(() => queueStateOf());
  assert.equal(state(queued({ run_after: 'not-a-date' })).state, QUEUE_STATE.READY, 'an unreadable date is not a future one');
  assert.equal(queueStateOf().state, QUEUE_STATE.READY);
});

// ── nothing sensitive leaks ──────────────────────────────────────────────

test('the derived state carries no payload and no error text', () => {
  const s = state(queued({
    status: 'failed', attempts: 3,
    payload: JSON.stringify({ secret: 'do-not-surface' }),
    last_error: 'ELEVENLABS_KEY=abc123 failed',
  }));
  const text = JSON.stringify(s);
  assert.ok(!text.includes('do-not-surface'), 'no payload');
  assert.ok(!text.includes('abc123'), 'no error text, which can carry a key');
  assert.ok(!('payload' in s) && !('last_error' in s));
});

// ── counts ───────────────────────────────────────────────────────────────

test('counts group a mixed queue correctly', () => {
  const c = queueStateCounts([
    queued(),
    queued({ attempts: 1, run_after: minutes(4) }),
    queued({ attempts: 2, run_after: minutes(20) }),
    queued({ status: 'running', claimed_at: minutes(-1) }),
    queued({ status: 'running', claimed_at: minutes(-30) }),
    queued({ status: 'failed', attempts: 3 }),
    queued({ status: 'done' }),
  ], { now: NOW });
  assert.equal(c[QUEUE_STATE.READY], 1);
  assert.equal(c[QUEUE_STATE.WAITING_FOR_RETRY], 2);
  assert.equal(c[QUEUE_STATE.RUNNING], 1);
  assert.equal(c[QUEUE_STATE.POSSIBLY_STUCK], 1);
  assert.equal(c[QUEUE_STATE.TERMINAL_FAILED], 1);
  assert.equal(c[QUEUE_STATE.COMPLETE], 1);
});
