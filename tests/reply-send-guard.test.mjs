// When a human reply may go out.
//
// The point of this guard is what it does NOT do: it is not the cold guard.
// Cadence caps, send windows and touch limits exist to protect strangers from
// a machine. Somebody who wrote to Ary and is waiting for an answer is not a
// stranger, and a cap designed to stop cold email must never be the reason a
// real person is left hanging.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canSendHumanReply, replyTarget, BLOCK } from '../lib/reply-send-guard.mjs';

const person = (o = {}) => ({ id: 1317, email: 'majcoach@gmail.com', do_not_contact: 0, unsubscribed: 0, ...o });
const thread = (o = {}) => ({ threadId: 't1', to: 'majcoach@gmail.com', subject: 'Re: your booking page', inReplyTo: '<a@mail>', references: '<a@mail>', ...o });
const ok = (over = {}) => canSendHumanReply(person(over.p), { thread: thread(), body: 'Sounds good.', ...over });

test('a normal reply is allowed', () => {
  assert.equal(ok().ok, true);
});

test('cold limits do NOT block a human reply', () => {
  // Every one of these ends cold outreach. None of them means Ary may not
  // answer somebody who wrote to her.
  for (const p of [
    { emails_sent: 999 },
    { emails_sent: 12, stage: 'Finished' },
    { replied: 1, reply_type: 'interested' },
    { stage: 'Snoozed' },
  ]) {
    assert.equal(ok({ p }).ok, true, `${JSON.stringify(p)} must not block a reply`);
  }
});

test('a client conversation is allowed', () => {
  assert.equal(ok({ p: { stage: 'Client', first_client_at: '2026-07-17' } }).ok, true);
});

test('do-not-contact and unsubscribe are absolute', () => {
  const dnc = ok({ p: { do_not_contact: 1 } });
  assert.equal(dnc.ok, false);
  assert.equal(dnc.block, BLOCK.DO_NOT_CONTACT);

  const unsub = ok({ p: { unsubscribed: 1 } });
  assert.equal(unsub.ok, false);
  assert.equal(unsub.block, BLOCK.UNSUBSCRIBED);
});

test('NO_TO_US blocks, NO_TO_THIS_OFFER does not', () => {
  assert.equal(ok({ state: 'NO_TO_US' }).ok, false);
  // Still a live relationship. Answering is normal.
  assert.equal(ok({ state: 'NO_TO_THIS_OFFER' }).ok, true);
});

test('an empty draft cannot be sent', () => {
  assert.equal(canSendHumanReply(person(), { thread: thread(), body: '   ' }).block, BLOCK.EMPTY);
});

test('no thread means no reply: it would be a cold email in disguise', () => {
  const v = canSendHumanReply(person(), { thread: thread({ threadId: null }), body: 'Hi' });
  assert.equal(v.ok, false);
  assert.equal(v.block, BLOCK.NO_THREAD);
});

test('a newer inbound message blocks the send', () => {
  const v = canSendHumanReply(person(), {
    thread: thread(),
    body: 'Answering your last one.',
    fingerprint: { latestInboundId: 'msg-A' },
    latest: { message_id: 'msg-B' },
  });
  assert.equal(v.ok, false);
  assert.equal(v.block, BLOCK.STALE);
  assert.match(v.reason, /A newer message came in\. Refresh the conversation before sending\./);
});

test('the same message is not stale', () => {
  const v = canSendHumanReply(person(), {
    thread: thread(), body: 'ok',
    fingerprint: { latestInboundId: 'msg-A' },
    latest: { message_id: 'msg-A' },
  });
  assert.equal(v.ok, true);
});

test('the reply goes to the address that actually wrote, in that thread', () => {
  const target = replyTarget([
    { direction: 'outbound', occurred_at: '2026-08-01T09:00:00Z', thread_id: 't9', subject: 'your booking page' },
    { direction: 'inbound', occurred_at: '2026-08-04T22:00:00Z', thread_id: 't9', from_address: 'mary@real.com',
      subject: 'Re: your booking page', rfc_message_id: '<m2@mail>', refs: '<m1@mail>', message_id: 'gm2' },
  ], { email: 'stale@old-record.com' });

  assert.equal(target.threadId, 't9');
  assert.equal(target.to, 'mary@real.com', 'the thread wins over a stale record');
  assert.equal(target.inReplyTo, '<m2@mail>');
  assert.match(target.references, /<m1@mail>/);
  assert.match(target.references, /<m2@mail>/);
  assert.equal(target.latestInboundId, 'gm2');
});

