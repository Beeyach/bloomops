import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { loadAutoLimits, autoSpentToday } from '@/lib/auto-budget.mjs';
import { loadCredits } from '@/lib/credits.mjs';
import { CLAIM_TTL_MINUTES } from '@/lib/queue.mjs';
import { queueStateOf } from '@/lib/queue-state.mjs';
import { jobHistory, summariseHistory } from '@/lib/job-events.mjs';
import { friendlyError } from '@/lib/friendly-errors.mjs';
import { scannerLoad, recentThroughput, livenessOf } from '@/lib/scanner-items.mjs';
import { readSchedulerHeartbeat, schedulerHealth, dailyWakeHealth, DAILY_WAKE } from '@/lib/scheduler-health.mjs';
import {
  systemHealth, scannerSummary, scannerLane, serviceState, claimIsStale, MAILBOX_STALE_MINUTES,
} from '@/lib/system-health.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Everything the health page needs, in one bounded read.
//
// Read-only by construction: not one statement here is an INSERT, UPDATE or
// DELETE, and there is no code path that enqueues, retries or sends. A page
// somebody refreshes every thirty seconds must not be able to change anything,
// or refreshing it becomes an action.
//
// Bounded by construction too. Every query is either an aggregate or has a
// LIMIT. The held backlog is 4,132 rows and counting it by loading it would
// make the cheapest page in the app the most expensive.

// The attention list is a list of things to look at, not an inventory. Twenty
// five is more than anybody works through in a sitting, and a page that can
// return two thousand rows is a page that will one day be asked to.
const MAX_ATTENTION = 25;

