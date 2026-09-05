// The two verdicts a real model actually returned, pinned.
//
// On 2026-08-11 both controlled fixtures went through the production route:
// Playwright took the picture, R2 stored it, the Worker fetched the bytes back,
// checked them against the recorded hash, and handed them to claude-haiku-4-5
// as base64. These are the answers that came back.
//
// They are recorded here as data, not re-simulated as a call. Nothing in this
// file reaches the network — what it holds is that the real answers, run
// through the real polarity and the real screening, produce the right outcome.
// If someone later flips the polarity map or loosens the screening, these two
// break, and they break with the actual production answers rather than with a
// convenient fixture.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { supports } from '../lib/visual-review.mjs';
import { partitionClaims, EVIDENCE, VIEWPORT } from '../lib/visual-evidence.mjs';
import { screenEvidence } from '../lib/outreach.mjs';

const NOW = new Date('2026-08-11T15:10:00Z');

// Verbatim from the production run.
const VISIBLE = {
  artifactId: 1,
  url: 'https://leadsthatbloom.com/guide/visual-fixture-cta.html',
  bytes: 46437,
  model: 'claude-haiku-4-5',
  delivery: 'base64',
  mediaType: 'image/png',
  verdict: { answer: 'yes', confidence: 'high', visible: 'Book a call' },
  usage: { input_tokens: 1843, output_tokens: 73 },
};

const BURIED = {
  artifactId: 2,
  url: 'https://leadsthatbloom.com/guide/visual-fixture-buried.html',
  bytes: 66858,
  model: 'claude-haiku-4-5',
  delivery: 'base64',
  mediaType: 'image/png',
  verdict: { answer: 'no', confidence: 'high', visible: '' },
  usage: { input_tokens: 1842, output_tokens: 89 },
};

// ── The pair discriminates ───────────────────────────────────────────────

test('the model saw the button, so "nothing to click" is refuted', () => {
  // The `cta` finding claims there is no action above the fold. The model
  // answered that there is one, and named it. That REFUTES the claim.
  assert.equal(supports('cta', VISIBLE.verdict), false);
  assert.equal(VISIBLE.verdict.visible, 'Book a call');
});

test('the same button 1,400px down is not visible, so the claim stands', () => {
  // Same page design, same button, pushed below the first screen. The claim is
  // true here and must survive — a check that rejects everything is not
  // enforcement, it is a switch that is off.
  assert.equal(supports('cta', BURIED.verdict), true);
});

test('the two answers are opposite, which is the whole point', () => {
  assert.notEqual(VISIBLE.verdict.answer, BURIED.verdict.answer);
  assert.notEqual(supports('cta', VISIBLE.verdict), supports('cta', BURIED.verdict));
});

// ── The model was handed pixels, not a link ──────────────────────────────

test('both verdicts came from bytes delivered to the model', () => {
  for (const r of [VISIBLE, BURIED]) {
    assert.equal(r.delivery, 'base64');
    assert.equal(r.mediaType, 'image/png');
    assert.ok(r.bytes > 40_000, 'a real first-screen capture, not a placeholder');
    // History, not policy. This run was on Haiku, which is what the cheap tier
    // routed to at the time. The tier has since moved to the workspace model.
    assert.equal(r.model, 'claude-haiku-4-5', 'the model that actually answered on the day');
    assert.ok(r.usage.input_tokens > 1500, 'an image-sized prompt, not text alone');
  }
});

test('a verdict is traceable to the artifact it came from', () => {
  assert.equal(VISIBLE.artifactId, 1);
  assert.equal(BURIED.artifactId, 2);
  assert.notEqual(VISIBLE.artifactId, BURIED.artifactId);
});

// ── What the writer may say, decided by those real answers ───────────────

const evidenceFor = (result, supported) => ([{
  tier: EVIDENCE.VISUAL,
  url: result.url,
  viewport: VIEWPORT.DESKTOP,
  capturedAt: NOW.toISOString(),
  blocked: false,
  storedAt: 'https://file.gobloomwired.com/shot/fixture',
  artifactId: result.artifactId,
  supportsKeys: supported ? ['cta'] : [],
}]);

test('the refuted claim cannot reach the writer', () => {
  const { kept, dropped } = screenEvidence(
    [{ key: 'cta', text: 'Nothing above the fold reads like an action', source: VISIBLE.url }],
    evidenceFor(VISIBLE, false),
    { now: NOW, site: VISIBLE.url }
  );
  assert.equal(kept.length, 0, 'the writer gets nothing from this finding');
  assert.equal(dropped.length, 1);
  assert.equal(dropped[0].key, 'cta');
});

test('the supported claim does reach the writer, on the strength of a picture', () => {
  const { kept, dropped } = screenEvidence(
    [{ key: 'cta', text: 'Nothing above the fold reads like an action', source: BURIED.url }],
    evidenceFor(BURIED, true),
    { now: NOW, site: BURIED.url }
  );
  assert.equal(kept.length, 1, 'a true visual claim is not blocked');
  assert.equal(dropped.length, 0);
});

test('the rejection is a refutation, not a shrug', () => {
  // The three reasons stay distinct: refuted means the claim was wrong, which
  // is different from unproven and different from nobody looked.
  const { rejected } = partitionClaims(
    [{ key: 'cta', text: 'Nothing above the fold reads like an action', url: VISIBLE.url }],
    evidenceFor(VISIBLE, false),
    { now: NOW }
  );
  assert.equal(rejected.length, 1);
  assert.match(rejected[0].why, /does not show|looked at/i);
});
