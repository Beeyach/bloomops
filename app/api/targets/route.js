import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';

export const dynamic = 'force-dynamic';

// Funnel targets, adopted from Ellen's spreadsheet. Only the INPUTS are
// stored; the Stats view derives proposals/calls/leads needed from the rates
// (the same formulas her Targets sheet used).
const DEFAULT_TARGETS = {
  clientsGoal: 0,          // clients wanted this cycle (0 = targets off)
  proposalCloseRate: 0.2,  // proposals → clients
  callToProposalRate: 0.5, // calls → proposals
  leadToCallRate: 0.02,    // leads contacted → calls (cold)
  dailyTarget: 0,          // touches per day across channels
  channelSplit: { pe: 0, li: 0, ig: 0, ce: 0 }, // daily touches per channel
};

const RATE_FIELDS = ['proposalCloseRate', 'callToProposalRate', 'leadToCallRate'];

function sanitize(t) {
  const out = { ...DEFAULT_TARGETS, ...(t && typeof t === 'object' ? t : {}) };
  const int = (v, max) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), max) : 0;
  };
  out.clientsGoal = int(out.clientsGoal, 10000);
  out.dailyTarget = int(out.dailyTarget, 100000);
  for (const f of RATE_FIELDS) {
    const n = Number(out[f]);
    out[f] = Number.isFinite(n) && n > 0 && n <= 1 ? n : DEFAULT_TARGETS[f];
  }
  const split = out.channelSplit && typeof out.channelSplit === 'object' ? out.channelSplit : {};
  out.channelSplit = {
    pe: int(split.pe, 100000),
    li: int(split.li, 100000),
    ig: int(split.ig, 100000),
    ce: int(split.ce, 100000),
  };
  return out;
}

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const row = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'targets'`)
    .bind(ctx.workspace)
    .first();
  let stored = {};
  if (row && row.value) {
    try { stored = JSON.parse(row.value); } catch { stored = {}; }
  }
  return NextResponse.json({ targets: sanitize(stored) });
}

export async function PUT(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const targets = sanitize(body?.targets);
  const db = getDb();
  await db
    .prepare(
      `INSERT INTO settings (workspace, key, value, updated_at) VALUES (?, 'targets', ?, datetime('now'))
       ON CONFLICT(workspace, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind(ctx.workspace, JSON.stringify(targets))
    .run();
  return NextResponse.json({ targets });
}
