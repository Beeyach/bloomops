import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { WELCOME_PAGE, SAMPLE_PAGES } from '@/lib/pages-seed.mjs';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';

// Force-dynamic: this route reads per-request state from D1 and must never be prerendered.
export const dynamic = 'force-dynamic';

const COLUMNS = 'id, title, emoji, body, position, parent_id, share_token, created_at';

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  // First run for this workspace: seed the tour page plus the sample
  // reference pages (all deletable) so a new account isn't a blank slate.
  const count = await db.prepare('SELECT COUNT(*) AS n FROM pages WHERE workspace = ?').bind(ctx.workspace).first();
  if (!count || count.n === 0) {
    const seedPages = [WELCOME_PAGE, ...SAMPLE_PAGES];
    const now = new Date().toISOString();
    const stmt = db.prepare(
      'INSERT INTO pages (id, title, emoji, body, position, workspace, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    await db.batch(
      seedPages.map((p, i) =>
        stmt.bind(crypto.randomUUID(), p.title, p.emoji, p.body, i, ctx.workspace, now)
      )
    );
  }
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM pages WHERE workspace = ? AND deleted_at IS NULL ORDER BY position ASC, created_at ASC`)
    .bind(ctx.workspace)
    .all();
  return NextResponse.json({ pages: results || [] });
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
  const title = String(body?.title || '').trim().slice(0, 200);
  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  const emoji = String(body?.emoji || '📄').slice(0, 8);
  const db = getDb();
  // A new subpage names its parent. Verified against this workspace so a
  // page can never be filed under someone else's.
  let parentId = String(body?.parent_id || '').trim() || null;
  if (parentId) {
    const owner = await db
      .prepare('SELECT id FROM pages WHERE id = ? AND workspace = ? AND deleted_at IS NULL')
      .bind(parentId, ctx.workspace)
      .first();
    if (!owner) parentId = null;
  }
  const posRow = await db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS next FROM pages WHERE workspace = ?')
    .bind(ctx.workspace)
    .first();
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO pages (id, title, emoji, body, position, parent_id, workspace, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, title, emoji, '', posRow?.next ?? 0, parentId, ctx.workspace, new Date().toISOString())
    .run();
  const row = await db.prepare(`SELECT ${COLUMNS} FROM pages WHERE id = ?`).bind(id).first();
  return NextResponse.json({ page: row }, { status: 201 });
}
