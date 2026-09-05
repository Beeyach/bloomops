import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { publicPagesFor } from '@/lib/page-share.mjs';
import { upgradeEmbedsForPublic } from '@/lib/public-embeds.mjs';
import { renderEquationsForPublic } from '@/lib/public-equations.mjs';
import { sanitizePublicHtml } from '@/lib/sanitize-public-html.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// The ONLY unauthenticated read in the app.
//
// It takes a token, finds the single page carrying it, and returns that page
// plus its descendants. Everything else about the workspace stays invisible:
// no sibling pages, no parent, no page list, no workspace name, no settings.
//
// Note the query is scoped to the token-bearing page's workspace and nothing
// wider — the token identifies the workspace, the caller never names it.

export async function GET(req, { params }) {
  const { token } = await params;
  const t = String(token || '').trim();
  // Cheap shape check before touching the database.
  if (!/^[0-9a-f]{32,64}$/.test(t)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = getDb();

  // Which workspace does this token belong to? If none, stop here — the
  // caller learns nothing beyond "no".
  const owner = await db
    .prepare(`SELECT workspace FROM pages WHERE share_token = ? AND deleted_at IS NULL`)
    .bind(t)
    .first();
  if (!owner) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { results } = await db
    .prepare(
      `SELECT id, title, emoji, body, position, parent_id, share_token, deleted_at
       FROM pages WHERE workspace = ? AND deleted_at IS NULL`
    )
    .bind(owner.workspace)
    .all();

  const visible = publicPagesFor(t, results || []);
  if (!visible) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Strip the token from the payload. The reader needs the tree, not the
  // credential that unlocked it.
  //
  // Embeds are upgraded here rather than in the reader: PublicReader renders
  // this body with dangerouslySetInnerHTML, so the server decides what a
  // client is allowed to load. Non-allowlisted embeds are left as the link
  // already sitting in the body.
  //
  // Order matters. The body is sanitised FIRST, because that is the part an
  // author wrote and the only part that could carry a script; a script here
  // would run on this app's own origin, and any logged-in reader who opened
  // the link would be making authenticated calls on its behalf. Embeds and
  // equations run after, adding markup the server itself decided on rather
  // than markup that arrived from a page body.
  const selfHost = new URL(req.url).hostname;
  const clean = visible.pages.map(({ share_token, deleted_at, ...p }) => ({
    ...p,
    body: renderEquationsForPublic(
      upgradeEmbedsForPublic(sanitizePublicHtml(p.body), selfHost)
    ),
  }));

  return NextResponse.json(
    { root: visible.root.id, pages: clean },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
