import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';

export const dynamic = 'force-dynamic';

// The two facts the journey classifier cannot read off a prospect row:
// who has a client card (the clients table is the authority - the stage
// string drifts), and which prospects have a live outreach package (what
// the Ready tab shows, and what the Following-up rows print as the next
// step and its angle).
//
// One GET, two small-table queries, no prospect scan: clients is tens of
// rows and the live-package subset likewise. The lib/prospect-facts.mjs
// rule applies to anything added here: drive from the small table, probe
// by primary key, never join across the world.
const LIVE_STATUSES = ['PREPARING', 'READY_FOR_APPROVAL', 'NEEDS_DECISION', 'APPROVED'];

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();

  const { results: clients } = await db
    .prepare(`SELECT prospect_id FROM clients WHERE workspace = ? AND prospect_id IS NOT NULL`)
    .bind(ctx.workspace)
    .all()
    .catch(() => ({ results: [] }));

  const marks = LIVE_STATUSES.map(() => '?').join(',');
  const { results: packages } = await db
    .prepare(
      `SELECT prospect_id, status, playbook, generator_version
         FROM outreach_packages
        WHERE workspace = ? AND status IN (${marks}) AND prospect_id IS NOT NULL`
    )
    .bind(ctx.workspace, ...LIVE_STATUSES)
    .all()
    .catch(() => ({ results: [] }));

  return NextResponse.json(
    {
      clientIds: (clients || []).map((r) => r.prospect_id),
      livePackages: (packages || []).map((r) => ({
        prospectId: r.prospect_id,
        status: r.status,
        playbook: r.playbook || null,
        generator: r.generator_version || null,
      })),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
