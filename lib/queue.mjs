import { jobEventStatement, JOB_EVENT } from './job-events.mjs';

// The durable job queue.
//
// Everything automatic runs through here rather than inside whichever request
// happened to trigger it. A job is a row, so it survives the browser closing,
// a deployment, a worker restart and a dropped connection.
//
// The design constraint that shapes all of it: a retry must never cost money
// twice. Every expensive handler is written so that running it again after a
// crash is a no-op or a cheap re-read, and the queue itself refuses to hold
// two copies of the same work.

export const KIND = {
  GMAIL_SYNC: 'gmail-sync',     // read what changed in a connected mailbox
  GMAIL_WATCH: 'gmail-watch',   // renew the mailbox watch before it lapses
  PRESCREEN: 'prescreen',       // free, deterministic
  VERIFY_SITE: 'verify-site',   // paid: browser probe
  SIGNALS: 'signals',           // cheap: one fetch of their own page
  // Free: their own public pages, looking for a way to reach them. Bounded to
  // a homepage plus three real internal links, and it never buys anything.
  DISCOVER_CONTACT: 'discover-contact',
  VET: 'vet',                   // free, reads what the others stored
  CLASSIFY_REPLY: 'classify-reply', // cheap model read of an unknown reply
  PREPARE_FOLLOWUP: 'prepare-followup', // writes a draft, never sends it
  // One final follow-up for the two-sent AU pilot cohort. Composes a draft
  // into an ordinary approval package; sending stays behind Ary's approval
  // and the send guard, exactly like everything else.
  LATE_FOLLOWUP: 'late-followup',
  PREPARE_OUTREACH: 'prepare-outreach', // the whole first-contact package
  // Sends one approved package through the Gmail API. Never enqueued unless
  // the workspace has turned the relevant automation on; the guard checks
  // again at execution anyway, because the queue is not the authority.
  SEND_APPROVED: 'send-approved',
  SWEEP: 'sweep',               // scheduled: finds work and enqueues it
  // One prospect of one Hive run. The unit that used to be an iteration of a
  // for-loop inside a browser tab.
  SCANNER_ITEM: 'scanner-item',
};

export const STATUS = {
  QUEUED: 'queued',
  RUNNING: 'running',
  DONE: 'done',
  FAILED: 'failed',
  // Blocked on budget or on a person. Not a failure: picked up again when the
  // thing it is waiting for changes.
  WAITING: 'waiting',
  CANCELLED: 'cancelled',
};

// How a failure is classified decides what happens next, and getting this
// wrong is how a queue either gives up too early or burns money forever.
export const ERROR_KIND = {
  TRANSIENT: 'transient',  // network, 5xx, a timeout. Retry with backoff.
  PERMANENT: 'permanent',  // bad input, 404, a rule said no. Stop.
  HUMAN: 'human',          // needs a decision. Surface, do not retry.
  BUDGET: 'budget',        // out of allowance. Wait, do not count an attempt.
};

// Conversations beat research, the same ordering Pick Bee uses.
export const PRIORITY = {
  // Above everything. Finding out somebody replied outranks reacting to it:
  // until the sync runs, the follow-up guard does not know they wrote.
  GMAIL_SYNC: 110,
  REPLY: 100,
  CLASSIFY_REPLY: 95,
  // Not urgent on any given run, and catastrophic if it never happens. A
  // lapsed watch is silence that looks exactly like a quiet inbox.
  GMAIL_WATCH: 90,
  // A send that is already due, already approved and already armed. Below the
  // reply lanes on purpose — finding out somebody wrote back outranks sending
  // to them — and above everything that only produces a draft, because a
  // message whose window closes at five is not work that can wait for research.
  //
  // It had no entry at all, so it sorted at 0: below prescreen, below research,
  // behind every stranger in the queue. Nothing had noticed because nothing
  // ever enqueued one on a schedule.
  SEND_APPROVED: 70,
  // Above research: a draft for somebody already due is worth more today than
  // learning something new about somebody who is not.
  PREPARE_FOLLOWUP: 60,
  // Just below the live follow-up drafts: this cohort has waited a week
  // already, so another drain costs nothing, and fresh sequences come first.
  LATE_FOLLOWUP: 58,
  // Below follow-ups: a person already in the sequence outranks a stranger we
  // have not written to yet.
  PREPARE_OUTREACH: 55,
  VET: 50,
  VERIFY: 40,
  SIGNALS: 30,
  PRESCREEN: 20,
  SWEEP: 10,
  // Below the pipeline, above the sweep. A Hive run is Ary sitting there having
  // pressed a button, so it should not queue behind overnight research; but a
  // reply arriving still matters more than the next site check in a batch of
  // five thousand.
  SCANNER_ITEM: 35,
};

