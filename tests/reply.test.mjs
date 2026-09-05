import test from 'node:test';
import assert from 'node:assert/strict';
import { matchReply, bareAddress, domainOf, isPublicDomain, isUnanswered, MATCH } from '../lib/reply-match.mjs';
import {
  classifyByRules, parseClassifyResult, actionFor, buildClassifyParts,
  REPLY, REAL_REPLY, POSITIVE_REPLY, NEEDS_HUMAN,
} from '../lib/reply-classify.mjs';

// ── Matching ────────────────────────────────────────────────────────────
// One person's reply on another person's record is a data-integrity failure,
// not a UX inconvenience. These are the tests that keep it from happening.

const CANDIDATES = [
  { id: 1, name: 'Val', email: 'val@wellnessvaleria.com.au', domain: 'wellnessvaleria.com.au' },
  { id: 2, name: 'Kym', email: 'kym@heartandsoul.com', domain: 'heartandsoul.com' },
  { id: 3, name: 'Dana', email: 'dana@bigclinic.com', domain: 'bigclinic.com' },
  { id: 4, name: 'Sam', email: 'sam@bigclinic.com', domain: 'bigclinic.com' },
];

test('an owner replying from a personal account still matches', () => {
  // The reason the skill matches on the address WE SENT TO: Val's record is
  // val@wellnessvaleria.com.au and her reply came from a gmail address.
  const m = matchReply(
    { fromAddress: 'valeria.personal@gmail.com', sentToAddress: 'val@wellnessvaleria.com.au' },
    { candidates: CANDIDATES }
  );
  assert.equal(m.prospectId, 1);
  assert.equal(m.how, MATCH.SENT_TO);
});

test('a known thread is the strongest signal', () => {
  const m = matchReply(
    { fromAddress: 'someone.else@gmail.com', threadId: 't-99' },
    { candidates: CANDIDATES, knownThreads: new Map([['t-99', 2]]) }
  );
  assert.equal(m.prospectId, 2);
  assert.equal(m.how, MATCH.THREAD);
});

test('two prospects at one company is ambiguous, never a guess', () => {
  const m = matchReply({ fromAddress: 'reception@bigclinic.com' }, { candidates: CANDIDATES });
  assert.equal(m.prospectId, null);
  assert.equal(m.how, MATCH.AMBIGUOUS);
  assert.equal(m.candidates.length, 2);
  assert.match(m.reason, /Not guessing/);
});

test('a shared mailbox domain never matches anybody', () => {
  // Otherwise every gmail reply attaches to whichever gmail prospect exists.
  const withGmail = [...CANDIDATES, { id: 9, name: 'Jo', email: 'jo@gmail.com', domain: '' }];
  const m = matchReply({ fromAddress: 'stranger@gmail.com' }, { candidates: withGmail });
  assert.equal(m.prospectId, null);
  assert.equal(m.how, MATCH.NONE);
});

test('a company domain with exactly one prospect matches, at medium confidence', () => {
  const m = matchReply({ fromAddress: 'reception@heartandsoul.com' }, { candidates: CANDIDATES });
  assert.equal(m.prospectId, 2);
  assert.equal(m.how, MATCH.DOMAIN);
  assert.equal(m.confidence, 'medium');
});

test('a name in the body never matches anything', () => {
  // The one rule the brief calls out by name.
  const m = matchReply(
    { fromAddress: 'random@nowhere.com', subject: 'About Kym', snippet: 'Kym said to contact you' },
    { candidates: CANDIDATES }
  );
  assert.equal(m.prospectId, null);
});

test('addresses are parsed out of display names and cased consistently', () => {
  assert.equal(bareAddress('Kym Stewart <KYM@HeartAndSoul.com>'), 'kym@heartandsoul.com');
  assert.equal(domainOf('a@b.co.uk'), 'b.co.uk');
  assert.equal(isPublicDomain('GMAIL.COM'), true);
  assert.equal(isPublicDomain('heartandsoul.com'), false);
});

// ── Answered / unanswered from real timestamps ──────────────────────────

test('an inbound with no later outbound is unanswered', () => {
  const events = [
    { id: 1, direction: 'outbound', occurred_at: '2026-08-01T09:00:00Z' },
    { id: 2, direction: 'inbound', occurred_at: '2026-08-08T14:00:00Z' },
  ];
  assert.equal(isUnanswered(events), true);
});

