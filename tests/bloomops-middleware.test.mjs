// The front door after A3: which paths may reach a route without a session
// cookie, what happens to everyone else, and that nothing of the inherited
// access-code login survives.
import './_jsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Resolved after the hook above is registered: next has no exports map, so
// the bare subpath needs the hook's .js fallback.
const { NextRequest } = await import('next/server');

const root = new URL('..', import.meta.url);
const middlewareSource = readFileSync(new URL('middleware.js', root), 'utf8');
// Comments quote the loose patterns they warn against, so strip them before
// pinning shapes.
const middleware = middlewareSource.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const { middleware: run, hasSessionCookie } = await import('../middleware.js');

const req = (path, { method = 'GET', headers = {} } = {}) => new NextRequest(`https://bloomops-staging.example${path}`, { method, headers });

test('every unauthenticated path is pinned to one path and, where it matters, one verb', () => {
  assert.match(middleware, /pathname === '\/sign-in'/);
  assert.match(middleware, /\^\\\/invite\\\/\[A-Za-z0-9_-\]\{40,64\}/);
  assert.match(middleware, /pathname\.startsWith\('\/api\/auth\/'\)/);
  assert.match(middleware, /pathname === '\/api\/version'/);
  assert.match(middleware, /pathname === '\/api\/health'/);
  assert.match(middleware, /pathname === '\/api\/cron\/drain'/);
  assert.match(middleware, /x-cron-secret/);
  assert.match(middleware, /pathname === '\/api\/gmail\/push'/);
  assert.match(middleware, /startsWith\('Bearer '\)/);
  assert.match(middleware, /pathname === '\/api\/public\/video-view'/);
  assert.ok(middleware.includes('[0-9a-f]{32,64}'), 'the public page token shape is checked, not just the prefix');
  const prefixes = [...middleware.matchAll(/startsWith\('(\/api\/[^']*)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(prefixes, ['/api/', '/api/auth/'], 'a new prefix here is a new way in');
});

test('without a session cookie: pages go to /sign-in with a safe next, APIs get 401', async () => {
  const page = await run(req('/clients?tab=active'));
  assert.equal(page.status, 307);
  const to = new URL(page.headers.get('location'));
  assert.equal(to.pathname, '/sign-in');
  assert.equal(to.searchParams.get('next'), '/clients?tab=active');
  const home = await run(req('/'));
  assert.equal(new URL(home.headers.get('location')).search, '', 'the root needs no next');
  const api = await run(req('/api/infra'));
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { error: 'Sign in to continue.' });
  const oldCookie = await run(req('/api/infra', { headers: { cookie: 'ltb_session=eyJ3IjoiYXJ5IiwiciI6ImFkbWluIn0.sig' } }));
  assert.equal(oldCookie.status, 401, 'the inherited Leadsthatbloom cookie opens nothing');
  const gate = await run(req('/gate'));
  assert.equal(gate.status, 307, '/gate is an ordinary protected path now');
});

test('with a session cookie the request passes, and the cookie names are exactly the BloomOps ones', async () => {
  for (const name of ['bloomops.session_token', '__Secure-bloomops.session_token']) {
    const r = await run(req('/api/infra', { headers: { cookie: `${name}=abc.def` } }));
    assert.equal(r.status, 200, name);
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
  assert.equal(hasSessionCookie(req('/', { headers: { cookie: 'better-auth.session_token=x' } })), false, 'the default Better Auth prefix is not ours');
  assert.equal(hasSessionCookie(req('/', { headers: { cookie: 'bloomops.session_token=' } })), false, 'an empty value is no cookie');
});

test('the signed-out screens, Better Auth, and the probes are reachable without a cookie', async () => {
  for (const [path, method] of [
    ['/sign-in', 'GET'],
    ['/sign-in?error=INVALID_TOKEN', 'GET'],
    [`/invite/${'a'.repeat(43)}`, 'GET'],
    ['/api/auth/sign-in/magic-link', 'POST'],
    ['/api/auth/magic-link/verify?token=x', 'GET'],
    ['/api/auth/get-session', 'GET'],
    ['/api/auth/sign-out', 'POST'],
    ['/api/version', 'GET'],
    ['/api/health', 'GET'],
    [`/p/${'0'.repeat(32)}`, 'GET'],
    [`/api/public/${'0'.repeat(32)}`, 'GET'],
  ]) {
    const r = await run(req(path, { method }));
    assert.equal(r.status, 200, `${method} ${path}`);
  }
  for (const [path, method] of [
    ['/invite/short', 'GET'],
    ['/invite', 'GET'],
    ['/api/auth', 'POST'],
    ['/api/authx', 'GET'],
    [`/p/${'0'.repeat(32)}`, 'POST'],
    ['/prospects', 'GET'],
    ['/api/bloomops/me', 'GET'],
    ['/api/bloomops/invitations/accept', 'POST'],
  ]) {
    const r = await run(req(path, { method }));
    assert.ok(r.status === 307 || r.status === 401, `${method} ${path} -> ${r.status}`);
  }
});

test('the inherited access-code login is gone from the tree', () => {
  for (const gone of ['lib/session.mjs', 'app/gate/page.jsx', 'app/gate/GateForm.jsx', 'app/api/auth/route.js', 'docs/ACCESS-CODES.md']) {
    assert.equal(existsSync(new URL(gone, root)), false, `${gone} still exists`);
  }
  assert.ok(existsSync(new URL('app/api/auth/[...all]/route.js', root)));
  assert.doesNotMatch(middlewareSource, /LTB_|ltb_session|verifySession|access code/i);

  // Nothing under app/, lib/, components/, or .github/ reads the old login
  // secrets as a login. The inherited prospecting code may still derive an
  // encryption key from LTB_SESSION_SECRET; that is not authentication and
  // goes with that code.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) {
        if (entry === 'node_modules' || entry === '.open-next' || entry === '.next') continue;
        walk(p);
      } else if (/\.(js|jsx|mjs|yml)$/.test(entry)) {
        const text = readFileSync(p, 'utf8');
        if (/LTB_ACCESS_CODES|loadCodes|resolveCode|signSession|verifySession|SESSION_COOKIE\b/.test(text)) offenders.push(p);
      }
    }
  };
  for (const dir of ['app', 'lib', 'components', '.github', 'scripts']) walk(new URL(dir, root).pathname);
  assert.deepEqual(offenders, []);
});
