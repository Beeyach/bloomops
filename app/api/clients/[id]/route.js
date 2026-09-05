import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { normalizeStage, normalizeFiles, parseFiles } from '@/lib/client-profile.mjs';

// Force-dynamic: this route reads per-request state from D1 and must never be prerendered.
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

// Whitelisted patchable fields → SQL value serializers.
const FIELDS = {
  name: (v) => String(v).trim().slice(0, 200),
  handle: (v) => String(v).slice(0, 300),
  monthly_rate: (v) => String(v).slice(0, 100),
  start_date: (v) => String(v).slice(0, 10),
  notes: (v) => String(v).slice(0, 5000),
  // Same rich-editor HTML as a workspace page, so a client profile can hold
  // tables, checklists and pasted screenshots instead of one flat textarea.
  body: (v) => String(v || '').slice(0, 200000),
  stage: (v) => normalizeStage(v),
  files: (v) => JSON.stringify(normalizeFiles(v)),
  platforms: (v) => JSON.stringify(Array.isArray(v) ? v.map((p) => String(p).slice(0, 40)).slice(0, 10) : []),
  onboarding: (v) =>
    JSON.stringify(
      Array.isArray(v)
        ? v.slice(0, 100).map((s, i) => ({
            id: String(s?.id || `ob-${i + 1}`).slice(0, 40),
            label: String(s?.label || '').slice(0, 300),
            done: !!s?.done,
            doneDate: s?.doneDate ? String(s.doneDate).slice(0, 30) : null,
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
      if (field === 'name' && !String(body.name).trim()) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      }
      // Array fields must arrive as arrays: coercing junk to [] would
      // silently wipe a checklist instead of surfacing the caller's bug.
      if ((field === 'onboarding' || field === 'platforms') && !Array.isArray(body[field])) {
        return NextResponse.json({ error: `${field} must be an array` }, { status: 400 });
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
    .prepare(`UPDATE clients SET ${sets.join(', ')} WHERE id = ? AND workspace = ?`)
    .bind(...values, id, ctx.workspace)
    .run();
  if (!result.meta || result.meta.changes === 0) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }
  const row = await db.prepare(`SELECT ${COLUMNS} FROM clients WHERE id = ? AND workspace = ?`).bind(id, ctx.workspace).first();
  return NextResponse.json({ client: parseClient(row) });
}

export async function DELETE(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  const db = getDb();
  const result = await db.prepare('DELETE FROM clients WHERE id = ? AND workspace = ?').bind(id, ctx.workspace).run();
  if (!result.meta || result.meta.changes === 0) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
