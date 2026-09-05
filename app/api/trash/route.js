import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';

export const dynamic = 'force-dynamic';

// Soft-deleted pages and prospects live here for 30 days, then purge. Opening
// the Trash view triggers the purge (lazy — exact timing doesn't matter).
const PURGE_DAYS = 30;

async function purgeOld(db, ws) {
  const cutoff = `-${PURGE_DAYS} days`;
  await db.batch([
    db.prepare(`DELETE FROM pages WHERE workspace = ? AND deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)`).bind(ws, cutoff),
    db.prepare(`DELETE FROM prospects WHERE workspace = ? AND deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)`).bind(ws, cutoff),
  ]);
}

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  await purgeOld(db, ctx.workspace);
  const pages = await db
    .prepare(`SELECT id, title, emoji, deleted_at FROM pages WHERE workspace = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`)
    .bind(ctx.workspace)
    .all();
  const prospects = await db
    .prepare(`SELECT id, name, business_name, email, stage, deleted_at FROM prospects WHERE workspace = ? AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`)
    .bind(ctx.workspace)
    .all();
  return NextResponse.json({
    pages: pages.results || [],
    prospects: prospects.results || [],
    purgeDays: PURGE_DAYS,
  });
}

// Restore an item back out of the trash.
export async function PUT(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const { kind, id } = body || {};
  const table = kind === 'page' ? 'pages' : kind === 'prospect' ? 'prospects' : null;
  if (!table || id == null) return NextResponse.json({ error: 'Provide kind (page|prospect) and id' }, { status: 400 });
  const db = getDb();
  // An id that was already purged (or belongs to another workspace) updates no
  // rows. Reporting ok:true there told the user it was restored when nothing
  // came back, so the miss has to surface as a 404.
  const res = await db
    .prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ? AND workspace = ?`)
    .bind(id, ctx.workspace)
    .run();
  if (!res.meta?.changes) {
    return NextResponse.json({ error: 'That item is no longer in the Trash.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

// Delete an item forever (or empty the whole trash when id is omitted).
export async function DELETE(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const { kind, id } = body || {};
  const db = getDb();
  if (kind == null && id == null) {
    await db.batch([
      db.prepare(`DELETE FROM pages WHERE workspace = ? AND deleted_at IS NOT NULL`).bind(ctx.workspace),
      db.prepare(`DELETE FROM prospects WHERE workspace = ? AND deleted_at IS NOT NULL`).bind(ctx.workspace),
    ]);
    return NextResponse.json({ ok: true, emptied: true });
  }
  const table = kind === 'page' ? 'pages' : kind === 'prospect' ? 'prospects' : null;
  if (!table || id == null) return NextResponse.json({ error: 'Provide kind (page|prospect) and id' }, { status: 400 });
  await db
    .prepare(`DELETE FROM ${table} WHERE id = ? AND workspace = ? AND deleted_at IS NOT NULL`)
    .bind(id, ctx.workspace)
    .run();
  return NextResponse.json({ ok: true });
}
