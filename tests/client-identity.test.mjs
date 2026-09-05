// A client must never be treated as a prospect, even when the prospect row
// disagrees. Written from a real incident: Good Energy Coach was a client from
// 2026-07-17 with a prospect row still reading Interested, so Today counted
// her client threads as prospecting and she reached emails_sent = 12.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExceptionQueue, reasonsAndStanding, BUCKET } from '../lib/exceptions.mjs';

const NOW = new Date('2026-08-17T12:00:00Z');

// Sarah as she actually was: a client, with every prospect field disagreeing.
const drifted = {
  id: 927, business_name: 'Good Energy Coach', name: 'Sarah',
  stage: 'Interested',          // stale
  first_client_at: null,        // stale
  emails_sent: 12,              // nonsense, inflated by client work
  replied: 1, reply_date: '2026-08-10', rating: '💚',
  do_not_contact: 0, unsubscribed: 0,
};

const wroteBack = new Map([[927, [{
  direction: 'inbound', occurred_at: '2026-08-10T18:33:00Z',
  classification: 'interested', requires_human: 1, matched_by: 'thread',
  snippet: 'Can you send the next one over?',
}]]]);

test('the clients table wins over a stale prospect row', () => {
  const asProspect = reasonsAndStanding(drifted, { now: NOW, isClientRow: false });
  assert.equal(asProspect.standing.isClient ?? false, false, 'control: without the clients table she reads as a prospect');

  const asClient = reasonsAndStanding(drifted, { now: NOW, isClientRow: true });
  assert.notEqual(asClient.standing.state, asProspect.standing.state,
    'membership of the clients table has to change the reading');
});

test('a client is never eligible for cold outreach', () => {
  const q = buildExceptionQueue([drifted], {
    now: NOW, repliesByProspect: wroteBack, clientIds: new Set([927]),
  });
  // The safety property that matters: no new cold package, no approval to
  // send, no resurfacing into a sequence. A client who WRITES may still need
  // an answer — that is a real person waiting, and correct — but nothing
  // automated may ever queue outreach at them.
  const coldWork = q.rows.filter((r) => r.bucket === BUCKET.READY_FOR_APPROVAL || r.bucket === BUCKET.RESURFACED);
  assert.equal(coldWork.length, 0, 'a client is never cold outreach work');
});

test('a nonsense emails_sent cannot make a client cold-eligible', () => {
  const q = buildExceptionQueue([{ ...drifted, emails_sent: 999 }], {
    now: NOW, repliesByProspect: wroteBack, clientIds: new Set([927]),
  });
  assert.equal(q.rows.filter((r) => r.bucket === BUCKET.READY_FOR_APPROVAL).length, 0);
});

test('an ordinary prospect is untouched by the client rule', () => {
  const prospect = { ...drifted, id: 3163, business_name: 'A real prospect' };
  const q = buildExceptionQueue([prospect], {
    now: NOW,
    repliesByProspect: new Map([[3163, wroteBack.get(927)]]),
    clientIds: new Set([927]),   // a DIFFERENT prospect is the client
  });
  assert.equal(q.rows[0]?.bucket, BUCKET.NEEDS_REPLY, 'the prospect still needs a reply');
});

test('client status is still honoured from the prospect row alone', () => {
  // The denormalised fields keep working; they simply stopped being the only
  // check. Callers with no clients table to hand must not regress.
  const marked = { ...drifted, stage: 'Client' };
  const q = buildExceptionQueue([marked], { now: NOW, repliesByProspect: wroteBack });
  assert.equal(q.rows.filter((r) => r.bucket === BUCKET.READY_FOR_APPROVAL).length, 0);
});