test('the subject keeps the thread, and Re: is not doubled', () => {
  const once = replyTarget([{ direction: 'inbound', occurred_at: '2026-08-04T22:00:00Z', thread_id: 't', subject: 'your booking page' }], {});
  assert.equal(once.subject, 'Re: your booking page');
  const already = replyTarget([{ direction: 'inbound', occurred_at: '2026-08-04T22:00:00Z', thread_id: 't', subject: 'Re: your booking page' }], {});
  assert.equal(already.subject, 'Re: your booking page');
});

// ── The follow-up case: our thread, their silence ─────────────────────────
// Found live by Ary: a drafted US follow-up refused with "no Gmail
// conversation to reply to" while the drawer displayed that conversation.
// The target only knew how to anchor on an inbound message.

test('a silent thread anchors the reply on our own newest email', () => {
  const target = replyTarget([
    { direction: 'outbound', occurred_at: '2026-08-07T10:00:00Z', thread_id: 'tA', subject: 'your booking page', rfc_message_id: '<one@mail>', snippet: 'Hi there' },
    { direction: 'outbound', occurred_at: '2026-08-07T10:00:01Z', thread_id: 'tA', subject: 'your booking page', snippet: 'idempotency marker' },
  ], { email: 'p@x.com' });
  assert.equal(target.anchor, 'outbound');
  assert.equal(target.threadId, 'tA');
  assert.equal(target.to, 'p@x.com');
  assert.equal(target.subject, 'Re: your booking page');
  assert.equal(target.inReplyTo, '<one@mail>', 'the marker row is never the anchor');
});

test('the V2 cap blocks a hand follow-up, never a reply', () => {
  const capped = canSendHumanReply(person({ emails_sent: 3, rating: '💚' }), { thread: thread({ anchor: 'outbound', latestInboundId: null }), body: 'One more.' });
  assert.equal(capped.ok, false);
  assert.equal(capped.block, BLOCK.CAPPED);
  // Two touches on a green rating leaves room for the final one.
  assert.equal(canSendHumanReply(person({ emails_sent: 2, rating: '💚' }), { thread: thread({ anchor: 'outbound' }), body: 'One more.' }).ok, true);
  // Non-green caps at two.
  assert.equal(canSendHumanReply(person({ emails_sent: 2, rating: null }), { thread: thread({ anchor: 'outbound' }), body: 'One more.' }).block, BLOCK.CAPPED);
  // And an inbound-anchored REPLY is never capped (the test above this file
  // already proves emails_sent 999 does not block one).
});

test('a reply arriving after a silence-draft stops the send', () => {
  const v = canSendHumanReply(person(), {
    thread: thread({ anchor: 'outbound' }),
    body: 'Follow-up written against silence.',
    fingerprint: { latestInboundId: null },
    latest: { message_id: 'fresh-inbound' },
  });
  assert.equal(v.ok, false);
  assert.equal(v.block, BLOCK.STALE);
  assert.match(v.reason, /just wrote back/);
});

test('a machine talking is not a conversation: auto inbound cannot lift the cap', () => {
  // Two capped prospects got a fourth touch on 2026-08-19 because their
  // out-of-office acks anchored the thread as 'inbound' and skipped the cap.
  const auto = { direction: 'inbound', occurred_at: '2026-08-08T10:00:00Z', thread_id: 'tA', classification: 'out-of-office', from_address: 'p@x.com', message_id: 'ooo1' };
  const ours = { direction: 'outbound', occurred_at: '2026-08-07T10:00:00Z', thread_id: 'tA', subject: 'your intake form', rfc_message_id: '<us@mail>', snippet: 'Hi' };
  const target = replyTarget([auto, ours], { email: 'p@x.com' });
  assert.equal(target.anchor, 'outbound', 'an OOO does not make it a conversation');
  // A real human message still wins the anchor.
  const human = { ...auto, classification: 'question', message_id: 'h1', occurred_at: '2026-08-09T10:00:00Z' };
  assert.equal(replyTarget([human, auto, ours], { email: 'p@x.com' }).anchor, 'inbound');
});

test('a follow-up send advances the stage; a reply send never does', () => {
  const route = readFileSync(new URL('../app/api/reply-send/route.js', import.meta.url), 'utf8');
  assert.match(route, /target\.anchor === 'outbound'/);
  assert.match(route, /stage = \?, next_action_date = NULL/);
  assert.match(route, /Email \$\{Math\.min\(touches, 5\)\}/);
});
