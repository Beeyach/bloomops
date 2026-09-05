// Is Leads That Bloom actually working right now?
//
// One question, and it is not the same question Today answers. Today asks what
// needs a person. This asks whether the machine behind it is running, and the
// two get confused constantly: a quiet Today can mean everything is fine or it
// can mean nothing has run since Tuesday, and nothing on the screen told those
// apart.
//
// The hard part is not counting. It is refusing to call three different things
// by the same name:
//
//   FAILING    something tried to run and could not finish
//   WAITING    something is deliberately paused, by budget, by a person, or by
//              a prerequisite it does not control
//   IDLE       there is nothing to run
//
// Collapsing those is how an operations page becomes a page nobody opens. A
// budget pause drawn in red teaches somebody to ignore red, and after that the
// one genuine failure a month is invisible too.
//
// So: waiting for the day's budget is not a failure. A prospect with no address
// is not a failure. A scanner somebody stopped on purpose is not a failure. A
// scanner whose heartbeat died IS one. An empty queue is allowed to be
// perfectly healthy.
//
// This module decides nothing about prospects and mutates nothing. It takes
// counts that were already gathered and works out which sentence is true.

import { CLAIM_TTL_MINUTES } from './queue.mjs';
import { HEARTBEAT_STALE_MINUTES, RUN, abandonedSummary } from './scanner-run.mjs';
import { LIVENESS, ABANDONABLE, livenessSummary } from './scanner-liveness.mjs';
import { SCHEDULER } from './scheduler-health.mjs';

export const HEALTH = {
  // Work is moving through the system right now.
  HEALTHY: 'HEALTHY',
  // Nothing to do, and nothing wrong with that.
  IDLE: 'IDLE',
  // Deliberately paused. Budget, a person, a prerequisite.
  WAITING: 'WAITING',
  // Something could not finish and somebody should look.
  ATTENTION: 'ATTENTION',
  // A service the whole pipeline depends on is not answering.
  DEGRADED: 'DEGRADED',
};

// The one number a health page must never invent.
//
// There is no score here, no percentage and no confidence. A 97/100 is a
// sentence somebody made up, and the moment it appears people start asking
// what the missing 3 is instead of reading the thing that is actually wrong.
export const NO_SCORE = true;

// How long a mailbox may go unsynced before it is worth saying so.
//
// The cron enqueues a sync whenever the last one is more than twenty minutes
// old, so a mailbox quiet for an hour means either the cron or the sync stopped.
// Three times the reconcile window, because one missed run is a nuisance and
// three in a row is a fact.
export const MAILBOX_STALE_MINUTES = 60;

const minutesSince = (iso, now) => {
  if (!iso) return null;
  const t = Date.parse(String(iso).replace(' ', 'T').replace(/Z?$/, 'Z'));
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((now.getTime() - t) / 60_000));
};

export { minutesSince };

