// Remembering the conversation, not just the last label.
//
// The case that forced this: somebody replied interested, said the specific
// thing offered was not what she needed, raised budget, explored something
// else, appeared to decline because she had found another person, and three
// minutes later accepted a £297 one-time cleanup.
//
// The old model read that as Rejected — and worse, with `needsHuman: false`, so
// it never even asked anybody to look. A won deal filed as a dead lead.
//
// The tests below are mostly about one asymmetry. Being too soft costs Ary a
// second look at somebody who is not interested. Being too hard buries a
// customer. Everything ambiguous resolves toward the first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1 } from './_d1.mjs';

import {
  REL, SOURCE, LABEL, CLOSED_TO_OUTREACH, WANTS_A_PERSON,
  relationshipFromReply, isReconsideration, currentState, explain, describeEvent,
} from '../lib/relationship.mjs';
import { applyReplyToProspect } from '../lib/reply-apply.mjs';
import { actionFor } from '../lib/reply-classify.mjs';
import { canProgressOutbound } from '../lib/outbound.mjs';
import {
  timelineFor, standingOf, recordEvent, recordReply, correctTo,
} from '../lib/relationship-store.mjs';

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SCHEMA = `
CREATE TABLE relationship_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL, prospect_id INTEGER NOT NULL,
  state TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'classifier', confidence TEXT,
  occurred_at TEXT NOT NULL, message_id TEXT, thread_id TEXT,
  reason TEXT, defer_until TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX relationship_events_once
  ON relationship_events (workspace, prospect_id, message_id, state, source)
  WHERE message_id IS NOT NULL;`;

const db = () => d1([SCHEMA]);
const WS = 'ary';
const at = (iso) => iso;

// ── 1-8. Reading one message ─────────────────────────────────────────────

test('a decline about the offer is not a decline about us', () => {
  const offer = relationshipFromReply('decline', { text: 'I found another WordPress person for the ongoing stuff' });
  assert.equal(offer.state, REL.NO_TO_THIS_OFFER, 'the relationship survives');
  assert.equal(CLOSED_TO_OUTREACH.has(offer.state), false, 'and it is not closed');

  const us = relationshipFromReply('decline', { text: 'Please stop contacting me' });
  assert.equal(us.state, REL.NO_TO_US);
  assert.equal(CLOSED_TO_OUTREACH.has(us.state), true, 'this one really is closed');
});

test('when the words do not clearly reject us, the softer reading wins', () => {
  // The cost of being wrong here is a second look. The cost the other way is
  // burying somebody who would have bought.
  for (const text of ['not for me right now', 'no thanks', "we're all set", '']) {
    assert.equal(
      relationshipFromReply('decline', { text }).state,
      REL.NO_TO_THIS_OFFER,
      `"${text}" must not be read as rejecting us`
    );
  }
});

test('unsubscribing is always about us', () => {
  assert.equal(relationshipFromReply('unsubscribe', { text: '' }).state, REL.NO_TO_US);
});

test('money talk is a constraint, not a no', () => {
  const s = relationshipFromReply('objection', { text: "I'm retired now so the budget is tight" });
  assert.equal(s.state, REL.BUDGET_CONCERN);
  assert.equal(CLOSED_TO_OUTREACH.has(s.state), false);
  assert.equal(WANTS_A_PERSON.has(s.state), true, 'and it is worth a person looking');
});

test('asking the price is interest unless the words are about affording it', () => {
  assert.equal(relationshipFromReply('price', { text: 'how much is it?' }).state, REL.INTERESTED);
  assert.equal(relationshipFromReply('price', { text: 'that is too expensive for me' }).state, REL.BUDGET_CONCERN);
});

test('not now is a deferral', () => {
  assert.equal(relationshipFromReply('not-now', { text: 'contact me in October' }).state, REL.DEFERRED);
});

test('an autoresponder or a bounce says nothing about the relationship', () => {
  for (const c of ['out-of-office', 'bounce', 'wrong-person', 'referral']) {
    assert.equal(relationshipFromReply(c, { text: 'x' }).state, null, `${c} must not create a state`);
  }
});