// A job holds its claim for this long before another worker may take it. Long
// enough for the slowest handler (a site probe is about a minute), short
// enough that a crashed worker's jobs come back the same day.
export const CLAIM_TTL_MINUTES = 15;

// Exponential, in minutes: 1, 5, 25. Past max_attempts the job fails for good.
export const backoffMinutes = (attempt) => Math.min(60, 5 ** Math.max(0, attempt - 1));

// Deterministic key for "this exact work on this exact prospect". Two callers
// asking for the same thing produce the same key and the second is a no-op.
export function dedupeKey(kind, { workspace, prospectId = null, extra = '' } = {}) {
  return [workspace, kind, prospectId ?? '-', extra].join(':');
}

// Adds a job unless the same work is already queued, running or waiting.
// Returns { queued: true, id } or { queued: false, reason }.
export async function enqueue(db, { workspace, kind, prospectId = null, payload = null, priority = null, runAfter = null, maxAttempts = 3, extra = '', scannerRunId = null }) {
  if (!workspace || !kind) return { queued: false, reason: 'workspace and kind are required' };
  const key = dedupeKey(kind, { workspace, prospectId, extra });
  try {
    const res = await db
      .prepare(
        `INSERT INTO jobs (workspace, kind, prospect_id, payload, priority, max_attempts, run_after, dedupe_key, scanner_run_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        workspace,
        kind,
        prospectId,
        payload ? JSON.stringify(payload).slice(0, 4000) : null,
        priority ?? PRIORITY[kind.toUpperCase().replace('-', '_')] ?? 0,
        maxAttempts,
        runAfter,
        key,
        // Ownership. Stopping a run cancels its queued work by this column, so a
        // scanner job that forgot to set it would keep running after Stop.
        scannerRunId
      )
      .run();
    return { queued: true, id: res?.meta?.last_row_id ?? null, key };
  } catch (err) {
    // The unique partial index rejected it, which is the mechanism working:
    // the same work is already in flight.
    if (/UNIQUE|constraint/i.test(String(err?.message || ''))) {
      return { queued: false, reason: 'already queued', key };
    }
    throw err;
  }
}

// Takes the next runnable job for a worker. Claiming is a conditional UPDATE
// rather than a SELECT then UPDATE, so two workers racing cannot both get the
// same row: only one UPDATE matches.
export async function claimNext(db, { workspace = null, kinds = null, excludeKinds = null, now = new Date() } = {}) {
  const nowIso = now.toISOString();
  const staleBefore = new Date(now.getTime() - CLAIM_TTL_MINUTES * 60_000).toISOString();

  const where = [
    // datetime() on both sides, always. See the note on inFlightCount: this
    // column holds ISO strings with a T and a Z, and half the queries that ask
    // about it build their bound with datetime('now', ...), which is space
    // separated. Comparing those two as text compares 'T' against ' ' and
    // answers the same thing every time regardless of the clock.
    `(status = 'queued' OR (status = 'running' AND datetime(claimed_at) < datetime(?)))`,
    `(run_after IS NULL OR run_after <= ?)`,
  ];
  const binds = [staleBefore, nowIso];
  if (workspace) { where.push('workspace = ?'); binds.push(workspace); }
  if (kinds?.length) { where.push(`kind IN (${kinds.map(() => '?').join(',')})`); binds.push(...kinds); }
  // The other half of the same idea, and the thing that makes a separate lane
  // possible: a worker can be told what it may NOT take. The general drain
  // excludes scanner work so a thirty-second site check cannot eat the budget a
  // send was waiting on, and the scanner lane asks for scanner work only.
  if (excludeKinds?.length) {
    where.push(`kind NOT IN (${excludeKinds.map(() => '?').join(',')})`);
    binds.push(...excludeKinds);
  }

  const row = await db
    .prepare(`SELECT id FROM jobs WHERE ${where.join(' AND ')} ORDER BY priority DESC, id ASC LIMIT 1`)
    .bind(...binds)
    .first();
  if (!row) return null;

  // The claim. `status = 'queued' OR claimed_at < staleBefore` in the WHERE is
  // what makes this safe: a second worker that read the same id finds the row
  // no longer matches and gets nothing.
  const claimed = await db
    .prepare(
      `UPDATE jobs
          SET status = 'running', claimed_at = ?, attempts = attempts + 1, updated_at = ?
        WHERE id = ? AND (status = 'queued' OR (status = 'running' AND datetime(claimed_at) < datetime(?)))`
    )
    .bind(nowIso, nowIso, row.id, staleBefore)
    .run();
  if (!claimed?.meta?.changes) return null; // somebody else got it

  const job = await db.prepare('SELECT * FROM jobs WHERE id = ?').bind(row.id).first();
  // Written after the claim rather than with it, because the claim is a
  // conditional update that may lose the race, and a history row for an attempt
  // that never started would be a lie. Never fatal: losing the note must not
  // lose the job.
  if (job) await jobEventStatement(db, job, JOB_EVENT.CLAIMED).run().catch(() => {});
  return job;
}

// How many jobs of one kind are actually out with a worker right now.
//
// The queue is the only thing every worker shares, so it is the only honest
// place to ask. A limit each worker enforces on itself is not a limit on the
// resource: two overlapping invocations obeying "two each" produce four.
//
// Claims older than the expiry do not count. They belong to a worker that died,
// and treating them as live would let one crash wedge the lane shut.
//
// datetime() wraps both sides, and that is not decoration. `claimed_at` is
// written as an ISO string with a T and a Z, while every bound built with
// datetime('now', ...) is space separated. Compared as plain text those two
// differ at character eleven — 'T' against a space — so the comparison returns
// the same answer forever, whatever the actual times are. The drain has had a
// stale-claim clause with exactly that shape since it was written, which is why
// it never matched anything. datetime() parses both forms and normalises them.
export async function inFlightCount(db, kind, { now = new Date() } = {}) {
  const staleBefore = new Date(now.getTime() - CLAIM_TTL_MINUTES * 60_000).toISOString();
  const row = await db
    .prepare(`SELECT COUNT(*) n FROM jobs WHERE kind = ? AND status = 'running' AND datetime(claimed_at) >= datetime(?)`)
    .bind(kind, staleBefore)
    .first()
    .catch(() => null);
  return Number(row?.n || 0);
}

// Put a claimed job back, as though it had never been taken.
//
// Used when a worker claims something and then discovers it should not run it
// after all. The attempt is given back too: deciding not to start is not a
// failed try, and counting it as one would eventually exhaust the retries of a
// job that has never actually run.
export async function release(db, job) {
  const update = db
    .prepare(
      `UPDATE jobs SET status = 'queued', claimed_at = NULL,
              attempts = MAX(0, attempts - 1), updated_at = datetime('now')
        WHERE id = ? AND status = 'running'`
    )
    .bind(job.id);
  await writeWith(db, update, jobEventStatement(db, job, JOB_EVENT.RELEASED)).catch(() => {});
}

// Clearing `last_error` here is right: a job that failed twice and then worked
// is a job that worked, and the row must not make it look unhealthy. It was
// also the only copy of what went wrong, which is why the attempt is written to
// `job_events` in the same batch.
export async function complete(db, id, { result = null, job = null } = {}) {
  const update = db
    .prepare(`UPDATE jobs SET status = 'done', last_error = NULL, error_kind = NULL, payload = COALESCE(?, payload), updated_at = datetime('now') WHERE id = ?`)
    .bind(result ? JSON.stringify(result).slice(0, 4000) : null, id);
  await writeWith(db, update, job && job.id ? jobEventStatement(db, job, JOB_EVENT.SUCCEEDED) : null);
}

// The state change and its history, together or not at all.
//
// D1 runs a batch atomically, so the job row and the record of how it got there
// cannot disagree because one write landed and the other did not. Without a
// history statement it is an ordinary single write, unchanged.
async function writeWith(db, update, event) {
  if (!event) { await update.run(); return; }
  if (typeof db.batch === 'function') { await db.batch([update, event]); return; }
  // No batch support on this handle. The state change is what matters, so it
  // goes first and the history follows; a lost history row is visible as a gap
  // rather than as a wrong job state.
  await update.run();
  await event.run().catch(() => {});
}

// Records a failure and decides what happens next from its kind.
export async function fail(db, job, { error, kind = ERROR_KIND.TRANSIENT, now = new Date() } = {}) {
  const msg = String(error?.message || error || 'unknown').slice(0, 500);

  // Budget is not a failure and must not burn an attempt: the work is still
  // worth doing, just not now. Decrementing keeps a month of budget waits from
  // exhausting max_attempts and losing the job.
  if (kind === ERROR_KIND.BUDGET) {
    const runAfter = new Date(now.getTime() + 6 * 3600_000).toISOString();
    const update = db
      .prepare(`UPDATE jobs SET status = 'waiting', attempts = MAX(0, attempts - 1), last_error = ?, error_kind = ?, run_after = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(msg, kind, runAfter, job.id);
    await writeWith(db, update, jobEventStatement(db, job, JOB_EVENT.WAITING_ON_BUDGET, { error: msg, errorKind: kind, runAfter }));
    return { status: STATUS.WAITING };
  }

  // A human decision. Surfacing beats retrying: nothing about running it again
  // makes the answer appear.
  if (kind === ERROR_KIND.HUMAN) {
    const update = db
      .prepare(`UPDATE jobs SET status = 'waiting', last_error = ?, error_kind = ?, run_after = NULL, updated_at = datetime('now') WHERE id = ?`)
      .bind(msg, kind, job.id);
    await writeWith(db, update, jobEventStatement(db, job, JOB_EVENT.WAITING_ON_HUMAN, { error: msg, errorKind: kind }));
    return { status: STATUS.WAITING };
  }

  const attempts = Number(job.attempts) || 1;
  const max = Number(job.max_attempts) || 3;
  if (kind === ERROR_KIND.PERMANENT || attempts >= max) {
    const update = db
      .prepare(`UPDATE jobs SET status = 'failed', last_error = ?, error_kind = ?, updated_at = datetime('now') WHERE id = ?`)
      .bind(msg, kind, job.id);
    await writeWith(db, update, jobEventStatement(db, job, JOB_EVENT.TERMINAL_FAILED, { error: msg, errorKind: kind }));
    return { status: STATUS.FAILED };
  }

  const runAfter = new Date(now.getTime() + backoffMinutes(attempts) * 60_000).toISOString();
  const update = db
    .prepare(`UPDATE jobs SET status = 'queued', last_error = ?, error_kind = ?, run_after = ?, claimed_at = NULL, updated_at = datetime('now') WHERE id = ?`)
    .bind(msg, kind, runAfter, job.id);
  // The exact run_after written, not the interval it came from. A backoff
  // formula can change; what this job was actually scheduled for cannot.
  await writeWith(db, update, jobEventStatement(db, job, JOB_EVENT.RETRY_SCHEDULED, { error: msg, errorKind: kind, runAfter }));
  return { status: STATUS.QUEUED, retryInMinutes: backoffMinutes(attempts) };
}

// Anything blocked on budget becomes runnable again when the allowance resets.
// Called by the sweep rather than polled.
export async function wakeBudgetWaiters(db, workspace) {
  const res = await db
    .prepare(`UPDATE jobs SET status = 'queued', run_after = NULL, updated_at = datetime('now')
               WHERE workspace = ? AND status = 'waiting' AND error_kind = ?`)
    .bind(workspace, ERROR_KIND.BUDGET)
    .run();
  return res?.meta?.changes || 0;
}

// What the queue looks like right now, for the UI and for the report.
export async function queueSummary(db, workspace) {
  const { results } = await db
    .prepare(`SELECT status, error_kind, COUNT(*) AS n FROM jobs WHERE workspace = ? GROUP BY status, error_kind`)
    .bind(workspace)
    .all();
  const out = { queued: 0, running: 0, done: 0, failed: 0, waiting: 0, cancelled: 0, waitingOnBudget: 0, waitingOnHuman: 0 };
  for (const r of results || []) {
    out[r.status] = (out[r.status] || 0) + r.n;
    if (r.status === STATUS.WAITING && r.error_kind === ERROR_KIND.BUDGET) out.waitingOnBudget += r.n;
    if (r.status === STATUS.WAITING && r.error_kind === ERROR_KIND.HUMAN) out.waitingOnHuman += r.n;
  }
  return out;
}

// Classifies a thrown error so the queue knows what to do with it. Errors that
// cannot be classified are transient, because giving up on something
// recoverable is worse than one wasted retry.
export function classifyError(err) {
  const msg = String(err?.message || err || '');
  if (err?.budget || /out of credits|allowance|reserve/i.test(msg)) return ERROR_KIND.BUDGET;
  if (err?.human || /needs a person|confirm|ambiguous/i.test(msg)) return ERROR_KIND.HUMAN;
  if (err?.permanent || /not found|no domain|invalid|forbidden|not in this workspace/i.test(msg)) return ERROR_KIND.PERMANENT;
  return ERROR_KIND.TRANSIENT;
}
