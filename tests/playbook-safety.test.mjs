import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPlaybook, PLAYBOOK, PLAYBOOKS } from '../lib/playbooks.mjs';
import { pdfDecision, videoDecision, PDF, VIDEO, WHY } from '../lib/assets.mjs';
import { canPrepare } from '../lib/outreach.mjs';

// The lessons that cost something to learn.
//
// Every case below came from a real prospect replying to explain why we were
// wrong, or from a video that should never have been recorded. They are the
// most valuable rules in the product and the easiest to lose in a refactor,
// because each one is a place where the obvious inference is the wrong one.
//
// The shape of the mistake is always the same: absence read as fault, or a
// cosmetic fact read as a commercial problem.

const NOW = new Date('2026-08-09T12:00:00Z');
const GREEN = String.fromCodePoint(0x1F49A);

const prospect = (keys, over = {}) => ({
  id: 1, name: 'Kym', business_name: 'Coastal', email: 'kym@coastal.com.au',
  domain: 'coastal.com.au', country: 'AU', stage: 'Validated', rating: GREEN,
  site_intel: JSON.stringify({
    checkedAt: '2026-08-08T00:00:00Z', pagesChecked: 5, readFacts: true, blocked: null,
    keys, reasons: keys.map((k) => `finding: ${k}`),
  }),
  ...over,
});

test('no booking calendar is not booking friction', () => {
  // The single most-corrected claim. Plenty of good businesses take bookings
  // by phone on purpose, and telling one their setup is broken gets a reply
  // explaining that it is deliberate.
  const r = selectPlaybook(prospect(['no-booking']), { now: NOW });
  assert.notEqual(r.playbook.id, PLAYBOOK.BOOKING_FRICTION);
});

test('manual scheduling plus a cosmetic finding is still not an angle', () => {
  // The tempting combination: "no calendar AND a stale footer, surely that is
  // two things". It is one deliberate choice and one triviality.
  const r = selectPlaybook(prospect(['no-booking', 'stale-copyright']), { now: NOW });
  assert.equal(r.playbook.id, PLAYBOOK.NONE);
});

test('an existing booking tool is not itself a problem', () => {
  // Calendly, Acuity, Square and Vagaro are answers, not faults. Nothing here
  // may produce an angle from their mere presence.
  const withTool = prospect([], {
    site_intel: JSON.stringify({
      checkedAt: '2026-08-08T00:00:00Z', pagesChecked: 5, readFacts: true, blocked: null,
      keys: [], reasons: [], platform: 'Squarespace', hasBooking: true,
    }),
  });
  const r = selectPlaybook(withTool, { now: NOW });
  assert.equal(r.playbook.id, PLAYBOOK.NONE, 'having a booking tool is not a reason to contact somebody');
});

test('a booking tool that is verifiably broken IS an angle', () => {
  // The other half of the same rule. A calendar that does not load, or two
  // schedulers fighting, is a real observable problem.
  for (const key of ['calendar-not-loading', 'two-schedulers', 'booking-is-a-form']) {
    const r = selectPlaybook(prospect([key]), { now: NOW });
    assert.equal(r.playbook.id, PLAYBOOK.BOOKING_FRICTION, key);
  }
});

test('cosmetic findings never become a commercial problem', () => {
  // A stale footer year and a missing meta description are real and true and
  // worth nobody's attention. Three of them are still worth nobody's
  // attention.
  const r = canPrepare(prospect(['stale-copyright', 'no-meta-description', 'expired-date']), { now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.reason, /cosmetic/i);
});

test('a site nobody could read never becomes a strong opportunity', () => {
  // The failure that produced a ninety-second video about a blank page. An
  // unreadable site means we know nothing, and knowing nothing is not the same
  // as finding everything wrong.
  const blocked = prospect([], {
    site_intel: JSON.stringify({
      checkedAt: '2026-08-08T00:00:00Z', keys: [], reasons: [],
      blocked: { reason: 'empty', status: 200 },
    }),
  });
  const r = canPrepare(blocked, { now: NOW });
  assert.equal(r.ok, false);
  assert.equal(videoDecision(blocked, { now: NOW }).decision, VIDEO.NONE);
});

test('absence of evidence never becomes evidence of absence', () => {
  // A prospect nobody has checked has no findings. That must read as "we have
  // not looked", never as "they have nothing".
  const unchecked = { id: 5, email: 'a@b.com', domain: 'b.com', stage: 'Validated', rating: GREEN };
  const r = canPrepare(unchecked, { now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.reason, /nothing has been verified/i);
  assert.equal(selectPlaybook(unchecked, { now: NOW }).playbook.id, PLAYBOOK.NONE);
});

test('a tool being present proves nothing about how they use it', () => {
  // "They have a form, so they must be following up badly" is an assumption
  // wearing a finding's clothes. No playbook may require it.
  const followUpish = PLAYBOOKS.filter((p) => /follow/i.test(p.label || ''));
  for (const pb of followUpish) {
    assert.ok(pb.keys === null || pb.keys.length, `${pb.id} must name the evidence it needs`);
  }
  // And nothing in the catalogue may claim a behaviour we cannot observe.
  for (const pb of PLAYBOOKS) {
    assert.ok(pb.requires, `${pb.id} must state what it requires`);
  }
});

test('every playbook names evidence it can actually get', () => {
  // A playbook whose required keys the probe never emits is a playbook that
  // silently never fires, which is how an angle quietly disappears.
  const EMITTED = new Set([
    'form-broken', 'captcha-broken', 'mailto-form', 'no-contact', 'contact-page-no-form',
    'lead-magnet-open', 'quote-form-thin', 'booking-is-a-form', 'no-booking',
    'calendar-not-loading', 'two-schedulers', 'dead-links', 'nav-dead-link', 'dead-link-one',
    'broken-images', 'dead-image-host', 'dead-feed', 'mobile-overflow', 'phone-mismatch',
    'insecure', 'mixed-content', 'long-form', 'ctas-collapse', 'stale-copyright',
    'expired-date', 'default-title', 'no-title', 'no-meta-description', 'stale-stack',
    'no-hours', 'no-reviews', 'viewport', 'noindex', 'slow', 'placeholder-text', 'social-stub',
  ]);
  for (const pb of PLAYBOOKS) {
    for (const k of pb.keys || []) {
      assert.ok(EMITTED.has(k), `${pb.id} requires "${k}", which nothing produces`);
    }
  }
});

test('the strongest evidence wins, not the most dramatic problem', () => {
  // Given a broken form and a broken link, the form is the one that costs them
  // an enquiry. Order in the catalogue encodes that, so it is pinned.
  const r = selectPlaybook(prospect(['dead-links', 'form-broken']), { now: NOW });
  assert.equal(r.playbook.id, PLAYBOOK.LEAD_CAPTURE_GAP);
});

test('a manual finding beats the machine on the same prospect', () => {
  const p = prospect(['form-broken'], {
    own_findings: JSON.stringify([{ text: 'The booking confirmation email never arrives', at: '2026-08-07' }]),
  });
  const r = selectPlaybook(p, { now: NOW });
  assert.equal(r.playbook.id, PLAYBOOK.OWN_FINDING);
  assert.match(r.why, /confirmation email/);
});

test('assets follow the same restraint as the angle', () => {
  // Cosmetic-only evidence must not buy a PDF either.
  const d = pdfDecision(prospect(['stale-copyright', 'no-meta-description']), { now: NOW, playbookId: PLAYBOOK.NONE });
  assert.equal(d.decision, PDF.NO);
  assert.equal(d.why, WHY.NO_VERIFIED_ANGLE);
});
