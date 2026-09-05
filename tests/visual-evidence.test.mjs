// "The code says it exists" is not "a visitor can see it".
//
// The audit measures a rendered page and can say, truthfully, that no element
// above the fold has call-to-action-shaped text. It then said "there is nothing
// up there to click", which is a claim about what somebody sees. findings.mjs
// records the bill: "three separate videos told owners there was nothing up
// there to click while a Book button sat on screen."
//
// These hold the line between the two.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

import {
  EVIDENCE, CLAIM, REQUIRES, VIEWPORT, VISUAL_FRESH_DAYS,
  claimFor, validateClaim, partitionClaims, supportedReasons, soundsMobile,
} from '../lib/visual-evidence.mjs';

const NOW = new Date('2026-08-11T12:00:00Z');
const ago = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();

// A screenshot that has been looked at, and whose verdict backs the claim.
// `supportsKeys` is the difference between "we have a picture" and "the picture
// shows what we are about to say", which is the whole point.
const shot = (over = {}) => ({
  tier: EVIDENCE.VISUAL,
  url: 'https://example.com/contact',
  viewport: VIEWPORT.DESKTOP,
  capturedAt: ago(1),
  blocked: false,
  supportsKeys: ['cta', 'mobile-overflow'],
  ...over,
});

const claim = (over = {}) => ({
  key: 'cta',
  text: 'The booking button is buried below three sections.',
  url: 'https://example.com/contact',
  ...over,
});

const ok = (c, e) => validateClaim(c, e, { now: NOW });

// ── 1, 2. What may not prove a visual claim ──────────────────────────────

test('source evidence cannot support a claim about what a visitor sees', () => {
  const v = ok(claim(), [{ tier: EVIDENCE.TECHNICAL, url: 'https://example.com/contact' }]);
  assert.equal(v.ok, false);
  assert.equal(v.category, CLAIM.VISUAL_UX);
  assert.equal(v.required, EVIDENCE.VISUAL);
  assert.match(v.reason, /needs a picture/);
});

test('a rendered measurement is still not a picture', () => {
  // This is the exact shape of the bug: the browser ran, the geometry was
  // measured, and the conclusion was about prominence.
  const v = ok(claim(), [{ tier: EVIDENCE.RENDERED, url: 'https://example.com/contact', capturedAt: ago(0) }]);
  assert.equal(v.ok, false);
  assert.match(v.reason, /needs a picture/);
});

// ── 3, 4. What does ───────────────────────────────────────────────────────

test('a screenshot of the right page supports it', () => {
  const v = ok(claim(), [shot()]);
  assert.equal(v.ok, true);
  assert.equal(v.evidence.length, 1);
});

test('a screenshot of a different page does not', () => {
  const v = ok(claim({ url: 'https://example.com/contact' }), [shot({ url: 'https://example.com/' })]);
  assert.equal(v.ok, false);
  assert.match(v.reason, /different page/);
});

test('a query string and a trailing slash are the same page', () => {
  assert.equal(ok(claim({ url: 'https://example.com/contact/' }), [shot({ url: 'https://example.com/contact?utm=x' })]).ok, true);
  assert.equal(ok(claim({ url: 'https://example.com/contact' }), [shot({ url: 'https://EXAMPLE.com/contact' })]).ok, true);
});

// ── 5. Mobile ─────────────────────────────────────────────────────────────

test('a claim about the phone needs the page captured on a phone', () => {
  const mobile = claim({ key: 'mobile-overflow', text: 'On a phone the booking button is pushed off the screen.' });
  assert.equal(ok(mobile, [shot({ viewport: VIEWPORT.DESKTOP })]).ok, false);
  assert.equal(ok(mobile, [shot({ viewport: VIEWPORT.MOBILE })]).ok, true);
});

test('the words decide too, not only the key', () => {
  assert.equal(soundsMobile('hard to tap on mobile'), true);
  assert.equal(soundsMobile('the form is long'), false);
  // A desktop-keyed claim that talks about phones is a phone claim.
  const worded = claim({ key: 'cta', text: 'On a phone the button is hard to tap.' });
  assert.equal(ok(worded, [shot({ viewport: VIEWPORT.DESKTOP })]).ok, false);
  assert.equal(ok(worded, [shot({ viewport: VIEWPORT.MOBILE })]).ok, true);
});

// ── 6, 7. Blocked pages and stale pictures ───────────────────────────────

test('a page that showed a challenge proves nothing about its appearance', () => {
  const v = ok(claim(), [shot({ blocked: true })]);
  assert.equal(v.ok, false);
  assert.match(v.reason, /blocked or showed a challenge/);
});

test('a picture too old to trust cannot carry fresh outreach', () => {
  assert.equal(ok(claim(), [shot({ capturedAt: ago(VISUAL_FRESH_DAYS + 1) })]).ok, false);
  assert.equal(ok(claim(), [shot({ capturedAt: ago(VISUAL_FRESH_DAYS - 1) })]).ok, true);
});

test('a claim that does not say which page it is about is not a claim', () => {
  const v = ok(claim({ url: null }), [shot()]);
  assert.equal(v.ok, false);
  assert.match(v.reason, /which page/);
});

// ── A picture is necessary and not sufficient ────────────────────────────

test('a screenshot nobody checked cannot support a claim', () => {
  const v = ok(claim(), [shot({ supportsKeys: undefined })]);
  assert.equal(v.ok, false);
  assert.match(v.reason, /has not been checked/);
});

