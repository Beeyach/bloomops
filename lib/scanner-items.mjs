// The list a Hive run was given, and where each one got to.
//
// Before this, a run existed only as a loop inside a browser tab. The tab held
// the array of prospects, called the checker one at a time, and reported
// progress back. Everything about that is fine right up until the tab closes,
// and then the work stops with no record of what was left. That is exactly what
// happened: 5,484 asked for, 70 done, and no way to say which 5,414 remained.
//
// So the list becomes rows, written before any work starts, and the queue does
// the work. The browser's job shrinks to starting, watching and stopping.
//
// This module owns the item lifecycle and nothing else. It does not decide
// which prospects belong in a run: that is the scanner's selection policy and
// it stays where it is. This snapshots whatever it is handed.

import { RUN, isLive, isTerminal, ABANDON_REASON, reconcileStaleScannerRuns } from './scanner-run.mjs';
import { KIND, PRIORITY, enqueue, inFlightCount } from './queue.mjs';
import { scannerRunLiveness, LIVENESS, ABANDONABLE } from './scanner-liveness.mjs';

export const ITEM = {
  PENDING: 'PENDING',
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  SUCCEEDED: 'SUCCEEDED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
};

// Reached the end of the road, one way or another.
export const ITEM_TERMINAL = new Set([ITEM.SUCCEEDED, ITEM.FAILED, ITEM.CANCELLED]);
// Never started. The only states from which cancelling is honest.
export const ITEM_UNSTARTED = new Set([ITEM.PENDING, ITEM.QUEUED]);

// ── How fast scanner work is allowed to go ───────────────────────────────
//
// One place, because a throughput number scattered across a route, a runner and
// a feeder is a number that will disagree with itself.

// How many site checks may be in flight at once.
//
// This is not a taste decision. The render service is Cloud Run, deployed with
// `--concurrency 1 --max-instances 3` (services/audit-render/README.md), so it
// can serve at most THREE requests simultaneously no matter what we send it.
// A fourth does not go faster; it queues inside Cloud Run against a 600-second
// timeout while holding our invocation open.
//
// Two rather than three, because that ceiling is shared with video rendering,
// which takes one to three minutes a go, and with the "check this site" button
// on a prospect. Taking all three would mean a scan Ary forgot was running
// blocks the video she is trying to record. One instance stays free for the
// work a person is waiting on.
//
// Raising this is only safe alongside raising --max-instances, and the two
// numbers must be changed together.
export const SCANNER_CONCURRENCY = 2;

// How long a single drain may spend on scanner work.
//
// Also measured rather than guessed: run 2's first item held one invocation for
// 89 seconds and completed normally, which is direct production evidence that
// an invocation of this length survives here. The general lane keeps its own
// much tighter budget; this one is separate precisely so a slow site check
// cannot spend a budget that was sized for fast jobs.
export const SCANNER_BUDGET_MS = 90_000;

// Don't start a wave without room for a typical one.
//
// Measured p50 is about 32 seconds (25, 26, 32, 32 warm; 89 cold). Starting a
// wave with less than this left means finishing well past the budget, which is
// how an invocation gets killed holding claimed jobs.
export const SCANNER_WAVE_RESERVE_MS = 35_000;

// How many scanner jobs may sit in the queue for one run at a time.
//
// Not one job per item. A 5,484-item run would put 5,484 rows in a table the
// drain scans every five minutes, and cancelling a run would mean rewriting all
// of them. It would also let one Hive run monopolise the queue against every
// other kind of work.
//
// The items are all stored; only their jobs are rationed. The feeder tops the
// queue back up as they finish, which keeps the durable list complete and the
// working set small.
//
// Tied to the concurrency rather than a round number, so the ready pool is
// always several drains' worth of work and a worker never waits on the feeder,
// but the queue never fills with rows nothing will reach for hours.
export const FEED_BATCH = SCANNER_CONCURRENCY * 5;

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// ── Snapshot ─────────────────────────────────────────────────────────────

