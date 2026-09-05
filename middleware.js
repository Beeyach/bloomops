import { NextResponse } from 'next/server';
import { SESSION_COOKIE_NAMES } from '@/lib/bloomops/auth-config.mjs';

// The front door. Anything without a BloomOps session cookie is bounced:
// pages go to /sign-in, API calls get 401. This is a presence check only,
// the fast one Better Auth documents for middleware. It does not validate
// the cookie and it knows nothing about workspaces: every protected route
// and page verifies the session and the caller's ACTIVE workspace membership
// itself through lib/bloomops/access.mjs. Authorization is server-side and
// per request; this file only decides who gets to knock.
//
// Exempt from the cookie check (each pinned to an exact shape, see
// tests/bloomops-middleware.test.mjs):
//   /sign-in, /invite/<token>     the pages a signed-out person needs
//   /api/auth/*                   Better Auth's own endpoints
//   /api/version, /api/health     build stamp and configuration booleans
//   /p/<token>, /api/public/<token>  shared Pages, GET only
//   the inherited unattended callers (video beacon, cron drain, Gmail push)
//
// The matcher also covers the exempt pages so the no-cache header below
// reaches them. `fonts/` and `_next/` are static assets, never pages.
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

export function hasSessionCookie(req) {
  return SESSION_COOKIE_NAMES.some((name) => Boolean(req.cookies.get(name)?.value));
}

// Only a same-origin path may be remembered for after sign-in.
function safeNextPath(pathname, search) {
  if (!pathname.startsWith('/') || pathname.startsWith('//') || pathname.includes('\\')) return '/';
  return `${pathname}${search || ''}`;
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  if (
    pathname === '/sign-in' ||
    /^\/invite\/[A-Za-z0-9_-]{40,64}\/?$/.test(pathname) ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/api/version' ||
    pathname === '/api/health'
  ) {
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
  if (
    pathname === '/api/cron/drain' &&
    (req.method === 'POST' || req.method === 'PUT') &&
    req.headers.get('x-cron-secret')
  ) {
    return NextResponse.next();
  }

  // Gmail's push notifications. Same reasoning as the cron drain: there is no
  // person here and therefore no session. Pub/Sub signs every push with an
  // OIDC token, and the route verifies it properly before doing anything at
  // all. Narrow as ever: exactly this path, exactly POST, and only when a
  // bearer token is actually present.
  if (
    pathname === '/api/gmail/push' &&
    req.method === 'POST' &&
    (req.headers.get('authorization') || '').startsWith('Bearer ')
  ) {
    return NextResponse.next();
  }

  if (hasSessionCookie(req)) return freshHtml(NextResponse.next());

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401 });
  }
  const signIn = req.nextUrl.clone();
  signIn.pathname = '/sign-in';
  signIn.search = '';
  const next = safeNextPath(pathname, req.nextUrl.search);
  if (next !== '/') signIn.searchParams.set('next', next);
  return NextResponse.redirect(signIn);
}
