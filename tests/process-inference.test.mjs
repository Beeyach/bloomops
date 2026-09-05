// A form on a page is not a description of how somebody answers their email.
//
// Package 20 was prepared from one verified fact — the consultation buttons on
// aztherapyquest.com lead to /contact/ rather than to a calendar — and wrote:
//
//   "it means each booking needs a reply back and forth before a time is set"
//   "get people onto a set time faster, no back and forth needed"
//
// Nothing failed in either sentence, so the existing outcome rule (which is
// about failure) let both through. They are claims about what happens after
// somebody submits the form: who replies, how many rounds, how long it feels.
// A browser standing outside the building cannot see any of it. She may phone
// every enquiry back within the hour.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  outcomeClaims, PROCESS_INFERENCE, BENEFIT_INFERENCE, SPEED_KEYS, BREAKAGE_KEYS,
} from '../lib/outcome-claims.mjs';

// The keys that actually supported package 20.
const KEYS = ['booking-is-a-form', 'ctas-collapse', 'no-reviews'];
const caught = (s, keys = KEYS) => outcomeClaims(s, keys).length > 0;

// 1
test('a request form instead of a calendar does not license "back and forth"', () => {
  assert.ok(caught('it means each booking needs a reply back and forth before a time is set'));
  assert.ok(caught('requires back and forth'));
  assert.ok(caught('no back and forth needed'));
  // And the same claim in different words, which a phrase list would miss.
  assert.ok(caught('someone has to write back before a time is set'));
  assert.ok(caught('each request waits for a reply'));
  assert.ok(caught('you have to coordinate a time by email'));
  assert.ok(caught('they end up chasing to confirm a slot'));
});

// 2
test('it does not license "faster"', () => {
  assert.ok(caught('get people onto a set time faster'));
  assert.ok(caught('faster to land on a time'));
  assert.ok(caught('people can book faster'));
  assert.ok(caught('makes scheduling quicker'));
  assert.ok(caught('clients could book sooner'));
});

// 3
test('it does not license "saves time"', () => {
  assert.ok(caught('saves them time'));
  assert.ok(caught('saves you a lot of admin'));
  assert.ok(caught('cuts down on effort'));
  assert.ok(caught('staff spend time coordinating'));
});

// 4
test('it does not license conversion or drop-off claims', () => {
  assert.ok(caught('more bookings for you'));
  assert.ok(caught('extra enquiries'));
  // The original failure family still fires too.
  assert.ok(caught('people give up before they book'));
  assert.ok(caught('you are losing enquiries'));
});

// 5
test('"I could not tell whether that is intentional" is allowed', () => {
  assert.equal(caught('One thing I could not tell from the outside is whether that is intentional.'), false);
  assert.equal(caught('I could not tell whether that is on purpose.'), false);
});

// 6
test('a hypothetical about their preference is allowed', () => {
  assert.equal(caught('Maybe you prefer to review requests before scheduling.'), false);
  assert.equal(caught('You may want to screen who books before a time is confirmed.'), false);
});

// 7
test('the observed fact itself is allowed, stated plainly', () => {
  assert.equal(caught('The consultation buttons lead to the contact form rather than a visible calendar where someone can choose a time.'), false);
  assert.equal(caught('I looked at your booking page and the buttons go to the contact form.'), false);
  assert.equal(caught('Your contact page has no form on it.'), false);
});

// The offer must survive the rule, or the rule is useless.
test('a concrete offer about the booking path is allowed', () => {
  assert.equal(caught('If it would be useful, I can send over a short outline of how to offer direct scheduling alongside the form.'), false);
  assert.equal(caught('I can put together a short rundown of what I would change on that page.'), false);
});

// The stand-downs, both of them.
test('a verified breakage still licenses outcome language', () => {
  assert.ok(BREAKAGE_KEYS.has('form-broken'));
  assert.equal(caught('enquiries get lost', ['form-broken']), false, 'a broken form is the failure, not a guess about one');
});

test('a timing finding licenses a speed claim, and a layout finding does not', () => {
  assert.ok(SPEED_KEYS.has('slow'));
  assert.equal(caught('the page loads faster once those images are sized', ['slow']), false);
  assert.ok(caught('the page loads faster once those images are sized', ['booking-is-a-form']));
});

test('process inference is never licensed, by any finding', () => {
  // There is no key for "we watched how they answer their email", so nothing
  // stands this one down — not even a verified breakage.
  for (const keys of [['form-broken'], ['slow'], ['booking-is-a-form'], []]) {
    assert.ok(caught('there is a lot of back and forth', keys), `still caught with ${JSON.stringify(keys)}`);
  }
});

// 8 + 9
test('the writer is never handed a name it has not verified', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['../lib/outreach.mjs', '../lib/followup-v2.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    // The business name must not be a fallback for a person's name.
    assert.ok(
      !/Their name: \$\{\w+\.name \|\| \w+\.business_name/.test(src),
      `${f} must not fall back to the business name for a greeting`,
    );
    assert.match(src, /Their name: \$\{\w+\.name \|\| 'there'\}/, `${f} falls back to "there"`);
  }
});

test('a mailbox local-part is not name evidence', async () => {
  const { checkGreeting, NAME_CHECK } = await import('../lib/name-guard.mjs');
  // brianda@aztherapyquest.com, with no recorded person on the prospect.
  const r = checkGreeting({ body: 'Hi there,\n\nThe buttons go to the contact form.\n\nThanks,\nAry', expected: '' });
  assert.notEqual(r.result, NAME_CHECK.MISMATCH, 'a nameless greeting can never mismatch');
});

// 10
test('Email 2 cannot introduce a benefit Email 1 could not claim', () => {
  assert.ok(caught("Still glad to send over the two or three steps I'd cut from your booking form to get people onto a set time faster, no back and forth needed."));
  assert.equal(
    caught('Still happy to send over that short outline of how direct scheduling could sit alongside your form, if it would be useful.'),
    false,
  );
});

// 11
test('both emails end exactly with the signature', async () => {
  const { ensureSignOff } = await import('../lib/outreach.mjs');
  // It has to be told whose name signs the email. Without that it leaves the
  // body alone rather than inventing a signature — which is correct, and is
  // why calling it bare in the first version of this test proved nothing.
  const s = { operatorName: 'Ary' };
  assert.match(ensureSignOff('Hi there,\n\nSomething.\n\nThanks,\nAry', s), /Thanks,\r?\nAry\s*$/);
  assert.match(ensureSignOff('Hi there,\n\nSomething.', s), /Thanks,\r?\nAry\s*$/);
  assert.equal(ensureSignOff('Hi there,\n\nSomething.', {}), 'Hi there,\n\nSomething.');
});

// 12-15: the package contract is unchanged by any of this.
test('nothing in this rule approves, arms, or sends', () => {
  const before = JSON.stringify({ PROCESS_INFERENCE: PROCESS_INFERENCE.length, BENEFIT_INFERENCE: BENEFIT_INFERENCE.length });
  outcomeClaims('anything at all', KEYS);
  assert.equal(JSON.stringify({ PROCESS_INFERENCE: PROCESS_INFERENCE.length, BENEFIT_INFERENCE: BENEFIT_INFERENCE.length }), before);
  // It is a pure text check: no database, no package, no send.
  assert.equal(typeof outcomeClaims('x', []), 'object');
});