// Write the run's membership, exactly as selected.
//
// Returns how many rows now exist. The caller sets the run's total from that
// number and not from the length of the list it hoped to insert: a run claiming
// 5,484 while 5,000 rows exist is the same lie in a new place.
export async function snapshotMembership(db, { workspace, runId, prospectIds = [] }) {
  const seen = new Set();
  const ids = [];
  for (const raw of prospectIds) {
    const id = Number(raw);
    // `Number(null)` is 0, which is finite, so a null in the list would become
    // a row for prospect zero and then a job that could never find it.
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (!ids.length) return { inserted: 0, total: 0 };

  const stamp = now();
  // In batches, because one statement with 5,000 placeholder groups is a
  // statement no database wants. INSERT OR IGNORE against the unique index, so
  // a retried call is a no-op rather than a duplicate.
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const values = slice.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
    const binds = [];
    slice.forEach((id, n) => {
      binds.push(workspace, runId, id, i + n, ITEM.PENDING, stamp, stamp);
    });
    await db
      .prepare(
        `INSERT OR IGNORE INTO scanner_run_items
           (workspace, scanner_run_id, prospect_id, position, state, created_at, updated_at)
         VALUES ${values}`
      )
      .bind(...binds)
      .run();
  }

  const row = await db
    .prepare(`SELECT COUNT(*) n FROM scanner_run_items WHERE workspace = ? AND scanner_run_id = ?`)
    .bind(workspace, runId)
    .first()
    .catch(() => null);

  const total = Number(row?.n || 0);
  return { inserted: total, total };
}

// ── Progress ─────────────────────────────────────────────────────────────

// What the run has actually done, counted from the items.
//
// An aggregate, always. The browser's counters are no longer the authority and
// a progress number must never cost a full table read.
export async function runProgress(db, { workspace, runId }) {
  const { results } = await db
    .prepare(
      `SELECT state, COUNT(*) n FROM scanner_run_items
        WHERE workspace = ? AND scanner_run_id = ? GROUP BY state`
    )
    .bind(workspace, runId)
    .all()
    .catch(() => ({ results: [] }));

  const by = Object.fromEntries((results || []).map((r) => [r.state, Number(r.n || 0)]));
  const succeeded = by[ITEM.SUCCEEDED] || 0;
  const failed = by[ITEM.FAILED] || 0;
  const cancelled = by[ITEM.CANCELLED] || 0;
  const total = Object.values(by).reduce((a, b) => a + b, 0);

  return {
    total,
    succeeded,
    failed,
    cancelled,
    // What Ary means by "done so far": work that was attempted and settled.
    // Cancelled items were never attempted and do not belong in it.
    processed: succeeded + failed,
    pending: by[ITEM.PENDING] || 0,
    queued: by[ITEM.QUEUED] || 0,
    running: by[ITEM.RUNNING] || 0,
    // Still to do. This is the number the old run could never produce.
    unfinished: (by[ITEM.PENDING] || 0) + (by[ITEM.QUEUED] || 0) + (by[ITEM.RUNNING] || 0),
  };
}

// The exact prospects a run never got to.
//
// Bounded, because it exists to start a new run rather than to be displayed,
// and a caller that wants all of them can page. Only meaningful for runs that
// have membership: a legacy run returns nothing, which is the truth.
export async function unfinishedProspectIds(db, { workspace, runId, limit = 1000 }) {
  const { results } = await db
    .prepare(
      `SELECT prospect_id FROM scanner_run_items
        WHERE workspace = ? AND scanner_run_id = ? AND state IN ('PENDING','QUEUED','RUNNING')
        ORDER BY position ASC LIMIT ?`
    )
    .bind(workspace, runId, limit)
    .all()
    .catch(() => ({ results: [] }));
  return (results || []).map((r) => r.prospect_id);
}

// ── How fast it is actually going ────────────────────────────────────────

