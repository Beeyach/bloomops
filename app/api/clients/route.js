import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { DEFAULT_ONBOARDING } from '@/lib/onboarding.mjs';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { normalizeStage, parseFiles } from '@/lib/client-profile.mjs';

// D1 is only available in the edge runtime on Cloudflare Pages.
export const runtime = 'edge';
// Force-dynamic so next-on-pages keeps this a real Function for ALL methods.
export const dynamic = 'force-dynamic';

const COLUMNS =
  'id, prospect_id, name, handle, platforms, monthly_rate, start_date, notes, onboarding, body, stage, files, created_at';

function parseClient(row) {
  const parse = (v, fallback) => {
    try { return JSON.parse(v); } catch { return fallback; }
  };
  return {
    ...row,
    platforms: parse(row.platforms, []),
    onboarding: parse(row.onboarding, []),
    files: parseFiles(row.files),
    stage: normalizeStage(row.stage),
  };
}

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM clients WHERE workspace = ? ORDER BY created_at DESC`)
    .bind(ctx.workspace)
    .all();
  return NextResponse.json({ clients: (results || []).map(parseClient) });
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const name = String(body?.name || '').trim().slice(0, 200);
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const prospectId = Number.isInteger(body?.prospect_id) ? body.prospect_id : null;
  const db = getDb();
  // One card per prospect: the app auto-creates a card when a prospect's
  // stage hits Client, and that write may race a hand-click on "Start
  // onboarding". Whoever loses the race gets the existing card back
  // instead of minting a duplicate.
  if (prospectId != null) {
    const existing = await db
      .prepare(`SELECT ${COLUMNS} FROM clients WHERE workspace = ? AND prospect_id = ?`)
      .bind(ctx.workspace, prospectId)
      .first();
    if (existing) {
      return NextResponse.json({ client: parseClient(existing), existed: true });
    }
  }
  const handle = String(body?.handle || '').slice(0, 300);
  const platforms = Array.isArray(body?.platforms)
    ? body.platforms.map((p) => String(p).slice(0, 40)).slice(0, 10)
    : [];
  const startDate = String(body?.start_date || '').slice(0, 10);
  const onboarding = DEFAULT_ONBOARDING.map((label, i) => ({
    id: `ob-${i + 1}`,
    label,
    done: false,
    doneDate: null,
  }));
  const createdAt = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO clients (id, prospect_id, name, handle, platforms, monthly_rate, start_date, notes, onboarding, workspace, created_at)
       VALUES (?, ?, ?, ?, ?, '', ?, '', ?, ?, ?)`
    )
    .bind(id, prospectId, name, handle, JSON.stringify(platforms), startDate, JSON.stringify(onboarding), ctx.workspace, createdAt)
    .run();

  // Keep the prospect row in step.
  //
  // Without this the two records drift, and one already had: Good Energy
  // Coach became a client on 2026-07-17 while her prospect row went on
  // saying Interested, so every prospecting surface that asked the prospect
  // row got the wrong answer and put a client in the cold queue.
  //
  // Today no longer depends on this being right — it reads the clients table
  // directly — but leaving the two disagreeing is how the next surface
  // inherits the same bug. Failure is swallowed on purpose: the client was
  // created, and that must not be undone because a denormalised field could
  // not be updated.
  if (prospectId) {
    await db
      .prepare(
        `UPDATE prospects
            SET stage = 'Client',
                first_client_at = COALESCE(first_client_at, ?)
          WHERE id = ? AND workspace = ?`
      )
      .bind(startDate || createdAt, prospectId, ctx.workspace)
      .run()
      .catch(() => null);
  }

  const row = await db.prepare(`SELECT ${COLUMNS} FROM clients WHERE id = ?`).bind(id).first();
  return NextResponse.json({ client: parseClient(row) }, { status: 201 });
}
