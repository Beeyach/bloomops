import test from 'node:test';
import assert from 'node:assert/strict';
import { prescreen, buildVetResult, VERDICT } from '../lib/vet.mjs';
import { buildSiteIntel } from '../lib/site-intel.mjs';

// Vet Bee used to have one move: run the full browser probe on everybody, 20
// credits and a minute each. So dismissing a prospect with no website cost
// exactly as much as confirming a promising one. A gatekeeper has to be
// cheaper than the thing it guards.

const NOW = new Date('2026-08-09T12:00:00Z');
const intel = (over, at = '2026-08-08T12:00:00Z') => JSON.stringify(buildSiteIntel({
  worth: true, score: 11,
  reasons: ['Booking form returns a 500', 'Footer says 2019'],
  facts: { platform: 'WordPress', form: true, booking: false },
  ...over,
}, { at }));

// ── Stage A: the free rules that stop us paying ─────────────────────────

test('a closed stage is skipped without spending anything', () => {
  for (const stage of ['Client', 'Rejected', 'Lost', 'Finished', 'Invalid Email']) {
    const r = prescreen({ stage, domain: 'x.com' }, { now: NOW });
    assert.equal(r.verdict, VERDICT.SKIP, stage);
    assert.equal(r.needsProbe, false, `${stage} must not trigger a paid probe`);
    assert.ok(r.reasons[0].length > 0, 'a SKIP with no reason is indistinguishable from a bug');
  }
});

test('somebody who said no is not researched again', () => {
  const r = prescreen({ stage: 'Email 3', reply_type: 'decline', replied: 1, domain: 'x.com' }, { now: NOW });
  assert.equal(r.verdict, VERDICT.SKIP);
  assert.equal(r.needsProbe, false);
});

test('no website means nothing to audit, and it says how to fix that', () => {
  const r = prescreen({ stage: 'New' }, { now: NOW });
  assert.equal(r.verdict, VERDICT.SKIP);
  assert.equal(r.needsProbe, false);
  assert.match(r.fixable, /Add their domain/);
});

test('a links page is not their site', () => {
  for (const d of ['linktr.ee/kym', 'www.linktr.ee/kym', 'beacons.ai/kym', 'instagram.com/kym']) {
    const r = prescreen({ stage: 'New', domain: d }, { now: NOW });
    assert.equal(r.verdict, VERDICT.SKIP, d);
    assert.equal(r.needsProbe, false, d);
  }
});

test("Ary's own findings make a probe unnecessary", () => {
  // Buying a browser check to confirm what she already saw is paying to be
  // told something twice.
  const r = prescreen({
    stage: 'New', domain: 'x.com',
    own_findings: JSON.stringify([{ text: 'The booking button goes nowhere' }]),
  }, { now: NOW });
  assert.equal(r.verdict, VERDICT.STRONG);
  assert.equal(r.needsProbe, false);
  assert.equal(r.rule, 'manual-evidence');
});

test('fresh intel on file is reused instead of re-bought', () => {
  const r = prescreen({ stage: 'New', domain: 'x.com', site_intel: intel({}) }, { now: NOW });
  assert.equal(r.needsProbe, false);
  assert.equal(r.rule, 'fresh-intel');
  assert.equal(r.verdict, VERDICT.STRONG);
});

test('stale intel does justify paying again', () => {
  const r = prescreen({ stage: 'New', domain: 'x.com', site_intel: intel({}, '2026-05-01T12:00:00Z') }, { now: NOW });
  assert.equal(r.needsProbe, true);
  assert.match(r.reasons.join(' '), /past the 14-day window/);
});

test('a fresh check that found nothing is a MAYBE, not a STRONG', () => {
  const r = prescreen({ stage: 'New', domain: 'x.com', site_intel: intel({ worth: false, score: 0, reasons: [] }) }, { now: NOW });
  assert.equal(r.verdict, VERDICT.MAYBE);
  assert.equal(r.needsProbe, false);
});

test('a blocked site is a skip, and does not get probed again while fresh', () => {
  const blocked = JSON.stringify(buildSiteIntel(
    { worth: false, score: 0, blocked: { reason: 'parked' } },
    { at: '2026-08-08T12:00:00Z' }
  ));
  const r = prescreen({ stage: 'New', domain: 'x.com', site_intel: blocked }, { now: NOW });
  assert.equal(r.verdict, VERDICT.SKIP);
  assert.equal(r.needsProbe, false);
});

test('a reply outranks any audit, and still wants evidence gathered', () => {
  const r = prescreen({ stage: 'Email 2', domain: 'x.com', replied: 1, reply_type: 'interested' }, { now: NOW });
  assert.equal(r.verdict, VERDICT.STRONG);
  assert.equal(r.rule, 'replied');
  assert.match(r.reasons.join(' '), /better signal than any audit/);
});

// ── Stage C: the verdict ────────────────────────────────────────────────

test('the verdict is named levels with reasons, never a composite score', () => {
  const r = buildVetResult({ id: 1, stage: 'New', domain: 'x.com', site_intel: intel({}) }, { now: NOW });
  for (const k of ['fit', 'opportunity', 'evidenceQuality', 'timing']) {
    assert.ok(typeof r[k].level === 'string', `${k} is a level`);
    assert.ok(Array.isArray(r[k].reasons) && r[k].reasons.length, `${k} explains itself`);
  }
  assert.ok(['STRONG', 'MAYBE', 'SKIP'].includes(r.verdict));
  // Nothing anywhere should be a fake-precision number.
  assert.equal(typeof r.confidence, 'string');
  assert.ok(!('score' in r), 'no composite score');
});

