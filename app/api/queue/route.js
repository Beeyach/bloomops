import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { enqueue, queueSummary, wakeBudgetWaiters, KIND, PRIORITY } from '@/lib/queue.mjs';
import { runJobs } from '@/lib/runner.mjs';
import { loadAutoLimits } from '@/lib/auto-budget.mjs';

export const dynamic = 'force-dynamic';

// The queue's front door, for a signed-in person.
//
// POST /api/queue          enqueue work
// POST /api/queue?drain=1  run some jobs now, rather than waiting for cron
// POST /api/queue?wake=1   release anything parked on budget
// GET  /api/queue          what the queue looks like
//
// The handlers and the run loop live in lib/runner.mjs, because the cron path
// at /api/cron/drain runs the identical code on a schedule. A prospect
// advances because finishing one stage enqueues the next, not because anybody
// pressed continue.

// ── Routes ───────────────────────────────────────────────────────────────

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const summary = await queueSummary(db, ctx.workspace);
  const { results } = await db
    .prepare(`SELECT id, kind, prospect_id, status, attempts, error_kind, last_error, run_after, updated_at
                FROM jobs WHERE workspace = ? AND status IN ('queued','running','waiting','failed')
               ORDER BY priority DESC, id ASC LIMIT 50`)
    .bind(ctx.workspace)
    .all();
  return NextResponse.json({ summary, jobs: results || [] });
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const url = new URL(req.url);

  let body = {};
  try { body = await req.json(); } catch {}

  // ── Drain: run jobs ────────────────────────────────────────────────────
  if (url.searchParams.get('drain')) {
    // Same runner the cron path uses. Two copies of this loop would be two
    // engines that disagree.
    const max = Math.max(1, Math.min(Number(body?.max) || 5, 25));
    return NextResponse.json(await runJobs(db, ctx.workspace, { max }));
  }

  // ── Wake anything that was blocked on budget ───────────────────────────
  if (url.searchParams.get('wake')) {
    const woken = await wakeBudgetWaiters(db, ctx.workspace);
    return NextResponse.json({ woken });
  }

  // ── Enqueue ────────────────────────────────────────────────────────────
  const ids = Array.isArray(body?.prospectIds)
    ? body.prospectIds.map(Number).filter(Number.isFinite).slice(0, 500)
    : [Number(body?.prospectId)].filter(Number.isFinite);
  const kind = String(body?.kind || KIND.PRESCREEN);
  if (!Object.values(KIND).includes(kind)) {
    return NextResponse.json({ error: `Unknown job: ${kind}` }, { status: 400 });
  }
  // The sweep is the one job about the workspace rather than a prospect. It is
  // normally queued by the daily cron; being able to ask for one by hand is
  // what makes "did the automation see this?" answerable without waiting until
  // tomorrow morning.
  if (kind === KIND.SWEEP) {
    const q = await enqueue(db, { workspace: ctx.workspace, kind: KIND.SWEEP, priority: PRIORITY.SWEEP });
    return NextResponse.json({
      enqueued: q.queued ? 1 : 0,
      alreadyQueued: q.queued ? 0 : 1,
      summary: await queueSummary(db, ctx.workspace),
    });
  }

  if (!ids.length) return NextResponse.json({ error: 'Give me at least one prospect.' }, { status: 400 });

  const limits = await loadAutoLimits(db, ctx.workspace);
  // The fan-out guard: one trigger may not queue an entire import.
  const capped = ids.slice(0, limits.maxProspectsPerRun);
  const out = [];
  for (const id of capped) {
    out.push({ id, ...(await enqueue(db, { workspace: ctx.workspace, kind, prospectId: id })) });
  }
  return NextResponse.json({
    enqueued: out.filter((x) => x.queued).length,
    alreadyQueued: out.filter((x) => !x.queued).length,
    skippedOverCap: ids.length - capped.length,
    cap: limits.maxProspectsPerRun,
    summary: await queueSummary(db, ctx.workspace),
  });
}
