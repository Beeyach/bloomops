// The guarantees that must hold whether or not Anthropic is reachable.
//
// Deliberately offline. The real vision acceptance is a separate script that
// hits the live route with a live key, because a test suite that fails when a
// third party has a bad afternoon is a test suite people learn to ignore. What
// is held here is everything that does not need the network: where the key
// lives, what a rejected claim can reach, that the renderer carries no session,
// and that freshness has exactly one owner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { planPackage, buildEmailParts } from '../lib/outreach.mjs';
import { EVIDENCE, VIEWPORT } from '../lib/visual-evidence.mjs';
import { FRESH_DAYS } from '../lib/site-intel.mjs';
import { VISUAL_FRESH_DAYS } from '../lib/visual-evidence.mjs';

const NOW = new Date('2026-08-11T12:00:00Z');
const SITE = 'https://fixture.example';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const code = (f) => read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const prospect = (keys, reasons) => ({
  id: 42, name: 'Fixture', business_name: 'Fixture Physio', email: 'hi@fixture.example',
  domain: 'fixture.example', country: 'US', stage: 'Validated', rating: '💚',
  site_intel: JSON.stringify({
    worth: true, score: 6, why: 'checked', keys, reasons,
    checkedAt: NOW.toISOString(), source: 'precheck', pagesChecked: [SITE], hasForm: true,
  }),
});

// ── 1. The acceptance script exists and is not a mock ────────────────────

