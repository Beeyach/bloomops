// Verifies a deployed BloomOps Worker from the outside, the way a person and
// a script would: the front door holds, the sign-in screen renders, Better
// Auth answers on its endpoints, a magic-link request looks the same for any
// address, a bad link is refused, the inherited access-code flow is gone,
// and the health probe reports the expected environment, configuration, and
// schema. Prints a summary and exits non-zero on the first failure.
//
//   node .github/scripts/verify-staging.mjs --log deploy.log --expect-env staging --expect-sha <commit>
//   node .github/scripts/verify-staging.mjs --url http://127.0.0.1:8787 --expect-env development
//
// Nothing here signs in. A real sign-in needs a link from a real mailbox,
// and no endpoint exposes tokens to make that automatable; that single click
// is the manual acceptance step. The addresses used below are random and
// unknown to the deployment, so no email is ever sent by this script.
import { readFileSync, appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const arg = (name, fallback = '') => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? String(process.argv[i + 1] || '') : fallback;
};
const expectEnv = arg('--expect-env', 'staging');
const expectSha = arg('--expect-sha', '').slice(0, 7);
let base = arg('--url') || process.env.STAGING_URL || '';
if (!base && expectEnv === 'staging') {
  try {
    const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8').replace(/^\s*\/\/.*$/gm, ''));
    base = String(config?.env?.staging?.vars?.BLOOMOPS_APP_URL || '');
  } catch {}
}
if (!base && arg('--log')) {
  const log = readFileSync(arg('--log'), 'utf8');
  base = (log.match(/https:\/\/bloomops-staging[\w.-]*\.workers\.dev/) || [])[0] || '';
}
if (!base) {
  console.error('::error::No Worker URL. Pass --url, set STAGING_URL, configure the staging app URL, or point --log at the deploy output.');
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
function warn(name, detail = '') {
  results.push({ name, ok: true, detail: `warning: ${detail}` });
  console.log(`::warning::${name}${detail ? `: ${detail}` : ''}`);
}

async function call(path, { method = 'GET', body = null, headers: extra = {}, accept = 'application/json' } = {}) {
  const headers = { accept, ...extra };
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
const setCookies = (r) => (typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean));
const randomAddress = () => `verify-${randomBytes(8).toString('hex')}@example.invalid`;

// 0. Wait until the build under test is the one being served. A new Worker
// version rolls out over a few seconds and each secret upload creates
// another version, so early requests can land on the previous build.
if (expectSha) {
  let served = '';
  for (let attempt = 0; attempt < 24; attempt++) {
    const v = await call('/api/version');
    served = String(v.json?.sha || '');
    if (v.status === 200 && served.startsWith(expectSha)) break;
    await sleep(5000);
  }
  record(`build ${expectSha} is being served`, served.startsWith(expectSha), `served ${served || 'nothing'}`);
}

// 1. The front door holds for anonymous callers.
{
  const r = await call('/api/infra');
  record('anonymous /api/infra is refused', r.status === 401, `status ${r.status}`);
  const home = await call('/', { accept: 'text/html' });
  const location = home.headers.get('location') || '';
  record('anonymous / redirects to /sign-in', home.status >= 300 && home.status < 400 && /\/sign-in/.test(location), `status ${home.status} -> ${location}`);
  const page = await call('/sign-in', { accept: 'text/html' });
  const signInForm = /sign-in-email/.test(page.text);
  const notConfigured = /Sign-in is not set up/.test(page.text);
  record('/sign-in renders (the form, or the not-configured state)', page.status === 200 && /Bloomsi/.test(page.text) && /brand\/bloomsi-lockup-charcoal\.png/.test(page.text) && (signInForm || notConfigured), `status ${page.status}, ${signInForm ? 'form' : notConfigured ? 'not configured' : 'neither'}`);
  const stale = await call('/api/infra', { headers: { cookie: 'ltb_session=eyJ3IjoiYXJ5IiwiciI6ImFkbWluIn0.forged' } });
  record('an old Leadsthatbloom session cookie does not authorize', stale.status === 401, `status ${stale.status}`);
}

// 2. The inherited access-code flow is gone.
{
  const gate = await call('/gate', { accept: 'text/html' });
  record('/gate is no longer a login page', gate.status !== 200 || !/access code/i.test(gate.text), `status ${gate.status}`);
  const old = await call('/api/auth', { method: 'POST', body: { code: 'bloomops-staging-2026' } });
  record('POST /api/auth with an access code does not sign in', old.status !== 200 && setCookies(old).length === 0, `status ${old.status}`);
  const oldGet = await call('/api/auth');
  record('GET /api/auth is not the old session endpoint', oldGet.status !== 200 || oldGet.json?.authenticated === undefined, `status ${oldGet.status}`);
}

// 3. Health: environment, auth configuration, domain schema. Booleans only.
{
  const h = await call('/api/health');
  const j = h.json || {};
  record('/api/health answers', h.status === 200 && j.auth && j.schema, `status ${h.status}`);
  record(`environment is ${expectEnv}`, j.environment === expectEnv, `reported ${j.environment}`);
  record('BloomOps domain schema present with the A3 migration', j.schema?.ok === true && Number(j.schema?.migrations) >= 3, JSON.stringify(j.schema));
  record('authentication is configured (secret and app URL present)', j.auth?.configured === true, `${JSON.stringify(j.auth)}; set STAGING_BLOOMOPS_AUTH_SECRET as a repository secret and rerun`);
  if (j.auth?.mail === 'resend') record('mail transport is Resend', true, 'resend');
  else if (j.auth?.mail === 'r2-dev' && expectEnv === 'development') record('mail transport is the development mailbox', true, 'r2-dev');
  else warn('no mail transport is configured', `reported ${j.auth?.mail}; sign-in answers 503 until BLOOMOPS_RESEND_API_KEY is set`);
}

// 4. Better Auth answers, and its answers do not depend on the address.
{
  const s = await call('/api/auth/get-session');
  record('anonymous get-session is null', s.status === 200 && s.json === null, `status ${s.status}, body ${s.text.slice(0, 40)}`);

  const health = (await call('/api/health')).json || {};
  const origin = { origin: base };
  const first = await call('/api/auth/sign-in/magic-link', { method: 'POST', body: { email: randomAddress(), callbackURL: '/' }, headers: origin });
  const second = await call('/api/auth/sign-in/magic-link', { method: 'POST', body: { email: randomAddress(), callbackURL: '/' }, headers: origin });
  if (health.auth?.mail === 'none' || health.auth?.mail === 'invalid') {
    record('magic-link request answers 503 while mail is unconfigured', first.status === 503, `status ${first.status}`);
  } else {
    record('magic-link request for an unknown address is accepted', first.status === 200 && first.json?.status === true, `status ${first.status}`);
  }
  record('two unknown addresses get identical responses', first.status === second.status && first.text === second.text, `status ${first.status}/${second.status}`);
  record('no session cookie is issued by a magic-link request', setCookies(first).length === 0);

  const bogus = await call('/api/auth/magic-link/verify?token=not-a-real-token&callbackURL=%2F&errorCallbackURL=%2Fsign-in', { accept: 'text/html' });
  const where = bogus.headers.get('location') || '';
  record('a malformed magic link is refused and sent to the sign-in error state', bogus.status >= 300 && bogus.status < 400 && /error=INVALID_TOKEN/.test(where) && setCookies(bogus).length === 0, `status ${bogus.status} -> ${where}`);

  const foreign = await call('/api/auth/magic-link/verify?token=not-a-real-token&callbackURL=https%3A%2F%2Fevil.example', { accept: 'text/html' });
  record('a magic link with a foreign callback origin is refused', foreign.status === 403 || (foreign.status >= 300 && foreign.status < 400 && !/evil\.example/.test(foreign.headers.get('location') || '')), `status ${foreign.status}`);
}

// 5. BloomOps membership routes refuse anonymous callers.
{
  const me = await call('/api/bloomops/me');
  record('anonymous /api/bloomops/me is refused', me.status === 401, `status ${me.status}`);
  const accept = await call('/api/bloomops/invitations/accept', { method: 'POST', body: { token: 'x'.repeat(43) } });
  record('anonymous invitation acceptance is refused', accept.status === 401, `status ${accept.status}`);
  const invite = await call(`/invite/${'x'.repeat(43)}`, { accept: 'text/html' });
  record('an unknown invitation link renders the not-found state', invite.status === 200 && /not valid/.test(invite.text), `status ${invite.status}`);
}

finish(0);
