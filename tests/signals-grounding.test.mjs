import test from 'node:test';
import assert from 'node:assert/strict';
import { offerSignals, signalsFromIntel, contactSignal, collectSignals, signalLines, SIGNAL_TYPE } from '../lib/signals.mjs';
import { buildSiteIntel } from '../lib/site-intel.mjs';
import { EVIDENCE_RULES, buildReplyCoachParts, buildCallPrepParts, buildProposalParts } from '../lib/bee-prompts.mjs';
import { buildProspectContext } from '../lib/prospect-context.mjs';

// ── Signals ─────────────────────────────────────────────────────────────
// The detection already existed in lib/extract-email.mjs and only ad-scan
// leads could reach it. These pin the wrapper that gives it provenance, not
// the detection itself.

test('offer clues become typed signals with a source and a date', () => {
  const out = offerSignals('Join my 12 week group coaching accelerator. Book a call to apply.', {
    source: 'https://kym.com', observedAt: '2026-08-09T10:00:00Z',
  });
  assert.ok(out.length >= 2, 'a program and a call funnel');
  for (const s of out) {
    assert.equal(s.type, SIGNAL_TYPE.OFFER);
    assert.equal(s.source, 'https://kym.com');
    assert.equal(s.observedAt, '2026-08-09T10:00:00Z');
    assert.equal(s.method, 'page copy match');
    // A regex hit on marketing copy is not the same as a person reading it.
    assert.equal(s.confidence, 'medium');
  }
});

test('a page with no offer language produces no signals rather than filler', () => {
  assert.deepEqual(offerSignals('We are a small bakery in Wellington.'), []);
});

test('the site probe becomes signals without refetching anything', () => {
  const intel = JSON.stringify(buildSiteIntel(
    { worth: true, score: 8, reasons: [], facts: { platform: 'Squarespace', booking: false, form: true } },
    { at: new Date().toISOString() }
  ));
  const out = signalsFromIntel(intel);
  const text = out.map((s) => s.text).join(' | ');
  assert.match(text, /Squarespace/);
  assert.match(text, /No booking system/);
  assert.match(text, /Contact form/);
  assert.ok(out.every((s) => s.observedAt && s.method === 'browser check'));
  assert.ok(out.every((s) => s.confidence === 'high'), 'fresh intel is high confidence');
});

test('a stale probe produces low-confidence signals', () => {
  const intel = JSON.stringify(buildSiteIntel(
    { worth: true, score: 8, reasons: [], facts: { platform: 'Wix' } },
    { at: '2026-01-01T00:00:00Z' }
  ));
  assert.ok(signalsFromIntel(intel).every((s) => s.confidence === 'low'));
});

test('a blocked site yields no signals, because nothing was seen', () => {
  const intel = JSON.stringify(buildSiteIntel({ worth: false, blocked: { reason: 'parked' } }, { at: new Date().toISOString() }));
  assert.deepEqual(signalsFromIntel(intel), []);
});

test('a found contact address is a high-confidence signal', () => {
  const [s] = contactSignal('hello@kym.com', { source: 'https://kym.com', observedAt: '2026-08-09T10:00:00Z' });
  assert.equal(s.type, SIGNAL_TYPE.CONTACT);
  assert.equal(s.confidence, 'high');
  assert.match(s.method, /read from their own page/);
  assert.deepEqual(contactSignal(null), []);
});

test('collectSignals deduplicates and puts the most trustworthy first', () => {
  const intel = JSON.stringify(buildSiteIntel(
    { worth: true, reasons: [], facts: { platform: 'Wix' } },
    { at: new Date().toISOString() }
  ));
  const p = {
    site_intel: intel,
    signals: JSON.stringify([
      { type: 'tech', text: 'Site runs on Wix', confidence: 'low', method: 'guess' },
      { type: 'contact', text: 'hello@x.com', confidence: 'high', method: 'read from their own page' },
    ]),
  };
  const out = collectSignals(p);
  assert.equal(out[0].confidence, 'high');
  const wix = out.filter((s) => s.text === 'Site runs on Wix');
  assert.equal(wix.length, 1, 'the same fact from two sources appears once');
});

