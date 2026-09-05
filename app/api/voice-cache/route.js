import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';

export const dynamic = 'force-dynamic';

// The narration clips the render service is holding.
//
// A cached clip is reused in every video that needs that line, forever. That is
// the whole saving and also the whole risk: a take that came out wrong is not a
// one-off, it is every video from here on. So the clips can be listened to and
// thrown away. Deleting one IS the re-record — the renderer writes a clip only
// when the file is missing, so the next video that needs that line makes a
// fresh one, and only that line.
//
// Admin only. It spends credits indirectly (every deletion is a line that gets
// paid for again) and it reaches the render secret.

function env() {
  try {
    return { ...process.env, ...(getCloudflareContext().env || {}) };
  } catch {
    return process.env || {};
  }
}

function service() {
  const e = env();
  const url = (e.RENDER_URL || '').replace(/\/+$/, '');
  return { url, secret: e.RENDER_SECRET };
}

async function guard(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return { error: unauthorized() };
  if (ctx.role !== 'admin') {
    return { error: NextResponse.json({ error: 'Only an admin can manage the voice cache.' }, { status: 403 }) };
  }
  const { url, secret } = service();
  if (!url || !secret) {
    return { error: NextResponse.json({ error: 'Video rendering is not configured on this deployment.' }, { status: 500 }) };
  }
  return { ctx, url, secret };
}

// The workspace's own cloned voice, so the list shows the clips that workspace
// actually uses rather than the service default.
async function voiceIdFor(workspace) {
  try {
    const { getDb } = await import('@/lib/db');
    const row = await getDb()
      .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'voice'`)
      .bind(workspace)
      .first();
    const parsed = row?.value ? JSON.parse(row.value) : null;
    return parsed?.voiceId || null;
  } catch {
    return null;
  }
}

export async function GET(req) {
  const g = await guard(req);
  if (g.error) return g.error;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  // ?id=... streams one clip so it can be heard before deciding. Proxied rather
  // than linked, because the service needs a secret the browser must not hold.
  if (id) {
    const res = await fetch(`${g.url}/cache/audio?id=${encodeURIComponent(id)}`, {
      headers: { 'x-render-secret': g.secret },
    });
    if (!res.ok) return NextResponse.json({ error: 'That clip is not cached.' }, { status: 404 });
    return new NextResponse(res.body, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  }

  const voiceId = await voiceIdFor(g.ctx.workspace);
  const res = await fetch(`${g.url}/cache${voiceId ? `?voiceId=${encodeURIComponent(voiceId)}` : ''}`, {
    headers: { 'x-render-secret': g.secret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.error || 'Could not read the voice cache.' }, { status: 502 });
  }
  return NextResponse.json({ entries: data.entries || [] });
}

export async function DELETE(req) {
  const g = await guard(req);
  if (g.error) return g.error;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const res = await fetch(`${g.url}/cache?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'x-render-secret': g.secret },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json({ error: data.error || 'Could not delete that clip.' }, { status: 502 });
  }
  return NextResponse.json({ ok: true, id });
}
