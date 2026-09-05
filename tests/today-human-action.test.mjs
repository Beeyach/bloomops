// Replied is a history. Today is a queue. They are not the same list.
//
// The cold sequence stops the moment anybody writes back, which is right, and
// it is why every one of the sixty-eight replied conversations was routed to
// "needs a human". Today then drew all sixty-eight — including thirty-six
// people who had already said no to this offer, six waits that are not over,
// two lost and one client. None of them were waiting on Ary.
//
// The distinction these tests hold: which TAB a conversation lives in is about
// what happened, and whether it is on TODAY is about what is owed now. The
// second question belongs to the relationship model and nothing here may
// answer it locally.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { prospectActionState, viewFor, VIEW, PILE } from '../lib/prospect-action.mjs';
import { todaySections } from '../lib/today-sections.mjs';
import { REL, currentState, WANTS_A_PERSON, CLOSED_TO_OUTREACH } from '../lib/relationship.mjs';

const NOW = new Date('2026-08-11T12:00:00Z');
const iso = (d) => new Date(NOW.getTime() + d * 86400000).toISOString().slice(0, 10);

// A prospect who replied, and the record of what that reply meant.
const talker = (id, { stage = 'Email 2', deferUntil = null, extra = {} } = {}) => ({
  id, name: `Person ${id}`, business_name: `Business ${id}`, country: 'US',
  email: `p${id}@example.com`, rating: '💚', stage,
  emails_sent: 2, replied: 1, last_contact_date: iso(-6),
  next_action_date: deferUntil, ...extra,
});

const on = (p, opts) => {
  const s = todaySections([p], { now: NOW, ...opts });
  return s.needsYou.total === 1;
};
const state = (p) => prospectActionState(p, { now: NOW });

// An event-backed relationship, which is what production will have once the
// classifier has been running.
const evented = (id, relState, { deferUntil = null, stage = 'Email 2' } = {}) => ({
  prospect: talker(id, { stage }),
  relationship: currentState({
    events: [{ id: 1, state: relState, occurredAt: '2026-08-08T09:00:00Z', deferUntil }],
    now: NOW,
  }),
});

// ── 1. The Replied tab keeps everything ──────────────────────────────────

test('every reply state stays in the Replied tab, including the nos', () => {
  const everyone = [
    talker(1, { stage: 'Rejected' }),   // NO_TO_THIS_OFFER
    talker(2, { stage: 'Interested' }),
    talker(3, { stage: 'Snoozed', deferUntil: iso(30) }),
    talker(4, { stage: 'Lost' }),
    talker(5, { stage: 'Client' }),
    talker(6, { stage: 'Email 2' }),    // replied, nothing classified
  ];
  for (const p of everyone) {
    assert.equal(viewFor(state(p)), VIEW.REPLIED, `#${p.id} left the Replied tab`);
    assert.equal(state(p).pile, PILE.NEEDS_YOU, `#${p.id} changed pile`);
  }
});

// ── 2-5. What does NOT belong on Today ───────────────────────────────────

test('a no to this offer is not work, and is not closed either', () => {
  const p = talker(1, { stage: 'Rejected' });
  const s = state(p);
  assert.equal(s.label, 'Not interested');
  assert.match(s.detail, /Keep the relationship open/);
  assert.equal(s.relationship.closed, false, 'the relationship is intact');
  assert.equal(on(p), false, 'and it does not sit on Today');
});

test('a no to us is closed and never on Today', () => {
  const p = talker(1, { extra: { do_not_contact: 1 } });
  const s = state(p);
  assert.equal(s.pile, PILE.FINISHED, 'closed before anything else is asked');
  assert.equal(on(p), false);

  const { relationship } = evented(2, REL.NO_TO_US);
  assert.equal(relationship.closed, true);
  assert.equal(relationship.needsPerson, false);
});

test('a client is not work merely because they once replied', () => {
  const p = talker(1, { stage: 'Client' });
  assert.equal(state(p).label, 'Client');
  assert.equal(on(p), false);
});

test('a lost conversation is not work', () => {
  const p = talker(1, { stage: 'Lost' });
  assert.equal(state(p).label, 'Lost');
  assert.equal(on(p), false);
});

