import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { RUN, isLive, mayContinue, stopTransition, settleState, isStale, reconcileStaleScannerRuns } from '@/lib/scanner-run.mjs';
import { snapshotMembership, runProgress, stopRun, feedRun, cancelAbandonedItems, recentThroughput, reconcileScannerRuns, livenessOf } from '@/lib/scanner-items.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// The Hive scanners, as something the server knows about.
//
// Everything here is scoped to one run id. Stopping a site check must not touch
// a lead scan somebody started in another tab, so there is no global kill
// switch and no "stop everything" action.
//
// Nothing in this file touches sending, sequence state, approvals or prospect
// ratings. A scanner is research; those are outreach. Keeping the two apart is
// the point.
//
// Two kinds of run pass through here now. A durable one has its membership in
// scanner_run_items and is executed by the queue: its numbers are counted from
// those rows and the browser is a spectator. A legacy one has no items and was
// driven by a tab reporting its own progress. The difference is asked once, by
// counting items, and it decides who is allowed to write the counters. Both
// authorities at once is how a run ends up with two different truths about
// itself.

const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// Server-derived numbers, or null for a run that has no membership.
async function durableView(db, ws, run) {
  if (!run) return null;
  const p = await runProgress(db, { workspace: ws, runId: run.id });
  if (!p.total) return null;
  return {
    ...run,
    total: p.total,
    processed: p.processed,
    succeeded: p.succeeded,
    failed: p.failed,
    durable: true,
    progress: p,
  };
}

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const ws = ctx.workspace;
  const url = new URL(req.url);
  const id = Number(url.searchParams.get('id'));

  if (id) {
    const row = await db
      .prepare(`SELECT * FROM scanner_runs WHERE id = ? AND workspace = ?`)
      .bind(id, ws).first().catch(() => null);
    if (!row) return NextResponse.json({ error: 'No such run.' }, { status: 404 });
    const run = (await durableView(db, ws, row)) || row;
    // Only for a run that is still going. History does not have a speed.
    const speed = isLive(run.state)
      ? await recentThroughput(db, { workspace: ws }).catch(() => null)
      : null;
    // Why it is quiet, if it is. The Hive shows this instead of guessing from a
    // progress number that has not moved.
    const liveness = isLive(run.state) ? await livenessOf(db, run).catch(() => null) : null;
    return NextResponse.json({
      run, mayContinue: mayContinue(run),
      ...(speed ? { speed } : {}),
      ...(liveness ? { liveness } : {}),
    });
  }

  // Anything still alive, plus a short tail of history.
  const { results } = await db
    .prepare(
      `SELECT * FROM scanner_runs WHERE workspace = ?
        ORDER BY (state IN ('RUNNING','STOPPING')) DESC, started_at DESC LIMIT 20`
    ).bind(ws).all().catch(() => ({ results: [] }));

  // Only the live ones are recounted. History does not change, and paying for
  // twenty aggregates to redraw a list nobody is waiting on would be silly.
  const runs = [];
  for (const r of results || []) {
    runs.push(isLive(r.state) ? (await durableView(db, ws, r)) || r : r);
  }

  return NextResponse.json({ runs, live: runs.filter((r) => isLive(r.state)) });
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const ws = ctx.workspace;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '');
  const id = Number(body.id);

  // ── start ──────────────────────────────────────────────────────────────
  if (action === 'start') {
    const scanner = String(body.scanner || '').slice(0, 60);
    if (!scanner) return NextResponse.json({ error: 'Which scanner?' }, { status: 400 });

    // One live run per scanner. Pressing the button twice should join the run
    // already going rather than start a second one racing it through the same
    // list.
    const existing = await db
      .prepare(`SELECT * FROM scanner_runs WHERE workspace = ? AND scanner = ? AND state IN ('RUNNING','STOPPING') ORDER BY id DESC LIMIT 1`)
      .bind(ws, scanner).first().catch(() => null);
    if (existing && !isStale(existing)) {
      const run = (await durableView(db, ws, existing)) || existing;
      return NextResponse.json({ run, joined: true });
    }
    // A run whose worker went away is closed rather than left in the way.
    if (existing) {
      await db.prepare(`UPDATE scanner_runs SET state = ?, finished_at = ? WHERE id = ? AND workspace = ?`)
        .bind(RUN.ABANDONED, now(), existing.id, ws).run().catch(() => {});
    }

    const ids = Array.isArray(body.prospectIds) ? body.prospectIds : null;

    const r = await db
      .prepare(
        `INSERT INTO scanner_runs (workspace, scanner, label, state, total, started_at, heartbeat_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      // Total starts at zero for a durable run and is written from the rows
      // that actually landed. A run that claims 5,484 while 5,000 rows exist is
      // the same lie in a new place.
      .bind(ws, scanner, String(body.label || '').slice(0, 120) || null, RUN.RUNNING, ids ? 0 : Number(body.total) || 0, now(), now())
      .run().catch(() => null);

    const runId = r?.meta?.last_row_id;
    if (!runId) return NextResponse.json({ error: 'Could not start that run.' }, { status: 500 });

    if (ids) {
      // Membership before work. Nothing can be handed out until the list
      // exists, and a run with no items is never settled as finished, so this
      // gap is safe to be interrupted in.
      const snap = await snapshotMembership(db, { workspace: ws, runId, prospectIds: ids });
      await db.prepare(`UPDATE scanner_runs SET total = ? WHERE id = ? AND workspace = ?`)
        .bind(snap.total, runId, ws).run().catch(() => {});
      // A first batch straight away, so the run does not sit still until the
      // next drain comes round.
      await feedRun(db, { workspace: ws, runId }).catch(() => {});
    }

    const row = await db
      .prepare(`SELECT * FROM scanner_runs WHERE id = ? AND workspace = ?`)
      .bind(runId, ws).first().catch(() => null);
    const run = (await durableView(db, ws, row)) || row;
    return NextResponse.json({ run, joined: false, durable: Boolean(ids) });
  }

  // ── reconcile ──────────────────────────────────────────────────────────
  //
  // Above the id guard, because this one is about every run rather than one of
  // them and the Hive calls it with id 0.
  //
  // That placement is the whole reason a dead run sat in the database saying
  // RUNNING for nine hours. This branch lived below `if (!id) return 400`, so
  // the only caller in the app has been receiving "Which run?" since the day it
  // was written and the recovery code had never executed once, in any
  // environment. Nothing failed loudly: the browser fired it and forgot it.
  //
  // Runs whose worker went away. History is not deleted and finished runs are
  // not touched: they are marked abandoned so they stop occupying the screen.
  if (action === 'reconcile') {
    // One implementation, in the module that owns the states and the
    // threshold. This used to read the rows, filter them in JavaScript, and
    // then update with only a state guard, so a run that got a heartbeat in
    // between could be closed while it was alive.
    const out = await reconcileScannerRuns(db, { workspace: ws });
    // And the items of the runs it closed, by the same rule Stop uses: only
    // work that never started.
    const cancelledItems = await cancelAbandonedItems(db, out.runs).catch(() => 0);
    return NextResponse.json({
      closed: out.closed,
      ids: out.runs.map((r) => r.id),
      cancelledJobs: out.cancelledJobs,
      cancelledItems,
    });
  }

  if (!id) return NextResponse.json({ error: 'Which run?' }, { status: 400 });

  const run = await db
    .prepare(`SELECT * FROM scanner_runs WHERE id = ? AND workspace = ?`)
    .bind(id, ws).first().catch(() => null);
  if (!run) return NextResponse.json({ error: 'No such run.' }, { status: 404 });

  const durable = await durableView(db, ws, run);

  // ── progress ───────────────────────────────────────────────────────────
  //
  // For a legacy run this is the heartbeat, and also how the loop learns it has
  // been asked to stop: the answer comes back on the call it was making anyway.
  //
  // For a durable run it is a read. The numbers come from the items, the
  // heartbeat comes from workers finishing them, and anything a browser posts
  // here is ignored on purpose. A page watching a run cannot be allowed to
  // report progress on work it is not doing.
  if (action === 'progress') {
    if (durable) return NextResponse.json({ run: durable, mayContinue: mayContinue(durable), durable: true });

    if (isLive(run.state)) {
      await db.prepare(
        `UPDATE scanner_runs
            SET processed = ?, succeeded = ?, failed = ?, total = COALESCE(NULLIF(?, 0), total),
                current_item = ?, heartbeat_at = ?
          WHERE id = ? AND workspace = ?`
      ).bind(
        Number(body.processed) || 0, Number(body.succeeded) || 0, Number(body.failed) || 0,
        Number(body.total) || 0, String(body.currentItem || '').slice(0, 200) || null, now(), id, ws
      ).run().catch(() => {});
    }
    const fresh = await db.prepare(`SELECT * FROM scanner_runs WHERE id = ? AND workspace = ?`).bind(id, ws).first();
    return NextResponse.json({ run: fresh, mayContinue: mayContinue(fresh) });
  }

  // ── stop ───────────────────────────────────────────────────────────────
  if (action === 'stop') {
    const reason = String(body.reason || 'Stopped by hand').slice(0, 200);

    if (durable) {
      // Everything stopping means, in one call: no new items go out, the ones
      // that never started are cancelled along with their jobs, and the run
      // settles the moment the last in-flight item lands.
      const out = await stopRun(db, { workspace: ws, runId: id, reason });
      const fresh = await db.prepare(`SELECT * FROM scanner_runs WHERE id = ? AND workspace = ?`).bind(id, ws).first();
      return NextResponse.json({
        run: (await durableView(db, ws, fresh)) || fresh,
        changed: out.changed,
        cancelled: out.cancelled,
        message: out.state === RUN.STOPPED ? 'Stopped.' : 'Stopping after the current one finishes...',
      });
    }

    const t = stopTransition(run.state);
    if (t.changed) {
      // Conditional update, so two people pressing Stop at once cannot both
      // think they were the one who did it.
      await db.prepare(
        `UPDATE scanner_runs SET state = ?, stop_reason = ?, stopped_at = ?
          WHERE id = ? AND workspace = ? AND state = ?`
      ).bind(RUN.STOPPING, reason, now(), id, ws, RUN.RUNNING)
        .run().catch(() => {});

      // Queued work this run created, and nobody else's. Already-running jobs
      // keep their claim and finish: killing one mid-write leaves a half
      // answer nothing can tell apart from a whole one.
      await db.prepare(
        `UPDATE jobs SET status = 'cancelled', updated_at = datetime('now')
          WHERE workspace = ? AND scanner_run_id = ? AND status = 'queued'`
      ).bind(ws, id).run().catch(() => {});
    }
    const fresh = await db.prepare(`SELECT * FROM scanner_runs WHERE id = ? AND workspace = ?`).bind(id, ws).first();
    return NextResponse.json({ run: fresh, changed: t.changed, message: t.message });
  }

  // ── finish ─────────────────────────────────────────────────────────────
  //
  // Called by a legacy loop when it puts the work down. A run asked to stop
  // settles as STOPPED, never COMPLETED: half a list is half a list.
  //
  // A durable run finishes itself, when its last item does. Letting a browser
  // declare that one over would let a closed tab end a run the queue is still
  // working through.
  if (action === 'finish') {
    if (durable) return NextResponse.json({ run: durable, ignored: 'This run finishes when its own work does.' });

    const next = settleState(run.state, { error: body.error === true });
    if (isLive(run.state)) {
      await db.prepare(
        `UPDATE scanner_runs
            SET state = ?, processed = ?, succeeded = ?, failed = ?, current_item = NULL,
                finished_at = ?, heartbeat_at = ?
          WHERE id = ? AND workspace = ? AND state IN ('RUNNING','STOPPING')`
      ).bind(
        next, Number(body.processed) || run.processed || 0,
        Number(body.succeeded) || run.succeeded || 0, Number(body.failed) || run.failed || 0,
        now(), now(), id, ws
      ).run().catch(() => {});
    }
    const fresh = await db.prepare(`SELECT * FROM scanner_runs WHERE id = ? AND workspace = ?`).bind(id, ws).first();
    return NextResponse.json({ run: fresh });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
