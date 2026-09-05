import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { canMoveUnder } from '@/lib/page-tree.mjs';

// D1 is only available in the edge runtime on Cloudflare Pages.
export const runtime = 'edge';
// Force-dynamic so next-on-pages keeps this a real Function for ALL methods.
export const dynamic = 'force-dynamic';

const COLUMNS = 'id, title, emoji, body, position, parent_id, share_token, created_at';

// Whitelisted patchable fields → SQL value serializers.
const FIELDS = {
  title: (v) => String(v).trim().slice(0, 200),
  emoji: (v) => String(v).slice(0, 8),
  body: (v) => String(v).slice(0, 1800000),
  position: (v) => (Number.isInteger(v) ? v : 0),
};

export async function PUT(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const sets = [];
  const values = [];

  // Re-parenting is validated here, not in the UI. A page moved inside its
  // own descendant detaches that whole branch from the tree, and the client
  // is not the place to enforce that.
  if ('parent_id' in body) {
    const db0 = getDb();
    const { results: all } = await db0
      .prepare('SELECT id, parent_id FROM pages WHERE workspace = ? AND deleted_at IS NULL')
      .bind(ctx.workspace)
      .all();
    const next = String(body.parent_id || '').trim() || null;
    if (next && !(all || []).some((p) => p.id === next)) {
      return NextResponse.json({ error: 'That parent page does not exist here.' }, { status: 400 });
    }
    if (!canMoveUnder(id, next, all || [])) {
      return NextResponse.json(
        { error: 'A page cannot go inside itself, inside one of its own subpages, or more than 5 levels deep.' },
        { status: 400 }
      );
    }
    sets.push('parent_id = ?');
    values.push(next);
  }

  for (const [field, serialize] of Object.entries(FIELDS)) {
    if (body[field] !== undefined) {
      if (field === 'title' && !String(body.title).trim()) {
        return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
      }
      sets.push(`${field} = ?`);
      values.push(serialize(body[field]));
    }
  }
  if (!sets.length) {
    return NextResponse.json({ error: 'No patchable fields in body' }, { status: 400 });
  }
  const db = getDb();
  const result = await db
    .prepare(`UPDATE pages SET ${sets.join(', ')} WHERE id = ? AND workspace = ?`)
    .bind(...values, id, ctx.workspace)
    .run();
  if (!result.meta || result.meta.changes === 0) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }
  const row = await db.prepare(`SELECT ${COLUMNS} FROM pages WHERE id = ? AND workspace = ?`).bind(id, ctx.workspace).first();
  return NextResponse.json({ page: row });
}

export async function DELETE(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  const db = getDb();
  const result = await db.prepare("UPDATE pages SET deleted_at = datetime('now') WHERE id = ? AND workspace = ? AND deleted_at IS NULL").bind(id, ctx.workspace).run();
  if (!result.meta || result.meta.changes === 0) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