test('a screenshot that was checked and does not show it says so', () => {
  // This is the exact failure the geometry heuristic produced: the rule said
  // there was nothing above the fold to click, and a Book button was on screen.
  const v = ok(claim(), [shot({ supportsKeys: [] })]);
  assert.equal(v.ok, false);
  assert.match(v.reason, /does not show what the claim says/);
});

test('a verdict about one claim does not carry another', () => {
  const other = claim({ key: 'ctas-collapse', text: 'Two actions compete.' });
  assert.equal(ok(other, [shot({ supportsKeys: ['cta'] })]).ok, false);
  assert.equal(ok(other, [shot({ supportsKeys: ['ctas-collapse'] })]).ok, true);
});

// ── 8. Technical claims are unaffected ───────────────────────────────────

test('a technical claim still works with no picture at all', () => {
  const tech = claim({ key: 'insecure', text: 'The site is served over http.', url: 'https://example.com/' });
  const v = ok(tech, [{ tier: EVIDENCE.TECHNICAL, url: 'https://example.com/' }]);
  assert.equal(v.ok, true);
  assert.equal(v.category, CLAIM.TECHNICAL_FACT);
});

test('a rendered claim needs the browser but not the camera', () => {
  const r = claim({ key: 'calendar-not-loading', text: 'The booking calendar never loads.', url: 'https://example.com/book' });
  assert.equal(ok(r, [{ tier: EVIDENCE.TECHNICAL, url: 'https://example.com/book' }]).ok, false);
  assert.equal(ok(r, [{ tier: EVIDENCE.RENDERED, url: 'https://example.com/book' }]).ok, true);
});

// ── The key map ───────────────────────────────────────────────────────────

test('every finding key the probe can emit has been decided about', () => {
  // These are the keys findings.mjs actually emits.
  const keys = ['ancient-markup', 'bad-email', 'booking', 'booking-behind-login', 'booking-unknown',
    'broken-images', 'calendar-not-loading', 'console-errors', 'contact-page-email-only',
    'contact-page-no-form', 'cta', 'ctas-collapse', 'dead-image-host', 'dead-link-one', 'dead-links',
    'default-title', 'expired-date', 'followup-tool', 'form', 'form-email-only', 'form-offpage',
    'form-on-contact-page', 'insecure', 'lead-magnet-open', 'long-form', 'mailto-form',
    'map-not-loading', 'mixed-content', 'mobile-overflow', 'nav-dead-link', 'no-address', 'no-contact',
    'no-h1', 'no-hours', 'no-link-preview', 'no-local-schema', 'no-meta-description', 'no-reply-promise',
    'no-reviews', 'no-title', 'noindex', 'on-ghl', 'phone', 'phone-mismatch', 'phone-not-tappable',
    'phone-only', 'placeholder-text', 'slow', 'sluggish', 'social-feed-dead', 'social-stub',
    'stale-copyright', 'stale-stack', 'two-schedulers', 'viewport'];
  for (const k of keys) {
    assert.ok(Object.values(CLAIM).includes(claimFor(k)), `${k} has no claim category`);
  }
});

test('an unknown key is treated as visual, which is the strict reading', () => {
  // A check added to the render service must not become an outreach claim
  // before somebody decides what proves it.
  assert.equal(claimFor('some-new-check-nobody-classified'), CLAIM.VISUAL_UX);
  assert.equal(REQUIRES[claimFor('some-new-check-nobody-classified')], EVIDENCE.VISUAL);
});

test('the CTA claim is the one that has actually misfired, and it is visual', () => {
  assert.equal(claimFor('cta'), CLAIM.VISUAL_UX);
  assert.equal(claimFor('mobile-overflow'), CLAIM.MOBILE_VISUAL_UX);
});

// ── 11, 12. What the writer gets ─────────────────────────────────────────

test('claims are split into what may be said and what may not, with reasons', () => {
  const claims = [
    claim({ key: 'insecure', text: 'Served over http.', url: 'https://example.com/' }),
    claim({ key: 'cta', text: 'The booking button is buried.', url: 'https://example.com/' }),
  ];
  const { allowed, rejected } = partitionClaims(claims, [{ tier: EVIDENCE.TECHNICAL, url: 'https://example.com/' }], { now: NOW });

  assert.equal(allowed.length, 1);
  assert.equal(allowed[0].key, 'insecure');
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].key, 'cta');
  assert.ok(rejected[0].why, 'a rejection says why, so it can be reported rather than vanishing');
});

test('a prospect can still be Strong on technical grounds alone', () => {
  const claims = [
    claim({ key: 'lead-magnet-open', text: 'The guide downloads with no email capture.', url: 'https://example.com/guide' }),
    claim({ key: 'cta', text: 'The page feels cluttered.', url: 'https://example.com/' }),
  ];
  const kept = supportedReasons(claims, [{ tier: EVIDENCE.TECHNICAL, url: 'https://example.com/guide' }], { now: NOW });
  assert.equal(kept.length, 1);
  assert.equal(kept[0].key, 'lead-magnet-open');
});

test('nothing here can send, queue or write', () => {
  const src = readFileSync(new URL('../lib/visual-evidence.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['fetch(', 'INSERT INTO', 'UPDATE ', 'sendApproved', 'enqueue(']) {
    assert.ok(!src.includes(forbidden), `the evidence rule must never ${forbidden}`);
  }
});