test('signal lines carry type, method and date into a prompt', () => {
  const lines = signalLines(signalsFromIntel(JSON.stringify(buildSiteIntel(
    { worth: true, reasons: [], facts: { booking: false } },
    { at: '2026-08-09T10:00:00Z' }
  ))));
  assert.match(lines[0], /^\s+\* \[lead-flow\]/);
  assert.match(lines[0], /browser check, 2026-08-09/);
});

// ── Outreach grounding ──────────────────────────────────────────────────
// The rule the product rests on: never invent a reason to contact somebody.

test('the evidence rules forbid turning unknowns into claims', () => {
  assert.match(EVIDENCE_RULES, /may NOT state anything under INFERRED as fact/);
  assert.match(EVIDENCE_RULES, /may NOT turn an item under "WHAT WE DO NOT KNOW" into a claim/);
  assert.match(EVIDENCE_RULES, /Never assert a consequence you cannot see/);
  // The specific failure this exists to prevent, named in the prompt.
  assert.match(EVIDENCE_RULES, /You must be losing leads/);
});

test('the rules give permission to produce no email at all', () => {
  assert.match(EVIDENCE_RULES, /do not manufacture an observation/i);
  assert.match(EVIDENCE_RULES, /Producing no email is the correct answer there/);
});

test('every bee that describes a prospect gets the evidence rules', () => {
  const settings = { offer: 'booking systems', voiceSamples: [] };
  const ctx = 'PROSPECT\nname: Kym';
  for (const [name, parts] of [
    ['reply-coach', buildReplyCoachParts(settings, ctx, 'what does it cost?')],
    ['call-prep', buildCallPrepParts(settings, ctx)],
    ['proposal', buildProposalParts(settings, ctx)],
  ]) {
    assert.match(parts.system, /EVIDENCE RULES/, `${name} carries the rules`);
    assert.match(parts.system, /these outrank every other instruction/, name);
  }
});

test('the context block a bee receives separates the three tiers', () => {
  const ctx = buildProspectContext({
    id: 1, name: 'Kym', domain: 'kym.com',
    own_findings: JSON.stringify([{ text: 'Header video is black' }]),
    site_intel: JSON.stringify(buildSiteIntel(
      { worth: true, score: 9, reasons: ['Footer says 2019'], facts: { platform: 'WordPress' } },
      { at: new Date().toISOString() }
    )),
    audit_notes: 'Rating: 8\nPlatform: WordPress\n',
  });
  assert.match(ctx, /-- MANUAL \(seen by a person/);
  assert.match(ctx, /Header video is black/);
  assert.match(ctx, /-- VERIFIED \(a browser loaded the page/);
  assert.match(ctx, /Footer says 2019/);
  assert.match(ctx, /-- INFERRED \(context only, NOT quotable\)/);
  assert.match(ctx, /-- WHAT WE DO NOT KNOW --/);
});

test('a prospect nobody has researched is described as unknown, not as clean', () => {
  const ctx = buildProspectContext({ id: 2, name: 'Nobody', domain: 'n.com' });
  assert.match(ctx, /EVIDENCE: NONE/);
  assert.match(ctx, /Do not invent an observation/);
  assert.match(ctx, /Nobody has run the site check/);
});

test('a dead address never buys a browser probe', async () => {
  // Two 404s each bought a 20-credit probe on the first real run, because
  // "their site has nothing on it" and "their site does not exist" arrived at
  // the paid stage as the same empty result.
  const { worthProbing } = await import('../lib/extract-email.mjs');
  assert.equal(worthProbing(404), false, 'nothing there, and no browser will find it');
  assert.equal(worthProbing(410), false);
  assert.equal(worthProbing(null), false, 'never answered at all');
});

test('a bot check still buys a probe, because that is what the probe is for', async () => {
  const { worthProbing } = await import('../lib/extract-email.mjs');
  assert.equal(worthProbing(403), true);
  assert.equal(worthProbing(429), true);
  assert.equal(worthProbing(503), true);
  assert.equal(worthProbing(200), true);
});
