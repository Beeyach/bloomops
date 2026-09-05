// What the drafting model is allowed to know.
//
// The risk with drafting from a database is invention: a diagnosis nobody
// made, a price nobody agreed. These tests are mostly about what does NOT
// reach the prompt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildThread, buildFacts, buildReplyContext, buildReplyPrompt, REPLY_SYSTEM } from '../lib/reply-context.mjs';

const ev = (o) => ({ matched_by: 'thread', in_reply_to: '<x>', ...o });

const THREAD = [
  ev({ direction: 'outbound', occurred_at: '2026-08-01T09:00:00Z', subject: 'your booking page', snippet: 'Hi Mary Ann, I noticed a couple of things.' }),
  ev({ direction: 'inbound', occurred_at: '2026-08-02T10:00:00Z', snippet: 'Not the kind of upkeep I need most.' }),
  ev({ direction: 'inbound', occurred_at: '2026-08-02T10:05:00Z', snippet: 'I reconsidered. I would like the one-time cleanup.' }),
  ev({ direction: 'outbound', occurred_at: '2026-08-03T08:00:00Z', snippet: 'Great, I can do that.' }),
  ev({ direction: 'inbound', occurred_at: '2026-08-04T22:00:00Z', snippet: 'Why does a post appear twice? It&#39;s never happened before.' }),
];

test('the thread is oldest first, and says who spoke', () => {
  const t = buildThread(THREAD);
  assert.equal(t.length, 5);
  assert.equal(t[0].from, 'Ary');
  assert.equal(t[4].from, 'them');
  assert.ok(t[0].at < t[4].at, 'chronological');
});

test('entities are decoded and quoted chains are stripped before the model sees them', () => {
  const t = buildThread(THREAD);
  assert.match(t[4].text, /It's never happened before/);
  assert.ok(!t[4].text.includes('&#39;'));
});

test('a newsletter never becomes conversation context', () => {
  const withBlast = [...THREAD, {
    direction: 'inbound', occurred_at: '2026-08-05T14:00:00Z',
    matched_by: 'domain', in_reply_to: null, refs: null,
    snippet: 'Hey Audit, one of the biggest mistakes people make...',
  }];
  const t = buildThread(withBlast);
  assert.ok(!t.some((m) => /biggest mistakes/.test(m.text)), 'the blast is not part of the conversation');
});

test('no agreed price means the model is told so explicitly', () => {
  const facts = buildFacts({ business_name: 'X', stage: 'Interested' });
  assert.ok(facts.some((f) => /No agreed price or offer is recorded/.test(f)));
  assert.ok(facts.some((f) => /Do not name a price/.test(f)));
});

test('an accepted offer is carried, and never restated as a number', () => {
  const facts = buildFacts({ business_name: 'X', offer_accepted_at: '2026-08-03T00:00:00Z' });
  assert.ok(facts.some((f) => /accepted an offer on 2026-08-03/.test(f)));
  assert.ok(facts.some((f) => /do not restate or change a price/i.test(f)));
  assert.ok(!facts.some((f) => /\$|\bUSD\b/.test(f)), 'no invented figure');
});

test('a client is framed as client service, not prospecting', () => {
  const facts = buildFacts({ business_name: 'Good Energy Coach', stage: 'Interested' }, { isClient: true });
  assert.ok(facts.some((f) => /CLIENT\. This is client service, not prospecting/.test(f)));
  assert.ok(!facts.some((f) => /^Stage:/.test(f)), 'a client has no prospecting stage to report');
});

test('nothing is invented: only fields that hold a value appear', () => {
  const facts = buildFacts({ business_name: 'X' });
  assert.ok(!facts.some((f) => /^Person:/.test(f)));
  assert.ok(!facts.some((f) => /^Website:/.test(f)));
  assert.ok(!facts.some((f) => /^Country:/.test(f)));
});

test('owed is true when they wrote last', () => {
  assert.equal(buildReplyContext({ prospect: {}, events: THREAD }).owed, true);
  const answered = [...THREAD, ev({ direction: 'outbound', occurred_at: '2026-08-05T09:00:00Z', snippet: 'Let me look.' })];
  assert.equal(buildReplyContext({ prospect: {}, events: answered }).owed, false);
});

test('the prompt carries the thread and the message to answer', () => {
  const ctx = buildReplyContext({ prospect: { business_name: 'Mary Ann' }, events: THREAD });
  const prompt = buildReplyPrompt(ctx);
  assert.match(prompt, /THREAD, oldest first/);
  assert.match(prompt, /THE MESSAGE TO ANSWER/);
  assert.match(prompt, /appear twice/);
  assert.match(prompt, /Write only the reply body/);
});

test('with no stored message the prompt refuses to pretend', () => {
  const ctx = buildReplyContext({ prospect: {}, events: [] });
  assert.match(buildReplyPrompt(ctx), /do not pretend to answer anything/);
});

test('the voice rules forbid invention and fix the signature', () => {
  assert.match(REPLY_SYSTEM, /Do not invent a technical cause, a price, a scope, a delivery date, a meeting/);
  assert.match(REPLY_SYSTEM, /Never use an em dash/);
  assert.match(REPLY_SYSTEM, /Answer what they actually wrote, first/);
  assert.match(REPLY_SYSTEM, /Thanks,\nAry/);
});

test("the voice rules carry Ary's register, not a generic assistant's", () => {
  // The failure this guards: Mary Ann wrote a comment with no question in it,
  // and the draft opened "Good question". Never again.
  assert.match(REPLY_SYSTEM, /If their message asks no question, do not answer one/);
  assert.match(REPLY_SYSTEM, /Never open with "Good question" or "Great question"/);
  // Ary found the duplicate posts; the draft must not hand her discovery to
  // the prospect as if it were theirs.
  assert.match(REPLY_SYSTEM, /Never write as if they discovered it/);
  assert.match(REPLY_SYSTEM, /No exclamation marks, no emojis, no semicolons, no numbered lists/);
  assert.match(REPLY_SYSTEM, /fix, clean up, set up, work on, check, follow up/);
});
