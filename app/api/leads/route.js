import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { LEAD_PLATFORMS, LEAD_STATUSES, LEAD_VERDICTS } from '@/lib/engine-prompts.mjs';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { LEAD_COLUMNS } from '@/lib/columns.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SELECT_COLS = LEAD_COLUMNS;

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

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.getAll('status').filter((s) => LEAD_STATUSES.includes(s));
  const verdictFilter = searchParams.getAll('verdict').filter((v) => LEAD_VERDICTS.includes(v));
  const platformFilter = searchParams.getAll('platform').filter((p) => LEAD_PLATFORMS.includes(p));

  const where = ['workspace = ?'];
  const values = [ctx.workspace];
  if (statusFilter.length > 0) {
    where.push(`status IN (${statusFilter.map(() => '?').join(',')})`);
    statusFilter.forEach((s) => values.push(s));
  }
  if (verdictFilter.length > 0) {
    where.push(`verdict IN (${verdictFilter.map(() => '?').join(',')})`);
    verdictFilter.forEach((v) => values.push(v));
  }
  if (platformFilter.length > 0) {
    where.push(`platform IN (${platformFilter.map(() => '?').join(',')})`);
    platformFilter.forEach((p) => values.push(p));
  }

  // Bounded like the prospects list: 500 covers today's inbox many times
  // over, and ?offset pages through the rest before the table ever grows
  // into an unbounded read.
  const limit = 500;
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);
  const sql = `SELECT ${SELECT_COLS} FROM leads${
    where.length ? ` WHERE ${where.join(' AND ')}` : ''
  } ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
  const { results } = await db.prepare(sql).bind(...values, limit, offset).all();
  return NextResponse.json({ leads: results || [] });
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

  const platform = LEAD_PLATFORMS.includes(body.platform) ? body.platform : 'Other';
  const post_url = String(body.post_url || '').trim().slice(0, 2000);
  const post_text = String(body.post_text || '').trim();
  const author_name = String(body.author_name || '').trim().slice(0, 200);
  const author_handle = String(body.author_handle || '').trim().slice(0, 500);
  const notes = String(body.notes || '').trim().slice(0, 5000);

  if (!post_text && !post_url) {
    return NextResponse.json({ error: 'Provide the post text or a post link' }, { status: 400 });
  }
  if (post_text.length > MAX_POST_TEXT) {
    return NextResponse.json({ error: `post_text too long (max ${MAX_POST_TEXT} chars)` }, { status: 400 });
  }
  if (!isSafeUrl(post_url)) {
    return NextResponse.json({ error: 'post_url must be an http(s) link' }, { status: 400 });
  }

  const db = getDb();
  const res = await db
    .prepare(
      `INSERT INTO leads (platform, post_url, post_text, author_name, author_handle, notes, workspace)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(platform, post_url || null, post_text || null, author_name || null, author_handle || null, notes || null, ctx.workspace)
    .run();

  const lead = await db
    .prepare(`SELECT ${SELECT_COLS} FROM leads WHERE id = ?`)
    .bind(res.meta.last_row_id)
    .first();
  return NextResponse.json({ lead }, { status: 201 });
}
