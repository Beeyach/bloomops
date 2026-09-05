import { NextResponse } from 'next/server';
import { getRequestContext } from '@cloudflare/next-on-pages';
import { verifySession, SESSION_COOKIE } from '@/lib/session.mjs';

// Gate the whole app behind an access code. Anything without a valid signed
// session cookie is bounced: pages redirect to /gate, API calls get 401.
// The gate itself, the auth API, and static assets are exempt (see matcher).

// The matcher now also covers /gate and /api/auth. Their AUTH behaviour is
// unchanged (both are still exempt from the session check below) — they are
// matched only so the no-cache header below reaches them. The gate's HTML
// was the exact document browsers were caching stale, then requesting the
// previous build's chunk hashes and getting 404s.
// `fonts/` is exempt for the same reason `_next/` is: it is a static asset, not
// a page. Without it the session check sent every font file to /gate, so the
// browser asked for a typeface and got the login page's HTML back. Requests
// aborted, the app fell back to system fonts, and the wordmark on the gate
// itself — the one screen guaranteed to be unauthenticated — never rendered in
// the serif it was designed in.
export const config = {
  matcher: ['/((?!_next/|favicon.ico|fonts/|guide/).*)'],
};

// Pages' public/_headers only applies to STATIC assets. These pages are
// rendered by the Worker, so the document's Cache-Control has to be set
// here. Hashed assets keep their year-long immutable caching.
function freshHtml(res) {
  res.headers.set('Cache-Control', 'no-cache, must-revalidate');
  return res;
}

// Resolve env exactly like the auth route (getRequestContext), falling back
// to process.env, so the signing secret matches on both sides.
function resolveEnv() {
  try {
    const { env } = getRequestContext();
    if (env) return env;
  } catch {}
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  // Unchanged exemptions: the gate page and the auth API never require a
  // session (that would lock everyone out). They pass straight through,
  // just with the fresh-document header attached.
  // /api/version is exempt for the same reason /gate is: a stale tab needs to
  // learn a newer build exists even when its session has lapsed, and the
  // response is a commit hash and a date - nothing about the workspace.
  if (pathname === '/gate' || pathname.startsWith('/api/auth') || pathname === '/api/version') {
    return freshHtml(NextResponse.next());
  }

  // Shared pages. The ONLY unauthenticated read in the app, so the exemption
  // is written as narrowly as it can be: exactly /p/<token> and
  // /api/public/<token>, nothing above them and no other verb.
  //
  // Deliberately anchored with ^ and a single path segment — a looser test
  // like startsWith('/p') would also exempt /prospects, and startsWith
  // ('/api/public') with no shape check would hand the route arbitrary input.
  // Authorisation still happens in the route itself; this only decides who
  // gets to knock.
  const isPublicRead =
    req.method === 'GET' &&
    (/^\/p\/[0-9a-f]{32,64}\/?$/.test(pathname) ||
      /^\/api\/public\/[0-9a-f]{32,64}\/?$/.test(pathname));
  if (isPublicRead) {
    return freshHtml(NextResponse.next());
  }

  // The watch page's view beacon, the app's one unauthenticated write. Same
  // philosophy as the read above: exactly this path, exactly these verbs
  // (OPTIONS is the browser asking permission), and the route itself
  // revalidates every byte of the body before touching anything.
  if (
    pathname === '/api/public/video-view' &&
    (req.method === 'POST' || req.method === 'OPTIONS')
  ) {
    return NextResponse.next();
  }

  // The cron drain. There is no person here, so there is no session: the
  // Worker's scheduled handler calls it with a shared secret, which the route
  // itself verifies. Exempted as narrowly as the public read above — exactly
  // this path, exactly these verbs, and the secret is still checked inside.
  // Without the exemption the request never reaches the route to be checked.
  if (
    pathname === '/api/cron/drain' &&
    (req.method === 'POST' || req.method === 'PUT') &&
    req.headers.get('x-cron-secret')
  ) {
    return NextResponse.next();
  }

  // Gmail's push notifications. Same reasoning as the cron drain: there is no
  // person here and therefore no session. Pub/Sub signs every push with an
  // OIDC token, and the route verifies it properly — signature against
  // Google's published keys, then issuer, audience, service account and
  // expiry — before doing anything at all.
  //
  // This exemption exists because without it the request never reaches the
  // route to be checked. That is not a hypothetical: the first live push was
  // answered by this middleware with "Enter your access code", Pub/Sub read a
  // 401, retried, and the notification that should have found a reply died
  // here every time. Narrow as ever: exactly this path, exactly POST, and only
  // when a bearer token is actually present.
  if (
    pathname === '/api/gmail/push' &&
    req.method === 'POST' &&
    (req.headers.get('authorization') || '').startsWith('Bearer ')
  ) {
    return NextResponse.next();
  }

  const env = resolveEnv();
  const cookie = req.cookies.get(SESSION_COOKIE);
  const session = cookie ? await verifySession(env, cookie.value) : null;
  if (session) return freshHtml(NextResponse.next());

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not authenticated. Enter your access code.' }, { status: 401 });
  }
  const gate = req.nextUrl.clone();
  gate.pathname = '/gate';
  gate.search = '';
  return NextResponse.redirect(gate);
}
