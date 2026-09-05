import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectEvidence, groupEvidence, evidenceStrength, knownUnknowns,
  evidenceBlock, evidenceSummary, TIER, CONFIDENCE,
} from '../lib/evidence.mjs';
import { buildSiteIntel } from '../lib/site-intel.mjs';

// The rule: inferred context must never read like evidence. Before this every
// bee got one undifferentiated wall of prose, so a guess parsed out of months
// -old audit notes and a problem measured in a browser this morning looked the
// same on the way into a prompt.

const freshIntel = (over = {}) => JSON.stringify(buildSiteIntel({
  worth: true, score: 11,
  reasons: ['Booking form returns a 500 on submit', 'Footer still says 2019'],
  keys: ['form-broken', 'stale-copyright'],
  facts: { platform: 'WordPress', form: true, booking: false },
  ...over,
}, { at: new Date().toISOString() }));

const PROSPECT = {
  id: 1,
  name: 'Kym',
  domain: 'heartandsoul.com',
  email: 'kym@heartandsoul.com',
  site_intel: freshIntel(),
  own_findings: JSON.stringify([{ text: 'The header video does not play, it just sits black', where: 'top' }]),
  audit_notes: 'Rating: 8\nPlatform: WordPress\n',
  replied: 1,
};

test("Ary's own findings are collected, and they outrank everything", () => {
  const ev = collectEvidence(PROSPECT);
  assert.equal(ev[0].tier, TIER.MANUAL);
  assert.ok(ev[0].text.includes('header video'));
  assert.equal(ev[0].confidence, CONFIDENCE.HIGH);
  // Manual first, always: if only three things fit in a prompt, they are hers.
  const tiers = ev.map((e) => e.tier);
  assert.deepEqual([...tiers].sort((a, b) => tiers.indexOf(a) - tiers.indexOf(b)), tiers);
  assert.ok(tiers.indexOf(TIER.MANUAL) < tiers.indexOf(TIER.VERIFIED));
  assert.ok(tiers.indexOf(TIER.VERIFIED) < tiers.indexOf(TIER.INFERRED));
});

test('a browser measurement is VERIFIED and carries how and when', () => {
  const g = groupEvidence(collectEvidence(PROSPECT));
  const v = g.verified.find((e) => e.text.includes('500'));
  assert.ok(v, 'the probe finding is present');
  assert.equal(v.tier, TIER.VERIFIED);
  assert.match(v.method, /browser check/);
  assert.ok(v.observedAt, 'a measurement without a date is a rumour');
  assert.equal(v.confidence, CONFIDENCE.HIGH);
});

test('audit notes are INFERRED and never promoted to evidence', () => {
  const g = groupEvidence(collectEvidence(PROSPECT));
  assert.ok(g.inferred.length > 0);
  for (const e of g.inferred) {
    assert.equal(e.confidence, CONFIDENCE.LOW);
    assert.match(e.method, /parsed from audit notes/);
  }
  // Nothing from the notes may appear under manual or verified.
  assert.ok(!g.manual.some((e) => e.method.includes('audit notes')));
  assert.ok(!g.verified.some((e) => e.method.includes('audit notes')));
});

test('a stale measurement drops to medium confidence rather than staying quotable', () => {
  const old = { ...PROSPECT, site_intel: JSON.stringify(buildSiteIntel(
    { worth: true, score: 9, reasons: ['Footer still says 2019'], facts: {} },
    { at: '2026-01-01T00:00:00Z' }
  )) };
  const g = groupEvidence(collectEvidence(old));
  const v = g.verified.find((e) => e.text.includes('2019'));
  assert.equal(v.confidence, CONFIDENCE.MEDIUM);
});

test('automated research never removes a manual finding', () => {
  // The probe found nothing; her finding survives untouched.
  const p = {
    ...PROSPECT,
    site_intel: JSON.stringify(buildSiteIntel({ worth: false, score: 0, reasons: [], facts: {} }, { at: new Date().toISOString() })),
  };
  const g = groupEvidence(collectEvidence(p));
  assert.equal(g.manual.length, 1);
  assert.ok(g.manual[0].text.includes('header video'));
});

test('strength says plainly when there is nothing to point at', () => {
  const bare = { id: 2, name: 'Nobody', domain: 'x.com' };
  const s = evidenceStrength(collectEvidence(bare));
  assert.equal(s.level, 'none');
  assert.equal(s.canPersonalise, false);
});

test('one material finding is sufficient, two is strong', () => {
  const one = { id: 3, domain: 'x.com', own_findings: JSON.stringify([{ text: 'Form 500s' }]) };
  assert.equal(evidenceStrength(collectEvidence(one)).level, 'sufficient');
  const two = { id: 4, domain: 'x.com', own_findings: JSON.stringify([{ text: 'Form 500s' }, { text: 'Video is black' }]) };
  assert.equal(evidenceStrength(collectEvidence(two)).level, 'strong');
});

test('watching the video does not count as a reason to contact them', () => {
  // It is a real signal about interest, but it is not something to point at
  // on their website, so it must not make a prospect look personalisable.
  const watcher = {
    id: 5,
    domain: 'x.com',
    activity_log: JSON.stringify([{ ts: new Date().toISOString(), tag: 'VIDEOVIEW', text: 'Watched 75% of the video' }]),
  };
  const s = evidenceStrength(collectEvidence(watcher));
  assert.equal(s.level, 'none');
});

test('gaps are stated rather than left for the model to fill', () => {
  const gaps = knownUnknowns({ id: 6, domain: 'x.com' }, []);
  const joined = gaps.join(' ');
  assert.match(joined, /Nobody has run the site check/);
  assert.match(joined, /No contact email/);
  assert.match(joined, /never replied/);
});

