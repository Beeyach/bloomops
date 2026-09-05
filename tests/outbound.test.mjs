import test from 'node:test';
import assert from 'node:assert/strict';
import { canProgressOutbound, hasUnansweredReply, isReadyToReconsider, summariseStops, STOP } from '../lib/outbound.mjs';

// The sharpest rule recovered from any skill:
//
//   A follow-up sent on top of an unanswered reply is the worst email we can
//   send.
//
// Deterministic on purpose. Nothing here asks a model to notice somebody wrote
// back, and every ambiguity resolves towards silence.

const NOW = new Date('2026-08-09T12:00:00Z');
const base = {
  id: 1, name: 'Kym', email: 'kym@x.com', stage: 'Email 2',
  next_action_date: '2026-08-09',
};

test('an unanswered reply blocks the follow-up', () => {
  const r = canProgressOutbound(
    { ...base, replied: 1, reply_type: 'interested', reply_date: '2026-08-08', last_contact_date: '2026-08-01' },
    { now: NOW }
  );
  assert.equal(r.ok, false);
  assert.equal(r.stop, STOP.UNANSWERED_REPLY);
  assert.equal(r.surface, true, 'this belongs in front of a person');
});

test('a reply answered afterwards no longer blocks', () => {
  const r = canProgressOutbound(
    { ...base, replied: 1, reply_type: 'interested', reply_date: '2026-08-05', last_contact_date: '2026-08-07' },
    { now: NOW }
  );
  // Not blocked by the reply itself. It is blocked further down for being a
  // conversation, which is the correct second answer.
  assert.notEqual(r.stop, STOP.UNANSWERED_REPLY);
});

test('same-day counts as unanswered', () => {
  // Both stamps are dates, not times, so "she replied and I answered" and
  // "she replied after my send" look identical. The safe reading is that she
  // is still waiting.
  assert.equal(hasUnansweredReply({ replied: 1, reply_date: '2026-08-08', last_contact_date: '2026-08-08' }), true);
});

test('replied with no date is treated as unanswered', () => {
  // The cost of pausing wrongly is a delay. The cost of sending wrongly is
  // the thread.
  assert.equal(hasUnansweredReply({ replied: 1, last_contact_date: '2026-08-08' }), true);
});

test('a decline blocks everything, and is not counted as unanswered', () => {
  assert.equal(hasUnansweredReply({ replied: 1, reply_type: 'decline', reply_date: '2026-08-08' }), false);
  const r = canProgressOutbound({ ...base, replied: 1, reply_type: 'decline', reply_date: '2026-08-08' }, { now: NOW });
  assert.equal(r.stop, STOP.DECLINED);
  assert.equal(r.surface, false, 'nothing for a person to do about a no');
});

test('unsubscribe and do-not-contact beat everything, including a reply', () => {
  const unsub = canProgressOutbound({ ...base, unsubscribed: 1, replied: 1, reply_date: '2026-08-08' }, { now: NOW });
  assert.equal(unsub.stop, STOP.UNSUBSCRIBED);
  const dnc = canProgressOutbound({ ...base, do_not_contact: 1, replied: 1, reply_date: '2026-08-08' }, { now: NOW });
  assert.equal(dnc.stop, STOP.DO_NOT_CONTACT);
});

test('terminal stages stop the sequence', () => {
  for (const [stage, stop] of [
    ['Client', STOP.CLIENT],
    ['Invalid Email', STOP.INVALID_CONTACT],
    ['Rejected', STOP.TERMINAL_STAGE],
    ['Lost', STOP.TERMINAL_STAGE],
    ['Finished', STOP.TERMINAL_STAGE],
  ]) {
    assert.equal(canProgressOutbound({ ...base, stage }, { now: NOW }).stop, stop, stage);
  }
});

test('a live conversation is not a sequence', () => {
  for (const stage of ['Interested', 'Proposal Sent', 'Setup Check']) {
    const r = canProgressOutbound({ ...base, stage }, { now: NOW });
    assert.equal(r.stop, STOP.ACTIVE_CONVERSATION, stage);
    assert.equal(r.surface, true);
  }
});

test('a deferred prospect stays blocked until the date arrives', () => {
  const parked = canProgressOutbound({ ...base, next_action_date: '2026-10-15' }, { now: NOW });
  assert.equal(parked.stop, STOP.DEFERRED_UNTIL);
  assert.equal(parked.until, '2026-10-15');
  const arrived = canProgressOutbound({ ...base, next_action_date: '2026-08-09' }, { now: NOW });
  assert.equal(arrived.ok, true);
});

