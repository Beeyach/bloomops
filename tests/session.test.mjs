import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signSession, verifySession, sessionCookie, clearCookie } from '../lib/session.mjs';

const ENV = { LTB_SESSION_SECRET: 'test-secret-for-unit-tests' };
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 7, 10); // Aug 10, 2026 — inside the legacy grace window

test('sign + verify roundtrip carries workspace and role', async () => {
  const token = await signSession(ENV, { workspace: 'ary', role: 'admin' }, T0);
  assert.deepEqual(await verifySession(ENV, token, T0), { workspace: 'ary', role: 'admin' });
});

test('a token signed with a different secret is rejected', async () => {
  const token = await signSession({ LTB_SESSION_SECRET: 'other' }, { workspace: 'ary', role: 'admin' }, T0);
  assert.equal(await verifySession(ENV, token, T0), null);
});

test('expiry is enforced server-side: dead after 30 days, alive before', async () => {
  const token = await signSession(ENV, { workspace: 'ellen', role: 'user' }, T0);
  assert.notEqual(await verifySession(ENV, token, T0 + 29 * DAY), null);
  assert.equal(await verifySession(ENV, token, T0 + 31 * DAY), null);
});

test('legacy iat:0 tokens live through the grace window, then die', async () => {
  // signSession with a sub-second epoch "now" floors iat to 0 — the exact
  // shape of tokens minted before server-side expiry existed.
  const legacy = await signSession(ENV, { workspace: 'ary', role: 'admin' }, 500);
  assert.notEqual(await verifySession(ENV, legacy, Date.UTC(2026, 7, 20)), null); // Aug 20: grace
  assert.equal(await verifySession(ENV, legacy, Date.UTC(2026, 7, 23)), null);    // Aug 23: dead
});

test('production with no secret fails CLOSED: cannot mint, cannot verify', async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(() => signSession({}, { workspace: 'ary', role: 'admin' }, T0), /LTB_SESSION_SECRET/);
    // A token signed elsewhere cannot sneak past a secretless deploy either.
    const token = await signSession(ENV, { workspace: 'ary', role: 'admin' }, T0);
    assert.equal(await verifySession({}, token, T0), null);
  } finally {
    process.env.NODE_ENV = prevEnv;
  }
});

test('cookies carry HttpOnly + Secure + SameSite', () => {
  const set = sessionCookie('abc');
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) {
    assert.ok(set.includes(flag), `missing ${flag}`);
    assert.ok(clearCookie().includes(flag), `clear missing ${flag}`);
  }
});

// ── Which paths may reach a route without a session ───────────────────────
//
// The middleware is the app's front door and every exemption in it is a way
// in. This pins the shape of each one, because the failure is silent in both
// directions: too narrow and an unattended caller is answered with "enter your
// access code" forever, too loose and the gate is decorative.
//
// The Gmail exemption is here because it was got wrong the first time. The
// first real push was answered with the access-code 401, Pub/Sub retried, and
// the notification that should have found a reply died at the door.

import { readFileSync } from 'node:fs';

const middlewareSource = readFileSync(new URL('../middleware.js', import.meta.url), 'utf8');
// Comments in this file quote the loose patterns they warn against, so a
// naive search finds the warning and calls it the bug.
const middleware = middlewareSource
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

test('every unauthenticated path is pinned to one path and one verb', () => {
  // The cron drain: POST or PUT, and only with the secret header present.
  assert.match(middleware, /pathname === '\/api\/cron\/drain'/);
  assert.match(middleware, /x-cron-secret/);

  // Gmail push: POST only, and only when a bearer token is actually there.
  assert.match(middleware, /pathname === '\/api\/gmail\/push'/);
  assert.match(middleware, /req\.method === 'POST'/);
  assert.match(middleware, /startsWith\('Bearer '\)/);

  // The video beacon: POST or OPTIONS on exactly that path.
  assert.match(middleware, /pathname === '\/api\/public\/video-view'/);
});

test('the public read exemption is anchored, not a prefix', () => {
  // startsWith('/p') would also exempt /prospects, which is the whole table.
  assert.ok(middleware.includes('[0-9a-f]{32,64}'), 'the token shape is checked, not just the prefix');
  assert.ok(middleware.includes("req.method === 'GET'"), 'and only for reads');
  assert.ok(!middleware.includes("startsWith('/p')"), 'a prefix test here would open the table');
});

test('no exemption is written as a bare startsWith on an api path', () => {
  // /api/auth is the one prefix EXEMPTION and it is deliberate: the gate would
  // lock everybody out otherwise. /api/ is the catch-all 401 branch, which is
  // the opposite of an exemption. Anything else must name its path exactly.
  const prefixes = [...middleware.matchAll(/startsWith\('(\/api\/[^']*)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(prefixes, ['/api/', '/api/auth'], 'a new prefix here is a new way in');
});
