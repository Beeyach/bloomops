import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daysUntilDue, isDueProspect, nextActionForStage, applyNextAction,
  videoSlotRank, getLastSentNumber, DUE_DAYS_BY_STAGE, EMAIL_SEND_DAYS,
  isoShift, todayIso,
} from '../lib/due.mjs';

// Fixtures use isoShift so tests express "N days ago" relative to the real
// Pacific today — no clock injection, no flakiness at midnight boundaries
// beyond the second the suite actually runs.
const ago = (n) => isoShift(-n);

test('the cadence table encodes the 1·3·7·14·21 send schedule', () => {
  assert.deepEqual(
    [DUE_DAYS_BY_STAGE['Email 1'], DUE_DAYS_BY_STAGE['Email 2'], DUE_DAYS_BY_STAGE['Email 3'], DUE_DAYS_BY_STAGE['Email 4']],
    [2, 4, 7, 7]
  );
  assert.equal(EMAIL_SEND_DAYS[5], 21);
  assert.equal(DUE_DAYS_BY_STAGE['Email 5'], undefined); // terminal: auto-finishes instead
});

test('daysUntilDue: stage window counts down from last contact', () => {
  assert.equal(daysUntilDue({ stage: 'Email 1', last_contact_date: ago(1) }), 1);
  assert.equal(daysUntilDue({ stage: 'Email 1', last_contact_date: ago(2) }), 0);
  assert.equal(daysUntilDue({ stage: 'Email 1', last_contact_date: ago(5) }), -3);
  assert.equal(daysUntilDue({ stage: 'Email 5', last_contact_date: ago(9) }), null); // no window
  assert.equal(daysUntilDue({ stage: 'Email 2' }), null); // never contacted
  assert.equal(daysUntilDue(null), null);
});

test('daysUntilDue: an explicit next_action_date beats the stage window', () => {
  assert.equal(daysUntilDue({ stage: 'Email 1', last_contact_date: ago(9), next_action_date: isoShift(3) }), 3);
  assert.equal(daysUntilDue({ stage: 'Interested', next_action_date: ago(2) }), -2);
});

test('isDueProspect: due at zero and below, not above', () => {
  assert.equal(isDueProspect({ stage: 'Email 2', last_contact_date: ago(4) }), true);
  assert.equal(isDueProspect({ stage: 'Email 2', last_contact_date: ago(3) }), false);
});

test('nextActionForStage: cadence stages schedule forward, terminals clear, video-owed holds', () => {
  assert.equal(nextActionForStage('Email 2'), isoShift(4));
  assert.equal(nextActionForStage('Email 5', {}), null); // terminal, nothing owed
  assert.equal(nextActionForStage('Email 5', { video_url: 'x' }), undefined); // video owed: leave as-is
  assert.equal(nextActionForStage('Email 5', { video_url: 'x', video_sent_at: 'y' }), null);
  const patch = {};
  applyNextAction(patch, 'Email 5', { video_url: 'x' });
  assert.ok(!('next_action_date' in patch), 'video-owed leaves the date untouched');
});

test('videoSlotRank orders by how much of the sequence is left', () => {
  assert.deepEqual([videoSlotRank({ emails_sent: 1 }), videoSlotRank({ emails_sent: 3 }), videoSlotRank({ emails_sent: 5 })], [0, 1, 2]);
});

test('getLastSentNumber: stage wins in-sequence, counter capped at 5 after', () => {
  assert.equal(getLastSentNumber({ stage: 'Email 3' }), 3);
  assert.equal(getLastSentNumber({ stage: 'Interested', emails_sent: 7 }), 5);
  assert.equal(getLastSentNumber({ stage: 'New', emails_sent: 0 }), 0);
});

test('todayIso/isoShift agree with each other', () => {
  assert.equal(isoShift(0), todayIso());
});
