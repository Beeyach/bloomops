import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deadAddressCheck, platformVerdict, schedulingStance, tieBreaker,
  PARKING_MARKERS, UNVERIFIED_ABSENCE_RULES,
} from '../lib/qualify.mjs';

// Rules recovered from the website-audit skill. The app knew none of them:
// they lived only in a prompt a model read at audit time, so the tracker could
// reach a different conclusion about the same prospect and nothing noticed.

test('a parked domain is DEAD, not a strong prospect', () => {
  // The reason this runs before scoring, written in the skill in blood: a
  // blank page has no form, no booking, no CTA and no contact details, so it
  // scores as the most gap-ridden site in the batch. milesstovall.com got a
  // ninety-second video narrating an empty page that way.
  for (const marker of ['sedoparking', 'parkingcrew', 'this domain is for sale', 'hugedomains']) {
    const r = deadAddressCheck({ html: `<html><body>${marker}</body></html>` });
    assert.equal(r.dead, true, marker);
    assert.ok(r.reason.length > 0);
  }
});

test('a registrar default page is DEAD', () => {
  assert.equal(deadAddressCheck({ html: '<h1>Coming soon</h1>' }).dead, true);
  assert.equal(deadAddressCheck({ html: '<title>Welcome to nginx!</title>' }).dead, true);
});

test('an unreachable or erroring address is DEAD', () => {
  assert.equal(deadAddressCheck({ resolved: false }).dead, true);
  assert.equal(deadAddressCheck({ status: 404, html: '<p>gone</p>' }).dead, true);
  assert.equal(deadAddressCheck({ status: 503 }).dead, true);
});

test('a real site with a nav is not DEAD', () => {
  const html = '<html><nav>Home Services Contact</nav><body>' + 'We are a massage clinic in Wellington. '.repeat(20) + '</body></html>';
  assert.equal(deadAddressCheck({ html, status: 200 }).dead, false);
});

test('a full practice-management platform leans skip', () => {
  for (const p of ['SimplePractice', 'Dentrix', 'ChiroTouch', 'Boulevard']) {
    assert.equal(platformVerdict(p).verdict, 'covered', p);
  }
});

test('a booking tool is never a skip, it moves the angle', () => {
  for (const p of ['Calendly', 'Acuity', 'Square Appointments', 'Vagaro']) {
    const v = platformVerdict(p);
    assert.equal(v.verdict, 'build-around', p);
    assert.match(v.reason, /Never pitch against the tool/);
  }
});

test('GoHighLevel is inspected, never skipped on sight', () => {
  const v = platformVerdict('GoHighLevel');
  assert.equal(v.verdict, 'inspect');
  assert.match(v.reason, /already bought the platform/);
});

test('a site builder says nothing about fit either way', () => {
  assert.equal(platformVerdict('Squarespace').verdict, 'neutral');
  assert.equal(platformVerdict('').verdict, 'unknown');
});

test('a request-an-appointment site is a choice, not a gap', () => {
  // The rule that contradicted what the app was doing. Some practitioners skip
  // online booking deliberately, to screen people before committing time.
  const s = schedulingStance({ hasBooking: false, hasForm: true });
  assert.equal(s.stance, 'manual-by-choice');
  assert.equal(s.deliberate, true);
  assert.match(s.angle, /Not "you are missing booking"/);
});

test('screening language marks it deliberate even with no form', () => {
  const s = schedulingStance({ hasBooking: false, html: 'Please request an appointment and we will be in touch' });
  assert.equal(s.deliberate, true);
});

test('unknown booking state is not reported as missing', () => {
  assert.equal(schedulingStance({}).stance, 'unknown');
  assert.equal(schedulingStance({ hasBooking: true }).stance, 'has-booking');
});

test('the tie-breaker needs both halves', () => {
  assert.equal(tieBreaker({ canPay: true, verifiableGap: true }).verdict, 'STRONG');
  assert.equal(tieBreaker({ canPay: true, verifiableGap: false }).verdict, 'SKIP');
  assert.equal(tieBreaker({ canPay: false, verifiableGap: true }).verdict, 'SKIP');
  assert.match(tieBreaker({ canPay: true, verifiableGap: false }).why, /Reaching to justify it is a skip/);
});

test('the unverified-absence rules name the specific sentences that caused pushback', () => {
  assert.match(UNVERIFIED_ABSENCE_RULES, /NEVER a finding/);
  assert.match(UNVERIFIED_ABSENCE_RULES, /already-handled out/);
  assert.match(UNVERIFIED_ABSENCE_RULES, /No invented visitor moments/);
  assert.match(UNVERIFIED_ABSENCE_RULES, /may not smuggle the accusation/);
});

test('the parking marker list is not empty and is lowercase', () => {
  assert.ok(PARKING_MARKERS.length >= 8);
  for (const m of PARKING_MARKERS) assert.equal(m, m.toLowerCase(), 'matching is done lowercased');
});