test('an outbound after the reply resolves it, even on the same day', () => {
  // Real timestamps can resolve ordering that a date column cannot.
  const events = [
    { id: 1, direction: 'inbound', occurred_at: '2026-08-08T14:00:00Z' },
    { id: 2, direction: 'outbound', occurred_at: '2026-08-08T16:30:00Z' },
  ];
  assert.equal(isUnanswered(events), false);
});

test('an outbound BEFORE the reply does not count as answering it', () => {
  const events = [
    { id: 1, direction: 'outbound', occurred_at: '2026-08-08T09:00:00Z' },
    { id: 2, direction: 'inbound', occurred_at: '2026-08-08T14:00:00Z' },
  ];
  assert.equal(isUnanswered(events), true);
});

test('two replies before an answer are still unanswered', () => {
  const events = [
    { id: 1, direction: 'outbound', occurred_at: '2026-08-01T09:00:00Z' },
    { id: 2, direction: 'inbound', occurred_at: '2026-08-08T10:00:00Z' },
    { id: 3, direction: 'inbound', occurred_at: '2026-08-08T11:00:00Z' },
  ];
  assert.equal(isUnanswered(events), true);
});

// ── Deterministic classification ────────────────────────────────────────
// Half of a cold inbox is autoresponders, bounces and unsubscribes. None of
// them needs a model call.

test('bounces are caught by sender and by subject', () => {
  assert.equal(classifyByRules({ fromAddress: 'MAILER-DAEMON@googlemail.com' }).classification, REPLY.BOUNCE);
  assert.equal(classifyByRules({ subject: 'Undeliverable: your message' }).classification, REPLY.BOUNCE);
  assert.equal(classifyByRules({ subject: 'Delivery Status Notification (Failure)' }).classification, REPLY.BOUNCE);
});

test('out-of-office is caught by header, subject and body', () => {
  assert.equal(classifyByRules({ headers: { 'auto-submitted': 'auto-replied' } }).classification, REPLY.OUT_OF_OFFICE);
  assert.equal(classifyByRules({ subject: 'Automatic reply: your email' }).classification, REPLY.OUT_OF_OFFICE);
  assert.equal(classifyByRules({ snippet: "I'm currently out of the office until the 20th." }).classification, REPLY.OUT_OF_OFFICE);
});

test('an unsubscribe buried at the end of a real reply is still caught', () => {
  // It is frequently the last line, and missing it is the one mistake with a
  // legal edge to it.
  const r = classifyByRules({
    snippet: 'Thanks for reaching out, this looks interesting but please remove me from your list.',
  });
  assert.equal(r.classification, REPLY.UNSUBSCRIBE);
  assert.equal(r.confidence, 'high');
});

test('a genuine human reply is left for the model', () => {
  assert.equal(classifyByRules({ snippet: 'Sounds interesting, what does it cost?' }), null);
  assert.equal(classifyByRules({ snippet: 'No thanks.' }), null, '"no thanks" and "no, thanks, what does it cost" start identically');
});

// ── Model output handling ───────────────────────────────────────────────

test('a low-confidence label is downgraded to unknown', () => {
  // A guess must never silently stop or restart somebody's outreach.
  const r = parseClassifyResult('{"classification":"decline","confidence":"low","why":"maybe","when_iso":null}');
  assert.equal(r.classification, REPLY.UNKNOWN);
  assert.equal(r.downgradedFrom, 'decline');
});

test('an invented date is rejected unless it is a real one', () => {
  assert.equal(parseClassifyResult('{"classification":"not-now","confidence":"high","when_iso":"2026-13-45"}').whenIso, null);
  assert.equal(parseClassifyResult('{"classification":"not-now","confidence":"high","when_iso":"2026-10-01"}').whenIso, '2026-10-01');
});

test('unparseable output is unknown, not a crash', () => {
  assert.equal(parseClassifyResult('the model said hello').classification, REPLY.UNKNOWN);
  assert.equal(parseClassifyResult('').confidence, 'low');
});

test('a label outside the list becomes unknown', () => {
  assert.equal(parseClassifyResult('{"classification":"enthusiastic","confidence":"high"}').classification, REPLY.UNKNOWN);
});

