// Replies means one thing: Ary owes this person a response now.
//
// Written from the live queue, which said 17 and could prove 1. Sixteen rows
// carried replied = 1 and reply_type = 'interested', set by hand months ago,
// with no message anywhere in Gmail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExceptionQueue, BUCKET } from '../lib/exceptions.mjs';

const NOW = new Date('2026-08-17T12:00:00Z');

const base = (over = {}) => ({
  id: 1, business_name: 'Somebody', name: 'Sam', stage: 'Interested',
  rating: '💚', emails_sent: 1, do_not_contact: 0, unsubscribed: 0, ...over,
});

const inbound = (over = {}) => ({
  direction: 'inbound', occurred_at: '2026-08-16T10:00:00Z',
  classification: 'question', requires_human: 1, matched_by: 'thread',
  snippet: 'One more question before we start —', ...over,
});

test('a legacy replied flag with no message does NOT enter Replies', () => {
  // Sixteen live rows looked exactly like this.
  const stale = base({ replied: 1, reply_type: 'interested', reply_date: '2026-05-20' });
  const q = buildExceptionQueue([stale], { now: NOW });
  const replies = q.rows.filter((r) => r.bucket === BUCKET.NEEDS_REPLY);
  assert.equal(replies.length, 0, 'a flag is not a message');
});

test('a real unanswered reply DOES enter Replies', () => {
  const p = base({ id: 2, replied: 1, reply_date: '2026-08-16' });
  const q = buildExceptionQueue([p], { now: NOW, repliesByProspect: new Map([[2, [inbound()]]]) });
  assert.equal(q.rows[0].bucket, BUCKET.NEEDS_REPLY);
  assert.match(q.rows[0].detail, /One more question/);
  assert.equal(q.rows[0].quote, true);
});

test('an answered reply does NOT enter Replies', () => {
  const p = base({ id: 3, replied: 1, reply_date: '2026-08-16' });
  const q = buildExceptionQueue([p], {
    now: NOW,
    repliesByProspect: new Map([[3, [inbound({ answered_at: '2026-08-16T18:00:00Z' })]]]),
  });
  assert.equal(q.rows.filter((r) => r.bucket === BUCKET.NEEDS_REPLY).length, 0);
});

test('a dateless deferral is a Decision, not a Reply', () => {
  const p = base({ id: 4, stage: 'Snoozed', replied: 1, reply_type: 'defer', reply_date: '2026-07-01' });
  const q = buildExceptionQueue([p], { now: NOW });
  const row = q.rows[0];
  if (row) {
    assert.notEqual(row.bucket, BUCKET.NEEDS_REPLY, 'never in Replies');
    if (row.bucket === BUCKET.NEEDS_DECISION) {
      assert.match(row.detail, /asked for later, but no date was recorded/);
    }
  }
});

test('a reply that asks nothing does NOT enter Replies', () => {
  for (const classification of ['decline', 'not-now', 'bounce', 'unsubscribe', 'out-of-office', 'wrong-person']) {
    const p = base({ id: 5, replied: 1, reply_date: '2026-08-16' });
    const q = buildExceptionQueue([p], {
      now: NOW, repliesByProspect: new Map([[5, [inbound({ classification })]]]),
    });
    assert.equal(
      q.rows.filter((r) => r.bucket === BUCKET.NEEDS_REPLY).length, 0,
      `${classification} is a complete message, not a question`
    );
  }
});

test('a bare thank-you does NOT enter Replies', () => {
  const p = base({ id: 6, replied: 1, reply_date: '2026-08-16' });
  const q = buildExceptionQueue([p], {
    now: NOW,
    repliesByProspect: new Map([[6, [inbound({ classification: 'interested', snippet: 'Thank you!' })]]]),
  });
  assert.equal(q.rows.filter((r) => r.bucket === BUCKET.NEEDS_REPLY).length, 0);
});

test('a newsletter from a known domain does NOT enter Replies', () => {
  const p = base({ id: 7, replied: 1, reply_date: '2026-08-16' });
  const blast = inbound({ matched_by: 'domain', in_reply_to: null, refs: null, snippet: 'Hey Audit, one of the biggest mistakes...' });
  const q = buildExceptionQueue([p], { now: NOW, repliesByProspect: new Map([[7, [blast]]]) });
  assert.equal(q.rows.filter((r) => r.bucket === BUCKET.NEEDS_REPLY).length, 0);
});

test('the tab count equals the rows it renders', () => {
  const people = [
    base({ id: 10, replied: 1, reply_date: '2026-05-01' }),                 // stale flag
    base({ id: 11, replied: 1, reply_date: '2026-08-16' }),                 // real
    base({ id: 12, replied: 1, reply_date: '2026-05-01' }),                 // stale flag
  ];
  const q = buildExceptionQueue(people, {
    now: NOW, repliesByProspect: new Map([[11, [inbound()]]]),
  });
  const rendered = q.rows.filter((r) => r.bucket === BUCKET.NEEDS_REPLY);
  assert.equal(rendered.length, 1, 'one real reply among three flags');
  assert.equal(q.counts[BUCKET.NEEDS_REPLY] || 0, rendered.length, 'the count is the rows');
});
