// An observed design condition is not a business outcome.
//
// The copy that reached a prepared package offered "a short rundown of where
// the enquiry path breaks" to a therapist whose contact page lists an email
// address and a phone number. Nothing was measured breaking. The evidence says
// there is no form; it does not say anybody failed to reach her.
//
// The rule that should have caught it only knew the words "losing" and
// "missing", so it caught "you are losing leads" and let "where the enquiry
// path breaks" straight through. The difference between those two sentences is
// vocabulary, not meaning, so the rules here are about the move.
//
// The phrase was not invented by the model. It was in the playbook CTA, which
// is why the CTA is tested too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { outcomeClaims, BREAKAGE_KEYS } from '../lib/outcome-claims.mjs';
import { PLAYBOOKS } from '../lib/playbooks.mjs';
import { parseFollowup, validateFollowup } from '../lib/followup-v2.mjs';

// Cynthia's evidence: a structural absence, nothing broken.
const STRUCTURAL = ['contact-page-no-form'];

// ── the two sentences that shipped ───────────────────────────────────────

test('"where the enquiry path breaks" is not supported by a missing form', () => {
  const body = 'I can send a short rundown of where the enquiry path breaks and what I would change.';
  assert.ok(outcomeClaims(body, STRUCTURAL).length > 0, 'should be caught');
});

test('"where enquiries might be getting stuck" is not supported either', () => {
  const body = 'Still happy to send that rundown of where enquiries might be getting stuck on your contact page.';
  assert.ok(outcomeClaims(body, STRUCTURAL).length > 0, 'should be caught');
});

test('the other shapes of the same move are caught', () => {
  const shapes = [
    'Leads get lost before they reach you.',
    'People give up before they get in touch.',
    'Visitors abandon the page without contacting you.',
    'That is costing you clients every month.',
    'Enquiries fall through between the page and your inbox.',
    'Your contact attempts fail silently.',
    'Conversions suffer when there is no form.',
    'You are missing enquiries because of it.',
    'The contact flow is broken.',
  ];
  for (const s of shapes) {
    assert.ok(outcomeClaims(s, STRUCTURAL).length > 0, s);
  }
});

// ── what must still be sayable ───────────────────────────────────────────

test('describing the structure is allowed', () => {
  const ok = [
    'I checked your contact page and noticed there is no form on it.',
    'It looks like email and phone are the ways to reach you there.',
    'One thing I could not tell from the outside is whether that works fine for you.',
    'If you already have something that works, this does not apply.',
  ];
  for (const s of ok) assert.deepEqual(outcomeClaims(s, STRUCTURAL), [], s);
});

test('offering an improvement is allowed', () => {
  const ok = [
    'I can send a short rundown of how I would make the contact path easier.',
    'I can send a short rundown of what I would change on that contact page.',
    'I could send a quick outline of how to make contacting you more direct.',
    'Happy to send two or three changes that would make that page clearer.',
  ];
  for (const s of ok) assert.deepEqual(outcomeClaims(s, STRUCTURAL), [], s);
});

// ── a verified breakage licenses the outcome ─────────────────────────────

test('a form that does not submit may be described as broken', () => {
  const body = 'Your contact form does not submit, so enquiries sent through it get lost.';
  assert.ok(outcomeClaims(body, STRUCTURAL).length > 0, 'not licensed by a missing form');
  assert.deepEqual(outcomeClaims(body, ['form-broken']), [], 'licensed by a verified breakage');
});

test('every breakage key licenses it, and no structural key does', () => {
  const body = 'People cannot reach you through it.';
  for (const key of BREAKAGE_KEYS) {
    assert.deepEqual(outcomeClaims(body, [key]), [], key);
  }
  for (const key of ['contact-page-no-form', 'no-hours', 'no-reviews', 'no-meta-description', 'booking-is-a-form']) {
    assert.ok(outcomeClaims(body, [key]).length > 0, key);
  }
});

// ── the CTA that produced the sentence ───────────────────────────────────

test('no playbook CTA asks for an outcome claim', () => {
  // The writer said "where the enquiry path breaks" because the CTA told it to.
  //
  // Each CTA is judged against its own playbook's evidence, which is the point
  // of the licence: broken-path may say "where it breaks", because every key it
  // fires on is a verified breakage. lead-capture-gap may not, because a
  // missing form is an absence.
  const bad = PLAYBOOKS.filter((p) => outcomeClaims(p.cta || '', p.keys || []).length > 0);
  assert.deepEqual(bad.map((p) => p.id), [], 'a CTA asks for an outcome its own evidence cannot support');

  // And the licence is doing real work rather than waving everything through.
  const brokenPath = PLAYBOOKS.find((p) => p.id === 'broken-path');
  assert.ok(outcomeClaims(brokenPath.cta, []).length > 0, 'its CTA does contain outcome language');
  assert.deepEqual(outcomeClaims(brokenPath.cta, brokenPath.keys), [], 'which its own evidence licenses');
});

test('the lead-capture-gap CTA offers an improvement, not a diagnosis', () => {
  const cta = PLAYBOOKS.find((p) => p.id === 'lead-capture-gap').cta;
  assert.match(cta, /offer to send/i);
  assert.match(cta, /easier|clearer|simpler|more direct|would change/i);
  assert.doesNotMatch(cta, /break|stuck|lost|missing/i);
});

// ── through the real follow-up validator ─────────────────────────────────

const ctx = (evidenceKeys) => ({
  prospect: { name: 'Cynthia' }, step: 2, ceiling: 2, canPersonalise: true, evidenceKeys,
  firstEmail: {
    subject: 'your contact page',
    body: 'Hi Cynthia,\n\nI checked your contact page and noticed there is no form on it. '
      + 'I can send a short rundown of how I would make the contact path easier.\n\nThanks,\nAry',
  },
});

const check = (body, keys) => validateFollowup(parseFollowup(`SUBJECT: s\nBODY:\n${body}`), ctx(keys));

test('a follow-up claiming enquiries get stuck is rejected', () => {
  const body = 'Hi Cynthia,\n\nStill happy to send that rundown of where enquiries might be getting stuck '
    + 'on your contact page, since there is no form there now.\n\nThanks,\nAry';
  const v = check(body, STRUCTURAL);
  assert.equal(v.ok, false);
  assert.match(v.problems.map((p) => p.why).join(' | '), /outcome the evidence does not support/);
});

test('the neutral follow-up passes', () => {
  // Deliberately not a near-copy of Email 1: the validator also rejects a
  // follow-up that is mostly the first email again, and it is right to.
  const body = 'Hi Cynthia,\n\nThat offer still stands whenever you want it. Two or three things '
    + 'on the page could be simpler, and I am happy to write them down for you.\n\nThanks,\nAry';
  const v = check(body, STRUCTURAL);
  assert.equal(v.ok, true, v.problems.map((p) => p.why).join(' | '));
});

test('no regression: filler opener and sign-off still enforced', () => {
  const filler = 'Hi Cynthia,\n\nJust checking in about that contact page rundown I offered to send over to you.\n\nThanks,\nAry';
  assert.match(check(filler, STRUCTURAL).problems.map((p) => p.why).join(' | '), /opens on filler/);

  const good = 'Hi Cynthia,\n\nStill happy to send that short rundown of how I would make the contact path '
    + 'easier, whenever it would be useful to you.\n\nThanks,\nAry';
  assert.match(parseFollowup(`SUBJECT: s\nBODY:\n${good}`).body, /\n\s*Thanks,\s*\n\s*Ary\s*$/);
});