test('the prompt block labels the tiers and forbids the conversion of gaps into claims', () => {
  const block = evidenceBlock(PROSPECT);
  assert.match(block, /-- MANUAL \(seen by a person/);
  assert.match(block, /-- VERIFIED \(a browser loaded the page/);
  assert.match(block, /-- INFERRED \(context only, NOT quotable\)/);
  assert.match(block, /-- WHAT WE DO NOT KNOW --/);
  assert.match(block, /may NOT state anything in INFERRED as fact/);
  assert.match(block, /may not turn a gap into a claim/);
});

test('with no evidence the block tells the model to refuse rather than invent', () => {
  const block = evidenceBlock({ id: 7, domain: 'x.com' });
  assert.match(block, /EVIDENCE: NONE/);
  assert.match(block, /Do not invent an observation/);
  assert.match(block, /Say so plainly instead of manufacturing a reason to write/);
});

test('evidenceSummary carries the pieces Vet and Pick need', () => {
  const s = evidenceSummary(PROSPECT);
  assert.equal(s.manual.length, 1);
  assert.ok(s.verified.length >= 2);
  assert.equal(s.strength.level, 'strong');
  assert.equal(s.intelFresh, true);
  assert.ok(Array.isArray(s.gaps));
});

test('malformed own_findings does not take the whole record down', () => {
  const bad = { ...PROSPECT, own_findings: '{not json' };
  const ev = collectEvidence(bad);
  assert.ok(Array.isArray(ev));
  assert.equal(groupEvidence(ev).manual.length, 0);
});

test('verified evidence cannot be written by a client', async () => {
  // Load-bearing for everything above: if a PUT could set site_intel, anything
  // could be laundered into "a browser measured this" and the tier labels
  // would mean nothing.
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../app/api/prospects/[id]/route.js', import.meta.url), 'utf8');
  const list = src.slice(src.indexOf('const ALLOWED_FIELDS = ['), src.indexOf('];', src.indexOf('const ALLOWED_FIELDS = [')));
  for (const field of ['site_intel', 'site_intel_at', 'site_intel_source']) {
    assert.ok(!list.includes(`'${field}'`), `${field} must not be client-writable`);
  }
  // Her own findings ARE hers to write, and are labelled as hers.
  assert.ok(list.includes("'own_findings'"));
});

test('fresh is not the same as enough: a cosmetic-only probe is THIN', () => {
  // The edge that matters. A probe that ran an hour ago and found a stale
  // copyright line is perfectly fresh, and still gives nobody a reason to
  // write. Treating freshness as sufficiency is how a Vet declines to spend
  // twenty credits and then hands over an empty prospect as researched.
  const p = {
    id: 30, domain: 'x.com',
    site_intel: JSON.stringify(buildSiteIntel({
      worth: false, score: 3,
      reasons: ['Footer still says 2019', 'No meta description'],
      keys: ['stale-copyright', 'no-meta-description'],
      facts: { platform: 'Wix' },
    }, { at: new Date().toISOString() })),
  };
  const s = evidenceStrength(collectEvidence(p));
  assert.equal(s.level, 'thin');
  assert.equal(s.cosmeticOnly, true);
  assert.equal(s.strong, 0, 'nothing material');
  assert.equal(s.solid, 2, 'but two things really were verified');
  assert.equal(s.canPersonalise, false, 'not enough to write a specific email');
  assert.equal(s.worthVerifying, true, 'more research could still change the answer');
});

test('one material finding among cosmetics is enough', () => {
  const p = {
    id: 31, domain: 'x.com',
    site_intel: JSON.stringify(buildSiteIntel({
      worth: true, score: 9,
      reasons: ['Footer still says 2019', 'The contact form does not submit'],
      keys: ['stale-copyright', 'form-broken'],
      facts: {},
    }, { at: new Date().toISOString() })),
  };
  const s = evidenceStrength(collectEvidence(p));
  assert.equal(s.level, 'sufficient');
  assert.equal(s.cosmeticOnly, false);
  assert.equal(s.canPersonalise, true);
  assert.equal(s.worthVerifying, false);
});

test("Ary's findings always count as material, whatever she wrote", () => {
  // She was looking at the page. She does not write down things she thinks
  // are trivial, and no keyword list should second-guess her.
  const p = { id: 32, domain: 'x.com', own_findings: JSON.stringify([{ text: 'The footer year is wrong' }]) };
  const s = evidenceStrength(collectEvidence(p));
  assert.equal(s.level, 'sufficient');
  assert.equal(s.cosmeticOnly, false);
});

test('a blocked site is not evidence of anything to point at', () => {
  const p = {
    id: 33, domain: 'x.com',
    site_intel: JSON.stringify(buildSiteIntel({ worth: false, blocked: { reason: 'parked' } }, { at: new Date().toISOString() })),
  };
  const s = evidenceStrength(collectEvidence(p));
  assert.equal(s.level, 'none');
  assert.equal(s.canPersonalise, false);
});

test('the prompt block says plainly when everything found is cosmetic', () => {
  const p = {
    id: 34, domain: 'x.com',
    site_intel: JSON.stringify(buildSiteIntel({
      worth: false, score: 3, reasons: ['Footer still says 2019'], keys: ['stale-copyright'], facts: {},
    }, { at: new Date().toISOString() })),
  };
  const block = evidenceBlock(p);
  assert.match(block, /EVIDENCE: THIN/);
  assert.match(block, /Everything verified here is cosmetic/);
  assert.match(block, /none of it is a reason to write/);
});
