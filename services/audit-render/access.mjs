// Who may talk to the render service.
//
// One shared secret, sent as `x-render-secret`, checked on every route except
// `/health`. That includes `POST /precheck`, which is the only place in the
// system that will hand back internal crawl facts — the booking link it found,
// the page it resolved, the calendar signal, every page it opened — when asked
// with `{ debug: true }`.
//
// Kept in its own file with no dependencies because the service's own packages
// only exist inside its container image, so nothing in `services/audit-render`
// can be imported by the repo's test suite. The access decision is the part
// worth testing, so the access decision is the part that lives somewhere
// testable.

import { timingSafeEqual } from 'node:crypto';

// Constant-time comparison.
//
// `!==` on strings stops at the first differing byte, which is the timing
// signal a character-at-a-time guess needs. The cron drain route already
// compares its secret this way and explains why; this guards the same class of
// thing and did not.
//
// False when no secret is configured, so a missing environment variable opens
// nothing rather than everything.
export function secretOk(given, expected) {
  if (!expected) return false;
  // A header is a string. Anything else is not a credential, and coercing it
  // would accept an object whose toString happens to return the secret — which
  // a test found, because `String(given)` was doing exactly that.
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  // Length is not secret — it leaks through the response either way — but the
  // buffers must match in size before timingSafeEqual will look at them.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