// Below this many finished items, no speed is reported at all.
//
// Two site checks tell you nothing: one cold start and one warm one differ by a
// factor of three. A number that swings between "20 an hour" and "110 an hour"
// on every refresh is worse than no number, because Ary would plan around it.
export const MIN_SPEED_SAMPLES = 5;

// What the scanner got through recently, and how long each one took.
//
// Bounded twice: a time window, and a hard row cap. This is read by a page that
// refreshes, so it must never become a full-table scan as runs accumulate.
export async function recentThroughput(db, { workspace, minutes = 60, cap = 300 } = {}) {
  const { results } = await db
    .prepare(
      `SELECT started_at, finished_at FROM scanner_run_items
        WHERE workspace = ? AND finished_at IS NOT NULL
          AND finished_at >= datetime('now', ?)
          AND state IN ('SUCCEEDED','FAILED')
        ORDER BY finished_at DESC LIMIT ?`
    )
    .bind(workspace, `-${Math.max(1, Math.round(minutes))} minutes`, cap)
    .all()
    .catch(() => ({ results: [] }));

  const rows = results || [];
  const seconds = [];
  for (const r of rows) {
    if (!r.started_at) continue;
    const a = Date.parse(String(r.started_at).replace(' ', 'T') + 'Z');
    const b = Date.parse(String(r.finished_at).replace(' ', 'T') + 'Z');
    if (Number.isFinite(a) && Number.isFinite(b) && b >= a) seconds.push((b - a) / 1000);
  }
  seconds.sort((x, y) => x - y);
  const at = (p) => (seconds.length ? seconds[Math.min(seconds.length - 1, Math.floor((p / 100) * seconds.length))] : null);

  const finished = rows.length;
  return {
    finished,
    windowMinutes: minutes,
    // Per hour, from the window actually observed rather than extrapolated from
    // one item.
    perHour: finished ? Math.round((finished / minutes) * 60) : 0,
    p50Seconds: at(50),
    p90Seconds: at(90),
    samples: seconds.length,
    // The one thing a caller needs to know before showing any of it.
    enough: finished >= MIN_SPEED_SAMPLES,
  };
}

// The scanner lane, as one bounded read. What is working, what is waiting.
export async function scannerLoad(db, { workspace }) {
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN state = 'RUNNING' THEN 1 ELSE 0 END) running,
         SUM(CASE WHEN state = 'QUEUED'  THEN 1 ELSE 0 END) queued,
         SUM(CASE WHEN state = 'PENDING' THEN 1 ELSE 0 END) pending,
         SUM(CASE WHEN state = 'FAILED'  THEN 1 ELSE 0 END) failed
       FROM scanner_run_items i
       JOIN scanner_runs r ON r.id = i.scanner_run_id AND r.workspace = i.workspace
      WHERE i.workspace = ? AND r.state IN ('RUNNING','STOPPING')`
    )
    .bind(workspace)
    .first()
    .catch(() => null);
  return {
    running: Number(row?.running || 0),
    queued: Number(row?.queued || 0),
    pending: Number(row?.pending || 0),
    failed: Number(row?.failed || 0),
    concurrency: SCANNER_CONCURRENCY,
  };
}

// ── Liveness ─────────────────────────────────────────────────────────────

// The one definition of scanner capacity, shared with the lane.
//
// Exported so the abandonment rule and the worker cannot drift apart. Two
// counts with slightly different filters would mean the reconciler closing runs
// the lane thinks are legitimately waiting, which is precisely the bug this is
// meant to end.
export const scannerInFlight = (db, opts) => inFlightCount(db, KIND.SCANNER_ITEM, opts);

// Everything the liveness rule needs about one run, in two bounded reads.
export async function livenessOf(db, run, { workspace = null, globalInFlight = null, now = new Date() } = {}) {
  if (!run) return scannerRunLiveness({ run: null, now });
  if (isTerminal(run.state)) return scannerRunLiveness({ run, now });

  // Say so rather than binding undefined and letting a caller's catch turn the
  // mistake into the old, wrong answer. That is exactly how a healthy waiting
  // run got reported as having stopped unexpectedly.
  const ws = workspace || run.workspace;
  if (!ws) throw new Error('livenessOf needs a workspace: select it, or pass it in.');

  const counts = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN state = 'RUNNING' THEN 1 ELSE 0 END) running,
         SUM(CASE WHEN state IN ('PENDING','QUEUED','RUNNING') THEN 1 ELSE 0 END) unfinished
       FROM scanner_run_items WHERE workspace = ? AND scanner_run_id = ?`
    )
    .bind(ws, run.id)
    .first()
    .catch(() => null);

  // The queue's own record of "this is parked on money", read rather than
  // re-derived. Budget is the queue's decision and it already wrote it down.
  const budget = await db
    .prepare(
      `SELECT COUNT(*) n FROM jobs
        WHERE scanner_run_id = ? AND status = 'waiting' AND error_kind = 'budget'`
    )
    .bind(run.id)
    .first()
    .catch(() => null);

  return scannerRunLiveness({
    run,
    running: Number(counts?.running || 0),
    unfinished: Number(counts?.unfinished || 0),
    budgetWaiting: Number(budget?.n || 0),
    globalInFlight: globalInFlight == null ? await scannerInFlight(db, { now }) : globalInFlight,
    concurrency: SCANNER_CONCURRENCY,
    now,
  });
}