test('a reply nobody can read asks for a person rather than guessing', () => {
  const s = relationshipFromReply('something-new', { text: 'hmm' });
  assert.equal(s.state, REL.AMBIGUOUS);
  assert.equal(WANTS_A_PERSON.has(s.state), true);
});

// ── 9-14. The whole story, in order ──────────────────────────────────────

test('the case this was built for', async () => {
  // Interested, then not this offer, then budget, then a decline-shaped
  // message, then yes. Exactly the sequence that used to end as Rejected.
  const conn = db();
  const p = 4242;
  const steps = [
    ['2026-07-01 09:00:00', REL.INTERESTED, 'm1'],
    ['2026-07-05 10:00:00', REL.NO_TO_THIS_OFFER, 'm2'],
    ['2026-07-20 11:00:00', REL.BUDGET_CONCERN, 'm3'],
    ['2026-08-10 14:00:00', REL.NO_TO_THIS_OFFER, 'm4'],
    ['2026-08-10 14:03:00', REL.ACCEPTED_OFFER, 'm5'],
  ];
  for (const [when, state, mid] of steps) {
    await recordEvent(conn, { workspace: WS, prospectId: p, state, occurredAt: when, messageId: mid });
  }

  const timeline = await timelineFor(conn, { workspace: WS, prospectId: p });
  assert.equal(timeline.length, 5, 'every moment is still there');

  const now = currentState({ events: timeline });
  assert.equal(now.state, REL.ACCEPTED_OFFER, 'the newest explicit decision is what stands');
  assert.equal(now.supersedes, REL.NO_TO_THIS_OFFER, 'and it knows what it changed');
  assert.equal(now.closed, false);
  assert.equal(now.needsPerson, true, 'this belongs in front of Ary');

  // The decline is still in the record, unedited.
  assert.ok(timeline.some((e) => e.state === REL.NO_TO_THIS_OFFER && e.occurredAt === '2026-08-10 14:00:00'));
});

test('three minutes is enough to change your mind', () => {
  const events = [
    { state: REL.NO_TO_THIS_OFFER, occurredAt: '2026-08-10 14:00:00' },
    { state: REL.ACCEPTED_OFFER, occurredAt: '2026-08-10 14:03:00' },
  ];
  assert.equal(currentState({ events }).state, REL.ACCEPTED_OFFER);
});

test('an older negative never outranks a newer explicit positive', () => {
  const events = [
    { state: REL.ACCEPTED_OFFER, occurredAt: '2026-08-01 10:00:00' },
    { state: REL.NO_TO_THIS_OFFER, occurredAt: '2026-08-02 10:00:00' },
  ];
  // And the reverse ordering gives the reverse answer. Recency decides, not
  // which one sounds more final.
  assert.equal(currentState({ events }).state, REL.NO_TO_THIS_OFFER);
});

test('reconsidering is a reversal, not ordinary interest', () => {
  assert.equal(isReconsideration(REL.NO_TO_THIS_OFFER, REL.ACCEPTED_OFFER), true);
  assert.equal(isReconsideration(REL.DEFERRED, REL.INTERESTED), true);
  assert.equal(isReconsideration(null, REL.INTERESTED), false, 'a first interested reply is not a change of mind');
  assert.equal(isReconsideration(REL.INTERESTED, REL.INTERESTED), false);
});

test('a reversal records both the turn and where it turned to', async () => {
  const conn = db();
  const p = 77;
  await recordEvent(conn, { workspace: WS, prospectId: p, state: REL.NO_TO_THIS_OFFER, occurredAt: '2026-08-10 14:00:00', messageId: 'a' });
  await recordReply(conn, {
    workspace: WS, prospectId: p, classification: 'interested',
    text: 'actually yes please do the cleanup', occurredAt: '2026-08-10 14:03:00', messageId: 'b',
  });

  const timeline = await timelineFor(conn, { workspace: WS, prospectId: p });
  const states = timeline.map((e) => e.state);
  assert.ok(states.includes(REL.RECONSIDERED), 'the turn is recorded');
  assert.ok(states.includes(REL.INTERESTED), 'and what they turned to');
});

