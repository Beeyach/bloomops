import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized, forbidden } from '@/lib/workspace.mjs';

const LOCKED_CATEGORIES = new Set(['guide-agents', 'guide-sourcing', 'guide-automation']);

// The guides are read-only for user codes; only admin codes may modify them.
async function guardLocked(db, id, ctx) {
  const row = await db
    .prepare('SELECT category FROM library_groups WHERE id = ? AND workspace = ?')
    .bind(id, ctx.workspace)
    .first();
  if (!row) return 'missing';
  if (LOCKED_CATEGORIES.has(row.category) && ctx.role !== 'admin') return 'locked';
  return 'ok';
}

// Force-dynamic: this route reads per-request state from D1 and must never be prerendered.
export const dynamic = 'force-dynamic';

const COLUMNS = 'id, title, note, position, items';

function parseGroup(row) {
  let items;
  try {
    items = JSON.parse(row.items);
  } catch {
    items = [];
  }
  return { ...row, items };
}

// Whitelisted patchable fields → SQL value serializers.
const FIELDS = {
  title: (v) => String(v).trim().slice(0, 200),
  note: (v) => String(v).slice(0, 500),
  position: (v) => (Number.isInteger(v) ? v : 0),
  items: (v) =>
    JSON.stringify(
      Array.isArray(v)
        ? v.slice(0, 100).map((it, i) => ({
            id: String(it?.id || `it-${i}`).slice(0, 40),
            title: String(it?.title || '').slice(0, 300),
            body: String(it?.body || '').slice(0, 20000),
            notes: String(it?.notes || '').slice(0, 5000),
          }))
        : []
    ),
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
  for (const [field, serialize] of Object.entries(FIELDS)) {
    if (body[field] !== undefined) {
      if (field === 'title' && !String(body.title).trim()) {
        return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
      }
      // Items must arrive as an array: coercing junk to [] would silently
      // wipe a group's blocks instead of surfacing the caller's bug.
      if (field === 'items' && !Array.isArray(body.items)) {
        return NextResponse.json({ error: 'items must be an array' }, { status: 400 });
      }
      sets.push(`${field} = ?`);
      values.push(serialize(body[field]));
    }
  }
  if (!sets.length) {
    return NextResponse.json({ error: 'No patchable fields in body' }, { status: 400 });
  }
  const db = getDb();
  const guard = await guardLocked(db, id, ctx);
  if (guard === 'missing') return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  if (guard === 'locked') return forbidden();
  const result = await db
    .prepare(`UPDATE library_groups SET ${sets.join(', ')} WHERE id = ? AND workspace = ?`)
    .bind(...values, id, ctx.workspace)
    .run();
  if (!result.meta || result.meta.changes === 0) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }
  const row = await db.prepare(`SELECT ${COLUMNS} FROM library_groups WHERE id = ? AND workspace = ?`).bind(id, ctx.workspace).first();
  return NextResponse.json({ group: parseGroup(row) });
}

export async function DELETE(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  const db = getDb();
  const guard = await guardLocked(db, id, ctx);
  if (guard === 'missing') return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  if (guard === 'locked') return forbidden();
  const result = await db.prepare('DELETE FROM library_groups WHERE id = ? AND workspace = ?').bind(id, ctx.workspace).run();
  if (!result.meta || result.meta.changes === 0) {
    return NextResponse.json({ error: 'Group not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
