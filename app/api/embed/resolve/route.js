import { NextResponse } from 'next/server';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { isFacebookShare, canonicalFacebookPost } from '@/lib/embeds.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Turns a facebook.com/share/p/<code> link into the canonical permalink.
//
// Facebook's Share button only hands out the short form, and the post plugin
// cannot resolve it — a perfectly public post embeds as "no longer available".
// The short link is opaque, so the only way to expand it is to follow it.
//
// This is the one place in the app that fetches a URL a user supplied, so the
// guard is deliberately narrow: the input must match the Facebook share shape
// exactly before any request goes out, and the response is never returned to
// the caller — only a canonical facebook.com URL parsed out of it. That is
// what keeps it from being a general-purpose proxy for probing private
// addresses. It is also behind the session check, like every other route.

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();

  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const url = String(body?.url || '').trim();

  if (!isFacebookShare(url)) {
    return NextResponse.json({ error: 'Only Facebook share links can be resolved.' }, { status: 400 });
  }

  let html;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        // Without a browser-ish UA Facebook serves a consent interstitial that
        // carries no canonical link.
        'User-Agent': 'Mozilla/5.0 (compatible; Bloomtrack/1.0; +https://bloomwired.io)',
        'Accept-Language': 'en',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch {
    return NextResponse.json({ error: 'Could not reach that link.' }, { status: 502 });
  }

  // og:url first: Facebook sets it on the post itself, while canonical is
  // occasionally the page rather than the post.
  const og = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
  const canon = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const found = (og && og[1]) || (canon && canon[1]);
  if (!found) {
    return NextResponse.json({ error: 'That link did not resolve to a post.' }, { status: 404 });
  }

  const resolved = canonicalFacebookPost(found.replace(/&amp;/g, '&'));
  if (!resolved) {
    return NextResponse.json({ error: 'That link did not resolve to a post.' }, { status: 404 });
  }

  return NextResponse.json({ url: resolved });
}
