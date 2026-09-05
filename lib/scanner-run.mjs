// Starting a Hive scanner, and being able to stop it.
//
// The scanners are loops that live in a browser tab: press a button, and the
// tab walks a list, one HTTP call per item. That worked until Ary wanted to
// stop one, at which point the only available answer was "close the tab", and
// closing a tab is not a decision the app remembers.
//
// So a run is a row. The tab reports progress against it and reads its state
// before each item; Stop writes STOPPING to the row. Two useful properties fall
// out of that: a stop survives a refresh, and a second tab watching the same
// run sees the same answer.
//
// Deliberately NOT a second queue runtime. The existing `jobs` table stays the
// only queue; a run simply tags the jobs it created so stopping one run cannot
// touch anybody else's work.

import { parseUtc } from './tz.mjs';

export const RUN = {
  RUNNING: 'RUNNING',
  // An item is in flight. No new ones will start.
  STOPPING: 'STOPPING',
  STOPPED: 'STOPPED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  // Nobody stopped it and nobody finished it: the tab went away.
  ABANDONED: 'ABANDONED',
};

// States where work may still be happening.
export const LIVE = new Set([RUN.RUNNING, RUN.STOPPING]);
// States nothing can move out of.
export const TERMINAL = new Set([RUN.STOPPED, RUN.COMPLETED, RUN.FAILED, RUN.ABANDONED]);

export const isLive = (s) => LIVE.has(String(s || ''));
export const isTerminal = (s) => TERMINAL.has(String(s || ''));

// A tab that has not reported in this long is gone.
//
// Generous on purpose: a single site check can take a minute and a half, and
// declaring a run abandoned while it is merely slow would be worse than leaving
// it alone. This is the same reasoning the queue's claim expiry uses.
export const HEARTBEAT_STALE_MINUTES = 15;

// May this run start another item?
//
// The one question the loop asks before every iteration, and the only place
// that decides it.
export function mayContinue(run) {
  if (!run) return { ok: false, reason: 'That run does not exist.' };
  if (run.state === RUN.RUNNING) return { ok: true };
  if (run.state === RUN.STOPPING) return { ok: false, reason: 'Stopping after the current one finishes.', stopping: true };
  return { ok: false, reason: `This run already ${run.state === RUN.COMPLETED ? 'finished' : 'stopped'}.` };
}

// What a stop request does, given where the run currently is.
//
// Idempotent by construction: pressing Stop twice, or stopping something that
// already stopped, is a no-op that reports the truth rather than an error.
export function stopTransition(state) {
  switch (String(state || '')) {
    case RUN.RUNNING:
      return { changed: true, next: RUN.STOPPING, message: 'Stopping after the current one finishes...' };
    case RUN.STOPPING:
      return { changed: false, next: RUN.STOPPING, message: 'Already stopping.' };
    case RUN.STOPPED:
      return { changed: false, next: RUN.STOPPED, message: 'Already stopped.' };
    case RUN.COMPLETED:
      return { changed: false, next: RUN.COMPLETED, message: 'That run already finished.' };
    case RUN.FAILED:
      return { changed: false, next: RUN.FAILED, message: 'That run already failed.' };
    case RUN.ABANDONED:
      return { changed: false, next: RUN.ABANDONED, message: 'That run was abandoned.' };
    default:
      return { changed: false, next: null, message: 'That run does not exist.' };
  }
}

// The state a run settles into once its loop puts the work down.
//
// A stopped run is never reported as completed. Half a list is half a list, and
// saying otherwise would let Ary believe every site was checked.
export function settleState(current, { error = false } = {}) {
  if (current === RUN.STOPPING) return RUN.STOPPED;
  if (error) return RUN.FAILED;
  return RUN.COMPLETED;
}

// Has this run gone quiet?
export function isStale(run, { now = new Date(), minutes = HEARTBEAT_STALE_MINUTES } = {}) {
  if (!run || !isLive(run.state)) return false;
  // parseUtc, not Date.parse. D1 writes `datetime('now')` as UTC with no zone
  // marker, and Date.parse reads a bare timestamp as LOCAL time, so on a
  // machine eight hours behind UTC every run would have looked eight hours
  // stale the moment it started.
  // The later of the two clocks, same rule the reconciler uses. A run parked by
  // the scheduler has not gone quiet; it has been told to wait.
  const beat = parseUtc(run.heartbeat_at || run.started_at);
  const seen = run.last_scheduler_seen_at ? parseUtc(run.last_scheduler_seen_at) : NaN;
  const t = Math.max(Number.isFinite(beat) ? beat : -Infinity, Number.isFinite(seen) ? seen : -Infinity);
  if (!Number.isFinite(t)) return false;
  return (now.getTime() - t) / 60000 > minutes;
}