// What Cloudflare says this deployment was built from.
//
// CF_PAGES_COMMIT_SHA and CF_PAGES_BRANCH are set by Pages at build time. Read
// defensively: a local `next dev` has neither, and the honest answer there is
// "unknown" rather than a crash or a guess.
// Read from the request context only, never from the process environment. The
// rule on this page is that an environment variable is never evidence of
// anything, and the test that enforces it is a plain string check; keeping to
// the binding is both honest and the right source on Pages anyway.
function buildInfo() {
  let e = {};
  try { e = getRequestContext().env || {}; } catch { e = {}; }
  const sha = String(e.CF_PAGES_COMMIT_SHA || '');
  return {
    commit: sha ? sha.slice(0, 7) : 'unknown',
    branch: String(e.CF_PAGES_BRANCH || '') || 'unknown',
  };
}

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const ws = ctx.workspace;
  const now = new Date();
  const build = buildInfo();

  // Recorded, not inferred. The only thing on this page that can tell "the cron
  // ran and there was nothing to do" from "the cron has not run since Tuesday".
  const scheduler = schedulerHealth({ ...(await readSchedulerHeartbeat(db).catch(() => ({}))), now });
  // The once-a-day path, judged separately. It is the one that lines up new
  // work, so it can go dark while the drain above stays perfectly healthy.
  const dailyWake = dailyWakeHealth({ ...(await readSchedulerHeartbeat(db, { name: DAILY_WAKE }).catch(() => ({}))), now });

  const one = async (sql, ...binds) => {
    const r = await db.prepare(sql).bind(...binds).first().catch(() => null);
    return r || {};
  };
  const all = async (sql, ...binds) => {
    const r = await db.prepare(sql).bind(...binds).all().catch(() => ({ results: [] }));
    return r.results || [];
  };

  // ── The queue, as one aggregate ────────────────────────────────────────
  //
  // A claimed job whose lease expired counts as stuck rather than running. The
  // runner already treats it that way when it reclaims it; showing it as
  // "running" for the fifteen minutes in between would be the page disagreeing
  // with the engine.
  const staleBefore = new Date(now.getTime() - CLAIM_TTL_MINUTES * 60_000)
    .toISOString().replace('T', ' ').slice(0, 19);
  // Compared with datetime() on both sides, the same way claimNext does it.
  const nowSql = now.toISOString().replace('T', ' ').slice(0, 19);

  const q = await one(
    `SELECT
       SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) queued,
       -- Split out, because these two looked identical and one of them is
       -- fine. A job whose retry the queue already scheduled is not waiting
       -- for anybody; a job eligible now and still sitting there might be.
       SUM(CASE WHEN status = 'queued' AND run_after IS NOT NULL AND datetime(run_after) > datetime(?) THEN 1 ELSE 0 END) waitingRetry,
       SUM(CASE WHEN status = 'queued' AND (run_after IS NULL OR datetime(run_after) <= datetime(?)) THEN 1 ELSE 0 END) readyNow,
       SUM(CASE WHEN status = 'running' AND (claimed_at IS NULL OR claimed_at >= ?) THEN 1 ELSE 0 END) running,
       SUM(CASE WHEN status = 'running' AND claimed_at < ? THEN 1 ELSE 0 END) stuck,
       SUM(CASE WHEN status = 'waiting' AND error_kind = 'budget' THEN 1 ELSE 0 END) waitingBudget,
       SUM(CASE WHEN status = 'waiting' AND error_kind = 'human' THEN 1 ELSE 0 END) waitingHuman,
       SUM(CASE WHEN status = 'waiting' AND error_kind NOT IN ('budget','human') THEN 1 ELSE 0 END) waitingOther,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) failed,
       SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) cancelled,
       SUM(CASE WHEN status = 'done' AND date(updated_at) = date('now') THEN 1 ELSE 0 END) doneToday
     FROM jobs WHERE workspace = ?`,
    staleBefore, staleBefore, nowSql, nowSql, ws
  );
  const queue = {
    queued: Number(q.queued || 0),
    waitingRetry: Number(q.waitingRetry || 0),
    readyNow: Number(q.readyNow || 0),
    running: Number(q.running || 0),
    stuck: Number(q.stuck || 0),
    waitingBudget: Number(q.waitingBudget || 0),
    waitingHuman: Number(q.waitingHuman || 0),
    waitingOther: Number(q.waitingOther || 0),
    failed: Number(q.failed || 0),
    cancelled: Number(q.cancelled || 0),
    doneToday: Number(q.doneToday || 0),
  };

  const byKind = await all(
    `SELECT kind, status, COUNT(*) n FROM jobs
      WHERE workspace = ? AND status IN ('queued','running','waiting','failed')
      GROUP BY kind, status ORDER BY n DESC LIMIT 30`,
    ws
  );

  // ── What could not finish ──────────────────────────────────────────────
  //
  // Failed and stuck only. A job waiting on budget or on a person has not
  // failed at anything and does not belong in a list headed by the word
  // attention.
  const broken = await all(
    `SELECT id, kind, prospect_id, status, attempts, max_attempts, error_kind, last_error,
            claimed_at, updated_at
       FROM jobs
      WHERE workspace = ?
        AND (status = 'failed' OR (status = 'running' AND claimed_at < ?))
      ORDER BY updated_at DESC LIMIT ?`,
    ws, staleBefore, MAX_ATTENTION
  );

  // Waiting for a retry the queue already scheduled. Not broken, and
  // deliberately its own list rather than a line in the one headed by the word
  // attention: job 522 sat here for ten minutes and was reported as a stuck
  // queue, because the only thing on screen was the word queued.
  const retrying = await all(
    `SELECT id, kind, prospect_id, status, attempts, max_attempts, error_kind, last_error,
            claimed_at, run_after, created_at, updated_at
       FROM jobs
      WHERE workspace = ? AND status = 'queued'
        AND run_after IS NOT NULL AND datetime(run_after) > datetime(?)
      ORDER BY run_after ASC LIMIT ?`,
    ws, nowSql, MAX_ATTENTION
  );

  // Names for the affected prospects, in one query rather than one per row.
  const ids = [...new Set(broken.map((b) => b.prospect_id).filter(Boolean))];
  const names = new Map();
  if (ids.length) {
    const rows = await all(
      `SELECT id, name, business_name FROM prospects
        WHERE workspace = ? AND id IN (${ids.map(() => '?').join(',')})`,
      ws, ...ids
    );
    for (const r of rows) names.set(r.id, r.name || r.business_name || `#${r.id}`);
  }

  // What each of these went through before it stopped. Bounded to the jobs
  // already on screen, so nothing here scans the table.
  const stories = new Map();
  for (const b of broken) {
    stories.set(b.id, summariseHistory(await jobHistory(db, b.id, { limit: 20 })));
  }

  const attention = broken.map((b) => {
    const friendly = friendlyError(b.last_error, { errorKind: b.error_kind });
    return {
      id: b.id,
      kind: b.kind,
      prospectId: b.prospect_id || null,
      who: b.prospect_id ? (names.get(b.prospect_id) || `#${b.prospect_id}`) : null,
      // The stale-claim case is not a failure the job reported; it is a worker
      // that went away mid-job, and it says so rather than borrowing whatever
      // error happened to be on the row.
      title: b.status === 'running' ? 'It started and never reported back' : friendly.title,
      what: b.status === 'running'
        ? `Nothing has been heard from it for ${CLAIM_TTL_MINUTES} minutes or more. The queue will pick it up again on its own.`
        : friendly.detail,
      // Only where the app already has a safe retry for it. This page adds no
      // new mechanism and there is deliberately no retry-everything.
      retryable: b.status === 'failed' && friendly.retry === true && Boolean(b.prospect_id),
      // Everything raw lives behind the disclosure, never in the sentence.
      technical: { status: b.status, errorKind: b.error_kind, attempts: b.attempts, maxAttempts: b.max_attempts, lastError: b.last_error, at: b.updated_at },
      // One line per attempt, sanitized when it was written. Empty for
      // anything that predates the history table, which is honest: it means
      // nobody recorded it, not that nothing happened.
      history: stories.get(b.id) || [],
    };
  });

  // ── Budget and credits, kept apart ─────────────────────────────────────
  //
  // Three different things get called money here and only one of them is a
  // balance. The daily automatic allowance bounds what the unattended sweep
  // may spend; the credit balance is what the workspace has; a hand-run check
  // spends the balance and does not touch the allowance. Adding them into one
  // bar would be inventing a number.
  const limits = await loadAutoLimits(db, ws);
  const spentToday = await autoSpentToday(db, ws).catch(() => 0);
  const credits = await loadCredits(db, ws).catch(() => null);
  const spend = await one(
    `SELECT COALESCE(SUM(credits),0) usedToday FROM credit_events
      WHERE workspace = ? AND date(created_at) = date('now') AND kind = 'charge'`,
    ws
  );

  // ── Hive ───────────────────────────────────────────────────────────────
  const run = await one(
    // workspace is selected, not assumed. Leaving it out made livenessOf bind
    // undefined, throw, get swallowed by the catch below, and report a healthy
    // waiting run as one that had stopped unexpectedly.
    `SELECT id, workspace, scanner, state, total, processed, succeeded, failed, current_item,
            started_at, heartbeat_at, last_scheduler_seen_at, stopped_at, finished_at
       FROM scanner_runs WHERE workspace = ? ORDER BY id DESC LIMIT 1`,
    ws
  );
  // Whether the queue owns this run, which is what decides who can kill it by
  // closing a page. One indexed count, and only for a run that is still going.
  let durable = false;
  if (run.id && (run.state === 'RUNNING' || run.state === 'STOPPING')) {
    const n = await one(
      `SELECT COUNT(*) n FROM scanner_run_items WHERE workspace = ? AND scanner_run_id = ?`,
      ws, run.id
    );
    durable = Number(n?.n || 0) > 0;
  }
  // Why a run is quiet, not just how long. A run queuing for a free site
  // checker used to be reported here as having stopped unexpectedly.
  const liveness = run.id ? await livenessOf(db, run, { workspace: ws, now }).catch(() => null) : null;
  const hive = scannerSummary(run.id ? { ...run, durable } : null, now, { liveness });

  // The lane itself: what is being checked, what is waiting, and how fast it
  // has actually been going. Both reads are bounded and indexed.
  const lane = scannerLane({
    load: await scannerLoad(db, { workspace: ws }).catch(() => null),
    throughput: await recentThroughput(db, { workspace: ws }).catch(() => null),
  });
  if (hive.attention) {
    attention.push({
      id: `run-${run.id}`,
      kind: 'hive-run',
      prospectId: null,
      who: null,
      // Its own title. Falling through to the generic one put "It could not
      // finish" above a sentence about a scanner, which reads as two different
      // problems stacked.
      // The same words the Hive section uses. Two cards about one incident
      // saying it differently is how somebody concludes there were two.
      title: 'A Hive run stopped unexpectedly',
      what: hive.text,
      retryable: false,
      technical: { state: run.state, processed: run.processed, total: run.total, heartbeatAt: run.heartbeat_at, startedAt: run.started_at },
    });
  }

  // ── Today's work ───────────────────────────────────────────────────────
  //
  // Counted from durable per-prospect stamps, not from job rows: a job that ran
  // twice on one prospect is one website checked, and counting jobs would make
  // a retry look like progress. Deleted and test rows are excluded, which
  // matters right now because three of them exist on purpose.
  const work = await one(
    `SELECT
       (SELECT COUNT(*) FROM prospects
         WHERE workspace = ? AND deleted_at IS NULL AND date(site_intel_at) = date('now')) sitesChecked,
       (SELECT COUNT(*) FROM prospects
         WHERE workspace = ? AND deleted_at IS NULL AND date(contact_searched_at) = date('now')) contactSearches,
       (SELECT COUNT(*) FROM prospects
         WHERE workspace = ? AND deleted_at IS NULL AND date(contact_searched_at) = date('now')
           AND contact_search_result = 'FOUND') contactsFound,
       (SELECT COUNT(*) FROM outreach_packages
         WHERE workspace = ? AND date(created_at) = date('now')) packagesPrepared,
       (SELECT COUNT(*) FROM outcome_events
         WHERE workspace = ? AND kind = 'vet' AND date(created_at) = date('now')) vetDecisions`,
    ws, ws, ws, ws, ws
  );

  // ── Contact recovery, as counts ────────────────────────────────────────
  const contact = await one(
    `SELECT
       (SELECT COUNT(*) FROM prospects
         WHERE workspace = ? AND deleted_at IS NULL
           AND (contact_state = 'NONE' OR (contact_state IS NULL AND (email IS NULL OR email = '')))
           AND stage NOT IN ('Client','Rejected','Not This Offer','Lost','Invalid Email','Finished')) waiting,
       (SELECT COUNT(*) FROM prospects
         WHERE workspace = ? AND deleted_at IS NULL AND contact_state = 'NEEDS_CONTACT_RECOVERY') broken,
       (SELECT COUNT(*) FROM jobs
         WHERE workspace = ? AND kind = 'discover-contact' AND status IN ('queued','running')) searching`,
    ws, ws, ws
  );

  // ── Services, each with the signal that justifies it ───────────────────
  const lastJob = await one(`SELECT MAX(updated_at) at FROM jobs WHERE workspace = ?`, ws);
  const mailbox = await one(
    `SELECT email_address, status, last_sync_at, last_notification_at, watch_expiration, last_error
       FROM gmail_accounts WHERE workspace = ? LIMIT 1`,
    ws
  );
  const lastCheck = await one(
    `SELECT MAX(site_intel_at) at FROM prospects WHERE workspace = ? AND deleted_at IS NULL`,
    ws
  );

  const services = [
    serviceState({
      label: 'Queue worker',
      lastActivityAt: lastJob.at,
      staleMinutes: 60,
      evidence: 'A background job last changed state at this time. Nothing else can move a job.',
      now,
    }),
    serviceState({
      label: 'Mailbox sync',
      lastActivityAt: mailbox.last_sync_at,
      staleMinutes: MAILBOX_STALE_MINUTES,
      // Not the OAuth token, which proves only that somebody once said yes.
      evidence: 'Your mailbox was last read at this time. A stored token would not prove this.',
      hardDown: mailbox.email_address ? mailbox.status === 'needs-reconnect' : false,
      now,
    }),
    serviceState({
      label: 'Website checker',
      lastActivityAt: lastCheck.at,
      staleMinutes: 60 * 24,
      evidence: 'A website was last read and written back to a prospect at this time.',
      now,
    }),
  ];

  const overall = systemHealth({
    queue: { ...queue, running: queue.running },
    // Jobs whose next attempt the queue has already scheduled, each carrying
    // the state a person can act on and the UTC time it happens. The client
    // renders that in local time; nothing here decides a timezone.
    retrying: retrying.map((j) => {
      const s = queueStateOf(j, { now });
      return {
        id: j.id, kind: j.kind, prospectId: j.prospect_id || null,
        state: s.state, label: s.label, detail: s.detail,
        nextAttemptAt: s.nextAttemptAt, attempt: s.attempt, maxAttempts: s.maxAttempts,
        eligibleNow: s.eligibleNow, possiblyStuck: s.possiblyStuck,
      };
    }),
    attention,
    budget: { resetsAt: 'midnight UTC' },
    services,
    scheduler,
    dailyWake,
    now,
  });

  return NextResponse.json({
    updatedAt: now.toISOString(),
    overall,
    queue,
    byKind,
    // Capped above, and the count says whether anything was left out.
    attention: attention.slice(0, MAX_ATTENTION),
    attentionTruncated: attention.length > MAX_ATTENTION,
    budget: {
      dailyAllowance: limits.autoCreditsPerDay,
      spentToday,
      remaining: Math.max(0, limits.autoCreditsPerDay - spentToday),
      waiting: queue.waitingBudget,
      resetsAt: 'midnight UTC',
    },
    credits: {
      // Workspace level only. Per-prospect attribution is incomplete and the
      // page says so rather than dividing an unreliable number.
      balance: credits && typeof credits.balance === 'number' ? credits.balance : null,
      usedToday: Number(spend.usedToday || 0),
    },
    work: {
      sitesChecked: Number(work.sitesChecked || 0),
      contactSearches: Number(work.contactSearches || 0),
      contactsFound: Number(work.contactsFound || 0),
      packagesPrepared: Number(work.packagesPrepared || 0),
      vetDecisions: Number(work.vetDecisions || 0),
      jobsFinished: queue.doneToday,
    },
    contact: {
      waiting: Number(contact.waiting || 0),
      broken: Number(contact.broken || 0),
      searching: Number(contact.searching || 0),
    },
    hive,
    scheduler,
    dailyWake,
    scanner: lane,
    // Which commit is actually answering this request.
    //
    // Not decoration. "Is the fix deployed?" has been answered wrongly more
    // than once in this project, because the deployment list says Active while
    // the edge still serves the previous bundle, and because the app sits
    // behind a gate so the served JavaScript cannot be read without signing in.
    // Cloudflare Pages hands every function the commit it was built from, so
    // the honest answer was always one line away.
    build,
    services,
    technical: {
      claimTtlMinutes: CLAIM_TTL_MINUTES,
      mailboxStaleMinutes: MAILBOX_STALE_MINUTES,
      lastJobAt: lastJob.at || null,
      mailbox: mailbox.email_address
        ? { address: mailbox.email_address, status: mailbox.status, lastSyncAt: mailbox.last_sync_at, lastPushAt: mailbox.last_notification_at, watchExpires: mailbox.watch_expiration }
        : null,
      lastSiteCheckAt: lastCheck.at || null,
    },
  });
}
