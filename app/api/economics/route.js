import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized, forbidden } from '@/lib/workspace.mjs';
import { summarise, perProspect, periodSql, PERIODS, catalogSummary } from '@/lib/economics.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Internal economics. Admin only: this is what the product costs to run, and
// it is nobody's business but the person paying the bills.
export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') return forbidden();

  const db = getDb();
  const url = new URL(req.url);
  const prospectId = Number(url.searchParams.get('prospect'));

  // ── Drill-down: what one prospect consumed ─────────────────────────────
  if (Number.isInteger(prospectId) && prospectId > 0) {
    const prospect = await db
      .prepare(`SELECT id, name, stage, replied, reply_type, first_client_at FROM prospects WHERE id = ? AND workspace = ?`)
      .bind(prospectId, ctx.workspace)
      .first();
    if (!prospect) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [credits, ai, sends, pkg] = await Promise.all([
      db.prepare(`SELECT action, credits, kind, actor FROM credit_events WHERE workspace = ? AND prospect_id = ?`)
        .bind(ctx.workspace, prospectId).all(),
      // AI usage is not stamped with a prospect, so a per-prospect AI cost can
      // only come from the package that recorded one. Saying so beats a join
      // that looks precise and is not.
      db.prepare(`SELECT task, cost_usd, ok FROM ai_usage WHERE workspace = ? AND 1 = 0`).bind(ctx.workspace).all(),
      db.prepare(`SELECT COUNT(*) AS n FROM send_events WHERE workspace = ? AND prospect_id = ?`)
        .bind(ctx.workspace, prospectId).first(),
      db.prepare(`SELECT status, playbook, reviewed_at, credits_spent FROM outreach_packages WHERE workspace = ? AND prospect_id = ? ORDER BY version DESC LIMIT 1`)
        .bind(ctx.workspace, prospectId).first(),
    ]);

    const detail = perProspect({
      creditRows: credits.results || [],
      aiRows: ai.results || [],
      prospect,
      sends: Number(sends?.n) || 0,
      pkg,
    });
    return NextResponse.json({
      prospect: detail,
      // Named explicitly rather than folded in as a zero.
      aiCostNote: 'AI spend is ledgered per workspace, not per prospect, so the per-prospect model cost is not attributable yet.',
    });
  }

  // ── Period summary ─────────────────────────────────────────────────────
  const period = PERIODS[url.searchParams.get('period')] ? url.searchParams.get('period') : '7d';
  const where = periodSql(period);

  const [ai, credits, pending] = await Promise.all([
    db.prepare(`SELECT task, model, cost_usd, credits_charged, ok FROM ai_usage WHERE workspace = ? AND ${where}`)
      .bind(ctx.workspace).all(),
    db.prepare(`SELECT action, credits, kind, actor FROM credit_events WHERE workspace = ? AND ${where}`)
      .bind(ctx.workspace).all(),
    // Approved and not yet sent. Not economics exactly, but it is the number
    // that says whether the spend turned into anything.
    db.prepare(
      `SELECT COUNT(*) AS n FROM outreach_packages pk
        WHERE pk.workspace = ? AND pk.status = 'APPROVED'
          AND NOT EXISTS (SELECT 1 FROM send_events s WHERE s.workspace = pk.workspace AND s.prospect_id = pk.prospect_id)`
    ).bind(ctx.workspace).first(),
  ]);

  const summary = summarise({ aiRows: ai.results || [], creditRows: credits.results || [] });

  return NextResponse.json({
    period,
    periodLabel: PERIODS[period].label,
    ...summary,
    approvedNotSent: Number(pending?.n) || 0,
    // Prices and per-unit costs, straight from the catalog. The view renders
    // these rather than holding its own copy of any price.
    catalog: catalogSummary(),
  });
}