test('an out-of-office cannot overrule what a person said', async () => {
  const conn = db();
  const p = 88;
  await recordReply(conn, {
    workspace: WS, prospectId: p, classification: 'interested', text: 'yes send it over',
    occurredAt: '2026-08-10 09:00:00', messageId: 'human',
  });
  await recordReply(conn, {
    workspace: WS, prospectId: p, classification: 'out-of-office', text: 'I am away until Monday',
    occurredAt: '2026-08-10 09:05:00', messageId: 'robot', isRealReply: false,
  });

  const timeline = await timelineFor(conn, { workspace: WS, prospectId: p });
  assert.equal(timeline.length, 1, 'the robot wrote nothing');
  assert.equal(currentState({ events: timeline }).state, REL.INTERESTED);
});

// ── 15-19. Who decides ───────────────────────────────────────────────────

test('a correction by hand is its own fact, and does not edit the old one', async () => {
  const conn = db();
  const p = 99;
  await recordEvent(conn, {
    workspace: WS, prospectId: p, state: REL.AMBIGUOUS,
    occurredAt: '2026-08-10 10:00:00', messageId: 'm1', source: SOURCE.CLASSIFIER,
  });
  await correctTo(conn, {
    workspace: WS, prospectId: p, state: REL.INTERESTED,
    note: 'She is clearly interested.', now: new Date('2026-08-10T11:00:00Z'),
  });

  const timeline = await timelineFor(conn, { workspace: WS, prospectId: p });
  assert.equal(timeline.length, 2, 'the guess is still on the record');
  assert.equal(timeline[0].state, REL.AMBIGUOUS);
  assert.equal(timeline[0].source, SOURCE.CLASSIFIER);
  assert.equal(timeline[1].source, SOURCE.HUMAN);

  const now = currentState({ events: timeline });
  assert.equal(now.state, REL.INTERESTED);
  assert.equal(now.source, SOURCE.HUMAN);
});

test('the classifier cannot undo a correction without a newer reply', async () => {
  const conn = db();
  const p = 101;
  await correctTo(conn, { workspace: WS, prospectId: p, state: REL.INTERESTED, now: new Date('2026-08-10T11:00:00Z') });
  // A classification of an OLDER message arrives late, as they do.
  await recordReply(conn, {
    workspace: WS, prospectId: p, classification: 'objection', text: 'not sure about this',
    occurredAt: '2026-08-10 09:00:00', messageId: 'old',
  });

  const timeline = await timelineFor(conn, { workspace: WS, prospectId: p });
  assert.equal(currentState({ events: timeline }).state, REL.INTERESTED, 'the newer human decision still stands');
});

test('but a genuinely newer reply from the prospect does win', async () => {
  const conn = db();
  const p = 102;
  await correctTo(conn, { workspace: WS, prospectId: p, state: REL.INTERESTED, now: new Date('2026-08-10T11:00:00Z') });
  await recordReply(conn, {
    workspace: WS, prospectId: p, classification: 'decline', text: 'please stop contacting me',
    occurredAt: '2026-08-11 09:00:00', messageId: 'newer',
  });
  const timeline = await timelineFor(conn, { workspace: WS, prospectId: p });
  assert.equal(currentState({ events: timeline }).state, REL.NO_TO_US);
});

test('the same message classified twice writes one event', async () => {
  const conn = db();
  const p = 103;
  for (let i = 0; i < 3; i += 1) {
    await recordReply(conn, {
      workspace: WS, prospectId: p, classification: 'interested', text: 'yes',
      occurredAt: '2026-08-10 09:00:00', messageId: 'same',
    });
  }
  assert.equal((await timelineFor(conn, { workspace: WS, prospectId: p })).length, 1);
});

test('do-not-contact and client outrank everything in the timeline', () => {
  const events = [{ state: REL.ACCEPTED_OFFER, occurredAt: '2026-08-10 14:00:00' }];
  assert.equal(currentState({ events, doNotContact: true }).state, REL.NO_TO_US);
  assert.equal(currentState({ events, isClient: true }).state, REL.WON);
  assert.equal(currentState({ events, isClient: true }).closed, true, 'a client is not cold-emailed');
});

// ── 20-23. Deferrals ─────────────────────────────────────────────────────