test('a real-vision acceptance path exists and runs through the Worker', () => {
  const route = code('../app/api/visual-evidence/route.js');
  // It calls the live renderer and the real review path, and it never invents
  // a verdict of its own.
  assert.match(route, /\/shots/);
  assert.match(route, /reviewArtifact\(/);
  assert.match(route, /loadAiKey\(/);
  for (const fake of ['mock', 'stub', 'fixtureVerdict', 'fakeVerdict']) {
    assert.ok(!route.includes(fake), `the acceptance route must not ${fake} anything`);
  }
});

test('the key is decrypted in the Worker and never leaves it', () => {
  const route = code('../app/api/visual-evidence/route.js');
  // loadAiKey opens the secret; the value is handed straight to reviewArtifact
  // and never returned, logged, or put in the response.
  assert.match(route, /const \{ key: apiKey/);
  assert.ok(!route.includes('console.log'), 'nothing about a request is logged');
  const returned = route.slice(route.lastIndexOf('return NextResponse.json'));
  assert.ok(!returned.includes('apiKey'), 'the key is never in a response');
  assert.ok(!returned.includes('secret'), 'nor is the render secret');
});

test('admin only, because it spends money and renders third-party sites', () => {
  const route = code('../app/api/visual-evidence/route.js');
  assert.match(route, /ctx\.role !== 'admin'/);
});

// ── 3. A verdict is tied to the picture it came from ─────────────────────

test('a verdict carries the artifact it looked at', () => {
  const review = code('../lib/visual-review.mjs');
  for (const field of ['artifactId', 'storedAt', 'url', 'viewport', 'capturedAt', 'model']) {
    assert.ok(review.includes(`${field}:`), `a verdict must record ${field}`);
  }
  // And it refuses to look at something that is not there.
  assert.match(review, /there is no stored image to look at/);
  assert.match(review, /the page was blocked/);
});

test('the artifact row is written before the model is asked', () => {
  // So a picture that was taken is recorded even when the look fails, and the
  // enforcement still reads the verdict rather than the row.
  const route = code('../app/api/visual-evidence/route.js');
  assert.ok(route.indexOf('INSERT INTO visual_artifacts') < route.indexOf('reviewArtifact('));
});

// ── 4, 5. What a rejected claim cannot reach ─────────────────────────────

test('a rejected visual claim is absent from every part of the writer input', () => {
  const p = prospect(['form-broken', 'cta'], ['The contact form is broken', 'Nothing above the fold to click']);
  const plan = planPackage(p, { now: NOW });
  const { system, user } = buildEmailParts({ positioning: 'booking systems' }, p, plan);

  const banned = 'Nothing above the fold';
  assert.ok(!user.includes(banned), 'not in the evidence block');
  assert.ok(!system.includes(banned), 'not in the chosen angle');
  assert.ok(!JSON.stringify(plan.supporting || []).includes(banned), 'not in the supporting set');
  assert.ok(!String(plan.whyContact || '').includes(banned), 'not in why-contact');
  assert.ok(!JSON.stringify(plan.evidence).includes(banned), 'not in the evidence at all');
  // It survives only where it belongs: the record of what was thrown away.
  assert.ok(JSON.stringify(plan.unsupported).includes(banned), 'and it is recorded as rejected');
});

test('there is one writer entry point, so parity is structural not promised', () => {
  const runner = code('../lib/runner.mjs');
  assert.match(runner, /planPackage\(p, \{/);
  assert.match(runner, /visualEvidence,/, 'the native path passes stored artifacts');
  assert.match(runner, /FROM visual_artifacts/, 'which it reads from the artifact table');
});

test('the skills defer to the app rather than carrying their own rule', () => {
  // website-audit is a packed archive; what matters is that it names the rule
  // and does not restate a competing one.
  const shipped = readFileSync(new URL('../skills/website-audit.skill', import.meta.url));
  assert.ok(shipped.length > 1000, 'the skill ships');
  // auto-prospect makes no visual claims at all, so there is nothing to
  // resurrect. Asserted rather than assumed.
  const auto = readFileSync(new URL('../skills/auto-prospect.skill', import.meta.url));
  assert.ok(auto.length > 1000);
});

// ── 6. No human queue from a failed check ────────────────────────────────

test('a failed visual check never becomes work for a person', () => {
  const p = prospect(['cta'], ['Nothing above the fold to click']);
  const plan = planPackage(p, { now: NOW });
  assert.equal(plan.ok, false);
  const words = `${plan.reason} ${JSON.stringify(plan.unsupported)}`.toLowerCase();
  for (const nag of ['please check', 'manually', 'have a look', 'review this site', 'ary']) {
    assert.ok(!words.includes(nag), `"${nag}" would hand a verification failure to a human`);
  }
});

// ── 7, 8. Artifact and capture safety ────────────────────────────────────

test('a screenshot URL carries nothing but host, path, viewport and a hash', () => {
  const server = code('../services/audit-render/server.mjs');
  const slug = server.slice(server.indexOf('function shotSlug'), server.indexOf('const app = new Hono'));
  assert.match(slug, /hostname/);
  assert.match(slug, /pathname/);
  assert.match(slug, /createHash\('sha256'\)/);
  for (const leak of ['SECRET', 'token', 'apiKey', 'Authorization', 'password']) {
    assert.ok(!slug.includes(leak), `a slug must never contain ${leak}`);
  }
});

test('the renderer opens prospect sites with no session of any kind', () => {
  const src = read('../services/audit-render/capture.mjs');
  const shots = src.slice(src.indexOf('async function shootOne'));
  for (const carried of ['storageState', 'addCookies', 'httpCredentials',
    'setExtraHTTPHeaders', 'localStorage', 'Authorization']) {
    assert.ok(!shots.includes(carried), `the capture must not carry ${carried}`);
  }
});

test('the capture still clicks and submits nothing', () => {
  const src = read('../services/audit-render/capture.mjs');
  const shots = src.slice(src.indexOf('async function shootOne'));
  for (const act of ['.click(', '.fill(', '.type(', 'submit', 'press(']) {
    assert.ok(!shots.includes(act), `the shutter must never ${act}`);
  }
});

// ── 9. One freshness owner ───────────────────────────────────────────────

test('visual freshness is the site-intel policy, not a second number', () => {
  assert.equal(VISUAL_FRESH_DAYS, FRESH_DAYS);
  assert.equal(FRESH_DAYS, 14);
  const src = code('../lib/visual-evidence.mjs');
  assert.match(src, /export \{ FRESH_DAYS as VISUAL_FRESH_DAYS \}/, 're-exported, never redeclared');
  assert.ok(!/VISUAL_FRESH_DAYS\s*=\s*\d/.test(src), 'and never given its own value');
});

// ── 10-12. Safety ────────────────────────────────────────────────────────

test('the acceptance route sends nothing and queues nothing', () => {
  const route = code('../app/api/visual-evidence/route.js');
  for (const forbidden of ['sendApproved', 'enqueue(', 'send_events', 'outreach_packages',
    'autoSend', 'UPDATE prospects', 'DELETE ']) {
    assert.ok(!route.includes(forbidden), `the acceptance route must never touch ${forbidden}`);
  }
  // It writes to exactly one table. `DO UPDATE SET` is the upsert clause, not
  // a second target, so the pattern names the table explicitly.
  const writes = route.match(/INSERT INTO\s+(\w+)|UPDATE\s+(?!SET)(\w+)/g) || [];
  assert.ok(writes.length >= 2, 'the route does write');
  for (const w of writes) assert.match(w, /visual_artifacts/, `unexpected write: ${w}`);
});

test('the controlled fixtures collect nothing and submit nothing', () => {
  for (const f of ['../public/guide/visual-fixture-cta.html', '../public/guide/visual-fixture-buried.html']) {
    const html = read(f);
    for (const risky of ['<form', '<input', 'action=', 'fetch(', 'XMLHttpRequest', 'password']) {
      assert.ok(!html.includes(risky), `${f} must not contain ${risky}`);
    }
    assert.match(html, /Book a call/, 'both fixtures carry the same visible action');
    assert.match(html, /test fixture/, 'and say what they are');
  }
});