test('no address and no due date each stop it, for different reasons', () => {
  assert.equal(canProgressOutbound({ ...base, email: null }, { now: NOW }).stop, STOP.NO_CONTACT);
  assert.equal(canProgressOutbound({ ...base, next_action_date: null }, { now: NOW }).stop, STOP.NOT_DUE);
});

test('a clean due prospect is allowed through', () => {
  const r = canProgressOutbound(base, { now: NOW });
  assert.equal(r.ok, true);
  assert.equal(r.dueOn, '2026-08-09');
});

test('every stop carries a reason a person can read', () => {
  const cases = [
    { ...base, unsubscribed: 1 },
    { ...base, reply_type: 'decline', replied: 1 },
    { ...base, stage: 'Client' },
    { ...base, replied: 1, reply_date: '2026-08-08', last_contact_date: '2026-08-01' },
    { ...base, next_action_date: '2026-12-01' },
    { ...base, email: null },
  ];
  for (const c of cases) {
    const r = canProgressOutbound(c, { now: NOW });
    assert.equal(r.ok, false);
    assert.ok(r.reason && r.reason.length > 10, `"${r.stop}" needs a readable reason`);
  }
});

test('a deferred prospect wakes only when its date arrives', () => {
  const notYet = { ...base, stage: 'Snoozed', reply_type: 'defer', next_action_date: '2026-10-15' };
  assert.equal(isReadyToReconsider(notYet, { now: NOW }), false);
  const ready = { ...notYet, next_action_date: '2026-08-09' };
  assert.equal(isReadyToReconsider(ready, { now: NOW }), true);
});

test('a declined or unsubscribed prospect never wakes back up', () => {
  const base2 = { ...base, stage: 'Snoozed', reply_type: 'defer', next_action_date: '2026-08-01' };
  assert.equal(isReadyToReconsider({ ...base2, unsubscribed: 1 }, { now: NOW }), false);
  assert.equal(isReadyToReconsider({ ...base2, do_not_contact: 1 }, { now: NOW }), false);
  assert.equal(isReadyToReconsider({ ...base2, stage: 'Rejected' }, { now: NOW }), false);
});

test('the sweep summary separates what a person needs from what it handled', () => {
  const s = summariseStops([
    { ...base, id: 1 },                                                              // eligible
    { ...base, id: 2, replied: 1, reply_date: '2026-08-08', last_contact_date: '2026-08-01' }, // surfaced
    { ...base, id: 3, unsubscribed: 1 },                                             // handled quietly
    { ...base, id: 4, next_action_date: '2026-12-01' },                              // handled quietly
  ], { now: NOW });
  assert.equal(s.eligible.length, 1);
  assert.equal(s.surfaced.length, 1, 'only the reply needs a person');
  assert.equal(s.surfaced[0].stop, STOP.UNANSWERED_REPLY);
  assert.ok(s.blocked[STOP.UNSUBSCRIBED]);
  assert.ok(s.blocked[STOP.DEFERRED_UNTIL]);
});

test('with real timestamps the guard resolves same-day ordering', () => {
  // The date columns cannot tell these apart. Message timestamps can, and
  // being able to answer somebody at 4pm and have the sequence resume is a
  // real improvement over waiting a day.
  const answered = canProgressOutbound(base, {
    now: NOW,
    events: [
      { direction: 'inbound', occurred_at: '2026-08-08T14:00:00Z', classification: 'question' },
      { direction: 'outbound', occurred_at: '2026-08-08T16:30:00Z' },
    ],
  });
  assert.notEqual(answered.stop, STOP.UNANSWERED_REPLY);

  const notAnswered = canProgressOutbound(base, {
    now: NOW,
    events: [
      { direction: 'outbound', occurred_at: '2026-08-08T09:00:00Z' },
      { direction: 'inbound', occurred_at: '2026-08-08T14:00:00Z', classification: 'question' },
    ],
  });
  assert.equal(notAnswered.stop, STOP.UNANSWERED_REPLY);
});

test('an out-of-office in the events does not block outbound', () => {
  // They are back next week. Treating an autoresponder as a conversation
  // would freeze the sequence for every prospect on holiday.
  const r = canProgressOutbound(base, {
    now: NOW,
    events: [
      { direction: 'outbound', occurred_at: '2026-08-08T09:00:00Z' },
      { direction: 'inbound', occurred_at: '2026-08-08T09:01:00Z', classification: 'out-of-office' },
    ],
  });
  assert.notEqual(r.stop, STOP.UNANSWERED_REPLY);
});

test('the events path never weakens the guard when nothing was answered', () => {
  const r = canProgressOutbound(base, {
    now: NOW,
    events: [{ direction: 'inbound', occurred_at: '2026-08-08T14:00:00Z', classification: 'interested' }],
  });
  assert.equal(r.stop, STOP.UNANSWERED_REPLY);
});