// Which live runs must not be closed, whatever their heartbeat says.
//
// Bounded: the same fifty-run ceiling the reconciler uses, one global in-flight
// count for the whole pass rather than one per run, and two small aggregates
// each. No run items are loaded.
export async function protectedRunIds(db, { workspace = null, now = new Date() } = {}) {
  const scoped = workspace ? ' AND workspace = ?' : '';
  const binds = workspace ? [workspace] : [];
  const { results } = await db
    .prepare(
      `SELECT id, workspace, state, started_at, heartbeat_at, last_scheduler_seen_at FROM scanner_runs
        WHERE state IN ('RUNNING','STOPPING')${scoped} LIMIT 50`
    )
    .bind(...binds)
    .all()
    .catch(() => ({ results: [] }));

  if (!results?.length) return { protect: [], modes: {} };

  // Counted once for the whole pass. It is a property of the system, not of any
  // one run, and asking fifty times would give fifty slightly different answers.
  const globalInFlight = await scannerInFlight(db, { now });

  const protect = [];
  const modes = {};
  for (const run of results) {
    const live = await livenessOf(db, run, { globalInFlight, now });
    modes[run.id] = live.mode;
    if (!ABANDONABLE.has(live.mode)) protect.push(run.id);
  }
  return { protect, modes, globalInFlight };
}

// ── The feeder ───────────────────────────────────────────────────────────

