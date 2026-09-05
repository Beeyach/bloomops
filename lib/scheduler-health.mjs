// Is the thing that runs everything actually running?
//
// Every other health signal in this app is downstream of one fact: a cron
// fires every five minutes and calls the drain. If that stops, jobs stop
// moving, mailboxes stop syncing, Hive runs stop progressing — and the page
// would have reported three separate mysteries rather than the one cause.
//
// Worse, it could not report anything at all when the queue was empty. "Nothing
// changed" is the same picture whether the scheduler ran and found nothing to
// do, or never ran. So health inferred, and inference cannot tell those apart.
//
// This is the one fact that is recorded rather than inferred: the drain writes
// down that it was called. Nothing else may write it — not the health page, not
// a browser, not a queue worker — because a heartbeat produced by anything
// other than the scheduler is a heartbeat that can be faked by opening a page.

import { parseUtc } from './tz.mjs';

// The names of the schedules with heartbeats. One row each.
import { sanitizeError } from './job-events.mjs';

export const CRON_DRAIN = 'cron-drain';
export const DAILY_WAKE = 'daily-wake';

// How often the drain is supposed to run.
//
// Configured in workers/bloomwired-review/wrangler.toml as `*/5 * * * *`, and
// there is a test that reads that file and fails if the two ever disagree. A
// staleness rule derived from a cadence that has quietly changed is worse than
// no rule.
export const CRON_EVERY_MINUTES = 5;

// How long silence has to last before it means something.
//
// Two whole missed runs, plus a couple of minutes of slack, because Cloudflare
// does not promise to fire on the second and one late run is not news. Derived
// rather than typed: change the cadence above and this follows.
export const SCHEDULER_STALE_MINUTES = CRON_EVERY_MINUTES * 2 + 2;

// The daily wake, from the same wrangler.toml: `0 4 * * *`.
//
// Its own cadence and so its own threshold. Borrowing the drain's twelve
// minutes would call the daily wake dead within a quarter of an hour of every
// successful run, which is the sort of alarm people learn to ignore.
export const DAILY_WAKE_HOUR_UTC = 4;
export const DAILY_WAKE_EVERY_HOURS = 24;
// Enough slack for a late schedule or a deployment that lands across the hour,
// and not so much that a whole missed day goes unmentioned.
export const DAILY_WAKE_GRACE_HOURS = 2;
export const DAILY_WAKE_STALE_MINUTES = (DAILY_WAKE_EVERY_HOURS + DAILY_WAKE_GRACE_HOURS) * 60;

export const SCHEDULER = {
  HEALTHY: 'HEALTHY',
  // Firing, but the last drain did not reach the end. A different problem with
  // a different fix, and worth saying separately.
  INCOMPLETE: 'INCOMPLETE',
  STALE: 'STALE',
  // Never seen. A fresh deployment, before the first cron.
  UNKNOWN: 'UNKNOWN',
};

const minutesSince = (ts, now) => {
  const t = parseUtc(ts);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (now.getTime() - t) / 60000);
};

// What the scheduler's two clocks add up to.
//
// Pure, and deliberately says nothing about whether the work the drain did
// succeeded. A drain that fires on time and fails every job it touches has a
// healthy scheduler and a queue full of problems, and those are two different
// cards. Collapsing them would mean fixing the wrong thing.
export function schedulerHealth({
  invokedAt = null,
  completedAt = null,
  now = new Date(),
  staleMinutes = SCHEDULER_STALE_MINUTES,
  everyMinutes = CRON_EVERY_MINUTES,
} = {}) {
  const invokedAgo = minutesSince(invokedAt, now);
  const completedAgo = minutesSince(completedAt, now);
  const cadence = `about every ${everyMinutes} minutes`;

  if (invokedAgo == null) {
    return {
      state: SCHEDULER.UNKNOWN,
      headline: 'Waiting for the first check-in',
      detail: `The background scheduler runs ${cadence}. Nothing has been recorded yet, which is normal for a few minutes after a new version goes out.`,
      attention: false,
      invokedAgo: null,
      completedAgo: null,
      cadence,
    };
  }

  if (invokedAgo > staleMinutes) {
    return {
      state: SCHEDULER.STALE,
      headline: 'The background scheduler has not checked in',
      // What it means for her, not what it means for the queue. Nothing is
      // lost when the scheduler stops; it just stops moving.
      detail: `It normally runs ${cadence} and the last one was ${ago(invokedAgo)}. Nothing has been lost. Work will simply sit still until it starts again.`,
      attention: true,
      invokedAgo,
      completedAgo,
      cadence,
    };
  }

  // Fired recently, but the last one that reached the end did so a long time
  // ago. Something is killing the drain partway through.
  if (completedAgo == null || completedAgo > staleMinutes) {
    return {
      state: SCHEDULER.INCOMPLETE,
      headline: 'The scheduler is running, but not finishing',
      detail: `It is being triggered ${cadence}, and the last run that finished properly was ${completedAgo == null ? 'never' : ago(completedAgo)}. Some work may be being retried rather than completed.`,
      attention: true,
      invokedAgo,
      completedAgo,
      cadence,
    };
  }

  return {
    state: SCHEDULER.HEALTHY,
    headline: 'Background scheduler is checking in normally',
    detail: `It last ran ${ago(invokedAgo)} and runs ${cadence}.`,
    attention: false,
    invokedAgo,
    completedAgo,
    cadence,
  };
}

