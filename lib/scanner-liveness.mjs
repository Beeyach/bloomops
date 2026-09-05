// Is this run dead, or is it just waiting its turn?
//
// Those looked identical, and one of them got closed for it. A run that is
// perfectly healthy but cannot start its next site check, because both scanner
// slots are busy, produces no finished items. `heartbeat_at` only moves when an
// item finishes. The abandonment rule only looked at `heartbeat_at`. So fifteen
// minutes of patience read exactly like fifteen minutes of being dead, and the
// reconciler closed a run that had done nothing wrong.
//
// The fix is not to keep waiting runs alive by touching their heartbeat. That
// would make genuinely dead runs immortal, which is a worse bug than the one
// being fixed: the whole reason abandonment exists is that a run once sat
// claiming to be RUNNING for nine hours.
//
// Instead the question is asked properly. "No progress" is not a cause, it is a
// symptom, and the causes are already written down in the queue:
//
//   the run is STOPPING and something is still landing   → it is settling
//   its work is parked on budget                         → it is waiting for money
//   every scanner slot is taken                          → it is waiting for a turn
//   none of the above, and no progress for 15 minutes    → it is dead
//
// Only the last one is abandonment.
//
// The load-bearing detail is that "every scanner slot is taken" cannot be true
// unless somebody claimed one in the last fifteen minutes: `inFlightCount`
// ignores claims older than the expiry. So if the whole machine stops, those
// claims age out, capacity frees, and a waiting run becomes abandonable again
// on its own. Waiting can never be an excuse that outlives the thing doing the
// waiting.
//
// That was first shipped without a new column, on the reasoning that a fresh
// claim is itself the proof the scheduler is alive. It was half right. Sparing
// a waiting run is not enough on its own, because its silence keeps building
// the whole time it waits: the instant capacity freed, run 7 was closed for the
// seventy quiet minutes it had accumulated while being protected, one step
// before the lane would have handed it work.
//
// So a run carries a second clock, `last_scheduler_seen_at`, written only when
// the drain has just proved the run is waiting on something real, and staleness
// reads the later of the two. Kept separate from `heartbeat_at` rather than
// overloading it, so "a check finished" and "the server parked this" stay
// different facts and a dead run is still unmistakably dead.

import { RUN, isTerminal, HEARTBEAT_STALE_MINUTES } from './scanner-run.mjs';
import { parseUtc } from './tz.mjs';

export const LIVENESS = {
  // Something of this run's is in a worker's hands right now.
  ACTIVE: 'ACTIVE',
  // Ready to go, but every scanner slot is busy.
  WAITING_CAPACITY: 'WAITING_CAPACITY',
  // Parked until there is budget for it.
  WAITING_BUDGET: 'WAITING_BUDGET',
  // Asked to stop, waiting for the last item to land.
  STOP_SETTLING: 'STOP_SETTLING',
  // Nothing is happening and nothing explains why.
  STALE: 'STALE',
  // Already over, one way or another.
  TERMINAL: 'TERMINAL',
};

// The only one that may lead to a run being closed.
export const ABANDONABLE = new Set([LIVENESS.STALE]);

// Minutes since a timestamp D1 wrote, or null.
//
// parseUtc, not Date.parse. D1 writes `datetime('now')` with no zone marker and
// Date.parse reads a bare timestamp as local time, which on a machine eight
// hours behind UTC makes every run look eight hours stale the moment it starts.
function minutesSince(ts, now) {
  const t = parseUtc(ts);
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / 60000;
}