// Keep a bounded number of this run's items queued.
//
// Called from the queue's own maintenance pass, never from a browser. Returns
// how many it handed over, so a caller can tell "nothing left" from "already
// full".
export async function feedRun(db, { workspace, runId, batch = FEED_BATCH }) {
  const run = await db
    .prepare(`SELECT id, state FROM scanner_runs WHERE id = ? AND workspace = ?`)
    .bind(runId, workspace)
    .first()
    .catch(() => null);

  // Only a RUNNING run is fed. STOPPING deliberately is not: that is the whole
  // meaning of stop, and it is enforced here rather than hoped for downstream.
  if (!run || run.state !== RUN.RUNNING) return { fed: 0, reason: run ? `run is ${run.state}` : 'no such run' };

  const inFlight = await db
    .prepare(
      `SELECT COUNT(*) n FROM scanner_run_items
        WHERE workspace = ? AND scanner_run_id = ? AND state IN ('QUEUED','RUNNING')`
    )
    .bind(workspace, runId)
    .first()
    .catch(() => ({ n: 0 }));

  const room = batch - Number(inFlight?.n || 0);
  if (room <= 0) return { fed: 0, reason: 'enough already queued' };

  const { results } = await db
    .prepare(
      `SELECT id, prospect_id FROM scanner_run_items
        WHERE workspace = ? AND scanner_run_id = ? AND state = ?
        ORDER BY position ASC LIMIT ?`
    )
    .bind(workspace, runId, ITEM.PENDING, room)
    .all()
    .catch(() => ({ results: [] }));

  let fed = 0;
  for (const item of results || []) {
    // The item is marked first, conditionally. If two feeders run at once the
    // second one's UPDATE changes nothing and it does not enqueue a duplicate.
    const claimed = await db
      .prepare(
        `UPDATE scanner_run_items SET state = ?, queued_at = ?, updated_at = ?
          WHERE id = ? AND workspace = ? AND state = ?`
      )
      .bind(ITEM.QUEUED, now(), now(), item.id, workspace, ITEM.PENDING)
      .run()
      .catch(() => ({ meta: { changes: 0 } }));
    if (!claimed?.meta?.changes) continue;

    const q = await enqueue(db, {
      workspace,
      kind: KIND.SCANNER_ITEM,
      prospectId: item.prospect_id,
      priority: PRIORITY.SCANNER_ITEM,
      scannerRunId: runId,
      // Ids only. The prospect row is the source of truth and a payload copy
      // would be stale the moment anything else touched it.
      payload: { runId, itemId: item.id, prospectId: item.prospect_id },
      extra: String(item.id),
    }).catch(() => ({ queued: false }));

    if (q.queued) fed += 1;
    else {
      // Nothing queued, so the item goes back rather than sitting as QUEUED
      // with no job behind it.
      await db
        .prepare(`UPDATE scanner_run_items SET state = ?, queued_at = NULL, updated_at = ? WHERE id = ? AND workspace = ? AND state = ?`)
        .bind(ITEM.PENDING, now(), item.id, workspace, ITEM.QUEUED)
        .run()
        .catch(() => {});
    }
  }

  return { fed, reason: fed ? 'fed' : 'nothing pending' };
}

// Feed every live run, and settle any that have run out of work.
//
// The one entry point the cron needs. Bounded: a handful of live runs at most,
// and each one hands over at most `batch` items.
export async function feedLiveRuns(db, { batch = FEED_BATCH } = {}) {
  const { results } = await db
    .prepare(`SELECT id, workspace, state FROM scanner_runs WHERE state IN ('RUNNING','STOPPING') LIMIT 20`)
    .all()
    .catch(() => ({ results: [] }));

  let fed = 0;
  const settled = [];
  for (const run of results || []) {
    if (run.state === RUN.RUNNING) {
      const out = await feedRun(db, { workspace: run.workspace, runId: run.id, batch });
      fed += out.fed;
    }
    const done = await settleIfFinished(db, { workspace: run.workspace, runId: run.id });
    if (done.settled) settled.push({ id: run.id, state: done.state });
  }
  return { fed, settled };
}

// ── Finishing ────────────────────────────────────────────────────────────

// A run with nothing left to do settles itself.
//
// Nobody is watching the browser any more, so the run has to notice on its own
// that the last item is in. A stopped run settles as STOPPED and never as
// COMPLETED: half a list is half a list.
export async function settleIfFinished(db, { workspace, runId }) {
  const run = await db
    .prepare(`SELECT id, state FROM scanner_runs WHERE id = ? AND workspace = ?`)
    .bind(runId, workspace)
    .first()
    .catch(() => null);
  if (!run || !isLive(run.state)) return { settled: false };

  const p = await runProgress(db, { workspace, runId });
  if (p.total === 0) return { settled: false };
  if (p.unfinished > 0) return { settled: false };

  const next = run.state === RUN.STOPPING ? RUN.STOPPED : RUN.COMPLETED;
  const stamp = now();
  const res = await db
    .prepare(
      `UPDATE scanner_runs
          SET state = ?, processed = ?, succeeded = ?, failed = ?, current_item = NULL,
              finished_at = ?, heartbeat_at = ?
        WHERE id = ? AND workspace = ? AND state IN ('RUNNING','STOPPING')`
    )
    .bind(next, p.processed, p.succeeded, p.failed, stamp, stamp, runId, workspace)
    .run()
    .catch(() => ({ meta: { changes: 0 } }));

  return { settled: Boolean(res?.meta?.changes), state: next, progress: p };
}

