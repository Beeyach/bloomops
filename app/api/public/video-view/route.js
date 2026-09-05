import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// The watch page's beacon. The second unauthenticated write surface in the
// app, and it is kept almost inert on purpose: it can append one thing to one
// prospect's activity log and nothing else. No reads come back out, a slug
// that matches nobody says only "no", and the whole body is two fields with
// tight shapes.
//
// Sent as text/plain (sendBeacon avoids a CORS preflight that way), so the
// body is parsed by hand rather than trusting a content type.

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;
const MILESTONES = new Set([1, 25, 50, 75, 95]);

// Mirrors VIDEO_URL_PREFIX in lib/bloom-api.mjs. Imported would be nicer, but
// that module builds the whole window.bloom surface and this endpoint should
// not pull it into the edge bundle for one string.
const VIDEO_URL_PREFIX = 'https://file.gobloomwired.com/video/';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req) {
  let slug = '';
  let pct = 0;
  try {
    const body = JSON.parse(await req.text());
    slug = String(body.slug || '').trim();
    pct = Number(body.pct);
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: CORS });
  }
  if (!SLUG_RE.test(slug) || !MILESTONES.has(pct)) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400, headers: CORS });
  }

  const db = getDb();
  // The stored link is either the bare slug or slug.mp4, depending on when it
  // was written. Exact candidates rather than LIKE, so "kym" can never match
  // "kym2".
  const found = await db
    .prepare(
      `SELECT id, activity_log FROM prospects
        WHERE video_url = ? OR video_url = ?
        ORDER BY id ASC LIMIT 2`
    )
    .bind(`${VIDEO_URL_PREFIX}${slug}`, `${VIDEO_URL_PREFIX}${slug}.mp4`)
    .all();
  const rows = found?.results || [];
  // Two rows means two prospects hold the same video link, and there is no
  // way to tell which of them is watching. It used to take whichever the
  // database happened to return first, possibly in another workspace. A
  // missing view is recoverable; "they watched it" on the wrong person is
  // the one thing in the tracker that has to be true.
  if (rows.length !== 1) return new Response(null, { status: 204, headers: CORS });
  const row = rows[0];

  // One VIEW entry per prospect per day, holding the furthest point reached.
  // The milestones arrive one at a time as the video plays, and five log
  // lines about one sitting would drown the timeline the log exists to keep
  // readable.
  let log = [];
  try {
    const parsed = JSON.parse(row.activity_log || '[]');
    if (Array.isArray(parsed)) log = parsed;
  } catch {
    log = [];
  }
  const ts = new Date().toISOString();
  const today = ts.slice(0, 10);
  const text = pct >= 95 ? 'Watched the video to the end' : pct === 1 ? 'Opened the video' : `Watched ${pct}% of the video`;
  const idx = log.findIndex((e) => e && e.tag === 'VIDEOVIEW' && String(e.ts || '').slice(0, 10) === today);
  if (idx >= 0) {
    const prev = Number((String(log[idx].text || '').match(/(\d+)%/) || [])[1] || (String(log[idx].text).includes('end') ? 95 : 1));
    if (pct <= prev) return new Response(null, { status: 204, headers: CORS });
    log[idx] = { ...log[idx], ts, text };
  } else {
    log.push({ ts, tag: 'VIDEOVIEW', text });
  }

  await db
    .prepare(`UPDATE prospects SET activity_log = ? WHERE id = ?`)
    .bind(JSON.stringify(log), row.id)
    .run();

  return new Response(null, { status: 204, headers: CORS });
}