test('it reports what it verified and what it does not know', () => {
  const r = buildVetResult({
    id: 1, stage: 'New', domain: 'x.com',
    site_intel: intel({}),
    own_findings: JSON.stringify([{ text: 'Header video is black' }]),
  }, { now: NOW });
  assert.ok(r.verified.some((v) => v.tier === 'manual'));
  assert.ok(r.verified.some((v) => v.tier === 'verified'));
  assert.ok(r.unknown.length > 0);
  assert.ok(r.next && r.next.length > 0, 'always recommends a next action');
});

test('a site checked properly with nothing wrong is a SKIP with an honest reason', () => {
  const r = buildVetResult({ id: 1, stage: 'New', domain: 'x.com', site_intel: intel({ worth: false, score: 0, reasons: [] }) }, { now: NOW });
  assert.equal(r.verdict, VERDICT.SKIP);
  assert.equal(r.opportunity.level, 'none');
  assert.match(r.next, /site is fine as far as a browser can tell/);
});

test('a request-an-appointment site is not treated as missing booking', () => {
  // This test used to assert the opposite, and the opposite was wrong. The
  // website-audit skill is explicit: plenty of practitioners skip online
  // booking deliberately, to screen people before committing time. Telling one
  // of them they are "missing booking" says immediately that nobody looked.
  // The fixture has a contact form and no calendar, which is exactly that case.
  const r = buildVetResult({ id: 1, stage: 'New', domain: 'x.com', site_intel: intel({}) }, { now: NOW });
  assert.equal(r.fit.level, 'good');
  const why = r.fit.reasons.join(' ');
  assert.match(why, /usually a choice: they screen before committing time/);
  assert.match(why, /Not "you are missing booking"/);
  assert.ok(!/the thing Bloomwired sells/.test(why), 'the old framing is gone');
});

test('a full practice-management platform reads as poor fit', () => {
  // Recovered platform skip rules. The owner already feels covered.
  const covered = intel({ facts: { platform: 'SimplePractice', form: true, booking: true } });
  const r = buildVetResult({ id: 2, stage: 'New', domain: 'x.com', site_intel: covered }, { now: NOW });
  assert.equal(r.fit.level, 'poor');
  assert.match(r.fit.reasons.join(' '), /Lean skip unless something verifiable/);
});

test('a booking tool is never a skip, it changes the angle', () => {
  const tool = intel({ facts: { platform: 'Calendly', form: true, booking: true } });
  const r = buildVetResult({ id: 3, stage: 'New', domain: 'x.com', site_intel: tool }, { now: NOW });
  assert.equal(r.fit.level, 'good');
  assert.match(r.fit.reasons.join(' '), /Never pitch against the tool/);
});

test('GoHighLevel is never skipped on sight', () => {
  const ghl = intel({ facts: { platform: 'GoHighLevel', form: true, booking: false } });
  const r = buildVetResult({ id: 4, stage: 'New', domain: 'x.com', site_intel: ghl }, { now: NOW });
  assert.match(r.fit.reasons.join(' '), /Never skip on sight/);
  assert.match(r.fit.reasons.join(' '), /they already bought the platform/);
});

test('probeNeeded is false whenever the answer is already on file', () => {
  const withIntel = buildVetResult({ id: 1, stage: 'New', domain: 'x.com', site_intel: intel({}) }, { now: NOW });
  assert.equal(withIntel.probeNeeded, false);
  const without = buildVetResult({ id: 2, stage: 'New', domain: 'x.com' }, { now: NOW });
  assert.equal(without.probeNeeded, true);
});

test('a shallow record is re-probed however recent it is', () => {
  // The conceptual edge: fresh is not the same as enough. A record that only
  // knows the homepage exists has not answered the question, whatever its date.
  const shallow = JSON.stringify(buildSiteIntel(
    { worth: false, score: 0, reasons: [], facts: {}, pagesChecked: ['/'] },
    { at: '2026-08-09T11:00:00Z' }
  ));
  const r = prescreen({ stage: 'New', domain: 'x.com', site_intel: shallow }, { now: NOW });
  assert.equal(r.needsProbe, true, 'a shallow record still needs a real look');
  assert.match(r.reasons.join(' '), /never got past the front page/);
});

test('a thorough check that found nothing is NOT re-probed', () => {
  // The other half of the same distinction: coverage decides whether to pay
  // again, not yield. We looked properly and there was nothing. That is an
  // answer, and buying it twice is the waste this whole path exists to stop.
  const thorough = JSON.stringify(buildSiteIntel(
    { worth: false, score: 0, reasons: [], facts: { platform: 'Squarespace', form: true, booking: true }, pagesChecked: ['/', '/contact', '/services'] },
    { at: '2026-08-08T12:00:00Z' }
  ));
  const r = prescreen({ stage: 'New', domain: 'x.com', site_intel: thorough }, { now: NOW });
  assert.equal(r.needsProbe, false);
  assert.equal(r.rule, 'fresh-intel');
});

test('cosmetic-only findings do not read as an opportunity', () => {
  const cosmetic = JSON.stringify(buildSiteIntel(
    {
      worth: false, score: 3,
      reasons: ['Footer still says 2019', 'No meta description'],
      keys: ['stale-copyright', 'no-meta-description'],
      facts: { platform: 'Wix', form: true, booking: true },
      pagesChecked: ['/', '/about'],
    },
    { at: '2026-08-08T12:00:00Z' }
  ));
  const r = buildVetResult({ id: 1, stage: 'New', domain: 'x.com', site_intel: cosmetic }, { now: NOW });
  assert.equal(r.opportunity.level, 'none');
  assert.match(r.opportunity.reasons.join(' '), /all cosmetic/);
  // And it is not re-probed, because the probe did its job.
  assert.equal(r.probeNeeded, false);
});
