import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { makeShareToken } from '@/lib/page-share.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Turn sharing on or off for one page. Authenticated and workspace-scoped —
// only the owner of a page can publish it.
//
// POST { on: true }  -> mints a token (or returns the existing one)
// POST { on: false } -> revokes; the public link dies on the next request

export async function POST(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const { id } = await params;

  let body;
  try { body = await req.json(); } catch { body = {}; }
  const on = Boolean(body?.on);

  const db = getDb();
  const page = await db
    .prepare(`SELECT id, share_token FROM pages WHERE id = ? AND workspace = ? AND deleted_at IS NULL`)
    .bind(id, ctx.workspace)
    .first();
  if (!page) return NextResponse.json({ error: 'Page not found' }, { status: 404 });

  if (!on) {
    await db
      .prepare(`UPDATE pages SET share_token = NULL, shared_at = NULL WHERE id = ? AND workspace = ?`)
      .bind(id, ctx.workspace)
      .run();
    return NextResponse.json({ shared: false, token: null });
  }

  // Re-sharing keeps the existing token, so a link already sent to a client
  // does not silently break when the toggle is flipped twice.
  const token = page.share_token || makeShareToken();
  await db
    .prepare(`UPDATE pages SET share_token = ?, shared_at = datetime('now') WHERE id = ? AND workspace = ?`)
    .bind(token, id, ctx.workspace)
    .run();

  return NextResponse.json({ shared: true, token });
}
