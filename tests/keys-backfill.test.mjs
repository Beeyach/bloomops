import test from 'node:test';
import assert from 'node:assert/strict';
import { keyForReason, rebuildKeys, keysFromVideoReasons } from '../lib/keys-backfill.mjs';

// Rebuilding finding keys the probe computed and never sent.
//
// The repair is only allowed to be deterministic. A key invented from a
// sentence it does not really match is worse than the missing one: a missing
// key makes a prospect look unverified, and a wrong key makes them look
// verified for something nobody found, which is the thing that reaches a
// stranger in an email.

test('the exact sentences the probe writes map back to their keys', () => {
  // Every one of these is a fixed string in the render service's own table.
  assert.equal(keyForReason('Booking is a request form, not a calendar'), 'booking-is-a-form');
  assert.equal(keyForReason('No opening hours on the site'), 'no-hours');
  assert.equal(keyForReason('No description for search results'), 'no-meta-description');
  assert.equal(keyForReason('Layout runs off the screen on a phone'), 'mobile-overflow');
  assert.equal(keyForReason('Served over http, marked Not secure'), 'insecure');
  assert.equal(keyForReason('No way to book from the site'), 'no-booking');
});

test('a trailing full stop or stray whitespace does not defeat it', () => {
  assert.equal(keyForReason('  No opening hours on the site. '), 'no-hours');
});

test('templated sentences match on their stable part', () => {
  assert.equal(keyForReason('Footer still says 2023'), 'stale-copyright');
  assert.equal(keyForReason('Contact form asks for 14 things'), 'long-form');
  assert.equal(keyForReason('Browser tab still says "Home | My WordPress Site"'), 'default-title');
  assert.equal(keyForReason('Took 6.2 seconds to load'), 'slow');
});

test('anything it does not recognise returns nothing at all', () => {
  // The rule that makes the repair safe.
  assert.equal(keyForReason('Their pricing feels a bit high for the area'), null);
  assert.equal(keyForReason('Something about a form somewhere'), null);
  assert.equal(keyForReason(''), null);
  assert.equal(keyForReason(null), null);
});

test('a sentence merely mentioning a form is not a form finding', () => {
  // The patterns are anchored for exactly this reason.
  assert.equal(keyForReason('I could not tell what happens after the contact form is submitted'), null);
});

// ── Rebuilding a stored blob ─────────────────────────────────────────────

const intel = (over = {}) => JSON.stringify({
  worth: false, score: 6, reasons: [], keys: [], blocked: null,
  pagesChecked: 5, checkedAt: '2026-08-09T12:00:00Z', ...over,
});

test('a real damaged row is repaired from its own sentences', () => {
  // Exactly what production held for prospect 1134.
  const r = rebuildKeys(intel({ reasons: ['No opening hours on the site', 'Booking is a request form, not a calendar'] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.keys, ['no-hours', 'booking-is-a-form']);
  assert.equal(r.partial, false);
  assert.match(r.intel, /keysBackfilledAt/);
});

test('a row that already has keys is left alone', () => {
  const r = rebuildKeys(intel({ reasons: ['No opening hours on the site'], keys: ['no-hours'] }));
  assert.equal(r.ok, false);
  assert.equal(r.why, 'already-has-keys');
});

test('a clean site with no findings is not damage', () => {
  const r = rebuildKeys(intel({ reasons: [] }));
  assert.equal(r.ok, false);
  assert.equal(r.why, 'no-findings');
});

test('a partly recognisable row is repaired for what matched and flags the rest', () => {
  // Partial truth beats none, and the unmatched part is reported rather than
  // buried.
  const r = rebuildKeys(intel({ reasons: ['No opening hours on the site', 'Something nobody has a pattern for'] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.keys, ['no-hours']);
  assert.equal(r.partial, true);
  assert.equal(r.unmatched.length, 1);
});

test('a row where nothing is recognised writes nothing', () => {
  const r = rebuildKeys(intel({ reasons: ['A thing', 'Another thing'] }));
  assert.equal(r.ok, false);
  assert.equal(r.why, 'nothing-recognised');
  assert.equal(r.unmatched.length, 2);
});

test('unreadable stored data is refused rather than guessed at', () => {
  assert.equal(rebuildKeys('{not json').ok, false);
  assert.equal(rebuildKeys(null).ok, false);
});

test('the older video_reasons column reconstructs the same way', () => {
  const r = keysFromVideoReasons(JSON.stringify(['Booking is a request form, not a calendar', 'Footer still says 2023', 'mystery']));
  assert.deepEqual(r.keys, ['booking-is-a-form', 'stale-copyright']);
  assert.equal(r.unmatched.length, 1);
});

test('duplicate sentences produce one key', () => {
  const r = rebuildKeys(intel({ reasons: ['No opening hours on the site', 'No opening hours on the site'] }));
  assert.deepEqual(r.keys, ['no-hours']);
});
