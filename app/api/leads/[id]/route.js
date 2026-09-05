import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { LEAD_PLATFORMS, LEAD_STATUSES, LEAD_VERDICTS } from '@/lib/engine-prompts.mjs';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { LEAD_COLUMNS } from '@/lib/columns.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SELECT_COLS =
  LEAD_COLUMNS;

const MAX_POST_TEXT = 10000;

// post_url is rendered as a link in the UI — only allow http(s) to block
// javascript:/data: URLs on these unauthenticated endpoints.
function isSafeUrl(u) {
  if (!u) return true; // empty is fine
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

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

  if ('platform' in body) {
    if (!LEAD_PLATFORMS.includes(body.platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }
    sets.push('platform = ?');
    values.push(body.platform);
  }
  if ('post_url' in body) {
    const post_url = String(body.post_url || '').trim().slice(0, 2000);
    if (!isSafeUrl(post_url)) {
      return NextResponse.json({ error: 'post_url must be an http(s) link' }, { status: 400 });
    }
    sets.push('post_url = ?');
    values.push(post_url || null);
  }
  if ('post_text' in body) {
    const t = String(body.post_text || '').trim();
    if (t.length > MAX_POST_TEXT) {
      return NextResponse.json({ error: `post_text too long (max ${MAX_POST_TEXT} chars)` }, { status: 400 });
    }
    sets.push('post_text = ?');
    values.push(t || null);
  }
  if ('author_name' in body) {
    sets.push('author_name = ?');
    values.push(String(body.author_name || '').trim().slice(0, 200) || null);
  }
  if ('author_handle' in body) {
    sets.push('author_handle = ?');
    values.push(String(body.author_handle || '').trim().slice(0, 500) || null);
  }
  if ('verdict' in body) {
    if (body.verdict !== null && !LEAD_VERDICTS.includes(body.verdict)) {
      return NextResponse.json({ error: 'Invalid verdict' }, { status: 400 });
    }
    sets.push('verdict = ?');
    values.push(body.verdict);
  }
  // A verdict set through this route came from a person clicking a button, so
  // it is stamped as theirs and carries full confidence — you checked it
  // yourself, so it never wears the "unverified guess" badge. Guard Bee
  // refuses to re-score it afterwards.
  if ('verdict' in body) {
    const src = body.verdict_source === 'ai' ? 'ai' : 'you';
    sets.push('verdict_source = ?');
    values.push(body.verdict === null ? null : src);
    sets.push('confidence = ?');
    values.push(body.verdict === null ? null : 'high');
  }
  if ('your_note' in body) {
    sets.push('your_note = ?');
    values.push(String(body.your_note || '').trim().slice(0, 2000) || null);
  }
  if ('verdict_reasons' in body) {
    const reasons = Array.isArray(body.verdict_reasons)
      ? body.verdict_reasons.map((r) => String(r)).slice(0, 10)
      : [];
    sets.push('verdict_reasons = ?');
    values.push(JSON.stringify(reasons));
  }
  if ('notes' in body) {
    sets.push('notes = ?');
    values.push(String(body.notes || '').trim().slice(0, 5000) || null);
  }
  if ('status' in body) {
    if (!LEAD_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    sets.push('status = ?');
    values.push(body.status);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const db = getDb();
  sets.push(`updated_at = datetime('now')`);
  values.push(id, ctx.workspace);
  await db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ? AND workspace = ?`).bind(...values).run();

  const lead = await db.prepare(`SELECT ${SELECT_COLS} FROM leads WHERE id = ? AND workspace = ?`).bind(id, ctx.workspace).first();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  return NextResponse.json({ lead });
}

export async function DELETE(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  const db = getDb();
  await db.prepare(`DELETE FROM leads WHERE id = ? AND workspace = ?`).bind(id, ctx.workspace).run();
  return NextResponse.json({ ok: true });
}
