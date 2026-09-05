// What a job is actually doing, in words an operator can act on.
//
// The queue stores six statuses and three timestamps, and the screen showed the
// status. That is not enough to tell apart the two things somebody watching
// actually needs to distinguish: a job whose retry is scheduled for four
// minutes from now, and a job nothing is ever going to pick up. Both read
// `queued`.
//
// Job 522 is the case. It failed twice on a real bug, the queue wrote
// `run_after` five minutes out exactly as designed, and the retry landed on the
// next cron tick and succeeded. In between, the only thing on screen was the
// word queued, so it was reported as a stuck queue and a defect that did not
// exist. The queue was right; the reporting was not.
//
// Nothing here changes what the queue does. It reads the same columns the
// runner writes and says what they mean.

import { CLAIM_TTL_MINUTES } from './queue.mjs';

export const QUEUE_STATE = {
  READY: 'READY',
  RUNNING: 'RUNNING',
  WAITING_FOR_RETRY: 'WAITING_FOR_RETRY',
  WAITING_ON_BUDGET: 'WAITING_ON_BUDGET',
  WAITING_ON_HUMAN: 'WAITING_ON_HUMAN',
  TERMINAL_FAILED: 'TERMINAL_FAILED',
  DELAYED: 'DELAYED',
  POSSIBLY_STUCK: 'POSSIBLY_STUCK',
  COMPLETE: 'COMPLETE',
  CANCELLED: 'CANCELLED',
};

// How long a claimed job may go quiet before the lease is treated as dead.
//
// Not a number invented here. It is the queue's own reclaim window: past it,
// `claimNext` will hand the job to another worker, and the health page already
// counts such a row as stuck rather than running. Saying anything else would be
// the screen disagreeing with the engine.
export const STUCK_RUNNING_MINUTES = CLAIM_TTL_MINUTES;

// How long an eligible job may sit before it is worth mentioning.
//
// Derived from the real cadence rather than chosen. The cron fires every five
// minutes and one invocation takes at most five jobs per workspace, so a
// backlog drains in five-job steps. Thirty minutes is six ticks, which is up to
// thirty jobs of head start: comfortably normal on a busy queue and clearly
// abnormal on a quiet one.
//
// It is deliberately reported as delayed rather than stuck. A job that is
// merely waiting its turn is not broken, and the whole point of this module is
// to stop calling healthy things stuck.
export const DELAYED_READY_MINUTES = 30;

const CRON_EVERY_MINUTES = 5;

