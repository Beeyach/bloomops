import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats } from '../lib/prospect-stats.mjs';
import { isoShift } from '../lib/due.mjs';

// A small pipeline: two untouched, one mid-sequence, one replied-Interested,
// one Client with a call booked, one Rejected. Dates are relative so the
// due/weekday math runs against the real Pacific today.
const FIXTURE = [
  { stage: 'New' },
  { stage: 'Prescreen' },
  { stage: 'Email 2', last_contact_date: isoShift(-4) }, // due today (window is 4)
  {
    stage: 'Interested', replied: 1, reply_type: 'interested',
    replied_at_email: 3, emails_sent: 3, last_contact_date: isoShift(-2),
    country: 'US',
  },
  {
    stage: 'Client', call_booked: 1, replied: 1, reply_type: 'interested',
    replied_at_email: 4, emails_sent: 5, last_contact_date: isoShift(-30),
    country: 'AU',
  },
  { stage: 'Rejected', emails_sent: 5, last_contact_date: isoShift(-10), country: 'US' },
];

test('computeStats: counts, rates, and rollups from a known pipeline', () => {
  const s = computeStats(FIXTURE);

  assert.equal(s.total, 6);
  assert.equal(s.newCount, 2); // New + Prescreen are pre-contact
  assert.equal(s.reachedOut, 4);
  assert.deepEqual(s.byStage, {
    New: 1, Prescreen: 1, 'Email 2': 1, Interested: 1, Client: 1, Rejected: 1,
  });

  // Responded = Interested + Client + Rejected (stage or reply flag, once each).
  assert.equal(s.responded, 3);
  assert.equal(s.responseRate, 75);
  assert.equal(s.clients, 1);
  assert.equal(s.conversionRate, 25);
  assert.equal(s.callsBooked, 1);
  assert.equal(s.rejected, 1);

  assert.equal(s.missingCountry, 3);

  assert.equal(s.repliedCount, 2);
  assert.deepEqual(s.replyByType, { interested: 2, defer: 0, decline: 0 });
  assert.equal(s.repliesByEmail[3], 1);
  assert.equal(s.repliesByEmail[4], 1);
  assert.equal(s.avgEmailsBeforeReply, 4); // (3 + 5) / 2

  // Weekday rollup: 4 rows carry a contact date, 2 of them replied.
  const sent = s.byWeekday.reduce((a, d) => a + d.sent, 0);
  const replies = s.byWeekday.reduce((a, d) => a + d.replies, 0);
  assert.equal(sent, 4);
  assert.equal(replies, 2);
});

test('computeStats: empty list yields zeros, not NaN', () => {
  const s = computeStats([]);
  assert.equal(s.total, 0);
  assert.equal(s.responseRate, 0);
  assert.equal(s.conversionRate, 0);
  assert.equal(s.avgEmailsBeforeReply, null);
});

test('a reply on a pre-contact stage cannot push the rate past 100%', () => {
  // The stage lags the reply in real use: the reply-sync skill stamps
  // replied/reply_type, and a scan-imported row sits on New until somebody
  // advances it. Those rows used to be counted as "not contacted" (shrinking
  // the divisor) AND "responded" (growing the numerator) at the same time.
  const s = computeStats([
    { id: 1, stage: 'New', replied: 1, reply_type: 'interested', last_contact_date: '2026-08-01' },
    { id: 2, stage: 'Prescreen', replied: 1, reply_type: 'interested', last_contact_date: '2026-08-02' },
    { id: 3, stage: 'Email 2', replied: 0 },
  ]);
  assert.equal(s.reachedOut, 3);
  assert.equal(s.responded, 2);
  assert.equal(s.responseRate, 66.7);
  assert.ok(s.responseRate <= 100, 'a rate over 100% is never real');
});

test('everyone replied but nobody left the New stage still reads 100%', () => {
  // The same bug pointing the other way: the divisor collapsed to zero and
  // two logged replies rendered as "0%".
  const s = computeStats([
    { id: 1, stage: 'New', replied: 1, last_contact_date: '2026-08-01' },
    { id: 2, stage: 'New', replied: 1, last_contact_date: '2026-08-01' },
  ]);
  assert.equal(s.reachedOut, 2);
  assert.equal(s.responseRate, 100);
});

test('a genuinely untouched row is still not contacted', () => {
  const s = computeStats([
    { id: 1, stage: 'New' },
    { id: 2, stage: 'Validated' },
    { id: 3, stage: 'Email 1', last_contact_date: '2026-08-05', emails_sent: 1 },
  ]);
  assert.equal(s.newCount, 2);
  assert.equal(s.reachedOut, 1);
});

test('a send count alone counts as contact even on a New stage', () => {
  // Imports carry emails_sent from a previous tool without a date.
  const s = computeStats([{ id: 1, stage: 'New', emails_sent: 2 }]);
  assert.equal(s.newCount, 0);
  assert.equal(s.reachedOut, 1);
});
