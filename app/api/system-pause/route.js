import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { autonomyPaused, setAutonomyPaused } from '@/lib/spend-breaker.mjs';

export const dynamic = 'force-dynamic';

// The spend breaker's handle. Cloudflare's alerts announce a burn and stop
// nothing; this stops one. Pausing halts every autonomous behavior at the
// next drain, inside five minutes. Nothing is lost while paused and resume
// picks up exactly where things stopped.

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const paused = await autonomyPaused(getDb());
  return NextResponse.json({ paused: Boolean(paused), ...(paused || {}) });
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  let body = {};
  try { body = await req.json(); } catch {}
  const paused = Boolean(body?.paused);
  try {
    await setAutonomyPaused(getDb(), paused, paused ? 'paused by Ary from Settings' : '');
  } catch {
    // The flag table ships by migration. Until it exists the app cannot hold
    // a pause, and saying so beats a button that silently does nothing.
    return NextResponse.json(
      { error: 'The pause switch needs its table. Ask Claude for the one-line migration command.' },
      { status: 503 }
    );
  }
  return NextResponse.json({ ok: true, paused });
}
