// A run that did the important part must not be recorded as having done nothing.
//
// On 2026-08-12 the daily wake woke the budget waiters and enqueued both
// workspace sweeps — jobs 486 and 487, both of which completed — and then never
// wrote its completion mark. The health page could only say "started, but did
// not finish", which is true of three different problems:
//
//   1. the cron never fired
//   2. the sweep enqueue failed, so nothing new enters the queue ever again
//   3. the sweep worked and something afterwards did not
//
// The third is what happened, and it is the least alarming of the three. No
// error from that run was persisted, so the cause is not recoverable and none
// is invented here. What is fixed is what made it unrecoverable: a later stage
// could erase the proof an earlier one succeeded, and nothing said which stage
// stopped.

import test from 'node:test';
import assert from 'node:assert/strict';
import { d1, migration } from './_d1.mjs';

import {
  OUTCOME, runStage, markSchedulerInvoked, markSchedulerCompleted,
  markSchedulerFinished, readSchedulerHeartbeat, dailyWakeHealth, SCHEDULER, DAILY_WAKE,
} from '../lib/scheduler-health.mjs';

const conn = () => d1([
  migration('052_system_heartbeats.sql'),
  migration('057_scheduler_stage_results.sql'),
]);

// The control flow of the real handler, with each stage supplied by the test.
// Same order, same isolation, same outcome rule.
async function wake(db, { waiters, sweeps, watches }) {
  await markSchedulerInvoked(db, { name: DAILY_WAKE });
  const stages = [];
  await runStage(stages, 'budget-waiters', waiters);
  for (const [ws, fn] of Object.entries(sweeps)) {
    await runStage(stages, `sweep-enqueue:${ws}`, fn);
  }
  await runStage(stages, 'watch-renewal', watches);

  const failed = stages.filter((s) => !s.ok);
  const sweepFailed = failed.some((s) => s.stage.startsWith('sweep-enqueue'));
  const outcome = failed.length === 0
    ? OUTCOME.COMPLETED
    : (sweepFailed ? OUTCOME.FAILED : OUTCOME.PARTIAL);

  if (outcome === OUTCOME.COMPLETED) await markSchedulerCompleted(db, { name: DAILY_WAKE });
  await markSchedulerFinished(db, { name: DAILY_WAKE, outcome, stages });
  return { outcome, stages };
}

const ok = async () => 'queued';
const boom = (msg) => async () => { throw new Error(msg); };

// 1
test('a full daily wake records invoked and completed', async () => {
  const db = conn();
  const r = await wake(db, { waiters: ok, sweeps: { ary: ok, ellen: ok }, watches: ok });
  assert.equal(r.outcome, OUTCOME.COMPLETED);

  const beat = await readSchedulerHeartbeat(db, { name: DAILY_WAKE });
  assert.ok(beat.invokedAt, 'invoked');
  assert.ok(beat.completedAt, 'and completed');
  assert.equal(beat.outcome, OUTCOME.COMPLETED);
  assert.equal(beat.error, null);
  assert.equal(beat.stages.every((s) => s.ok), true);
});

// 2
test('no cron invocation writes no heartbeat at all', async () => {
  const db = conn();
  const beat = await readSchedulerHeartbeat(db, { name: DAILY_WAKE });
  assert.equal(beat.invokedAt, null);
  assert.equal(beat.completedAt, null);
  assert.equal(beat.outcome, null);
  // And the health surface says so without calling it an outage.
  const h = dailyWakeHealth({ invokedAt: null, completedAt: null });
  assert.equal(h.state, SCHEDULER.UNKNOWN);
  assert.equal(h.attention, false);
});

// 3 — the 2026-08-12 shape
test('sweeps enqueued, watch renewal fails -> partial, and the sweeps stay real', async () => {
  const db = conn();
  const r = await wake(db, {
    waiters: ok,
    sweeps: { ary: ok, ellen: ok },
    watches: boom('watch renewal exploded'),
  });

  assert.equal(r.outcome, OUTCOME.PARTIAL, 'not a plain failure — the pipeline stage worked');

  const beat = await readSchedulerHeartbeat(db, { name: DAILY_WAKE });
  assert.ok(beat.invokedAt);
  assert.equal(beat.completedAt, null, 'partial does not claim completion');
  assert.equal(beat.outcome, OUTCOME.PARTIAL);
  assert.match(beat.error, /watch renewal exploded/);

  // The proof the sweeps were enqueued survives the later failure. This is the
  // whole point: on 2026-08-12 that proof existed only in the jobs table.
  const sweeps = beat.stages.filter((s) => s.stage.startsWith('sweep-enqueue'));
  assert.equal(sweeps.length, 2);
  assert.equal(sweeps.every((s) => s.ok), true, 'both workspaces still recorded as swept');
  assert.equal(beat.stages.find((s) => s.stage === 'watch-renewal').ok, false);
});

