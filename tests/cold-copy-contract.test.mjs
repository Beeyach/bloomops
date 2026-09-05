// Two things a cold email may never do, tested on the drafts that did them.
//
// Both reached a prepared package for a real prospect and were caught by a
// person reading the copy, not by the suite. Every rule that should have caught
// them was one synonym short:
//
//   • the peer-behaviour rules all keyed on a loss verb (lose, miss, forget,
//     wait), and the draft said "for a therapy practice that first contact
//     often happens late at night", which loses nothing
//   • the filler-opener list held "circling back", "bumping this" and
//     "touching base", and the draft opened "Just checking in"
//
// So the fixtures below are the exact sentences, and the first assertion in
// each group is that the old rules did not catch them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFollowUp } from '../lib/followup.mjs';
import { parseFollowup, validateFollowup } from '../lib/followup-v2.mjs';

const draft = (subject, body) => `SUBJECT: ${subject}\nBODY:\n${body}`;

const flagsFor = (body) => parseFollowUp(draft('a subject', body)).banned || [];

const INDUSTRY = 'a claim about how their industry behaves';

// ── Email 1: no unsupported peer or industry behaviour ───────────────────

test('the exact sentence that slipped through is now caught', () => {
  const body = 'Hi Cynthia,\n\nI looked at your contact page and noticed there is no form on it. '
    + 'That surprised me a bit, since for a therapy practice that first contact often happens late at night '
    + 'or in a moment someone finally decides to reach out.\n\nThanks,\nAry';
  assert.ok(flagsFor(body).includes(INDUSTRY), flagsFor(body).join(' | '));
});

test('the other shapes of the same move are caught', () => {
  const shapes = [
    'Businesses like yours usually take enquiries by phone.',
    'For most clinics, people often call rather than write.',
    'Clients tend to give up after the second try.',
    'Enquiries usually arrive in the evening.',
    'Practices like yours often work this way.',
  ];
  for (const s of shapes) {
    assert.ok(flagsFor(`Hi there,\n\n${s}\n\nThanks,\nAry`).includes(INDUSTRY), s);
  }
});

test('saying what was observed is not a generalisation', () => {
  // The whole email has to survive the rule, or the rule is useless.
  const ok = [
    'I looked at your contact page and noticed there is no form on it, just links to email or phone.',
    'One thing I could not tell from the outside is whether people are still getting through fine some other way.',
    'If you prefer calls, or already have something that works, this does not apply.',
    'I can send you a short rundown of how I would make the contact path easier.',
  ];
  for (const s of ok) {
    assert.deepEqual(flagsFor(`Hi there,\n\n${s}\n\nThanks,\nAry`), [], s);
  }
});

test('the statistic and loss rules still work', () => {
  assert.ok(flagsFor('Hi,\n\n40% of clinics lose leads.\n\nThanks,\nAry').length > 0);
  assert.ok(flagsFor('Hi,\n\nA lot of coaches miss enquiries this way.\n\nThanks,\nAry').length > 0);
});

// ── Email 2: no filler opener ────────────────────────────────────────────

const ctx = {
  prospect: { name: 'Cynthia' }, step: 2, ceiling: 2, canPersonalise: true,
  firstEmail: {
    subject: 'your contact page has no form',
    body: 'Hi Cynthia,\n\nI looked at your contact page and noticed there is no form on it. '
      + 'I can send you a short rundown of how I would make the contact path easier.\n\nThanks,\nAry',
  },
};

const problemsFor = (body) => {
  const parsed = parseFollowup(draft('following up', body));
  assert.equal(parsed.ok, true);
  return validateFollowup(parsed, ctx).problems.map((p) => p.why).join(' | ');
};

test('the exact opener that slipped through is now caught', () => {
  const body = 'Hi Cynthia,\n\nJust checking in on the note about your contact page having no form. '
    + 'If it would help, I can still send the short rundown of how I would make the contact path easier.\n\nThanks,\nAry';
  assert.match(problemsFor(body), /opens on filler/);
});

test('the other filler openers are caught too', () => {
  const openers = [
    'Just following up on the contact page.',
    'Checking in about the contact page form.',
    'Wanted to see if you saw my note about the contact page.',
    'Following up on my last email about the contact page.',
  ];
  for (const o of openers) {
    const body = `Hi Cynthia,\n\n${o} I can still send the short rundown of how I would make the contact path easier for you.\n\nThanks,\nAry`;
    assert.match(problemsFor(body), /opens on filler/, o);
  }
});

test('opening on the offer passes', () => {
  const body = 'Hi Cynthia,\n\nStill happy to send that short rundown of the contact path if it would be useful. '
    + 'It is how I would make the contact path easier, nothing more than that.\n\nThanks,\nAry';
  assert.doesNotMatch(problemsFor(body), /opens on filler/);
});

test('the word "following up" later in the body is not an opener', () => {
  // The rule is about where the sentence sits, not that the phrase exists.
  const body = 'Hi Cynthia,\n\nStill happy to send that short rundown of the contact path. '
    + 'I will leave it there rather than following up again after this.\n\nThanks,\nAry';
  assert.doesNotMatch(problemsFor(body), /opens on filler/);
});

// ── what must not have changed ───────────────────────────────────────────

test('a clean follow-up still validates', () => {
  const body = 'Hi Cynthia,\n\nStill happy to send that short rundown of the contact path if it would be useful. '
    + 'It covers how I would make the contact path easier, and nothing else.\n\nThanks,\nAry';
  const parsed = parseFollowup(draft('still happy to send that rundown', body));
  assert.equal(validateFollowup(parsed, ctx).ok, true, validateFollowup(parsed, ctx).problems.map((p) => p.why).join(' | '));
});

test('both emails keep their sign-off through validation', () => {
  const body = 'Hi Cynthia,\n\nStill happy to send that short rundown of the contact path if it helps. '
    + 'It covers how I would make the contact path easier.\n\nThanks,\nAry';
  assert.match(parseFollowup(draft('s', body)).body, /\n\s*Thanks,\s*\n\s*Ary\s*$/);
  assert.match(parseFollowUp(draft('s', body)).body, /\n\s*Thanks,\s*\n\s*Ary\s*$/);
});
