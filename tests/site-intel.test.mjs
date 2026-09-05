import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSiteIntel, parseSiteIntel, isFresh, ageInDays, freshnessLabel,
  intelLines, FRESH_DAYS,
} from '../lib/site-intel.mjs';

// The render service probes a real site in a browser and returns facts,
// checks, keyed findings and pages visited. The app kept three columns of it
// and dropped the rest, so nothing knew when a site was last looked at and
// every bee was handed prose instead of measurements.

const PROBE = {
  worth: true,
  score: 11,
  why: '2 verified problems worth 11.',
  keys: ['broken-images', 'mobile-overflow'],
  reasons: ['4 images not loading', 'Layout runs off the screen on a phone'],
  facts: { platform: 'WordPress', title: 'Heart and Soul', form: true, booking: false, contactPage: '/contact' },
  pagesChecked: ['/', '/contact', '/services'],
};

test('the probe survives instead of being reduced to three columns', () => {
  const i = buildSiteIntel(PROBE, { source: 'precheck', at: '2026-08-09T10:00:00Z' });
  assert.equal(i.worth, true);
  assert.equal(i.score, 11);
  assert.deepEqual(i.keys, ['broken-images', 'mobile-overflow']);
  assert.equal(i.platform, 'WordPress');
  assert.equal(i.hasForm, true);
  assert.equal(i.hasBooking, false);
  assert.equal(i.contactPage, '/contact');
  assert.deepEqual(i.pagesChecked, ['/', '/contact', '/services']);
  assert.equal(i.source, 'precheck');
  assert.equal(i.checkedAt, '2026-08-09T10:00:00Z');
});

test('a blocked site is recorded as blocked, not as a clean site', () => {
  const i = buildSiteIntel(
    { worth: false, score: 0, why: 'parked', blocked: { reason: 'parked' } },
    { source: 'precheck' }
  );
  assert.equal(i.blocked.reason, 'parked');
  const lines = intelLines(i);
  assert.ok(lines[0].startsWith('SITE COULD NOT BE READ'));
  // It must not go on to describe a site it never saw.
  assert.ok(!lines.some((l) => l.includes('verified problems: none')));
});

test('a fact carries its date, and freshness is measured from it', () => {
  const now = new Date('2026-08-09T12:00:00Z');
  const fresh = buildSiteIntel(PROBE, { at: '2026-08-08T12:00:00Z' });
  const stale = buildSiteIntel(PROBE, { at: '2026-06-01T12:00:00Z' });
  assert.equal(Math.round(ageInDays(fresh, now)), 1);
  assert.ok(isFresh(fresh, { now }));
  assert.ok(!isFresh(stale, { now }));
  assert.ok(ageInDays(stale, now) > FRESH_DAYS);
});

test('nothing stored is never mistaken for a clean result', () => {
  assert.equal(parseSiteIntel(null), null);
  assert.equal(parseSiteIntel('not json'), null);
  assert.equal(ageInDays(null), null);
  assert.equal(isFresh(null), false);
  assert.equal(freshnessLabel(null), 'Never checked');
  assert.deepEqual(intelLines(null), []);
});

test('the freshness label says plainly when it is worth redoing', () => {
  const now = new Date('2026-08-09T12:00:00Z');
  assert.equal(freshnessLabel(buildSiteIntel(PROBE, { at: '2026-08-08T12:00:00Z' }), now), 'Checked yesterday');
  assert.match(freshnessLabel(buildSiteIntel(PROBE, { at: '2026-08-09T09:00:00Z' }), now), /^Checked 3h ago$/);
  assert.match(freshnessLabel(buildSiteIntel(PROBE, { at: '2026-05-01T12:00:00Z' }), now), /worth redoing$/);
});

test('the lines handed to a bee are measurements with a date, not prose', () => {
  const lines = intelLines(buildSiteIntel(PROBE, { at: '2026-08-09T10:00:00Z' }));
  const joined = lines.join('\n');
  assert.ok(joined.includes('platform: WordPress'));
  assert.ok(joined.includes('booking on site: no'));
  assert.ok(joined.includes('contact form: yes'));
  assert.ok(joined.includes('4 images not loading'));
  assert.ok(joined.includes('checked: 2026-08-09'));
});

test('a site the probe found nothing wrong with says so, rather than staying silent', () => {
  // Silence would let a bee assume there is something wrong and invent it.
  const lines = intelLines(buildSiteIntel({ worth: false, score: 0, reasons: [], facts: {} }, { at: '2026-08-09T10:00:00Z' }));
  assert.ok(lines.some((l) => l === 'verified problems: none found by the probe'));
});

test('round-trips through JSON, which is how it is stored', () => {
  const i = buildSiteIntel(PROBE, { at: '2026-08-09T10:00:00Z' });
  const back = parseSiteIntel(JSON.stringify(i));
  assert.deepEqual(back, i);
});
