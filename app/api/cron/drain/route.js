import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { runJobs } from '@/lib/runner.mjs';
import { cancelAbandonedItems, reconcileScannerRuns } from '@/lib/scanner-items.mjs';
import { queueSummary, KIND } from '@/lib/queue.mjs';
import { markSchedulerInvoked, markSchedulerCompleted, markSchedulerFinished, runStage, OUTCOME, DAILY_WAKE } from '@/lib/scheduler-health.mjs';
import { reconcileProspectFacts } from '@/lib/prospect-facts.mjs';
import { autonomyPaused, tripIfBurning } from '@/lib/spend-breaker.mjs';

export const dynamic = 'force-dynamic';

// The thing that makes any of this autonomous.
//
// A Cron Trigger on the bloomwired-review Worker calls this on a schedule. The
// browser does not need to be open and nobody presses anything. Cron's only
// job is to wake the queue; the work happens here, one bounded batch at a
// time, because a cron that does expensive work itself is a cron that cannot
// be stopped when it goes wrong.
//
// Authenticated by a shared secret rather than a session, because there is no
// person here. The secret only opens this one path, and the path can only
// drain the queue: it cannot read a prospect, write one, or do anything a
// stolen secret would make worth stealing.

function env() {
  try { return { ...process.env, ...(getCloudflareContext().env || {}) }; } catch { return process.env || {}; }
}

