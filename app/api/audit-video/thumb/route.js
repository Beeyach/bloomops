import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Hosts the email thumbnail the browser just drew: a frame of the audit video
// with a play button baked in. The browser cannot talk to the R2 worker's PUT
// directly because that needs the upload secret, and the secret stays server
// side, so this route is the relay. Session-gated by the middleware like
// every other write in the app.

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;
const MAX_BYTES = 2 * 1024 * 1024;
const THUMB_BASE = 'https://file.gobloomwired.com/thumb/';

function env() {
  try {
    return { ...process.env, ...(getRequestContext().env || {}) };
  } catch {
    return process.env || {};
  }
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();

  const slug = String(new URL(req.url).searchParams.get('slug') || '').trim();
  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: 'Bad slug.' }, { status: 400 });
  }

  // The slug has to name a video this workspace owns. Without this check the
  // route took any slug at all: a signed-in user could overwrite the
  // thumbnail on somebody else's prospect video, using the upload secret this
  // route holds on their behalf, and the replacement image would then be
  // sitting in an email that had already been sent.
  const db = getDb();
  const owned = await db
    .prepare(
      `SELECT 1 FROM prospects
        WHERE workspace = ?
          AND (video_url LIKE ? OR video_url LIKE ?)
        LIMIT 1`,
    )
    .bind(ctx.workspace, `%/video/${slug}`, `%/video/${slug}.mp4`)
    .first();
  if (!owned) {
    return NextResponse.json({ error: 'That video is not in this workspace.' }, { status: 404 });
  }

  const secret = env().UPLOAD_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'Thumbnail hosting is not configured.' }, { status: 500 });
  }

  const body = new Uint8Array(await req.arrayBuffer());
  if (body.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Thumbnail too large.' }, { status: 413 });
  }
  // PNG magic bytes. The route writes to a public URL under her brand, so it
  // refuses to host anything that is not the image it was promised.
  const isPng = body.length > 8
    && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47;
  if (!isPng) {
    return NextResponse.json({ error: 'Not a PNG.' }, { status: 400 });
  }

  const res = await fetch(`${THUMB_BASE}${slug}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'image/png' },
    body,
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `Hosting the thumbnail failed (${res.status}).` },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, url: `${THUMB_BASE}${slug}` });
}