// The once-a-day wake, judged on its own terms.
//
// A separate signal rather than a second opinion about the same one, because
// the two can fail independently and the five-minute drain staying healthy is
// exactly what hides this. The daily wake is the top of the chain: it wakes
// budget-parked jobs, queues each workspace's sweep, and renews the Gmail
// watches. If it stops, nothing new ever enters the queue — and a queue nothing
// enters is a queue that drains perfectly, on time, for ever, reporting
// excellent health while the pipeline quietly starves.
//
// Same two clocks and the same shape as the drain's. Different words, because
// "runs about every 5 minutes" would be a lie, and a different threshold,
// because twelve minutes would declare it dead a quarter of an hour after every
// successful run.
export function dailyWakeHealth({
  invokedAt = null,
  completedAt = null,
  now = new Date(),
  staleMinutes = DAILY_WAKE_STALE_MINUTES,
  hourUtc = DAILY_WAKE_HOUR_UTC,
} = {}) {
  const invokedAgo = minutesSince(invokedAt, now);
  const completedAgo = minutesSince(completedAt, now);
  const cadence = `once a day, at ${String(hourUtc).padStart(2, '0')}:00 UTC`;

  // Nothing recorded yet. A neutral fact, not an outage: the row only appears
  // after the first wake following a deployment, which can be most of a day
  // away. Nothing is faked at migration time to paper over this.
  if (invokedAgo == null) {
    return {
      state: SCHEDULER.UNKNOWN,
      headline: 'Waiting for the first daily check-in',
      detail: `The daily wake runs ${cadence}. Nothing has been recorded since this version went out, which is normal until the next one.`,
      attention: false,
      invokedAgo: null,
      completedAgo: null,
      cadence,
    };
  }

  if (invokedAgo > staleMinutes) {
    return {
      state: SCHEDULER.STALE,
      headline: 'The daily wake has not checked in',
      // Named plainly. This is the one that stops new work appearing, and the
      // symptom is a quiet app rather than a broken one, so it has to say so.
      detail: `It runs ${cadence} and the last one was ${ago(invokedAgo)}. Nothing has been lost, but no new work will be lined up until it runs again.`,
      attention: true,
      invokedAgo,
      completedAgo,
      cadence,
    };
  }

  if (completedAgo == null || completedAgo > staleMinutes) {
    return {
      state: SCHEDULER.INCOMPLETE,
      headline: 'The daily wake started, but did not finish',
      detail: `It is being triggered ${cadence}, and the last run that finished properly was ${completedAgo == null ? 'never' : ago(completedAgo)}.`,
      attention: true,
      invokedAgo,
      completedAgo,
      cadence,
    };
  }

  return {
    state: SCHEDULER.HEALTHY,
    headline: 'Daily wake checked in normally',
    detail: `It last ran ${ago(invokedAgo)} and runs ${cadence}.`,
    attention: false,
    invokedAgo,
    completedAgo,
    cadence,
  };
}

// Minutes, as a person says them.
function ago(mins) {
  if (mins == null) return 'never';
  if (mins < 1) return 'less than a minute ago';
  if (mins < 2) return 'a minute ago';
  if (mins < 60) return `${Math.round(mins)} minutes ago`;
  const h = Math.round(mins / 60);
  return h === 1 ? 'an hour ago' : `${h} hours ago`;
}

export { ago as schedulerAgo };

// ── Writing it ───────────────────────────────────────────────────────────
//
// Both of these belong to the scheduler and nothing else. They are here rather
// than inline in the route so the two writes cannot drift, and so a search for
// who writes the heartbeat finds exactly one file.