// Turn the gathered counts into one state and one sentence.
//
// Precedence is the design. A dead service outranks a failed job, because the
// failed job may well be a symptom of it. A failed job outranks work in flight,
// because "it is busy" is not an answer to "something broke". Running outranks
// waiting, and waiting outranks idle, because those two are only distinguishable
// by whether there is anything queued at all.
export function systemHealth({
  queue = {},
  attention = [],
  budget = {},
  services = [],
  scheduler = null,
  dailyWake = null,
  now = new Date(),
} = {}) {
  const running = Number(queue.running || 0);
  const queued = Number(queue.queued || 0);
  const waitingBudget = Number(queue.waitingBudget || 0);
  const waitingHuman = Number(queue.waitingHuman || 0);

  const dead = services.filter((s) => s.state === 'DOWN');
  const problems = attention.length;

  if (dead.length) {
    return {
      state: HEALTH.DEGRADED,
      headline: dead.length === 1 ? `${dead[0].label} is not responding` : `${dead.length} services are not responding`,
      detail: 'Prospect data is safe. Work that depends on this will pause until it comes back.',
      counts: { running, queued, waitingBudget, waitingHuman, problems },
    };
  }

  // The scheduler outranks everything except a dead service, and it does so on
  // purpose: if the cron has stopped, then jobs sitting still, mailboxes going
  // quiet and Hive runs not progressing are all the same incident wearing three
  // costumes. Leading with the cause means one warning instead of three
  // mysteries, which is the whole reason this heartbeat exists.
  if (scheduler && scheduler.attention) {
    return {
      state: HEALTH.ATTENTION,
      headline: scheduler.headline,
      detail: scheduler.detail,
      scheduler: scheduler.state,
      counts: { running, queued, waitingBudget, waitingHuman, problems },
    };
  }

  // The daily wake, ranked beside the drain rather than under it. It fails
  // independently, and the drain staying healthy is precisely what hides it:
  // nothing new enters the queue, so the queue drains perfectly for ever.
  //
  // The drain comes first only because if both are down, the cron itself is the
  // simpler explanation.
  if (dailyWake && dailyWake.attention) {
    return {
      state: HEALTH.ATTENTION,
      headline: dailyWake.headline,
      detail: dailyWake.detail,
      dailyWake: dailyWake.state,
      counts: { running, queued, waitingBudget, waitingHuman, problems },
    };
  }

  if (problems > 0) {
    return {
      state: HEALTH.ATTENTION,
      headline: problems === 1 ? 'One thing could not finish' : `${problems} things could not finish`,
      // Said every time, because the first question anybody has when a screen
      // says something broke is whether it broke something that matters.
      detail: 'Nothing was sent by mistake and no prospect data was lost. The rest of the work carried on.',
      counts: { running, queued, waitingBudget, waitingHuman, problems },
    };
  }

  if (running > 0) {
    return {
      state: HEALTH.HEALTHY,
      headline: 'Everything is running normally',
      detail: `${running} ${running === 1 ? 'job is' : 'jobs are'} being worked on right now. Nothing needs you.`,
      counts: { running, queued, waitingBudget, waitingHuman, problems },
    };
  }

  if (waitingBudget > 0) {
    return {
      state: HEALTH.WAITING,
      headline: "Waiting on today's budget",
      // The most important sentence on the page. Somebody who reads this as a
      // rejection starts deleting prospects.
      detail: `${waitingBudget} ${waitingBudget === 1 ? 'check is' : 'checks are'} paused until the allowance resets${budget.resetsAt ? ` at ${budget.resetsAt}` : ''}. They have not been turned down.`,
      counts: { running, queued, waitingBudget, waitingHuman, problems },
    };
  }

  if (queued > 0) {
    return {
      state: HEALTH.WAITING,
      headline: 'Work is queued',
      detail: `${queued} ${queued === 1 ? 'job is' : 'jobs are'} waiting their turn. The queue runs every few minutes.`,
      counts: { running, queued, waitingBudget, waitingHuman, problems },
    };
  }

  if (waitingHuman > 0) {
    return {
      state: HEALTH.WAITING,
      headline: 'Waiting on you',
      detail: `${waitingHuman} ${waitingHuman === 1 ? 'job stopped' : 'jobs stopped'} to ask something rather than guess. They are in Today.`,
      counts: { running, queued, waitingBudget, waitingHuman, problems },
    };
  }

  return {
    state: HEALTH.IDLE,
    headline: 'Quiet right now',
    detail: 'Nothing is stuck and nothing is queued. There is simply no background work to do at the moment.',
    counts: { running, queued, waitingBudget, waitingHuman, problems },
  };
}

// Is this claimed job actually still being worked on?
//
// The same fifteen minutes the queue itself uses to decide a claim has expired,
// imported rather than retyped: a health page that disagreed with the runner
// about what "stuck" means would be worse than no health page.
export function claimIsStale(claimedAt, now = new Date()) {
  const mins = minutesSince(claimedAt, now);
  return mins != null && mins >= CLAIM_TTL_MINUTES;
}

// Is this scanner run still alive?
//
// Again the canonical constant. RUNNING with a dead heartbeat is the one
// scanner state that is a real problem; every other stopped state is either
// finished or something a person chose.
export function runIsStale(run, now = new Date()) {
  if (!run || (run.state !== RUN.RUNNING && run.state !== RUN.STOPPING)) return false;
  const mins = minutesSince(run.heartbeat_at || run.started_at, now);
  return mins != null && mins >= HEARTBEAT_STALE_MINUTES;
}