// Stop a run, and mean it.
//
// The whole of stopping, in one place: no new items go out, the ones that never
// started are cancelled along with their jobs, and the run settles as STOPPED
// the moment the last in-flight item lands. Pressing Stop, running out of
// credits and closing a run all need exactly this, and three versions of it
// would be three different ideas of what stopped means.
//
// An item already in a worker's hands is left alone. Killing it halfway leaves a
// half-written answer nothing downstream can tell from a whole one, which is the
// same rule the abandonment path follows.
export async function stopRun(db, { workspace, runId, reason = null }) {
  const run = await db
    .prepare(`SELECT id, state FROM scanner_runs WHERE id = ? AND workspace = ?`)
    .bind(runId, workspace)
    .first()
    .catch(() => null);
  if (!run) return { changed: false, state: null };
  if (!isLive(run.state)) return { changed: false, state: run.state };

  const stamp = now();
  const moved = await db
    .prepare(
      `UPDATE scanner_runs SET state = ?, stop_reason = COALESCE(?, stop_reason), heartbeat_at = ?
        WHERE id = ? AND workspace = ? AND state = ?`
    )
    .bind(RUN.STOPPING, reason, stamp, runId, workspace, RUN.RUNNING)
    .run()
    .catch(() => ({ meta: { changes: 0 } }));

  const { cancelled } = await cancelUnstarted(db, {
    workspace,
    runId,
    reason: reason || 'The run stopped before this one started.',
  });

  // The jobs behind those items. Queued only, for the same reason.
  await db
    .prepare(
      `UPDATE jobs SET status = 'cancelled', last_error = ?, updated_at = datetime('now')
        WHERE workspace = ? AND scanner_run_id = ? AND status = 'queued'`
    )
    .bind(reason || 'The Hive run that queued this was stopped.', workspace, runId)
    .run()
    .catch(() => {});

  // Nothing in flight means it is already over, so it does not sit in STOPPING
  // waiting for a worker that will never come.
  const settled = await settleIfFinished(db, { workspace, runId });

  return {
    changed: Boolean(moved?.meta?.changes) || cancelled > 0 || settled.settled,
    state: settled.settled ? settled.state : RUN.STOPPING,
    cancelled,
  };
}

// Everything a stopping or closed run had not started yet.
//
// Cancelling an item that never began is honest; relabelling finished work is
// not, which is why only the unstarted states are touched.
export async function cancelUnstarted(db, { workspace, runId, reason = 'The run stopped before this one started.' }) {
  const res = await db
    .prepare(
      `UPDATE scanner_run_items
          SET state = ?, last_error = ?, finished_at = ?, updated_at = ?
        WHERE workspace = ? AND scanner_run_id = ? AND state IN ('PENDING','QUEUED')`
    )
    .bind(ITEM.CANCELLED, reason, now(), now(), workspace, runId)
    .run()
    .catch(() => ({ meta: { changes: 0 } }));
  return { cancelled: res?.meta?.changes || 0 };
}

