// Verifies a deployed BloomOps Worker from the outside, the way a person would:
// the gate holds, sign-in works, /api/infra reports the expected environment
// with D1 and R2 answering, /api/pages reads, and a disposable page can be
// created, read back, and deleted. Prints a summary and exits non-zero on the
// first failure.
//
//   node .github/scripts/verify-staging.mjs --log deploy.log --expect-env staging
//   node .github/scripts/verify-staging.mjs --url http://127.0.0.1:8787 --expect-env development
//
// Sign-in uses the first code inside STAGING_LTB_ACCESS_CODES (the same JSON
// the Worker holds as its secret). Without it only the unauthenticated checks run.
import { readFileSync, appendFileSync } from 'node:fs';

const arg = (name, fallback = '') => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || '') : fallback;
};
const expectEnv = arg('--expect-env', 'staging');
let base = arg('--url') || process.env.STAGING_URL || '';
if (!base && arg('--log')) {
  const log = readFileSync(arg('--log'), 'utf8');
  base = (log.match(/https:\/\/bloomops-staging[\w.-]*\.workers\.dev/) || [])[0] || '';
}
if (!base) {
  console.error('::error::No Worker URL. Pass --url, set STAGING_URL, or point --log at the deploy output.');
  process.exit(1);
}
base = base.replace(/\/+$/, '');

const results = [];
function finish(code) {
  const lines = results.map((r) => `| ${r.ok ? 'pass' : 'FAIL'} | ${r.name} | ${r.detail} |`);
  const md = `### Verification of ${base}\n\n| Result | Check | Detail |\n|---|---|---|\n${lines.join('\n')}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  console.log(code === 0 ? '::notice::verification passed' : '::error::verification failed');
  process.exit(code);
}
function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) finish(1);
}

let cookie = '';
async function call(path, { method = 'GET', body = null, auth = true } = {}) {
  const headers = { accept: 'application/json' };
  if (auth && cookie) headers.cookie = cookie;
  if (body !== null) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    redirect: 'manual',
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text, headers: res.headers };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. The gate holds for anonymous callers.
{
  const r = await call('/api/infra', { auth: false });
  record('anonymous /api/infra is refused', r.status === 401, `status ${r.status}`);
  const g = await call('/gate', { auth: false });
  record('/gate renders', g.status === 200, `status ${g.status}`);
  const home = await call('/', { auth: false });
  const location = home.headers.get('location') || '';
  record('anonymous / redirects to the gate', home.status >= 300 && home.status < 400 && /\/gate/.test(location), `status ${home.status}`);
}

// 2. Sign in with the throwaway code, retrying briefly while a just-set secret propagates.
const codesJson = process.env.STAGING_LTB_ACCESS_CODES || '';
if (!codesJson) {
  console.log('::warning::STAGING_LTB_ACCESS_CODES not provided, skipping authenticated checks');
  finish(0);
}
let code = '';
try { code = Object.keys(JSON.parse(codesJson))[0] || ''; } catch {}
if (!code) {
  console.error('::error::STAGING_LTB_ACCESS_CODES is not a JSON object of codes');
  process.exit(1);
}
{
  let r = null;
  for (let attempt = 0; attempt < 18; attempt++) {
    r = await call('/api/auth', { method: 'POST', body: { code }, auth: false });
    if (r.status === 200) break;
    await sleep(5000);
  }
  record('sign-in with the staging code', r.status === 200, `status ${r.status}`);
  const setCookies = typeof r.headers.getSetCookie === 'function'
    ? r.headers.getSetCookie()
    : [r.headers.get('set-cookie')].filter(Boolean);
  cookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  record('session cookie issued', cookie.length > 0);
}

// 3. Bindings for this environment.
{
  const r = await call('/api/infra');
  const j = r.json || {};
  record('/api/infra answers', r.status === 200, `status ${r.status}`);
  record(`environment is ${expectEnv}`, j.environment === expectEnv, `reported ${j.environment}`);
  record('D1 binding DB resolves', j.d1?.bound === true && j.d1?.ok === true, JSON.stringify(j.d1));
  record('R2 binding FILES resolves', j.r2?.bound === true && j.r2?.ok === true, JSON.stringify(j.r2));
  record('BloomOps domain schema present', j.domain?.ok === true, JSON.stringify(j.domain));
}

// 4. Pages read, disposable write, read back, delete.
{
  const list = await call('/api/pages');
  const count = list.json?.pages?.length ?? '?';
  record('/api/pages reads', list.status === 200 && Array.isArray(list.json?.pages), `status ${list.status}, ${count} pages`);
  const title = `BloomOps ${expectEnv} verification ${new Date().toISOString()}`;
  const created = await call('/api/pages', {
    method: 'POST',
    body: { title, emoji: '🧪', body: '<p>Disposable verification page. Safe to delete.</p>' },
  });
  const id = created.json?.page?.id;
  record('disposable page created', created.status === 201 && Boolean(id), `status ${created.status}`);
  const again = await call('/api/pages');
  record('disposable page reads back', (again.json?.pages || []).some((p) => p.id === id));
  const del = await call(`/api/pages/${id}`, { method: 'DELETE' });
  record('disposable page deleted', del.status === 200 && del.json?.ok === true, `status ${del.status}`);
  const after = await call('/api/pages');
  record('disposable page no longer listed', !(after.json?.pages || []).some((p) => p.id === id));
}

finish(0);