// What the Hive is doing, said plainly, without touching it.
export function scannerSummary(run, now = new Date(), { liveness = null } = {}) {
  if (!run) return { state: 'NONE', text: 'No Hive run is active.', attention: false };

  const stale = runIsStale(run, now);
  const done = Number(run.processed || 0);
  const total = Number(run.total || 0);
  const progress = total > 0 ? `${done} of ${total}` : `${done} done`;

  const sum = abandonedSummary(run);

  // A run whose heartbeat died but which the reconciler has not reached yet.
  //
  // Kept as a fallback rather than removed: the cron closes these within a few
  // minutes, and for those few minutes the truth is still that it is dead. It
  // says the same sentence the closed version does, so the wording does not
  // change under Ary when the row is corrected.
  if (stale && !(liveness && !ABANDONABLE.has(liveness.mode) && liveness.mode !== LIVENESS.TERMINAL)) {
    return { state: RUN.ABANDONED, text: `${sum.headline}. ${sum.progress}. ${sum.kept}`, attention: true, pendingClose: true };
  }
  // A run that is waiting on purpose.
  //
  // Checked before staleness, because "no progress" is a symptom and this is
  // the cause. A run queuing for a free site checker used to be reported here
  // as having stopped unexpectedly, which was both wrong and alarming: nothing
  // was wrong, and there was nothing for Ary to do about it.
  if (liveness && !ABANDONABLE.has(liveness.mode) && liveness.mode !== LIVENESS.TERMINAL) {
    const s = livenessSummary(liveness);
    if (liveness.mode === LIVENESS.WAITING_CAPACITY || liveness.mode === LIVENESS.WAITING_BUDGET) {
      return {
        state: liveness.mode,
        text: `${s.headline}. ${s.detail} ${progress} so far.`,
        // Waiting is not a fault, however long it has waited.
        attention: false,
        waiting: true,
      };
    }
  }

  if (run.state === RUN.RUNNING) {
    // Worth saying out loud for a run the queue owns. The whole reason this
    // page exists is that a run once died silently when a tab closed, and the
    // useful thing to know about this one is that closing a tab cannot do that
    // to it any more.
    const unattended = run.durable ? ' It keeps going whether or not the page is open.' : '';
    return { state: RUN.RUNNING, text: `Working through ${progress}.${unattended}`, attention: false };
  }
  if (run.state === RUN.STOPPING) return { state: RUN.STOPPING, text: `Stopping after the current one finishes. ${progress}.`, attention: false };
  if (run.state === RUN.STOPPED) return { state: RUN.STOPPED, text: `Stopped by you at ${progress}. Everything already done was kept.`, attention: false };
  if (run.state === RUN.COMPLETED) return { state: RUN.COMPLETED, text: `Finished ${progress}.`, attention: false };
  if (run.state === RUN.ABANDONED) {
    // Shown, because storage being corrected does not mean nothing happened.
    // Shown for a day rather than for ever: a warning that can never be
    // cleared is a warning people learn to scroll past, and there is no action
    // that resolves this one beyond starting a fresh scan.
    const closedMins = minutesSince(run.finished_at || run.stopped_at || run.heartbeat_at, now);
    const recent = closedMins == null || closedMins < 60 * 24;
    return {
      state: RUN.ABANDONED,
      text: `A Hive run stopped unexpectedly and was safely closed. ${sum.progress}. ${sum.kept}`,
      attention: recent,
      closed: true,
    };
  }
  return { state: run.state, text: `Last run ${String(run.state).toLowerCase()} at ${progress}.`, attention: false };
}

// What the scanner lane is doing, in numbers a person can act on.
//
// Deliberately never unhealthy for being busy. A run with four thousand items
// waiting is a big scan, not a fault, and a health page that panics about size
// teaches people to ignore it. The only thing here that asks for attention is
// items that actually failed.
export function scannerLane({ load = null, throughput = null } = {}) {
  const running = Number(load?.running || 0);
  const queued = Number(load?.queued || 0) + Number(load?.pending || 0);
  const failed = Number(load?.failed || 0);

  const parts = [];
  if (running) parts.push(`${running} site${running === 1 ? '' : 's'} being checked right now`);
  if (queued) parts.push(`${queued.toLocaleString('en-US')} waiting`);
  if (!parts.length) parts.push('No site checks in progress');

  // Only when there is enough of it to mean something. One cold start and one
  // warm check differ by a factor of three, and a number that swings on every
  // refresh is worse than no number.
  const speed = throughput?.enough ? `About ${throughput.perHour} an hour recently.` : null;

  return {
    state: running ? 'WORKING' : queued ? 'WAITING' : 'IDLE',
    text: `${parts.join(', ')}.${speed ? ` ${speed}` : ''}`,
    running,
    queued,
    failed,
    perHour: throughput?.enough ? throughput.perHour : null,
    // Shown, but never counted as ill health on its own: a site that will not
    // load is a fact about them.
    attention: false,
    concurrency: load?.concurrency ?? null,
  };
}

// A service is only as healthy as the evidence for it.
//
// `signal` is not decoration. Every row on the page carries the sentence that
// justifies its state, because "Connected" with nothing behind it is the lie an
// operations page tells most often: a token in a table, an environment variable,
// a route that returns 200 to an unauthenticated probe. None of those prove a
// service did any work.
//
// A service with no evidence is reported UNKNOWN, never OK.
export function serviceState({ label, lastActivityAt, staleMinutes, evidence, now = new Date(), hardDown = false }) {
  if (hardDown) return { label, state: 'DOWN', signal: evidence, agoMinutes: minutesSince(lastActivityAt, now) };
  const mins = minutesSince(lastActivityAt, now);
  if (mins == null) {
    return {
      label,
      state: 'UNKNOWN',
      signal: 'Nothing records when this last ran, so this cannot be called healthy.',
      agoMinutes: null,
    };
  }
  return {
    label,
    state: mins >= staleMinutes ? 'STALE' : 'OK',
    signal: evidence,
    agoMinutes: mins,
  };
}

// How long ago, for a person.
export function ago(minutes) {
  if (minutes == null) return 'never';
  if (minutes < 1) return 'just now';
  if (minutes === 1) return 'a minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return h === 1 ? 'an hour ago' : `${h} hours ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

export { CLAIM_TTL_MINUTES, HEARTBEAT_STALE_MINUTES };