// Close dead runs, and only dead ones.
//
// The single entry point both callers use, so neither can forget to ask which
// runs are legitimately waiting. Calling the raw reconciler without that answer
// is what closed a healthy run that was simply queuing for a site checker.
export async function reconcileScannerRuns(db, { workspace = null, now = new Date() } = {}) {
  const { protect, modes } = await protectedRunIds(db, { workspace, now });

  // Write down that the server looked at these and left them waiting on
  // purpose.
  //
  // Without this the protection is only ever momentary. A run waiting for a
  // free checker is correctly spared, but its silence keeps accumulating the
  // whole time because nothing is finishing; the instant capacity frees, the
  // protection lifts and the very next reconcile sees an hour of quiet with
  // work to do and a checker free, and closes it. It gets killed for silence it
  // built up while it was legitimately waiting, one step before the lane would
  // have handed it work. That happened in production, to run 7, at seventy
  // minutes.
  //
  // One statement for the whole batch, capped at the same fifty runs. Costs
  // nothing and starts nothing. Nothing stamps this if the machine is down,
  // which is what keeps a dead run mortal.
  if (protect.length) {
    await db
      .prepare(
        `UPDATE scanner_runs SET last_scheduler_seen_at = datetime('now')
          WHERE id IN (${protect.map(() => '?').join(',')}) AND state IN ('RUNNING','STOPPING')`
      )
      .bind(...protect)
      .run()
      .catch(() => {});
  }

  const out = await reconcileStaleScannerRuns(db, { workspace, protect });
  return { ...out, protected: protect, modes };
}

// Tidy up after the reconciler.
//
// Closing a dead run cancels the jobs it owned, but its items would otherwise
// sit at QUEUED with nothing behind them, which reads as "a worker is about to
// pick this up" for ever. The rule is the same one Stop uses, so it is the same
// function: only work that never started is touched.
//
// Lives here rather than inside reconcileStaleScannerRuns because that module
// owns the run states and this one owns the items, and the dependency only goes
// one way. Both callers of the reconciler pass its result straight through.
export async function cancelAbandonedItems(db, runs = [], { reason = ABANDON_REASON } = {}) {
  let cancelled = 0;
  for (const r of runs || []) {
    const out = await cancelUnstarted(db, { workspace: r.workspace, runId: r.id, reason });
    cancelled += out.cancelled;
  }
  return cancelled;
}

// ── One item's lifecycle ─────────────────────────────────────────────────

export async function markItemRunning(db, { workspace, itemId }) {
  const res = await db
    .prepare(
      `UPDATE scanner_run_items SET state = ?, started_at = COALESCE(started_at, ?), attempts = attempts + 1, updated_at = ?
        WHERE id = ? AND workspace = ? AND state IN ('QUEUED','PENDING','RUNNING')`
    )
    .bind(ITEM.RUNNING, now(), now(), itemId, workspace)
    .run()
    .catch(() => ({ meta: { changes: 0 } }));
  return Boolean(res?.meta?.changes);
}

// Settle one item.
//
// Conditional on it not already being terminal, so a late worker finishing
// after the run was closed cannot resurrect a cancelled item, and a retry that
// races a success cannot write over it.
export async function finishItem(db, { workspace, itemId, state, error = null }) {
  const res = await db
    .prepare(
      `UPDATE scanner_run_items SET state = ?, last_error = ?, finished_at = ?, updated_at = ?
        WHERE id = ? AND workspace = ? AND state NOT IN ('SUCCEEDED','FAILED','CANCELLED')`
    )
    .bind(state, error ? String(error).slice(0, 400) : null, now(), now(), itemId, workspace)
    .run()
    .catch(() => ({ meta: { changes: 0 } }));
  return Boolean(res?.meta?.changes);
}

// The run's cached counters, refreshed from the items.
//
// The columns on `scanner_runs` stay because everything already reads them, but
// they are a cache now and this is the only thing allowed to write them. It
// doubles as the run's heartbeat: server work happening IS the liveness signal,
// which is the whole point of moving off the browser.
export async function syncRunCounters(db, { workspace, runId }) {
  const p = await runProgress(db, { workspace, runId });
  await db
    .prepare(
      `UPDATE scanner_runs SET processed = ?, succeeded = ?, failed = ?, total = ?, heartbeat_at = ?
        WHERE id = ? AND workspace = ? AND state IN ('RUNNING','STOPPING')`
    )
    .bind(p.processed, p.succeeded, p.failed, p.total, now(), runId, workspace)
    .run()
    .catch(() => {});
  return p;
}