// What is this run actually doing?
//
// Pure. Everything it needs is passed in, because the counts come from
// aggregates the caller already has to run and there is no sense in it doing
// them twice, and because a decision this consequential should be testable
// without a database.
export function scannerRunLiveness({
  run,
  // This run's own items.
  running = 0,
  unfinished = 0,
  // This run's jobs parked on budget by the queue's own rule.
  budgetWaiting = 0,
  // Scanner work in flight across every worker and every workspace, counted by
  // the same helper the lane itself uses.
  globalInFlight = 0,
  concurrency = 0,
  now = new Date(),
  staleMinutes = HEARTBEAT_STALE_MINUTES,
} = {}) {
  if (!run) return { mode: LIVENESS.TERMINAL, reason: 'That run does not exist.' };
  if (isTerminal(run.state)) return { mode: LIVENESS.TERMINAL, reason: `This run already ${String(run.state).toLowerCase()}.` };

  // The later of the two clocks. `heartbeat_at` says when a check last
  // finished; `last_scheduler_seen_at` says when the server last looked and
  // deliberately left this waiting. A waiting run finishes nothing, so the
  // first freezes while the run is perfectly healthy.
  const beat = minutesSince(run.heartbeat_at || run.started_at, now);
  const seen = run.last_scheduler_seen_at ? minutesSince(run.last_scheduler_seen_at, now) : null;
  const quietFor = beat == null ? seen : (seen == null ? beat : Math.min(beat, seen));
  const stale = quietFor != null && quietFor > staleMinutes;

  // Its own work is in somebody's hands. Nothing to decide.
  if (running > 0) {
    return {
      mode: run.state === RUN.STOPPING ? LIVENESS.STOP_SETTLING : LIVENESS.ACTIVE,
      reason: run.state === RUN.STOPPING
        ? 'Stopping. Waiting for the last one to finish.'
        : `${running} being checked right now.`,
      quietFor,
    };
  }

  // Stopping, with nothing left in flight. Settling is somebody else's job
  // (settleIfFinished), and it is not abandonment either way.
  if (run.state === RUN.STOPPING) {
    return { mode: LIVENESS.STOP_SETTLING, reason: 'Stopping. Everything already done was kept.', quietFor };
  }

  // Nothing left to do at all. The run is about to settle itself; closing it as
  // abandoned in the gap would be wrong and would say so on the page.
  if (unfinished <= 0) {
    return { mode: LIVENESS.ACTIVE, reason: 'Finishing up.', quietFor };
  }

  // Parked on money. The queue already recorded that decision; this only reads
  // it back. Waiting for budget is not a fault and costs nothing.
  if (budgetWaiting > 0) {
    return { mode: LIVENESS.WAITING_BUDGET, reason: 'Paused until there is budget for the next one.', quietFor };
  }

  // Waiting for a turn.
  //
  // Only true while somebody else's claim is fresh, because that is the only
  // way in-flight is non-zero. A dead machine cannot hide behind this.
  if (concurrency > 0 && globalInFlight >= concurrency) {
    return {
      mode: LIVENESS.WAITING_CAPACITY,
      reason: 'Ready to carry on. Every site checker is busy right now.',
      quietFor,
      globalInFlight,
    };
  }

  // There is work, there is room, there is money, and still nothing has
  // happened for longer than anything legitimate takes.
  if (stale) {
    return { mode: LIVENESS.STALE, reason: `No progress for over ${staleMinutes} minutes.`, quietFor };
  }

  return { mode: LIVENESS.ACTIVE, reason: 'Working.', quietFor };
}

// What Ary is told, per mode.
//
// Kept beside the rule so the words cannot drift from the meaning. A healthy
// wait must never borrow the vocabulary of a failure: "waiting" is not
// "stopped", and neither is "stuck".
export function livenessSummary(liveness, { run = null } = {}) {
  const mode = liveness?.mode;
  switch (mode) {
    case LIVENESS.WAITING_CAPACITY:
      return {
        headline: 'Waiting for a site checker',
        detail: 'This run is ready to carry on. LTB will continue automatically when a checker is free.',
        healthy: true,
      };
    case LIVENESS.WAITING_BUDGET:
      return {
        headline: 'Waiting for budget',
        detail: 'The run is safe. It will carry on when there is budget for the next one.',
        healthy: true,
      };
    case LIVENESS.STOP_SETTLING:
      return {
        headline: 'Stopping',
        detail: 'Waiting for the one already started to finish. Everything done so far was kept.',
        healthy: true,
      };
    case LIVENESS.ACTIVE:
      return {
        headline: 'Working',
        detail: liveness?.reason || 'Working through the list.',
        healthy: true,
      };
    case LIVENESS.STALE:
      return {
        headline: 'This run stopped unexpectedly',
        detail: 'Everything it completed was kept. Start a fresh scan when you want to carry on.',
        healthy: false,
      };
    default:
      return { headline: '', detail: '', healthy: true };
  }
}
