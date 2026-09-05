import test from 'node:test';
import assert from 'node:assert/strict';
import { coldPhase, coldSequence, outreachWindow } from '../lib/gmail-backfill.mjs';

const m = (direction, occurredAt, subject = 'x') => ({ direction, occurredAt, subject });

// Sarah's real shape, and the reason this module exists. Her thread holds 84
// messages and 43 outbound; two were cold outreach and the rest are a client
// relationship. Counting all 43 as sequence steps is the contamination that
// made `emails_sent = 12` look like twelve cold emails.
test('the cold phase ends at the first human reply', () => {
  const r = coldPhase([
    m('outbound', '2026-04-25T22:03Z', 'The Beat the Bloat guide on your homepage'),
    m('outbound', '2026-04-30T00:36Z', 'Re: The Beat the Bloat guide on your homepage'),
    m('inbound', '2026-04-30T19:27Z', 'Re: The Beat the Bloat guide on your homepage'),
    m('outbound', '2026-04-30T20:28Z'),
    m('outbound', '2026-05-04T08:38Z'),
    m('outbound', '2026-07-16T19:24Z', 'Re: Edits to the weekly check-in questions'),
  ]);
  assert.equal(r.coldEmails, 2, 'two cold emails, not six outbound');
  assert.equal(r.firstReplyStep, 2);
  assert.equal(r.postReplyOutbound, 3, 'and the rest is a conversation, counted separately');
});

test('an autoresponder does not end the cold phase', () => {
  // Otherwise every prospect with an out-of-office looks like a one-email win.
  const r = coldPhase([
    m('outbound', '2026-04-01T09:00Z'),
    m('inbound', '2026-04-01T09:01Z', 'Automatic reply: Out of office'),
    m('outbound', '2026-04-08T09:00Z'),
    m('inbound', '2026-04-09T11:00Z', 'Re: your email'),
  ]);
  assert.equal(r.coldEmails, 2);
  assert.equal(r.firstReplyStep, 2);
});

test('silence produces no step, not step zero', () => {
  const r = coldPhase([
    m('outbound', '2026-04-01T09:00Z'), m('outbound', '2026-04-08T09:00Z'), m('outbound', '2026-04-15T09:00Z'),
  ]);
  assert.equal(r.coldEmails, 3);
  assert.equal(r.replied, false);
  assert.equal(r.firstReplyStep, null, 'no reply is not a reply at step 0');
});

test('a prospect who wrote first is not a sequence result', () => {
  const r = coldPhase([m('inbound', '2026-04-01T09:00Z'), m('outbound', '2026-04-01T10:00Z')]);
  assert.equal(r.coldEmails, 0);
  assert.equal(r.inboundFirst, true);
  assert.equal(r.firstReplyStep, null, 'they contacted us; no cold email earned it');
});

test('messages out of order are sorted before anything is counted', () => {
  const r = coldPhase([
    m('inbound', '2026-04-30T19:27Z'),
    m('outbound', '2026-04-25T22:03Z'),
    m('outbound', '2026-04-30T00:36Z'),
  ]);
  assert.equal(r.firstReplyStep, 2);
});

test('coldSequence returns the messages themselves, oldest first', () => {
  const seq = coldSequence([
    m('outbound', '2026-04-25T22:03Z', 'one'),
    m('outbound', '2026-04-30T00:36Z', 'two'),
    m('inbound', '2026-04-30T19:27Z'),
    m('outbound', '2026-05-01T09:00Z', 'three'),
  ]);
  assert.deepEqual(seq.map((x) => x.subject), ['one', 'two']);
});

// The search window that fixed the truncation.
test('the outreach window reaches back before the record was created', () => {
  // Sarah was imported 2026-05-24 and first emailed 2026-04-25. A window
  // anchored on created_at alone would still have missed her.
  const w = outreachWindow({ created_at: '2026-05-24 01:49:45', reply_date: '2026-04-30', last_contact_date: '2026-05-20' });
  assert.ok(w.after <= '2026/03/01', `window starts ${w.after}, too late to catch April`);
  assert.ok(w.before >= '2026/06/19');
});

test('a record with no usable dates gets no window rather than a wrong one', () => {
  assert.equal(outreachWindow({}), null);
});