test('a wait that is not over stays off Today, and says when it ends', () => {
  const p = talker(1, { stage: 'Snoozed', deferUntil: iso(13) });
  const s = state(p);
  assert.equal(s.label, 'Deferred');
  assert.match(s.detail, new RegExp(iso(13)));
  assert.equal(s.relationship.needsPerson, false);
  assert.equal(on(p), false);
  // The date leads the row. "2 emails sent · last contact Jul 31" is true and
  // useless next to the one fact that explains why this is not on Today.
  assert.match(s.context, /^Waiting until Aug 24/);
});

test('a wait with no date says so on the row, rather than looking scheduled', () => {
  const p = talker(1, { stage: 'Snoozed' });
  const s = state(p);
  assert.match(s.context, /^No date was given/);
  assert.equal(on(p), true, 'and it is work, because nothing else will surface it');
});

// ── 6-11. What DOES belong on Today ──────────────────────────────────────

test('a wait that has come due is work again', () => {
  const p = talker(1, { stage: 'Snoozed', deferUntil: iso(-2) });
  const s = state(p);
  assert.equal(s.label, 'Deferred');
  assert.equal(s.relationship.needsPerson, true, 'the date has passed');
  assert.equal(on(p), true);
  assert.match(s.context, /^The date they asked for has passed/);
});

test('interested, ambiguous, budget, reconsidered and accepted all want a person', () => {
  const wanted = [REL.INTERESTED, REL.AMBIGUOUS, REL.BUDGET_CONCERN, REL.RECONSIDERED, REL.ACCEPTED_OFFER];
  for (const relState of wanted) {
    assert.ok(WANTS_A_PERSON.has(relState), `${relState} must want a person`);

    // With the events read (what the server has).
    const { prospect, relationship } = evented(1, relState);
    const withEvents = prospectActionState(prospect, { relationship, now: NOW });
    assert.equal(withEvents.pile, PILE.NEEDS_YOU);
    assert.equal(withEvents.relationship.needsPerson, true, `${relState} was filed as needing nobody`);

    // And without them (what the browser has). None of these five map from an
    // old stage, so they arrive as an unread reply — which also wants a person,
    // so the row reaches Today either way.
    assert.equal(todaySections([prospect], { now: NOW }).needsYou.total, 1,
      `${relState} never reached Today`);
  }
});

test('a reply nobody has classified is a reply nobody has read', () => {
  // Seventeen of these in production: the row says a person wrote, no event
  // says what they meant. Filing that as "nothing happened" hides the only
  // people on the list whose messages are genuinely unread.
  const p = talker(1, { stage: 'Email 2' });
  const s = state(p);
  assert.equal(s.relationship.state, REL.AMBIGUOUS);
  assert.equal(s.label, 'Replied, needs you');
  assert.equal(on(p), true);
});

// ── 12-13. The two counts are independent, and one policy decides ────────

test('the Replied count and the Needs-you count are not the same number', () => {
  const everyone = [
    talker(1, { stage: 'Rejected' }), talker(2, { stage: 'Rejected' }),
    talker(3, { stage: 'Snoozed', deferUntil: iso(20) }),
    talker(4, { stage: 'Lost' }), talker(5, { stage: 'Client' }),
    talker(6, { stage: 'Interested' }), talker(7, { stage: 'Email 2' }),
  ];
  const inReplied = everyone.filter((p) => viewFor(state(p)) === VIEW.REPLIED).length;
  const onToday = todaySections(everyone, { now: NOW }).needsYou.total;

  assert.equal(inReplied, 7, 'the history keeps all of them');
  assert.equal(onToday, 2, 'the queue keeps the two that want something');
});

