import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const COLS =
  'id, date, pe_sent, li_sent, ig_sent, ce_sent, pe_replies, li_replies, ig_replies, ce_replies, misc_replies, notes';
const COUNT_FIELDS = [
  'pe_sent', 'li_sent', 'ig_sent', 'ce_sent',
  'pe_replies', 'li_replies', 'ig_replies', 'ce_replies', 'misc_replies',
];

// GET ?days=N — newest first, default the last 45 days of entries.
export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const days = Math.min(366, Math.max(1, Number(searchParams.get('days')) || 45));
  const { results } = await db
    .prepare(
      `SELECT ${COLS} FROM daily_log
       WHERE workspace = ? AND date >= date('now', ?)
       ORDER BY date DESC`
    )
    .bind(ctx.workspace, `-${days} days`)
    .all();
  return NextResponse.json({ entries: results || [] });
}

// PUT { date, pe_sent?, ... , notes? } — upsert the row for that day.
export async function PUT(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const body = await req.json().catch(() => null);
  const date = String(body?.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  const sets = [];
  const values = [];
  for (const f of COUNT_FIELDS) {
    if (f in (body || {})) {
      const n = Number(body[f]);
      if (!Number.isFinite(n) || n < 0 || n > 100000) {
        return NextResponse.json({ error: `${f} must be a non-negative number` }, { status: 400 });
      }
      sets.push(f);
      values.push(Math.round(n));
    }
  }
  const hasNotes = 'notes' in (body || {});
  if (hasNotes) {
    sets.push('notes');
    values.push(body.notes === '' ? null : String(body.notes));
  }
  if (sets.length === 0) {
    return NextResponse.json({ error: 'No fields' }, { status: 400 });
  }

  // Upsert on (workspace, date): insert the provided fields, or update just
  // those fields when the day already has a row.
  const insertCols = ['workspace', 'date', ...sets];
  const placeholders = insertCols.map(() => '?').join(', ');
  const updates = sets.map((f) => `${f} = excluded.${f}`).join(', ');
  await db
    .prepare(
      `INSERT INTO daily_log (${insertCols.join(', ')}) VALUES (${placeholders})
       ON CONFLICT(workspace, date) DO UPDATE SET ${updates}, updated_at = datetime('now')`
    )
    .bind(ctx.workspace, date, ...values)
    .run();

  const row = await db
    .prepare(`SELECT ${COLS} FROM daily_log WHERE workspace = ? AND date = ?`)
    .bind(ctx.workspace, date)
    .first();
  return NextResponse.json({ entry: row });
}

// DELETE { date } — remove one day's row.
export async function DELETE(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const body = await req.json().catch(() => null);
  const date = String(body?.date || '').trim();
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });
  const info = await db
    .prepare('DELETE FROM daily_log WHERE workspace = ? AND date = ?')
    .bind(ctx.workspace, date)
    .run();
  if ((info?.meta?.changes ?? 0) === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