// The scheduler reached us and proved who it was.
//
// Called after the secret check and before any work, so an unauthenticated
// request can never make the page look healthy.
export async function markSchedulerInvoked(db, { name = CRON_DRAIN } = {}) {
  await db
    .prepare(
      `INSERT INTO system_heartbeats (name, last_invoked_at, updated_at)
       VALUES (?, datetime('now'), datetime('now'))
       ON CONFLICT(name) DO UPDATE SET last_invoked_at = datetime('now'), updated_at = datetime('now')`
    )
    .bind(name)
    .run()
    .catch(() => {});
}

// The drain reached the end of what it meant to do.
//
// Never written from a failure path. A drain that threw has not completed, and
// saying otherwise would hide exactly the case this exists to expose.
export async function markSchedulerCompleted(db, { name = CRON_DRAIN } = {}) {
  await db
    .prepare(
      `INSERT INTO system_heartbeats (name, last_invoked_at, last_completed_at, updated_at)
       VALUES (?, datetime('now'), datetime('now'), datetime('now'))
       ON CONFLICT(name) DO UPDATE SET last_completed_at = datetime('now'), updated_at = datetime('now')`
    )
    .bind(name)
    .run()
    .catch(() => {});
}

// How a scheduled run ended.
//
// `completed` is the only one that advances `last_completed_at`. `partial`
// exists for the case that actually happened on 2026-08-12: the sweep enqueue —
// the stage the whole pipeline depends on — succeeded, and an unrelated
// maintenance step afterwards did not. Reporting that as a plain failure would
// send somebody looking for a broken sweep that worked perfectly; reporting it
// as success would hide a real error. It is neither.
export const OUTCOME = {
  COMPLETED: 'completed',
  PARTIAL: 'partial',
  FAILED: 'failed',
};

// One stage of a scheduled run, recorded whatever happened to it.
//
// Isolated on purpose: a stage that throws is caught, written down and does not
// stop the stages after it or erase the ones before it. Errors are never
// swallowed — they end up on the heartbeat and in the response — they are only
// prevented from destroying the record of work that did succeed.
export async function runStage(stages, name, fn) {
  try {
    const value = await fn();
    stages.push({ stage: name, ok: true, ...(value === undefined ? {} : { value }) });
    return value;
  } catch (err) {
    stages.push({ stage: name, ok: false, error: sanitizeError(err) });
    return undefined;
  }
}

// The run stopped. `outcome` says how, and only a clean one moves the
// completion mark.
export async function markSchedulerFinished(db, { name = CRON_DRAIN, outcome, stages = [], error = null } = {}) {
  const blob = JSON.stringify(stages).slice(0, 2000);
  const first = error || stages.find((s) => !s.ok)?.error || null;
  await db
    .prepare(
      `INSERT INTO system_heartbeats (name, last_invoked_at, last_completed_at, last_outcome, last_stages, last_error, last_finished_at, updated_at)
       VALUES (?, datetime('now'), ${outcome === OUTCOME.COMPLETED ? "datetime('now')" : 'NULL'}, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(name) DO UPDATE SET
         ${outcome === OUTCOME.COMPLETED ? "last_completed_at = datetime('now')," : ''}
         last_outcome = excluded.last_outcome,
         last_stages = excluded.last_stages,
         last_error = excluded.last_error,
         last_finished_at = datetime('now'),
         updated_at = datetime('now')`
    )
    .bind(name, outcome, blob, first)
    .run()
    .catch(() => {});
}

export async function readSchedulerHeartbeat(db, { name = CRON_DRAIN } = {}) {
  // The stage columns arrived in migration 057. Between a deployment and that
  // migration landing, selecting them fails — and a health page that answers
  // "nothing recorded" because of its own query is worse than one that shows
  // the two timestamps it has always had. So the richer read is tried first and
  // falls back rather than failing closed.
  const row = await db
    .prepare(
      `SELECT last_invoked_at, last_completed_at, last_outcome, last_stages, last_error, last_finished_at
         FROM system_heartbeats WHERE name = ?`
    )
    .bind(name)
    .first()
    .catch(() => db
      .prepare(`SELECT last_invoked_at, last_completed_at FROM system_heartbeats WHERE name = ?`)
      .bind(name)
      .first()
      .catch(() => null));
  let stages = null;
  try { stages = row?.last_stages ? JSON.parse(row.last_stages) : null; } catch {}
  return {
    invokedAt: row?.last_invoked_at || null,
    completedAt: row?.last_completed_at || null,
    outcome: row?.last_outcome || null,
    stages,
    error: row?.last_error || null,
    finishedAt: row?.last_finished_at || null,
  };
}
