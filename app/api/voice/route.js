import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { getRequestContext } from '@cloudflare/next-on-pages';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// The narrating voice for a workspace's audit videos. Each person's videos
// should sound like them, so their voice is cloned once from a sample and its
// id stored here. The render service holds the ElevenLabs key and does the
// actual cloning; this route only forwards the sample and remembers the result.
//
// Admin only for now, and checked on the server. Handing a client the recorder
// is a plan decision that waits on the tier system, so it is gated here rather
// than merely hidden in the UI.

function env() {
  try { return getRequestContext().env || {}; } catch {}
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

async function loadVoice(db, workspace) {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'voice'`)
    .bind(workspace)
    .first();
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

// GET — the workspace's current voice, or null.
export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  return NextResponse.json({ voice: await loadVoice(db, ctx.workspace) });
}

// POST multipart { file, name } — clone the sample and store the voice.
export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can set up a voice right now.' }, { status: 403 });
  }

  const e = env();
  const service = String(e.RENDER_URL || '').replace(/\/+$/, '');
  const secret = e.RENDER_SECRET;
  if (!service || !secret) {
    return NextResponse.json({ error: 'Voice setup is not configured on this deployment.' }, { status: 500 });
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected an audio file.' }, { status: 400 });
  }
  const file = form.get('file');
  const name = String(form.get('name') || '').trim() || `${ctx.workspace} voice`;
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No audio file was uploaded.' }, { status: 400 });
  }

  // Forward the sample to the render service, which does the ElevenLabs call.
  const out = new FormData();
  out.append('file', file, file.name || 'sample.webm');
  out.append('name', name.slice(0, 60));

  let data;
  try {
    const res = await fetch(`${service}/clone`, {
      method: 'POST',
      headers: { 'x-render-secret': secret },
      body: out,
    });
    data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: data.error || `Clone failed (HTTP ${res.status}).` }, { status: 424 });
    }
  } catch (err) {
    return NextResponse.json({ error: `Could not reach the voice service: ${err.message}` }, { status: 424 });
  }
  if (!data?.voiceId) {
    return NextResponse.json({ error: 'The voice service did not return a voice id.' }, { status: 424 });
  }

  const voice = { voiceId: data.voiceId, name: data.name || name, createdAt: new Date().toISOString() };
  const db = getDb();
  await db
    .prepare(
      `INSERT INTO settings (workspace, key, value, updated_at) VALUES (?, 'voice', ?, datetime('now'))
       ON CONFLICT(workspace, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind(ctx.workspace, JSON.stringify(voice))
    .run();

  return NextResponse.json({ voice });
}

// DELETE — forget the workspace's voice, so videos fall back to the default.
export async function DELETE(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can change the voice.' }, { status: 403 });
  }
  const db = getDb();
  await db.prepare(`DELETE FROM settings WHERE workspace = ? AND key = 'voice'`).bind(ctx.workspace).run();
  return NextResponse.json({ ok: true });
}