// 4
test('one workspace failing does not cost the other its sweep', async () => {
  const db = conn();
  const r = await wake(db, {
    waiters: ok,
    sweeps: { ary: ok, ellen: boom('ellen is broken') },
    watches: ok,
  });

  assert.equal(r.outcome, OUTCOME.FAILED, 'a sweep failure is the serious one');
  const beat = await readSchedulerHeartbeat(db, { name: DAILY_WAKE });
  assert.equal(beat.stages.find((s) => s.stage === 'sweep-enqueue:ary').ok, true, 'ary was still swept');
  assert.equal(beat.stages.find((s) => s.stage === 'sweep-enqueue:ellen').ok, false);
  assert.equal(beat.completedAt, null);
});

// 5
test('a budget-waiter failure is recorded and does not stop the sweep', async () => {
  const db = conn();
  const r = await wake(db, { waiters: boom('waiters exploded'), sweeps: { ary: ok }, watches: ok });
  assert.equal(r.outcome, OUTCOME.PARTIAL);
  const beat = await readSchedulerHeartbeat(db, { name: DAILY_WAKE });
  assert.equal(beat.stages.find((s) => s.stage === 'budget-waiters').ok, false);
  assert.equal(beat.stages.find((s) => s.stage === 'sweep-enqueue:ary').ok, true, 'the sweep still ran');
});

// 6
test('mark-completed is never written on a failed run', async () => {
  const db = conn();
  await wake(db, { waiters: boom('a'), sweeps: { ary: boom('b') }, watches: boom('c') });
  const beat = await readSchedulerHeartbeat(db, { name: DAILY_WAKE });
  assert.equal(beat.outcome, OUTCOME.FAILED);
  assert.equal(beat.completedAt, null);
  assert.ok(beat.finishedAt, 'but it did stop, and says when');
});

// 7
test('partial work is never labelled full success', async () => {
  const db = conn();
  await wake(db, { waiters: ok, sweeps: { ary: ok }, watches: boom('later maintenance') });
  const beat = await readSchedulerHeartbeat(db, { name: DAILY_WAKE });
  assert.notEqual(beat.outcome, OUTCOME.COMPLETED);
  // And the operator can still tell it apart from a dead cron.
  const h = dailyWakeHealth({ invokedAt: beat.invokedAt, completedAt: beat.completedAt });
  assert.equal(h.state, SCHEDULER.INCOMPLETE);
  assert.equal(h.attention, true);
});

// The four states an operator has to be able to tell apart.
test('the four cases are distinguishable from the heartbeat alone', async () => {
  const never = conn();
  const full = conn(); await wake(full, { waiters: ok, sweeps: { ary: ok }, watches: ok });
  const later = conn(); await wake(later, { waiters: ok, sweeps: { ary: ok }, watches: boom('x') });
  const sweep = conn(); await wake(sweep, { waiters: ok, sweeps: { ary: boom('x') }, watches: ok });

  const read = async (db) => readSchedulerHeartbeat(db, { name: DAILY_WAKE });
  assert.equal((await read(never)).invokedAt, null, '1. cron never fired');
  assert.equal((await read(full)).outcome, OUTCOME.COMPLETED, '4. full success');
  assert.equal((await read(later)).outcome, OUTCOME.PARTIAL, '2. sweep ok, later maintenance failed');
  assert.equal((await read(sweep)).outcome, OUTCOME.FAILED, '3. sweep enqueue failed');
});

// Errors are recorded, never swallowed.
test('a stage error reaches the heartbeat with no secret in it', async () => {
  const db = conn();
  await wake(db, {
    waiters: ok,
    sweeps: { ary: ok },
    watches: boom('refresh failed for token=ya29.SUPERSECRETVALUE0000000000000000000'),
  });
  const beat = await readSchedulerHeartbeat(db, { name: DAILY_WAKE });
  assert.match(beat.error, /refresh failed/, 'the error is there');
  assert.doesNotMatch(beat.error, /SUPERSECRETVALUE/, 'the token is not');
});

// 8-12: nothing about this touches sending.
test('none of this can send, arm or approve anything', async () => {
  const { sendPolicy } = await import('../lib/send-policy.mjs');
  const p = sendPolicy({});
  assert.equal(p.autoSendApprovedFirstEmails, false);
  assert.equal(p.autoSendApprovedFollowups, false);

  const { readFileSync } = await import('node:fs');
  const lib = readFileSync(new URL('../lib/scheduler-health.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['sendApproved', 'sendMessage', 'outreach_packages', 'auto_followup']) {
    assert.ok(!lib.includes(forbidden), `scheduler health never touches ${forbidden}`);
  }
});