test('a deferral keeps the date they actually gave', async () => {
  const conn = db();
  const p = 111;
  await recordReply(conn, {
    workspace: WS, prospectId: p, classification: 'not-now', text: 'contact me in October',
    occurredAt: '2026-08-10 09:00:00', messageId: 'd1', deferUntil: '2026-10-01',
  });
  const timeline = await timelineFor(conn, { workspace: WS, prospectId: p });
  const now = currentState({ events: timeline, now: new Date('2026-08-15T00:00:00Z') });
  assert.equal(now.state, REL.DEFERRED);
  assert.equal(now.deferredUntil, '2026-10-01');
  assert.equal(now.needsPerson, false, 'not yet due, so not in the way');
});

test('a deferral that has come due asks for a person', () => {
  const events = [{ state: REL.DEFERRED, occurredAt: '2026-08-10 09:00:00', deferUntil: '2026-10-01' }];
  const now = currentState({ events, now: new Date('2026-10-02T00:00:00Z') });
  assert.equal(now.needsPerson, true);
});

test('no date is stored when none was given', async () => {
  const conn = db();
  const p = 112;
  await recordReply(conn, {
    workspace: WS, prospectId: p, classification: 'not-now', text: 'not right now',
    occurredAt: '2026-08-10 09:00:00', messageId: 'd2',
  });
  const [e] = await timelineFor(conn, { workspace: WS, prospectId: p });
  assert.equal(e.deferUntil, null, 'an invented date is worse than none');
});

test('changing their mind after a deferral supersedes it, and the defer stays', async () => {
  const conn = db();
  const p = 113;
  await recordEvent(conn, { workspace: WS, prospectId: p, state: REL.DEFERRED, occurredAt: '2026-08-01 09:00:00', messageId: 'x', deferUntil: '2026-10-01' });
  await recordReply(conn, {
    workspace: WS, prospectId: p, classification: 'interested', text: 'actually can we do it now',
    occurredAt: '2026-08-02 09:00:00', messageId: 'y',
  });
  const timeline = await timelineFor(conn, { workspace: WS, prospectId: p });
  assert.ok(timeline.some((e) => e.state === REL.DEFERRED), 'the deferral is still history');
  assert.notEqual(currentState({ events: timeline }).state, REL.DEFERRED);
});

// ── 24-27. Old prospects, read honestly ──────────────────────────────────

test('a prospect from before all this keeps its one fact, marked as legacy', () => {
  const now = currentState({ events: [], legacyStage: 'Interested' });
  assert.equal(now.state, REL.INTERESTED);
  assert.equal(now.source, SOURCE.LEGACY);
  assert.equal(now.legacy, true);
});

test('the old Rejected bucket is read softly, not harshly', () => {
  // It held both kinds of no. Guessing the harsher one would re-bury exactly
  // the people this work exists to find.
  const now = currentState({ events: [], legacyStage: 'Rejected' });
  assert.equal(now.state, REL.NO_TO_THIS_OFFER);
  assert.equal(CLOSED_TO_OUTREACH.has(now.state), false);
});

test('no history is invented for anybody', () => {
  const now = currentState({ events: [], legacyStage: 'Interested' });
  assert.equal(now.at, undefined, 'a legacy status has no moment attached, and none is made up');
  const sql = src('../migrations/053_relationship_events.sql');
  assert.match(sql, /no backfill/i);
  assert.ok(!/INSERT INTO relationship_events/i.test(sql), 'the migration writes no rows');
});

test('a real event always beats a legacy stage', () => {
  const events = [{ state: REL.ACCEPTED_OFFER, occurredAt: '2026-08-10 14:00:00' }];
  assert.equal(currentState({ events, legacyStage: 'Rejected' }).state, REL.ACCEPTED_OFFER);
});

// ── 28-32. Words, and one place that decides ─────────────────────────────

test('no internal enum ever reaches Ary', () => {
  for (const state of Object.values(REL)) {
    assert.ok(LABEL[state], `${state} needs a human label`);
    assert.ok(!/_/.test(LABEL[state]), `${LABEL[state]} still looks like an enum`);
  }
});