// What Ary is shown while a run is alive.
//
// Written here rather than in the component so the words for "stopped" cannot
// drift into implying the work finished.
export function describe(run) {
  if (!run) return { text: '', done: true };
  const { processed = 0, total = 0, succeeded = 0, failed = 0 } = run;
  switch (run.state) {
    case RUN.RUNNING:
      return {
        text: total ? `Scanning ${processed} of ${total}` : 'Scanning',
        detail: run.current_item || null,
        done: false,
      };
    case RUN.STOPPING:
      return { text: 'Stopping after the current one finishes...', done: false };
    case RUN.STOPPED:
      return {
        text: `Stopped. Everything already completed was kept${total ? ` (${processed} of ${total})` : ''}.`,
        done: true,
      };
    case RUN.COMPLETED:
      return {
        text: total ? `Finished all ${total}.` : 'Finished.',
        detail: failed ? `${succeeded} worked, ${failed} could not be read.` : null,
        done: true,
      };
    case RUN.FAILED:
      return { text: 'Stopped because something went wrong. Everything already completed was kept.', done: true };
    case RUN.ABANDONED:
      return { text: 'This one was left running and has been closed. Anything completed was kept.', done: true };
    default:
      return { text: '', done: true };
  }
}

// ── Recovery ─────────────────────────────────────────────────────────────

// Closing out runs whose worker died.
//
// The state machine above always knew a stale heartbeat means ABANDONED, and
// there has always been code that writes it. It just never ran.
//
// The only thing that triggered it was mounting the Hive page in a browser, and
// the one situation where a run dies is the situation where nobody is looking
// at the Hive: the tab closed, the laptop slept, the phone locked. Recovery was
// gated on the exact event that cannot happen. A precheck run asked for 5,484
// prospects, finished 70, and sat in the database claiming to be RUNNING for
// nine hours because nobody opened the page that would have noticed.
//
// So this moved here, where the states and the threshold already live, and it
// is called from the queue's own maintenance pass as well as from the page.

// The reason written onto the row, built from the canonical threshold rather
// than a number typed into a sentence.
export const ABANDON_REASON = `No progress for over ${HEARTBEAT_STALE_MINUTES} minutes.`;

// The SQLite modifier for the cutoff, from the same constant.
export const STALE_MODIFIER = `-${HEARTBEAT_STALE_MINUTES} minutes`;

// How long this run has actually been unattended.
//
// The later of two different facts: when a site check last finished, and when
// the scheduler last looked at it and deliberately left it waiting. A run
// queuing for a free checker finishes nothing, so the first clock freezes while
// the run is perfectly healthy; without the second one it is killed the instant
// its protection lifts, for silence it accumulated while protected.
//
// datetime() around each, so a stored ISO string with a T and a Z and a
// space-separated one compare as times rather than as text.
export const LIVENESS_CLOCK =
  `MAX(datetime(COALESCE(heartbeat_at, started_at)), datetime(COALESCE(last_scheduler_seen_at, '1970-01-01 00:00:00')))`;