// ── What a classification does ──────────────────────────────────────────

test('interested stops outbound and asks for a person', () => {
  const a = actionFor(REPLY.INTERESTED);
  assert.equal(a.stopOutbound, true);
  assert.equal(a.needsHuman, true);
  assert.equal(a.stage, 'Interested');
});

test('unsubscribe marks do-not-contact, not merely a decline', () => {
  const a = actionFor(REPLY.UNSUBSCRIBE);
  assert.equal(a.doNotContact, true);
  assert.equal(a.unsubscribed, true);
  assert.equal(a.stopOutbound, true);
});

test('out of office is not a reply and must not inflate anything', () => {
  const a = actionFor(REPLY.OUT_OF_OFFICE);
  assert.equal(a.isRealReply, false);
  assert.equal(a.replyType, null);
  assert.equal(a.stopOutbound, false, 'they are back next week, the sequence continues');
  assert.ok(!REAL_REPLY.has(REPLY.OUT_OF_OFFICE));
  assert.ok(!REAL_REPLY.has(REPLY.BOUNCE));
});

test('not-now with a date parks it, without one asks Ary', () => {
  const dated = actionFor(REPLY.NOT_NOW, { whenIso: '2026-10-01' });
  assert.equal(dated.nextActionDate, '2026-10-01');
  assert.equal(dated.needsHuman, false);
  const vague = actionFor(REPLY.NOT_NOW, { whenIso: null });
  assert.equal(vague.nextActionDate, null, 'never invents a date');
  assert.equal(vague.needsHuman, true);
});

test('wrong person stops this contact, not the whole company', () => {
  const a = actionFor(REPLY.WRONG_PERSON);
  assert.equal(a.stopOutbound, true);
  assert.equal(a.stage, null, 'the business may be fine behind another address');
  assert.equal(a.needsHuman, true);
});

test('an unreadable reply still stops outbound', () => {
  // Failing closed: we do not know what they said, so we do not keep sending.
  const a = actionFor(REPLY.UNKNOWN);
  assert.equal(a.stopOutbound, true);
  assert.equal(a.needsHuman, true);
});

test('positive reply is narrower than not-a-decline', () => {
  assert.ok(POSITIVE_REPLY.has(REPLY.INTERESTED));
  assert.ok(POSITIVE_REPLY.has(REPLY.PRICE));
  assert.ok(!POSITIVE_REPLY.has(REPLY.OBJECTION), 'an objection is engagement, not interest');
  assert.ok(!POSITIVE_REPLY.has(REPLY.NOT_NOW));
});

test('everything warm, and anything unreadable, needs a person', () => {
  for (const k of [REPLY.INTERESTED, REPLY.QUESTION, REPLY.PRICE, REPLY.OBJECTION, REPLY.REFERRAL, REPLY.WRONG_PERSON, REPLY.UNKNOWN]) {
    assert.ok(NEEDS_HUMAN.has(k), k);
  }
  assert.ok(!NEEDS_HUMAN.has(REPLY.BOUNCE));
  assert.ok(!NEEDS_HUMAN.has(REPLY.OUT_OF_OFFICE));
});

test('the classify prompt forbids inventing a date and demands one label', () => {
  const parts = buildClassifyParts({}, { subject: 'hi', snippet: 'sounds good' });
  assert.match(parts.system, /Never invent a date/);
  assert.match(parts.system, /pick exactly one/);
  assert.match(parts.system, /"Not right now" is not-now, never decline/);
  // It also extracts what the reply stated now, which is real extra work and
  // real extra tokens. Still one call on the cheap tier, still small enough to
  // be worth guarding.
  assert.match(parts.system, /Stated, not implied/);
  assert.ok(parts.system.length < 1800, 'this runs on the cheap tier, keep it small');
});

// ── The RFC reply chain (added with the Gmail transport) ──────────────────
//
// The strongest matching evidence there is, and the reason it matters: the
// owner replies from a personal account on a domain nobody has ever seen, and
// the address rules all miss. In-Reply-To does not miss, because their mail
// client wrote it by copying the Message-ID of the email we sent.