test('not-this-offer reads differently from not-us', () => {
  const offer = explain({ state: REL.NO_TO_THIS_OFFER });
  const us = explain({ state: REL.NO_TO_US });
  assert.match(offer, /Keep the relationship open/);
  assert.notEqual(offer, us);
  assert.match(us, /asked not to be contacted/);
});

test('when the latest reply changed something, it says so', () => {
  const s = explain({ state: REL.ACCEPTED_OFFER, supersedes: REL.NO_TO_THIS_OFFER });
  assert.match(s, /changed the earlier not interested/i);
});

test('the timeline says who decided', () => {
  assert.equal(describeEvent({ state: REL.INTERESTED, source: SOURCE.HUMAN }).who, 'You');
  assert.equal(describeEvent({ state: REL.INTERESTED, source: SOURCE.CLASSIFIER }).who, 'LTB');
  assert.equal(describeEvent({ state: REL.INTERESTED, source: SOURCE.LEGACY }).who, 'Older record');
});

test('precedence lives in one helper and nowhere else', () => {
  const lib = code('../lib/relationship.mjs');
  assert.match(lib, /export function currentState/);
  // The store gathers the inputs and hands them over; it never decides. So it
  // calls currentState and contains no precedence branch of its own.
  const store = code('../lib/relationship-store.mjs');
  assert.match(store, /currentState\(\{/, 'the store asks the helper');
  assert.ok(!/if\s*\([^)]*doNotContact[^)]*\)\s*return/.test(store), 'and never answers for itself');
  assert.ok(!/isClient[^\n]*\?\s*REL\./.test(store), 'no shadow copy of the ordering');
});

// ── 33-35. The rule that must not change ─────────────────────────────────

// A prospect handle that records every statement, and can be told to make the
// relationship insert fail.
function replyDb({ failRelationship = false } = {}) {
  const sql = [];
  const stmt = (text) => ({
    bind: (...args) => ({
      run: async () => {
        sql.push({ text, args });
        if (failRelationship && /INSERT .*INTO relationship_events/i.test(text)) {
          throw new Error('relationship write exploded');
        }
        return { meta: { changes: 1 } };
      },
      all: async () => ({ results: [] }),
      first: async () => (/FROM prospects/i.test(text)
        ? { id: 4860, stage: 'Contacted', activity_log: null, pending_draft: null, emails_sent: 1 }
        : null),
    }),
  });
  return { sql, prepare: stmt };
}

const CYNTHIA_REPLY = {
  cls: { classification: 'decline', confidence: 'high', by: 'model' },
  action: actionFor('decline', {}),
  isReal: true,
  needsHuman: false,
  occurredAt: '2026-08-12T18:16:58.000Z',
  message: { id: '19ff73126313617a', threadId: '19ff6d45ffa27fbb', text: 'Yes, I prefer it this way.' },
};

test('this pass did not touch stopping outbound on a reply', async () => {
  const classify = code('../lib/reply-classify.mjs');
  // Every real reply still stops the sequence, including ones nobody can read.
  assert.match(classify, /export const STOPS_OUTBOUND/);

  // The stop comes from the reply, not from the relationship state. Proven by
  // asking the gate with no relationship events at all.
  const stopped = canProgressOutbound({ stage: 'Contacted', replied: 1, reply_type: 'decline' });
  assert.equal(stopped.ok, false);
  assert.equal(stopped.stop, 'declined');

  // And NO_TO_THIS_OFFER is not a closing state, so the relationship half
  // cannot be what stopped it.
  assert.equal(CLOSED_TO_OUTREACH.has(REL.NO_TO_THIS_OFFER), false);
  assert.equal(CLOSED_TO_OUTREACH.has(REL.NO_TO_US), true);
});

test('recording the meaning is additive, never a replacement', async () => {
  // The prospect update runs first and completes.
  const db = replyDb();
  const out = await applyReplyToProspect(db, 'ary', 4860, CYNTHIA_REPLY);
  const updateAt = db.sql.findIndex((s) => /UPDATE prospects SET/i.test(s.text));
  const relAt = db.sql.findIndex((s) => /INTO relationship_events/i.test(s.text));
  assert.ok(updateAt >= 0, 'the prospect was still updated');
  assert.ok(relAt > updateAt, 'the relationship event is written after, not instead');
  assert.equal(out.stopped, true, 'and the sequence still stops');

  // If the relationship write fails, the existing behaviour is untouched.
  const broken = replyDb({ failRelationship: true });
  const still = await applyReplyToProspect(broken, 'ary', 4860, CYNTHIA_REPLY);
  assert.ok(broken.sql.some((s) => /UPDATE prospects SET/i.test(s.text)), 'the update still happened');
  assert.equal(still.stopped, true, 'and the stop still holds');
});