// Close every run that has gone quiet, and stop the work it owned.
//
// Safe to call as often as anything likes: the transition is a conditional
// UPDATE, so calling it twice changes nothing the second time, and a worker
// that renewed its heartbeat between the read and the write keeps its run. The
// staleness test is in the WHERE clause rather than in JavaScript for exactly
// that reason. Reading a row, deciding it looks dead, and then writing that
// decision a moment later is how a live run gets killed by a maintenance pass.
//
// Costs nothing. It reads two tables and writes state; it starts no run,
// enqueues no work, and spends no credits or daily allowance.
export async function reconcileStaleScannerRuns(db, { workspace = null, now = null, protect = [] } = {}) {
  const scoped = workspace ? ' AND workspace = ?' : '';
  const bind = (extra = []) => (workspace ? [...extra, workspace] : extra);

  // Runs that must not be closed however old their heartbeat looks, because
  // something legitimate explains the silence: every site checker is busy, the
  // work is parked on budget, or a stop is still settling.
  //
  // Passed in rather than worked out here. This module owns the states and the
  // threshold; what counts as a legitimate wait needs the items and the queue,
  // and importing those from here would be a circle.
  //
  // A stale list is safe by construction: the worst case is that a run which
  // stopped waiting a moment ago survives one more pass, and the next drain
  // five minutes later closes it.
  const keep = [...new Set((protect || []).map(Number).filter(Number.isFinite))];
  const notProtected = keep.length ? ` AND id NOT IN (${keep.map(() => '?').join(',')})` : '';

  // Read first, only so the caller can be told which runs were closed and with
  // what numbers. Nothing is decided from this.
  const { results: candidates } = await db
    .prepare(
      `SELECT id, workspace, scanner, state, processed, total, started_at, heartbeat_at
         FROM scanner_runs
        WHERE state IN ('RUNNING','STOPPING')
          AND ${LIVENESS_CLOCK} < datetime('now', ?)${scoped}${notProtected}
        LIMIT 50`
    )
    // Order follows the SQL, not the helper's habit of appending workspace
    // last: threshold, then workspace if scoped, then the protected ids.
    .bind(STALE_MODIFIER, ...(workspace ? [workspace] : []), ...keep)
    .all()
    .catch(() => ({ results: [] }));

  if (!candidates?.length) return { closed: 0, runs: [], cancelledJobs: 0 };

  // The transition. Conditional on both the state and the heartbeat, so this is
  // the authority rather than the SELECT above.
  await db
    .prepare(
      `UPDATE scanner_runs
          SET state = ?, finished_at = datetime('now'), stop_reason = ?, current_item = NULL
        WHERE state IN ('RUNNING','STOPPING')
          AND ${LIVENESS_CLOCK} < datetime('now', ?)${scoped}${notProtected}`
    )
    .bind(RUN.ABANDONED, ABANDON_REASON, STALE_MODIFIER, ...(workspace ? [workspace] : []), ...keep)
    .run()
    .catch(() => {});

  // Only the runs that actually made the transition. One that got a heartbeat
  // in between is still live and must keep its queued work.
  const ids = candidates.map((r) => r.id);
  const { results: closed } = await db
    .prepare(
      `SELECT id, workspace, scanner, processed, total, started_at, heartbeat_at, finished_at
         FROM scanner_runs
        WHERE state = ? AND id IN (${ids.map(() => '?').join(',')})`
    )
    .bind(RUN.ABANDONED, ...ids)
    .all()
    .catch(() => ({ results: [] }));

  // The work that run owned and nobody else's.
  //
  // Queued only. A job already claimed keeps its claim and finishes, which is
  // the same rule Stop has always followed: killing an item halfway through
  // leaves a half-written answer that nothing downstream can tell from a whole
  // one. The queue's own expired-claim recovery handles a worker that died
  // mid-item, and it is a better judge of that than this is.
  let cancelledJobs = 0;
  for (const r of closed || []) {
    const res = await db
      .prepare(
        `UPDATE jobs SET status = 'cancelled', last_error = ?, updated_at = datetime('now')
          WHERE workspace = ? AND scanner_run_id = ? AND status = 'queued'`
      )
      .bind('The Hive run that queued this stopped unexpectedly.', r.workspace, r.id)
      .run()
      .catch(() => ({ meta: { changes: 0 } }));
    cancelledJobs += res?.meta?.changes || 0;
  }

  return {
    closed: (closed || []).length,
    runs: (closed || []).map((r) => ({
      id: r.id,
      workspace: r.workspace,
      scanner: r.scanner,
      processed: Number(r.processed || 0),
      total: Number(r.total || 0),
      startedAt: r.started_at,
      lastHeartbeatAt: r.heartbeat_at,
      finishedAt: r.finished_at,
    })),
    cancelledJobs,
  };
}

// What to say about a run that was closed this way.
//
// Kept apart from `describe` above because the two mean different things and
// somebody will eventually try to merge them: STOPPED is a decision Ary made,
// ABANDONED is something that happened to her. The wording never implies the
// finished work is in doubt, because it is not.
export function abandonedSummary(run) {
  const processed = Number(run?.processed || 0);
  const total = Number(run?.total || 0);
  return {
    headline: 'This run stopped unexpectedly',
    progress: total ? `${processed.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} finished` : `${processed.toLocaleString('en-US')} finished`,
    // Said every time. The first question anybody has is whether the work is
    // gone, and the answer is no.
    kept: 'Everything it completed was kept.',
    // Deliberately not "5,414 failed" or "5,414 skipped". The run stored a
    // requested total, not a list, so which prospects were left is not
    // something the record knows. See the report.
    next: 'Start a fresh scan when you want to carry on.',
  };
}