test('a reply that names one of ours as its parent matches, whatever address it came from', async () => {
  const { matchReply, MATCH } = await import('../lib/reply-match.mjs');
  const r = matchReply(
    { fromAddress: 'kym.personal@gmail.com', inReplyTo: 'ours-7@bloomwired.io', references: [] },
    { candidates: [{ id: 9, email: 'info@coastal.com.au', domain: 'coastal.com.au' }],
      knownRfcIds: new Map([['ours-7@bloomwired.io', 9]]) }
  );
  assert.equal(r.prospectId, 9);
  assert.equal(r.how, MATCH.IN_REPLY_TO);
  assert.equal(r.confidence, 'high');
});

test('our message anywhere in the ancestry still matches', async () => {
  const { matchReply, MATCH } = await import('../lib/reply-match.mjs');
  const r = matchReply(
    { fromAddress: 'someone@else.com', references: ['third-party@x', 'ours-3@bloomwired.io'] },
    { candidates: [], knownRfcIds: new Map([['ours-3@bloomwired.io', 4]]) }
  );
  assert.equal(r.prospectId, 4);
  assert.equal(r.how, MATCH.REFERENCES);
});

test('the reply chain outranks the address rules but never the thread', async () => {
  const { matchReply, MATCH } = await import('../lib/reply-match.mjs');
  // Thread first: it means an earlier message in this exact conversation was
  // matched and stored, which is the same evidence plus a decision already made.
  const both = matchReply(
    { threadId: 't', fromAddress: 'kym@coastal.com.au', inReplyTo: 'ours-1@bloomwired.io' },
    { candidates: [{ id: 2, email: 'kym@coastal.com.au' }],
      knownThreads: new Map([['t', 1]]),
      knownRfcIds: new Map([['ours-1@bloomwired.io', 3]]) }
  );
  assert.equal(both.how, MATCH.THREAD);
  assert.equal(both.prospectId, 1);
});

test('an unknown reply chain never invents a match', async () => {
  const { matchReply } = await import('../lib/reply-match.mjs');
  const r = matchReply(
    { fromAddress: 'stranger@nowhere.com', inReplyTo: 'not-ours@elsewhere.com', references: ['also-not@ours.com'] },
    { candidates: [], knownRfcIds: new Map([['ours-1@bloomwired.io', 1]]) }
  );
  assert.equal(r.prospectId, null, 'unmatched is the safe answer, not the nearest record');
});

// ── What the reply said, kept apart from what it was ──────────────────────
//
// Conversation evidence. A person saying "we already use Acuity" is not the
// same kind of fact as a site check finding no booking system, and the two must
// never merge: one is what somebody told us, the other is what we verified.

test('stated facts are extracted with their own source', async () => {
  const { parseClassifyResult } = await import('../lib/reply-classify.mjs');
  const r = parseClassifyResult(JSON.stringify({
    classification: 'objection', confidence: 'high', why: 'already has a provider',
    when_iso: null, referred_to: null, objection: 'we already use Acuity',
    provider: 'Acuity', new_contact: null, price_concern: false,
  }));
  assert.equal(r.extracted.source, 'reply', 'provenance travels with the fact');
  assert.equal(r.extracted.provider, 'Acuity');
  assert.equal(r.extracted.objection, 'we already use Acuity');
});

test('a reply that stated nothing extracts nothing', async () => {
  const { parseClassifyResult } = await import('../lib/reply-classify.mjs');
  const r = parseClassifyResult(JSON.stringify({
    classification: 'decline', confidence: 'high', why: 'no thanks',
    referred_to: null, objection: null, provider: null, new_contact: null, price_concern: false,
  }));
  assert.equal(r.extracted, null, 'an empty object would read as "we learned something"');
});

test('the model saying the string "null" is not a fact', async () => {
  const { extractedFrom } = await import('../lib/reply-classify.mjs');
  assert.equal(extractedFrom({ provider: 'null', objection: '  ', referred_to: 'NULL' }), null);
});

test('a named date is kept, and only a real one', async () => {
  const { parseClassifyResult } = await import('../lib/reply-classify.mjs');
  const good = parseClassifyResult('{"classification":"not-now","confidence":"high","why":"after summer","when_iso":"2026-09-01"}');
  assert.equal(good.extracted.requestedDate, '2026-09-01');
  const bad = parseClassifyResult('{"classification":"not-now","confidence":"high","why":"x","when_iso":"2026-02-31"}');
  assert.equal(bad.whenIso, null, 'the 31st of February is not a date');
});
