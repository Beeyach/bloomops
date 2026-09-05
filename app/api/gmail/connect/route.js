import { NextResponse } from 'next/server';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { authUrl, GMAIL_SCOPE } from '@/lib/gmail.mjs';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

// Step one of connecting a mailbox: send the person to Google.
//
// The workspace is carried in `state`, signed, so the callback knows which
// workspace consented without trusting a query parameter. Google echoes state
// back verbatim, and an unsigned one would let anybody attach a mailbox they
// control to somebody else's workspace.

function env() {
  try { const { env: e } = getCloudflareContext(); if (e) return e; } catch {}
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

export function redirectUri(e, req) {
  const base = e.APP_URL || new URL(req.url).origin;
  return `${String(base).replace(/\/+$/, '')}/api/gmail/callback`;
}

export async function signState(secret, payload) {
  const body = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(secret || 'dev')),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const mac = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${body}.${mac}`;
}

export async function readState(secret, state) {
  const [body, mac] = String(state || '').split('.');
  if (!body || !mac) return null;
  const expected = await signState(secret, JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))));
  // Constant-time-ish: compare the whole signed string, not just the mac.
  if (expected !== `${body}.${mac}`) return null;
  try { return JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
}

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const e = env();

  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json({
      error: 'Gmail is not set up on this deployment yet.',
      // Names only, never values. Enough to diagnose without leaking anything.
      missing: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'].filter((k) => !e[k]),
      hint: 'Both are Pages secrets, and secrets only reach deployments created after they are set.',
    }, { status: 503 });
  }

  const state = await signState(e.LTB_SESSION_SECRET, {
    ws: ctx.workspace,
    at: Date.now(),
  });

  return NextResponse.json({
    url: authUrl({
      clientId: e.GOOGLE_CLIENT_ID,
      redirectUri: redirectUri(e, req),
      state,
    }),
    scope: GMAIL_SCOPE,
  });
}