test('Today asks the relationship model and never decides for itself', () => {
  const src = readFileSync(new URL('../lib/today-sections.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // The membership rule is one property read. No local set of states, no
  // second opinion about what a reply means.
  assert.match(src, /relationship\?\.needsPerson/);
  for (const b of ['NO_TO_THIS_OFFER', 'WANTS_A_PERSON', 'REL.', 'DEFERRED', 'reply_type']) {
    assert.ok(!src.includes(b), `Today must not reason about ${b} itself`);
  }
});

test('the legacy branch answers the same three questions as the event branch', () => {
  // It used to answer `state` and stop, so every caller asking "does this need
  // a person" got undefined — which reads as no.
  for (const [stage, expected] of [['Interested', true], ['Rejected', false], ['Client', false], ['Lost', false]]) {
    const c = currentState({ events: [], legacyStage: stage, now: NOW });
    assert.equal(typeof c.needsPerson, 'boolean', `${stage} did not answer needsPerson`);
    assert.equal(c.needsPerson, expected, `${stage} answered wrongly`);
    assert.equal(c.closed, CLOSED_TO_OUTREACH.has(c.state), `${stage} did not answer closed`);
  }
  // And a legacy wait can now come due, which it never could before.
  assert.equal(currentState({ events: [], legacyStage: 'Snoozed', legacyDeferUntil: iso(-1), now: NOW }).needsPerson, true);
  assert.equal(currentState({ events: [], legacyStage: 'Snoozed', legacyDeferUntil: iso(1), now: NOW }).needsPerson, false);
  // And a wait with no date at all is not a wait. Nothing will ever bring it
  // back, so the only thing that can move it is a person. Three prospects in
  // production sit exactly there.
  assert.equal(currentState({ events: [], legacyStage: 'Snoozed', now: NOW }).needsPerson, true);
  assert.equal(
    currentState({ events: [{ id: 1, state: REL.DEFERRED, occurredAt: '2026-08-01T00:00:00Z', deferUntil: null }], now: NOW }).needsPerson,
    true,
    'the event branch answers the same way');
});

// ── 14-16. The other three sections were not disturbed ───────────────────

test('trimming Today did not move anybody between piles or tabs', () => {
  const everyone = [
    talker(1, { stage: 'Rejected' }), talker(2, { stage: 'Snoozed', deferUntil: iso(20) }),
    talker(3, { stage: 'Client' }), talker(4, { stage: 'Lost' }),
    talker(5, { stage: 'Interested' }), talker(6, { stage: 'Email 2' }),
    { id: 7, business_name: 'Untouched', stage: 'New', emails_sent: 0 },
    { id: 8, business_name: 'Due', email: 'd@x.com', rating: '💚', stage: 'Email 1', emails_sent: 1, last_contact_date: iso(-9) },
    { id: 9, business_name: 'Done', email: 'e@x.com', rating: '💚', stage: 'Email 5', emails_sent: 5, last_contact_date: iso(-40) },
  ];
  const tabs = {};
  for (const p of everyone) { const v = viewFor(state(p)); tabs[v] = (tabs[v] || 0) + 1; }
  assert.deepEqual(tabs, {
    [VIEW.REPLIED]: 6, [VIEW.NOT_CONTACTED]: 1, [VIEW.IN_OUTREACH]: 1, [VIEW.FINISHED]: 1,
  });

  const s = todaySections(everyone, { now: NOW });
  assert.equal(s.needsYou.total, 2, 'only the two that want something');
  assert.equal(s.followups.due.total, 1, 'the follow-up is untouched');
  assert.equal(s.attention.total, 0);
});

test('a person off Today is off it once, not filed somewhere else instead', () => {
  // The `continue` matters: a replied prospect who wants nothing must not fall
  // through into the follow-up branch and reappear as a due cold email.
  const p = talker(1, { stage: 'Rejected' });
  const s = todaySections([p], { now: NOW });
  assert.equal(s.needsYou.total, 0);
  assert.equal(s.followups.due.total, 0);
  assert.equal(s.followups.upcoming.total, 0);
  assert.equal(s.attention.total, 0);
});

// ── 17-20. Safety ────────────────────────────────────────────────────────

test('this fix writes nothing anywhere', () => {
  for (const f of ['../lib/today-sections.mjs', '../lib/prospect-action.mjs', '../lib/relationship.mjs']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const forbidden of ['INSERT INTO', 'UPDATE ', 'DELETE FROM', 'sendApproved', 'enqueue(', 'fetch(']) {
      assert.ok(!src.includes(forbidden), `${f} must never ${forbidden}`);
    }
  }
});

test('the relationship model still refuses to be a second send policy', () => {
  const src = readFileSync(new URL('../lib/relationship.mjs', import.meta.url), 'utf8');
  for (const forbidden of ['nextStepFor', 'followup-schedule', 'send-guard', 'emails_sent']) {
    assert.ok(!src.includes(forbidden), `the relationship model must not reach for ${forbidden}`);
  }
});