const at = (v) => {
  if (!v) return null;
  // The queue writes ISO with a T and a Z in some columns and a space-separated
  // form in others. Both are UTC; only one parses reliably everywhere.
  const s = String(v).includes('T') ? String(v) : `${String(v).replace(' ', 'T')}Z`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

const minutesSince = (d, now) => (d ? Math.floor((now.getTime() - d.getTime()) / 60_000) : null);

// One job, described.
//
// Everything returned is derived from the row. `nextAttemptAt` is the stored
// `run_after` verbatim, never a recomputed interval: the runner already decided
// when the retry happens and a second opinion here would eventually disagree
// with it.
export function queueStateOf(job = {}, { now = new Date() } = {}) {
  const status = String(job.status || '').toLowerCase();
  const attempts = Number(job.attempts) || 0;
  const maxAttempts = Number(job.max_attempts) || 0;
  const runAfter = at(job.run_after);
  const claimedAt = at(job.claimed_at);
  const createdAt = at(job.created_at);
  const updatedAt = at(job.updated_at);

  const base = {
    id: job.id ?? null,
    kind: job.kind || null,
    attempt: attempts,
    maxAttempts: maxAttempts || null,
    // Always the stored value, in UTC, for the client to render locally.
    nextAttemptAt: job.run_after ? (runAfter ? runAfter.toISOString() : null) : null,
    startedAt: claimedAt ? claimedAt.toISOString() : null,
    eligibleNow: false,
    possiblyStuck: false,
    retriesRemaining: maxAttempts ? Math.max(0, maxAttempts - attempts) : null,
  };

  if (status === 'done') {
    return { ...base, state: QUEUE_STATE.COMPLETE, label: 'Completed', detail: null };
  }
  if (status === 'cancelled') {
    return { ...base, state: QUEUE_STATE.CANCELLED, label: 'Cancelled', detail: null };
  }
  if (status === 'failed') {
    return {
      ...base,
      state: QUEUE_STATE.TERMINAL_FAILED,
      label: 'Failed',
      detail: 'No retries remaining.',
      retriesRemaining: 0,
    };
  }

  if (status === 'running') {
    const running = minutesSince(claimedAt, now);
    // Past the lease, the queue itself will reclaim this. That is real evidence
    // rather than a guess about elapsed time.
    if (running !== null && running >= STUCK_RUNNING_MINUTES) {
      return {
        ...base,
        state: QUEUE_STATE.POSSIBLY_STUCK,
        label: 'Possibly stuck',
        detail: `Started ${running} minutes ago and nothing has been heard since. The queue reclaims it after ${STUCK_RUNNING_MINUTES}.`,
        possiblyStuck: true,
      };
    }
    return {
      ...base,
      state: QUEUE_STATE.RUNNING,
      label: 'Running',
      detail: running === null ? null : `Attempt ${attempts}, started ${running} minute${running === 1 ? '' : 's'} ago.`,
    };
  }

  if (status === 'waiting') {
    const kind = String(job.error_kind || '').toLowerCase();
    if (kind === 'budget') {
      return { ...base, state: QUEUE_STATE.WAITING_ON_BUDGET, label: 'Waiting for budget', detail: 'It will run when there is allowance for it.' };
    }
    if (kind === 'human') {
      return { ...base, state: QUEUE_STATE.WAITING_ON_HUMAN, label: 'Waiting on a person', detail: 'Nothing will move this on its own.' };
    }
    return { ...base, state: QUEUE_STATE.WAITING_ON_HUMAN, label: 'Waiting', detail: null };
  }

  // Queued. The one that needed telling apart.
  const dueLater = runAfter && runAfter.getTime() > now.getTime();
  if (dueLater) {
    // A retry the queue has already scheduled. Not a problem, and the row says
    // so in a column nobody was reading.
    const mins = Math.max(1, Math.ceil((runAfter.getTime() - now.getTime()) / 60_000));
    return {
      ...base,
      state: QUEUE_STATE.WAITING_FOR_RETRY,
      label: 'Waiting for retry',
      detail: `Attempt ${attempts} of ${maxAttempts || '?'} failed. It tries again in about ${mins} minute${mins === 1 ? '' : 's'}.`,
      eligibleNow: false,
    };
  }

  // Eligible now. Only the length of the wait can make this worth mentioning,
  // and even then it is a delay rather than a fault.
  const waitingSince = updatedAt || createdAt;
  const waited = minutesSince(waitingSince, now);
  if (waited !== null && waited >= DELAYED_READY_MINUTES) {
    return {
      ...base,
      state: QUEUE_STATE.DELAYED,
      label: 'Delayed',
      detail: `Ready for ${waited} minutes. The queue wakes every ${CRON_EVERY_MINUTES} minutes, so this is longer than a busy queue explains.`,
      eligibleNow: true,
      possiblyStuck: true,
    };
  }
  return {
    ...base,
    state: QUEUE_STATE.READY,
    label: 'Ready to run',
    detail: attempts > 0 ? `Attempt ${attempts + 1} of ${maxAttempts || '?'}, due now.` : null,
    eligibleNow: true,
  };
}

// The same question over a list, for a counts panel.
export function queueStateCounts(jobs = [], { now = new Date() } = {}) {
  const out = Object.fromEntries(Object.values(QUEUE_STATE).map((k) => [k, 0]));
  for (const j of jobs || []) out[queueStateOf(j, { now }).state] += 1;
  return out;
}
