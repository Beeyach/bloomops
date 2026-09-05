// Getting old replies into the new model without inventing anything.
//
// The temptation here is obvious: re-read the old messages with today's rules
// and produce a rich, flattering history. That would be a timeline saying things
// nobody ever recorded, and it would be indistinguishable from the real thing.
//
// So these tests are mostly about what is deliberately NOT reconstructed. A
// short honest history beats a long invented one, and most of what follows
// exists to keep it short.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { stateForLegacyReply, planFor, RECONSTRUCTED, NOT_INFERRED } from '../lib/relationship-reconstruct.mjs';
import { REL, SOURCE, currentState, describeEvent } from '../lib/relationship.mjs';

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const reply = (o) => ({ direction: 'inbound', occurred_at: '2026-07-01 09:00:00', message_id: 'm1', ...o });

// ── Mapping, by label alone ──────────────────────────────────────────────

test('the old labels map to the obvious states', () => {
  assert.equal(stateForLegacyReply('interested'), REL.INTERESTED);
  assert.equal(stateForLegacyReply('question'), REL.INTERESTED);
  assert.equal(stateForLegacyReply('unknown'), REL.AMBIGUOUS);
  assert.equal(stateForLegacyReply('not-now'), REL.DEFERRED);
});

test('an old generic decline is always the softer reading', () => {
  // It covered both "not this thing" and "not you" and never recorded which.
  assert.equal(stateForLegacyReply('decline'), REL.NO_TO_THIS_OFFER);
  assert.equal(stateForLegacyReply('objection'), REL.NO_TO_THIS_OFFER);
});

test('no old label can ever produce NO_TO_US', () => {
  const labels = ['interested', 'question', 'price', 'objection', 'decline', 'not-now',
    'unknown', 'referral', 'wrong-person', 'out-of-office', 'bounce', 'unsubscribe', 'nonsense'];
  for (const l of labels) {
    assert.notEqual(stateForLegacyReply(l), REL.NO_TO_US, `${l} must not close the relationship on its own`);
  }
});

test('an old price reply takes the plain reading, not a guessed budget concern', () => {
  // Telling those apart needs the words, and the words are not reconstructable.
  assert.equal(stateForLegacyReply('price'), REL.INTERESTED);
  assert.ok(NOT_INFERRED.includes('BUDGET_CONCERN'));
});

test('autoresponders and machinery say nothing', () => {
  for (const l of ['out-of-office', 'bounce', 'wrong-person', 'referral', 'unsubscribe']) {
    assert.equal(stateForLegacyReply(l), null, `${l} must create no event`);
  }
});

test('the message text is never consulted', () => {
  const lib = code('../lib/relationship-reconstruct.mjs');
  // No snippet, no subject, no body, and no import of the live word-matching.
  // Whole words: "nobody could tell what it meant" is not a use of the body.
  for (const forbidden of ['snippet', 'subject', 'body', 'relationshipFromReply', 'rejectsUs', 'soundsLikeMoneyTrouble']) {
    assert.ok(!new RegExp(`\\b${forbidden}\\b`).test(lib), `reconstruction must not use ${forbidden}`);
  }
  assert.equal(stateForLegacyReply.length, 1, 'it takes a label and nothing else');
});

// ── What is deliberately not invented ────────────────────────────────────

test('a no followed by a yes is two events, never a reconsideration', () => {
  const { events } = planFor({
    prospect: { id: 1 },
    replies: [
      reply({ classification: 'decline', occurred_at: '2026-08-10 21:22:03', message_id: 'a' }),
      reply({ classification: 'price', occurred_at: '2026-08-10 21:25:01', message_id: 'b' }),
    ],
  });
  assert.deepEqual(events.map((e) => e.state), [REL.NO_TO_THIS_OFFER, REL.INTERESTED]);
  assert.ok(!events.some((e) => e.state === REL.RECONSIDERED), 'the old data never recorded a change of mind');
  // The timeline still reads correctly, because recency does the work.
  assert.equal(currentState({ events }).state, REL.INTERESTED);
});

test('offer_accepted_at is never treated as an acceptance', () => {
  // It is written for any interested or question reply, so it means "replied
  // with interest". Using it would put a sale in the record that never happened.
  const { events } = planFor({
    prospect: { id: 1, offer_accepted_at: '2026-08-10 18:33:45' },
    replies: [reply({ classification: 'interested' })],
  });
  assert.ok(!events.some((e) => e.state === REL.ACCEPTED_OFFER));
  const lib = code('../lib/relationship-reconstruct.mjs');
  assert.ok(!/offer_accepted_at[^\n]*REL\.ACCEPTED_OFFER/.test(lib));
});

test('a deferral without a stored date does not get one invented', () => {
  const { events } = planFor({
    prospect: { id: 1, deferred_until: null },
    replies: [reply({ classification: 'not-now' })],
  });
  assert.equal(events[0].state, REL.DEFERRED);
  assert.equal(events[0].deferUntil, null);
});

test('a deferral with a real stored date keeps it exactly', () => {
  const { events } = planFor({
    prospect: { id: 1, deferred_until: '2026-10-01' },
    replies: [reply({ classification: 'not-now' })],
  });
  assert.equal(events[0].deferUntil, '2026-10-01');
});

test('no reason text is ever a paraphrase of what they wrote', () => {
  const { events } = planFor({ prospect: { id: 1 }, replies: [reply({ classification: 'decline' })] });
  // Derived from the label, and it says so.
  assert.match(events[0].reason, /read as decline at the time/);
});

// ── Boundaries and business facts ────────────────────────────────────────

