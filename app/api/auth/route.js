import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { resolveCode, signSession, verifySession, sessionCookie, clearCookie, SESSION_COOKIE, loadCodes } from '@/lib/session.mjs';
import { getDb } from '@/lib/db';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

function env() {
  try { return getRequestContext().env || {}; } catch { return {}; }
}

// An access code is the entire account: no username to also get right, no
// second factor. So the number of guesses allowed is the only thing standing
// between a script and the workspace, and it was unlimited.
const MAX_ATTEMPTS = 10;
const WINDOW_MINUTES = 15;

function clientIp(req) {
  return (
    req.headers.get('CF-Connecting-IP') ||
    req.headers.get('X-Forwarded-For')?.split(',')[0].trim() ||
    'unknown'
  );
}

// Reads the current strike count, resetting it if the window has passed.
// Every failure here is swallowed: a rate limiter that cannot read its own
// table must not become the reason nobody can log in. It fails open on its
// own errors, never on the code check itself.
async function attemptState(db, ip) {
  try {
    const row = await db.prepare('SELECT count, window_start FROM login_attempts WHERE ip = ?').bind(ip).first();
    if (!row) return { count: 0, fresh: true };
    const started = Date.parse(row.window_start);
    if (!Number.isFinite(started) || Date.now() - started > WINDOW_MINUTES * 60 * 1000) {
      return { count: 0, fresh: true };
    }
    return { count: Number(row.count) || 0, fresh: false };
  } catch {
    return { count: 0, fresh: true, broken: true };
  }
}

async function recordFailure(db, ip, state) {
  if (state.broken) return;
  try {
    if (state.fresh) {
      await db
        .prepare('INSERT INTO login_attempts (ip, count, window_start) VALUES (?, 1, ?) ON CONFLICT(ip) DO UPDATE SET count = 1, window_start = excluded.window_start')
        .bind(ip, new Date().toISOString())
        .run();
    } else {
      await db.prepare('UPDATE login_attempts SET count = count + 1 WHERE ip = ?').bind(ip).run();
    }
  } catch {}
}

async function clearAttempts(db, ip) {
  try {
    await db.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();
  } catch {}
}

// POST { code } -> validate against the access-code secret, set a signed
// session cookie. Never reveals whether a code was close; just yes/no.
export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { body = {}; }
  const e = env();

  // A deployment with no codes configured rejects every code, including the
  // right one, and used to say "that code did not work" — indistinguishable
  // from a typo. That is how a preview build with production-only environment
  // variables reads as a forgotten password. Saying so costs nothing: it
  // reveals no code, and "this deployment is misconfigured" is not a secret
  // worth keeping from the person locked out of it.
  if (Object.keys(loadCodes(e)).length === 0) {
    return NextResponse.json(
      { error: 'This deployment has no access codes configured yet. Its LTB_ACCESS_CODES variable is missing.' },
      { status: 503 }
    );
  }

  const db = getDb();
  const ip = clientIp(req);
  const state = await attemptState(db, ip);
  if (state.count >= MAX_ATTEMPTS) {
    return NextResponse.json(
      { error: `Too many attempts. Wait ${WINDOW_MINUTES} minutes and try again.` },
      { status: 429, headers: { 'Retry-After': String(WINDOW_MINUTES * 60) } }
    );
  }

  const resolved = resolveCode(e, body.code);
  if (!resolved) {
    await recordFailure(db, ip, state);
    const left = MAX_ATTEMPTS - state.count - 1;
    return NextResponse.json(
      {
        error: 'That code did not work. Check it and try again.',
        // Counting down is not a hint about the code, and someone mistyping
        // their own deserves to know a lockout is coming.
        ...(left <= 3 && left > 0 ? { attemptsLeft: left } : {}),
      },
      { status: 401 }
    );
  }
  await clearAttempts(db, ip);
  let token;
  try {
    token = await signSession(e, resolved);
  } catch {
    // Same honesty as the missing-codes case above: a deploy without its
    // session secret says so instead of a bare 500.
    return NextResponse.json(
      { error: 'This deployment has no session secret configured. Its LTB_SESSION_SECRET variable is missing.' },
      { status: 503 }
    );
  }
  const res = NextResponse.json({ ok: true, role: resolved.role });
  res.headers.set('Set-Cookie', sessionCookie(token));
  return res;
}

// GET -> report the current session (used by the client to know role).
export async function GET(req) {
  const e = env();
  const cookie = req.cookies.get(SESSION_COOKIE);
  const session = cookie ? await verifySession(e, cookie.value) : null;
  if (!session) return NextResponse.json({ authenticated: false }, { status: 200 });
  return NextResponse.json({ authenticated: true, role: session.role, workspace: session.workspace });
}

// DELETE -> log out.
export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', clearCookie());
  return res;
}