test('a model-classified decline reaches the relationship timeline', async () => {
  // The defect this closes: the classify job applied the reply and never wrote
  // the relationship, so every reply a person wrote in their own words left the
  // timeline empty. Cynthia 4860 was the proof.
  const db = replyDb();
  await applyReplyToProspect(db, 'ary', 4860, CYNTHIA_REPLY);
  const rel = db.sql.find((s) => /INTO relationship_events/i.test(s.text));
  assert.ok(rel, 'a relationship event was written');
  assert.ok(rel.args.includes(REL.NO_TO_THIS_OFFER), `her words map to NO_TO_THIS_OFFER, not NO_TO_US: ${rel.args}`);
  assert.equal(rel.args.includes(REL.NO_TO_US), false);
});

test('an applied reply with no message text writes no relationship guess', async () => {
  const db = replyDb();
  await applyReplyToProspect(db, 'ary', 4860, { ...CYNTHIA_REPLY, message: null });
  assert.ok(db.sql.some((s) => /UPDATE prospects SET/i.test(s.text)), 'the prospect still updates');
  assert.equal(db.sql.some((s) => /INTO relationship_events/i.test(s.text)), false,
    'but nothing invents a relationship state from an absent message');
});

test('a state changing never restarts cold outreach', () => {
  const store = code('../lib/relationship-store.mjs');
  for (const forbidden of ['enqueue(', 'SEND_APPROVED', 'sendApproved', 'UPDATE prospects']) {
    assert.ok(!store.includes(forbidden), `the timeline must not ${forbidden}`);
  }
});

// ── 36-42. What Ary actually sees ────────────────────────────────────────

test('the drawer shows the conversation, and every icon it asks for exists', () => {
  const drawer = code('../components/ProspectDrawer.jsx');
  assert.match(drawer, /<ConversationTimeline prospectId=\{p\.id\}/);

  const view = code('../components/ConversationTimeline.jsx');
  const icons = src('../components/Icons.jsx');
  for (const [, name] of view.matchAll(/<Icon\s+name="([a-z0-9-]+)"/g)) {
    // Icons.jsx quotes a key only when it has to: 'mail-open' needs quotes,
    // pencil does not. Checking only the quoted form failed a real icon.
    assert.match(
      icons,
      new RegExp(`(^|\\s)'?${name}'?:`, 'm'),
      `there is no ${name} icon, so it would render as nothing`
    );
  }
});

