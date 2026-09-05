import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { summarise, outputStats, MODEL_PRICES, USD_PER_CREDIT } from '@/lib/ai-cost.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// What the AI actually cost, against what was charged for it.
//
// Admin only, and deliberately so: this is the one screen in the app that
// talks in dollars. Everything a workspace sees is credits, and that stays
// true (see lib/credits.mjs). This is the view behind it, so a credit price
// can be set from a measurement rather than from the estimate in a comment.

const WINDOWS = { '7d': 7, '30d': 30, '90d': 90 };

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can see cost reporting.' }, { status: 403 });
  }

  const url = new URL(req.url);
  const days = WINDOWS[url.searchParams.get('window') || '30d'] || 30;
  // Blank means every workspace, which is the question an owner actually has.
  const scope = String(url.searchParams.get('workspace') || '').trim().toLowerCase();

  const db = getDb();
  const where = scope ? 'WHERE created_at >= datetime(\'now\', ?) AND workspace = ?' : 'WHERE created_at >= datetime(\'now\', ?)';
  const binds = scope ? [`-${days} days`, scope] : [`-${days} days`];

  const { results } = await db
    .prepare(
      `SELECT task, model, input_tokens, output_tokens, cache_read_tokens,
              cache_write_tokens, cost_usd, credits_charged, ok, truncated, workspace
         FROM ai_usage ${where}
        ORDER BY id DESC LIMIT 5000`
    )
    .bind(...binds)
    .all();

  const rows = results || [];
  const summary = summarise(rows);

  // Per-model split, because the whole point of routing tasks is to be able
  // to check afterwards that it did anything.
  const byModel = new Map();
  for (const r of rows) {
    const m = r.model || 'unknown';
    const cur = byModel.get(m) || { model: m, calls: 0, costUsd: 0 };
    cur.calls += 1;
    cur.costUsd += Number(r.cost_usd) || 0;
    byModel.set(m, cur);
  }

  const failures = rows.filter((r) => !r.ok).length;

  return NextResponse.json({
    windowDays: days,
    workspace: scope || 'all',
    ...summary,
    byModel: [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd),
    // Output-token distribution per task, with the sample size attached. This
    // is what an output cap should be set from; anything under n=20, or with
    // any truncation recorded, says "not yet" rather than a number.
    outputs: outputStats(rows),
    failures,
    // Stated rather than assumed: if this is 0 after real use, the
    // cache_control markers are doing nothing and the comments that say
    // otherwise are wrong. Anthropic silently skips caching for prefixes
    // under about 1024 tokens, and this app's system prompts are smaller
    // than that.
    cacheReadTokens: summary.cacheReadTokens,
    usdPerCredit: USD_PER_CREDIT,
    modelPrices: MODEL_PRICES,
  });
}
