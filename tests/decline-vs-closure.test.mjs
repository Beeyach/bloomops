// "No thanks" and "never contact me again" are not the same sentence.
//
// The system already knew that: `relationshipFromReply` reads the words and
// only `rejectsUs` produces NO_TO_US. What it did not do was write the answer
// down when the label came from the model rather than the rules, which is every
// reply somebody actually composed. Cynthia 4860 said "Yes, I prefer it this
// way." and got stage Rejected with an empty relationship timeline.

import test from 'node:test';
import assert from 'node:assert/strict';

import { REL, CLOSED_TO_OUTREACH, relationshipFromReply } from '../lib/relationship.mjs';
import { REPLY, STOPS_OUTBOUND, REAL_REPLY, actionFor } from '../lib/reply-classify.mjs';
import { canProgressOutbound } from '../lib/outbound.mjs';

const stateOf = (text, cls = 'decline') => relationshipFromReply(cls, { text }).state;

// 1
test('"No thanks, we\'re all set." is a no to the offer', () => {
  assert.equal(stateOf("No thanks, we're all set."), REL.NO_TO_THIS_OFFER);
  assert.equal(CLOSED_TO_OUTREACH.has(REL.NO_TO_THIS_OFFER), false, 'the relationship stays open');
});

// 2
test('"Not interested in changing the contact page." is a no to the offer', () => {
  assert.equal(stateOf('Not interested in changing the contact page.'), REL.NO_TO_THIS_OFFER);
});

// 3
test('"Please don\'t contact me again." is a no to us', () => {
  assert.equal(stateOf("Please don't contact me again."), REL.NO_TO_US);
  assert.equal(CLOSED_TO_OUTREACH.has(REL.NO_TO_US), true, 'and that one closes it');
});

// 4
test('"Remove me from your list." is a no to us', () => {
  assert.equal(stateOf('Remove me from your list.'), REL.NO_TO_US);
});

// 5
test('an ambiguous decline stops the sequence without closing the relationship', () => {
  // Nothing here rejects Bloomwired. It rejects a thing.
  const vague = stateOf('Thanks, but no.');
  assert.equal(vague, REL.NO_TO_THIS_OFFER, 'the softer reading wins when the words do not say otherwise');
  assert.equal(CLOSED_TO_OUTREACH.has(vague), false);
  // And the cold sequence still stops, from the reply itself.
  assert.equal(STOPS_OUTBOUND.has(REPLY.DECLINE), true);
  const gate = canProgressOutbound({ stage: 'Contacted', replied: 1, reply_type: 'decline' });
  assert.equal(gate.ok, false);
});

// 6
test('unsubscribe and do-not-contact stay stricter than an ordinary decline', () => {
  assert.equal(relationshipFromReply('unsubscribe', { text: 'unsubscribe' }).state, REL.NO_TO_US);

  const unsub = actionFor(REPLY.UNSUBSCRIBE);
  assert.equal(unsub.doNotContact, true);
  assert.equal(unsub.unsubscribed, true);

  const decline = actionFor(REPLY.DECLINE);
  assert.notEqual(decline.doNotContact, true, 'an ordinary decline never sets do-not-contact');
  assert.notEqual(decline.unsubscribed, true);

  // And the gate ranks them: do-not-contact answers before the reply type does.
  const dnc = canProgressOutbound({ stage: 'Contacted', do_not_contact: 1, reply_type: 'decline' });
  assert.equal(dnc.stop, 'do-not-contact');
});

// 7
test('any real human reply stops the current cold sequence', () => {
  for (const c of REAL_REPLY) {
    assert.equal(STOPS_OUTBOUND.has(c), true, `${c} stops outbound`);
  }
  // Including one nobody could read.
  assert.equal(actionFor(REPLY.UNKNOWN).stopOutbound, true);
  assert.equal(actionFor(REPLY.UNKNOWN).needsHuman, true);
});

// 8
test('a no to this offer cannot restart the same offer', () => {
  // The stop is on the prospect record, not on the relationship state, so
  // an open relationship does not reopen the sequence by itself.
  const gate = canProgressOutbound({ stage: 'Contacted', replied: 1, reply_type: 'decline' });
  assert.equal(gate.ok, false);
  assert.equal(gate.stop, 'declined');
  assert.match(gate.reason, /Nothing further goes out/);
});

// 9
test('a no to us blocks future outreach', () => {
  assert.equal(CLOSED_TO_OUTREACH.has(REL.NO_TO_US), true);
  const gate = canProgressOutbound({ stage: 'Contacted', unsubscribed: 1 });
  assert.equal(gate.ok, false);
  assert.equal(gate.stop, 'unsubscribed');
});

// 10
test('Cynthia\'s actual words map to NO_TO_THIS_OFFER', () => {
  // Verbatim from reply_events id 31, the substantive text before her signature.
  const HERS = 'Yes, I prefer it this way.';
  assert.equal(stateOf(HERS), REL.NO_TO_THIS_OFFER);
  assert.notEqual(stateOf(HERS), REL.NO_TO_US);
  // The full stored snippet, signature and confidentiality notice included,
  // must not tip it either.
  const WITH_SIG = `${HERS} --- Cynthia A. Criss, LPC, CSAT Open Hearts Open Minds Counseling Services `
    + '4545 E. Shea Blvd., Suite 235 Phoenix, AZ 85028 602-677-3557 CONFIDENTIALITY NOTICE: This message';
  assert.equal(stateOf(WITH_SIG), REL.NO_TO_THIS_OFFER);
});

// 11
test('classifying a decline sends nothing and mutates no package', () => {
  const before = JSON.stringify({ REPLY, REL });
  stateOf("No thanks, we're all set.");
  actionFor(REPLY.DECLINE);
  canProgressOutbound({ stage: 'Contacted', replied: 1, reply_type: 'decline' });
  assert.equal(JSON.stringify({ REPLY, REL }), before, 'nothing was mutated');
  // The decline action carries no send, no package field, and no contact change.
  const a = actionFor(REPLY.DECLINE);
  assert.equal(a.stopOutbound, true);
  assert.equal(a.doNotContact, undefined);
  assert.equal(Object.keys(a).some((k) => /send|package|email_body/i.test(k)), false);
});

// The other real decline in production, for the same reason.
test('Maj 1317 declined the offer and named another provider, which is not a no to us', () => {
  const HERS = "Hi Ary, This is needed, I'm sure, but not the kind of upkeep I need most. "
    + 'I think I have found a WordPress person who can adjust the site and monitor issues. '
    + 'But thank you for reaching out.';
  assert.equal(stateOf(HERS), REL.NO_TO_THIS_OFFER);
});