test('not-this-offer is not dressed up as a failure', () => {
  const view = code('../components/ConversationTimeline.jsx');
  const tone = view.slice(view.indexOf('const TONE'), view.indexOf('const when'));
  // Red belongs to the one state that really is closed.
  assert.match(tone, /NO_TO_US: 'text-poppy/);
  assert.ok(!/NO_TO_THIS_OFFER: 'text-poppy/.test(tone), 'a live relationship must not be drawn in red');
});

test('the page never invents its own words or precedence', () => {
  const view = code('../components/ConversationTimeline.jsx');
  // Labels and explanations come from the model, through the API.
  assert.ok(!/ACCEPTED_OFFER'\s*:\s*'Accepted/.test(view), 'no second copy of the labels');
  assert.ok(!view.includes('do_not_contact'), 'and no second copy of the ordering');
  assert.match(view, /current\.label/);
  assert.match(view, /current\.explain/);
});

test('no raw enum reaches the screen', () => {
  const view = code('../components/ConversationTimeline.jsx');
  // States appear only as object keys for styling, never rendered as text.
  assert.ok(!/>\{[^}]*\.state\}</.test(view), 'a state is never printed directly');
  assert.match(view, /\{e\.label\}/);
});

test('a correction is recorded rather than an edit', () => {
  const route = code('../app/api/prospects/[id]/conversation/route.js');
  assert.match(route, /correctTo\(db/);
  for (const forbidden of ['UPDATE relationship_events', 'DELETE FROM relationship_events']) {
    assert.ok(!route.includes(forbidden), `history must never be ${forbidden}`);
  }
});

test('the correction menu cannot drift from the model', () => {
  const route = code('../app/api/prospects/[id]/conversation/route.js');
  assert.match(route, /Object\.values\(REL\)/, 'the options come from the vocabulary itself');
  // Won and Lost are business facts, not something to pick from a menu.
  assert.match(route, /s !== REL\.WON && s !== REL\.LOST/);
});

test('the conversation endpoint reads and records, and sends nothing', () => {
  const route = code('../app/api/prospects/[id]/conversation/route.js');
  for (const forbidden of ['sendApproved', 'enqueue(', 'buildMime', 'spendCredits']) {
    assert.ok(!route.includes(forbidden), `the timeline must not ${forbidden}`);
  }
});

test('the only prospect column this endpoint may write is the deferral date', () => {
  // It writes to `prospects` in exactly one case: Ary answering "come back on
  // the 24th" for a wait that never had a date. Both date fields move together
  // because lib/deferral.mjs owns them together — one promise, two records, and
  // a second endpoint would be a second truth.
  //
  // Everything else about the prospect stays out of reach. A timeline that can
  // edit a stage or a send count is not a timeline.
  const route = code('../app/api/prospects/[id]/conversation/route.js');
  const updates = route.match(/UPDATE prospects[\s\S]*?WHERE/g) || [];
  assert.equal(updates.length, 1, 'exactly one write, or none');
  const [sql] = updates;
  for (const col of ['deferred_until', 'next_action_date', 'deferral_source', 'updated_at']) {
    assert.ok(sql.includes(col), `the deferral write lost ${col}`);
  }
  for (const forbidden of ['stage', 'emails_sent', 'last_contact_date', 'replied', 'rating',
    'do_not_contact', 'unsubscribed', 'pending_draft', 'email ']) {
    assert.ok(!sql.includes(forbidden), `the timeline must never write ${forbidden}`);
  }
  // And the date is validated by the module that owns what a deferral date is.
  assert.match(route, /defer\(\{/, 'the date goes through lib/deferral.mjs');
  assert.match(route, /DEFERRAL_SOURCE\.ARY/, 'and it is recorded as Ary having set it');
});

// ── 43-45. Saying what actually changed ──────────────────────────────────

test('a positive state supersedes the last no, not merely the previous entry', () => {
  // Reconsidering and then accepting is one movement. "The latest reply changed
  // the earlier reconsidered" is not a sentence about anything.
  const events = [
    { state: REL.NO_TO_THIS_OFFER, occurredAt: '2026-08-10 14:00:00' },
    { state: REL.RECONSIDERED, occurredAt: '2026-08-10 14:03:00' },
    { state: REL.ACCEPTED_OFFER, occurredAt: '2026-08-10 14:03:30' },
  ];
  const now = currentState({ events });
  assert.equal(now.state, REL.ACCEPTED_OFFER);
  assert.equal(now.supersedes, REL.NO_TO_THIS_OFFER, 'the thing it actually reversed');
  assert.match(explain(now), /changed the earlier not interested/i);
});

test('a deferral is something a yes can be said to have changed', () => {
  const events = [
    { state: REL.DEFERRED, occurredAt: '2026-07-01 09:00:00' },
    { state: REL.INTERESTED, occurredAt: '2026-08-01 09:00:00' },
  ];
  assert.equal(currentState({ events }).supersedes, REL.DEFERRED);
});

test('with nothing contrary behind it, nothing is claimed to have changed', () => {
  const events = [
    { state: REL.INTERESTED, occurredAt: '2026-07-01 09:00:00' },
    { state: REL.ACCEPTED_OFFER, occurredAt: '2026-08-01 09:00:00' },
  ];
  const now = currentState({ events });
  assert.equal(now.supersedes, null);
  assert.ok(!/changed the earlier/.test(explain(now)), 'no invented reversal');
});
