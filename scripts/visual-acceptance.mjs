// The real vision acceptance. Not a test, and deliberately not in the suite.
//
// Everything else about visual evidence can be proved offline, and is. This is
// the one thing that cannot: that a real screenshot of a real page goes through
// the real production vision path, using the encrypted key that only the Worker
// can open, and comes back with a verdict that changes what the writer may say.
//
// It is a script rather than a test because it costs money, needs a live
// Anthropic, and needs an admin session. A suite that fails when a third party
// has a bad afternoon is a suite people learn to ignore.
//
// Usage:
//   node scripts/visual-acceptance.mjs <session-cookie-value>
//
// The cookie is an admin session for the production app. It is read from argv
// and never written anywhere.

const APP = process.env.LTB_APP || 'https://leadsthatbloom.com';
const COOKIE = process.argv[2];

if (!COOKIE) {
  console.error('Usage: node scripts/visual-acceptance.mjs <ltb_session cookie value>');
  process.exit(2);
}

// The pair. One page has a Book a call button in the first viewport; the other
// has the same button 1,400px down. Both must be answered correctly, because a
// check that rejects everything is not enforcement, it is a switch that is off.
const CASES = [
  {
    name: 'action visible in the first viewport',
    url: `${APP}/guide/visual-fixture-cta.html`,
    key: 'cta',
    // The `cta` finding claims there is nothing to click. The picture shows a
    // button, so the model should answer "yes" and the claim must be REFUTED.
    expectSupported: false,
    because: 'a Book a call button is plainly in frame',
  },
  {
    name: 'action pushed below the first viewport',
    url: `${APP}/guide/visual-fixture-buried.html`,
    key: 'cta',
    // Same button, 1,400px down. The model should answer "no" for the first
    // screen, so the claim is SUPPORTED.
    expectSupported: true,
    because: 'the same button is 1,400px below the fold',
  },
];

const line = (s = '') => console.log(s);

async function run(one) {
  const started = Date.now();
  const res = await fetch(`${APP}/api/visual-evidence`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `ltb_session=${COOKIE}` },
    body: JSON.stringify({ url: one.url, keys: [one.key], viewports: ['desktop'] }),
  });
  const ms = Date.now() - started;
  const json = await res.json().catch(() => null);

  if (!res.ok) {
    line(`  FAILED  HTTP ${res.status}: ${json?.error || '(no body)'}`);
    return { ok: false };
  }

  const result = json.results?.[0];
  const look = result?.looks?.[0];
  const a = result?.artifact;

  line(`  run id        ${json.runId}`);
  line(`  artifact id   ${a?.id}`);
  line(`  url           ${a?.url}`);
  line(`  viewport      ${a?.viewport} (${a?.viewportWidth}x${a?.viewportHeight})`);
  line(`  bytes         ${a?.bytes?.toLocaleString?.() ?? a?.bytes}`);
  line(`  stored at     ${a?.storedAt || '(not stored)'}`);
  line(`  sha256        ${a?.sha256?.slice(0, 24)}...`);
  line(`  http status   ${a?.httpStatus} | blocked ${a?.blocked}`);
  line(`  model         ${look?.model || '(none)'}`);
  line(`  request time  ${ms}ms`);
  line(`  question      ${(look?.question || '').slice(0, 96)}...`);
  line(`  answer        ${look?.verdict?.answer} (confidence ${look?.verdict?.confidence})`);
  line(`  visible text  ${JSON.stringify(look?.verdict?.visible || '')}`);
  line(`  observation   ${look?.verdict?.observation || ''}`);
  line(`  tokens        in ${look?.usage?.input_tokens ?? '?'} / out ${look?.usage?.output_tokens ?? '?'}`);
  line(`  supported     ${look?.supported}`);
  line(`  evidence      supportsKeys=${JSON.stringify(result?.evidence?.supportsKeys)} unclearKeys=${JSON.stringify(result?.evidence?.unclearKeys)}`);

  const got = Boolean(look?.supported);
  const pass = got === one.expectSupported;
  line(`  EXPECTED      supported=${one.expectSupported} (${one.because})`);
  line(`  ${pass ? 'PASS' : 'FAIL'}`);
  return { ok: pass, usage: look?.usage || {}, model: look?.model, artifact: a, look };
}

const results = [];
for (const one of CASES) {
  line(`\n── ${one.name} ──`);
  results.push(await run(one));
}

const inTok = results.reduce((n, r) => n + (r.usage?.input_tokens || 0), 0);
const outTok = results.reduce((n, r) => n + (r.usage?.output_tokens || 0), 0);
// Haiku 4.5 list price. Reported rather than assumed correct: the ledger in
// ai_usage records the real figure from the same call.
const COST_IN = 1 / 1_000_000;
const COST_OUT = 5 / 1_000_000;
const cost = inTok * COST_IN + outTok * COST_OUT;

line('\n── totals ──');
line(`  calls         ${results.length}`);
line(`  input tokens  ${inTok}`);
line(`  output tokens ${outTok}`);
line(`  cost          $${cost.toFixed(6)}  ($${(cost / Math.max(1, results.length)).toFixed(6)} per look)`);
line(`  x100          $${((cost / Math.max(1, results.length)) * 100).toFixed(4)}`);
line(`  x1000         $${((cost / Math.max(1, results.length)) * 1000).toFixed(3)}`);
line('\nNo prospect was contacted. No email was sent. No package was persisted.');

process.exit(results.every((r) => r.ok) ? 0 : 1);