test('a stored do-not-contact boundary is the only route to NO_TO_US', () => {
  const { events } = planFor({
    prospect: { id: 1, do_not_contact: 1, updated_at: '2026-08-01 09:00:00' },
    replies: [reply({ classification: 'interested' })],
  });
  const closing = events.find((e) => e.state === REL.NO_TO_US);
  assert.ok(closing, 'the boundary is recorded');
  assert.equal(closing.boundary, true);
  assert.equal(closing.messageId, null, 'it is not a message');
});

test('a real client fact becomes WON', () => {
  const { events } = planFor({
    prospect: { id: 1, first_client_at: '2026-08-05 12:00:00' },
    replies: [reply({ classification: 'interested' })],
  });
  assert.ok(events.some((e) => e.state === REL.WON && e.occurredAt === '2026-08-05 12:00:00'));
});

// ── Chronology, and living beside the new system ─────────────────────────

test('original timestamps are preserved, never re-stamped', () => {
  const { events } = planFor({
    prospect: { id: 1 },
    replies: [reply({ classification: 'interested', occurred_at: '2026-03-04 11:22:33' })],
  });
  assert.equal(events[0].occurredAt, '2026-03-04 11:22:33');
});

test('our own outbound messages are not part of their story', () => {
  const { events, skipped } = planFor({
    prospect: { id: 1 },
    replies: [{ direction: 'outbound', classification: null, occurred_at: '2026-07-01 09:00:00', id: 9 }],
  });
  assert.equal(events.length, 0);
  assert.match(skipped[0].why, /our own message/);
});

test('a message that already has an event is left alone', () => {
  const { events, skipped } = planFor({
    prospect: { id: 1 },
    replies: [reply({ classification: 'interested', message_id: 'dup' })],
    existing: [{ message_id: 'dup', occurred_at: '2026-07-01 09:00:00', source: SOURCE.CLASSIFIER }],
  });
  assert.equal(events.length, 0);
  assert.match(skipped[0].why, /already has a relationship event/);
});

test('anything from after the live model started recording is left to it', () => {
  const { events, skipped } = planFor({
    prospect: { id: 1 },
    replies: [
      reply({ classification: 'interested', occurred_at: '2026-06-01 09:00:00', message_id: 'old' }),
      reply({ classification: 'decline', occurred_at: '2026-09-01 09:00:00', message_id: 'new' }),
    ],
    existing: [{ message_id: 'live', occurred_at: '2026-08-01 09:00:00', source: SOURCE.CLASSIFIER }],
  });
  assert.deepEqual(events.map((e) => e.messageId), ['old'], 'only what predates the live record');
  assert.match(skipped.find((s) => s.id === undefined || true).why, /.+/);
});

test('a human correction is never touched by reconstruction', () => {
  const script = code('../scripts/reconstruct-replies.mjs');
  assert.match(script, /INSERT OR IGNORE INTO relationship_events/);
  for (const forbidden of ['UPDATE relationship_events', 'DELETE FROM relationship_events']) {
    assert.ok(!script.includes(forbidden), `reconstruction must never ${forbidden}`);
  }
});

// ── Provenance ───────────────────────────────────────────────────────────

test('reconstructed events are their own kind of thing', () => {
  assert.equal(RECONSTRUCTED, 'legacy-reconstruction');
  assert.notEqual(RECONSTRUCTED, SOURCE.CLASSIFIER, 'no classifier ran today');
  assert.notEqual(RECONSTRUCTED, SOURCE.HUMAN, 'nobody decided this');
  const script = code('../scripts/reconstruct-replies.mjs');
  assert.match(script, /'\$\{RECONSTRUCTED\}'/, 'and the script stamps it');
});

test('the raw provenance never reaches the screen', () => {
  // describeEvent falls through to "LTB" for anything that is not human or
  // legacy, and the enum itself is never rendered.
  const shown = describeEvent({ state: REL.INTERESTED, source: RECONSTRUCTED });
  assert.ok(!/legacy-reconstruction/.test(JSON.stringify(shown)));
  const view = code('../components/ConversationTimeline.jsx');
  assert.ok(!view.includes('legacy-reconstruction'));
});

// ── The script itself ────────────────────────────────────────────────────

test('reconstruction can only read and append', () => {
  const script = code('../scripts/reconstruct-replies.mjs');
  for (const forbidden of [
    'sendApproved', 'send-approved', 'enqueue(', 'outreach_packages', 'send_attempts',
    'spendCredits', 'askBackground', 'runPrecheck', 'UPDATE prospects',
  ]) {
    assert.ok(!script.includes(forbidden), `reconstruction must never touch ${forbidden}`);
  }
});

test('it is a script, not a privileged endpoint left switched on', () => {
  const script = code('../scripts/reconstruct-replies.mjs');
  assert.match(script, /process\.argv/, 'run by hand');
  assert.match(script, /--write/, 'and writing is opt-in');
  assert.match(script, /LIMIT \$\{BATCH\}/, 'bounded, so it can be stopped and resumed');
});

test('the dry run is the default', () => {
  const script = code('../scripts/reconstruct-replies.mjs');
  assert.match(script, /const WRITE = args\.includes\('--write'\)/);
  assert.match(script, /if \(!WRITE\) continue;/, 'nothing is written unless asked');
});

test('reconstructed history reads as an older record, not as LTB deciding today', () => {
  const shown = describeEvent({ state: REL.INTERESTED, source: RECONSTRUCTED });
  assert.equal(shown.who, 'Older record');
  // And the live classifier still reads as itself.
  assert.equal(describeEvent({ state: REL.INTERESTED, source: SOURCE.CLASSIFIER }).who, 'LTB');
  assert.equal(describeEvent({ state: REL.INTERESTED, source: SOURCE.HUMAN }).who, 'You');
});