// Constant-time-ish compare so the secret cannot be guessed a character at a
// time off response timing.
function secretMatches(given, expected) {
  const a = String(given || '');
  const b = String(expected || '');
  if (!b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Bounds. A cron invocation is not allowed to become a long-running process:
// Cloudflare will kill it anyway, and a job cut off mid-flight is exactly what
// the claim expiry exists to recover.
const MAX_JOBS_PER_RUN = 12;
const MAX_MS = 25_000;
// How many jobs one workspace may take from a single invocation. With one
// workspace this changes nothing; with several it stops an import of twenty
// thousand prospects monopolising the worker.
const MAX_PER_WORKSPACE = 5;

export async function POST(req) {
  const e = env();
  const expected = e.CRON_SECRET;
  if (!expected) {
    // Names only, never values. A misconfigured cron is otherwise invisible:
    // the Worker fires, the app answers 503, and nothing says whether the
    // secret is missing, misspelled, or on the wrong environment.
    const seen = ['CRON_SECRET', 'RENDER_SECRET', 'LTB_SESSION_SECRET', 'UPLOAD_SECRET']
      .filter((k) => Boolean(e[k]));
    return NextResponse.json(
      {
        error: 'CRON_SECRET is not configured on this deployment.',
        // If this list is empty, the binding itself is not reaching the route.
        // If it has the others but not CRON_SECRET, the secret went to the
        // wrong project or the deployment predates it.
        otherSecretsVisible: seen,
        hint: 'Pages secrets only apply to deployments created after they are set.',
      },
      { status: 503 }
    );
  }
  if (!secretMatches(req.headers.get('x-cron-secret'), expected)) {
    // Deliberately identical to the not-configured case in shape, and says
    // nothing about which half was wrong.
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }

  const db = getDb();
  const startedAt = Date.now();

  // The scheduler got here and proved who it was.
  //
  // Written before any work, because this heartbeat means "the cron fired", not
  // "the cron succeeded". Those are different questions and the page asks them
  // separately: a drain that fires on time and fails every job it touches has a
  // healthy scheduler and a queue full of problems.
  //
  // After the secret check, never before it, or an unauthenticated request off
  // the internet could make the health page look fine.
  await markSchedulerInvoked(db);

  // The spend breaker, before any work. Ary's pause control and the drain's
  // own tripwire write the same flag, and this is the one place it is read.
  // Paused means paused: bookkeeping, cleanup and approved sends all wait.
  // Costs one single-row read per drain; stamping completed keeps the health
  // page green, because a paused drain did exactly what it was told to.
  const paused = await autonomyPaused(db);
  if (paused) {
    await markSchedulerCompleted(db);
    return NextResponse.json({ ok: true, paused: true, reason: paused.reason, since: paused.since, ran: 0 });
  }

  // What the drain no longer does, by Ary's instruction (2026-08-27): read
  // Gmail (no mailbox reconcile, no sent-mail observer, no conversation
  // syncing) and compose email (no late-follow-up selector, no generation
  // jobs, no scanner waves). The skills do the reading and the writing in
  // Cowork, where the drafting is free; the app keeps the records, stages
  // what the skills hand it, and sends only what Ary approved. Everything
  // removed here spent either Gmail quota or AI money on its own schedule,
  // which is exactly what she asked to end.

  // The prospect-facts reconcile used to run here, every five minutes. It
  // moved to the daily wake below (2026-08-30, Ary's no-Cloudflare-spend
  // instruction): replies are applied to the prospect row at ingest time, so
  // the reconcile is a drift safety-net, and a safety-net that ran 288 times
  // a day computing "zero drifted" was most of the app's remaining D1 reads.

  // Close out any Hive run whose tab went away.
  //
  // This is the fix for a run that sat in the database saying RUNNING for nine
  // hours. The rule existed and the code that writes it existed; the only
  // thing that ever called it was the Hive page mounting in a browser, which
  // is precisely what does not happen when the tab that was driving the run
  // has closed. Recovery was gated on the event that cannot occur.
  //
  // Here instead: every drain, across every workspace, bounded to fifty runs,
  // costing nothing. It starts no run and spends nothing.
  const staleRuns = await reconcileScannerRuns(db).catch(() => ({ closed: 0, cancelledJobs: 0, runs: [], protected: [] }));
  // Its items too, or they sit saying a worker is about to pick them up.
  // Cleanup stays even though scanning is over: a run left open from before
  // the shutdown should still close itself instead of saying RUNNING forever.
  const staleItems = await cancelAbandonedItems(db, staleRuns.runs).catch(() => 0);

  // Which workspaces actually have work. Asking the queue rather than a list
  // of workspaces means a quiet workspace costs nothing.
  const { results: pending } = await db
    .prepare(
      `SELECT workspace, COUNT(*) AS n
         FROM jobs
        WHERE status = 'queued' OR (status = 'running' AND datetime(claimed_at) < datetime('now', '-15 minutes'))
        GROUP BY workspace
        ORDER BY n DESC`
    )
    .bind()
    .all();

  const workspaces = (pending || []).map((r) => r.workspace);
  const ran = [];
  const perWorkspace = {};

  // Round-robin rather than draining one workspace to empty. Fairness is
  // cheap to build now and impossible to retrofit once somebody with a big
  // import is starving everybody else.
  let round = 0;
  outer: while (workspaces.length && Date.now() - startedAt < MAX_MS && ran.length < MAX_JOBS_PER_RUN) {
    let didWork = false;
    for (const ws of workspaces) {
      if (ran.length >= MAX_JOBS_PER_RUN) break outer;
      if (Date.now() - startedAt > MAX_MS) break outer;
      if ((perWorkspace[ws] || 0) >= MAX_PER_WORKSPACE) continue;

      // Send-approved only. Every other kind either reads Gmail or spends AI
      // money, and both are the skills' job now. An include-list rather than
      // an exclude-list, so a kind added later is off until somebody decides
      // otherwise, not on because nobody remembered this line.
      const out = await runJobs(db, ws, { max: 1, kinds: [KIND.SEND_APPROVED] });
      if (!out.ran.length) continue;
      didWork = true;
      perWorkspace[ws] = (perWorkspace[ws] || 0) + out.ran.length;
      ran.push(...out.ran.map((j) => ({ ...j, workspace: ws })));
    }
    round += 1;
    // Nothing anywhere took a job this pass: everything left is scheduled for
    // later or blocked. Stop rather than spinning.
    if (!didWork) break;
  }

  const elapsedMs = Date.now() - startedAt;
  const summaries = {};
  for (const ws of Object.keys(perWorkspace)) summaries[ws] = await queueSummary(db, ws);

  // Reached the end of what this invocation meant to do. Only here, never on a
  // failure path: a drain that threw has not completed, and recording otherwise
  // would hide the exact case this is meant to expose.
  await markSchedulerCompleted(db);

  return NextResponse.json({
    ok: true,
    ran: ran.length,
    jobs: ran,
    workspaces: perWorkspace,
    rounds: round,
    elapsedMs,
    scannerRunsClosed: staleRuns.closed,
    scannerJobsCancelled: staleRuns.cancelledJobs,
    scannerItemsCancelled: staleItems,
    // True when the bounds stopped us rather than the queue running dry. The
    // next invocation picks up where this one left off.
    moreWaiting: ran.length >= MAX_JOBS_PER_RUN || elapsedMs >= MAX_MS,
    summaries,
  });
}

// The daily wake, now the home of the bookkeeping.
//
// This used to be the top of the whole autonomous chain: it woke budget
// waiters, enqueued the sweep that decided what today's work was, and kept
// the Gmail watches alive. Ary shut that chain down on 2026-08-27 — the
// skills decide the day's work in Cowork now, where drafting is free, and
// the app neither reads Gmail nor composes on its own. Gmail watches are
// deliberately left to lapse: Gmail drops them after seven days on its own,
// and not renewing them is how push notifications end without touching
// anything.
//
// What remains is the once-a-day drift check. The prospect-facts reconcile
// ran on every five-minute drain and, in the steady state, read tens of
// thousands of rows to find nothing drifted — most of the app's D1 reads,
// spent proving a negative 288 times a day. Replies are applied to the
// prospect row the moment they are ingested, so the reconcile is a safety
// net, and a safety net that runs daily still catches everything by the
// next morning. The spend tripwire moved with it: it meters this pass, the
// only pass left that reads at scale.
export async function PUT(req) {
  const e = env();
  if (!secretMatches(req.headers.get('x-cron-secret'), e.CRON_SECRET)) {
    return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  }
  const db = getDb();

  // Its own row, never the drain's. These two schedules fail independently and
  // the five-minute one staying healthy is exactly what used to hide this one
  // going dark.
  await markSchedulerInvoked(db, { name: DAILY_WAKE });

  // Paused means paused: the daily bookkeeping waits with everything else.
  const paused = await autonomyPaused(db);
  if (paused) {
    await markSchedulerCompleted(db, { name: DAILY_WAKE });
    return NextResponse.json({ ok: true, paused: true, reason: paused.reason, since: paused.since });
  }

  const stages = [];
  const prospectFacts = (await runStage(stages, 'reconcile-prospect-facts', () => reconcileProspectFacts(db)))
    || { counters: 0, replies: 0, rowsRead: 0 };

  // The tripwire. A normal pass reads twenty to forty thousand rows; both
  // 2026 burns read twenty-four million per run. If this pass just read like
  // a burn, pause everything now rather than six days and an invoice later.
  const tripped = await tripIfBurning(db, prospectFacts.rowsRead || 0);

  const outcome = stages.every((s) => s.ok) ? OUTCOME.COMPLETED : OUTCOME.PARTIAL;
  await markSchedulerFinished(db, { name: DAILY_WAKE, outcome, stages });

  return NextResponse.json({ ok: true, outcome, stages, prospectFacts, breakerTripped: tripped, swept: [] });
}
