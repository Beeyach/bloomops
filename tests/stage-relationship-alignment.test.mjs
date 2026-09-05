// The stage, the relationship and the gate now tell the same story.
//
// Before this, `Rejected` meant two things. "I prefer my contact page the way
// it is" and "remove me from your list" landed on the same word, and that word
// was terminal in a dozen places. The relationship layer had always read the
// softer meaning, so the two layers disagreed about the same person.
//
// The fix is a stage that only means the soft one. `Rejected` keeps its old
// terminal weight, which is what stops the 36 legacy rows with no stored reply
// text from being quietly reopened by a change they have no evidence for.

import test from 'node:test';
import assert from 'node:assert/strict';

import { canProgressOutbound, STOP } from '../lib/outbound.mjs';
import { REL, SOURCE, CLOSED_TO_OUTREACH, currentState, relationshipFromReply, describeEvent } from '../lib/relationship.mjs';
import { REPLY, actionFor } from '../lib/reply-classify.mjs';
import { CLOSED_STAGES } from '../lib/today.mjs';
import { STAGE_GROUPS } from '../lib/stage-groups.mjs';

const NOT_THIS_OFFER = 'Not This Offer';

// Cynthia as production will hold her after the correction.
const CYNTHIA = {
  id: 4860, stage: NOT_THIS_OFFER, replied: 1, reply_type: 'decline',
  reply_date: '2026-08-12', last_contact_date: '2026-08-12',
  do_not_contact: 0, unsubscribed: 0, email: 'c@example.com', emails_sent: 1,
};

// 1
test('Cynthia\'s exact words are a no to the offer, not to us', () => {
  assert.equal(relationshipFromReply('decline', { text: 'Yes, I prefer it this way.' }).state, REL.NO_TO_THIS_OFFER);
  assert.equal(CLOSED_TO_OUTREACH.has(REL.NO_TO_THIS_OFFER), false);
});

// 2
test('package 19 Email 2 stays blocked', () => {
  const gate = canProgressOutbound(CYNTHIA);
  assert.equal(gate.ok, false);
  assert.equal(gate.stop, STOP.DECLINED, 'the decline on her row is what stops it');
  assert.match(gate.reason, /Nothing further goes out/);
});

// 3
test('the same offer cannot restart by itself', async () => {
  // Out of every automatic selection, so nothing re-offers her the same thing.
  const { rankOne } = await import('../lib/pick.mjs');
  const { prescreen } = await import('../lib/vet.mjs');
  const { classify, BUCKET, STOP: BSTOP } = await import('../lib/backlog.mjs');
  const { shouldResurface } = await import('../lib/deferral.mjs');

  assert.equal(rankOne(CYNTHIA), null, 'never ranked for a fresh cold pick');
  const vetted = prescreen(CYNTHIA);
  assert.equal(vetted.verdict, 'SKIP', 'never re-vetted');
  assert.equal(vetted.rule, 'closed-stage');
  assert.match(vetted.reasons.join(' '), /Not This Offer/, 'and it says why in her own stage');
  const backlogged = classify(CYNTHIA);
  assert.equal(backlogged.bucket, BUCKET.STOPPED, 'the backlog treats her as stopped');
  assert.equal(backlogged.stop, BSTOP.TERMINAL);
  assert.equal(shouldResurface({ ...CYNTHIA, deferred_until: '2026-01-01' }), false, 'no deferral resurfacing');
  assert.equal(CLOSED_STAGES.has(NOT_THIS_OFFER), true, 'Today counts no unscheduled work for her');
  assert.equal(canProgressOutbound(CYNTHIA).ok, false, 'and the gate still refuses');
});

// 4
test('a new verified reason is not vetoed by the stage alone', () => {
  // A person deliberately clears the decline because something genuinely
  // different came up. The stage must not silently overrule that.
  const revisited = { ...CYNTHIA, reply_type: null, replied: 0, last_contact_date: '2026-01-01' };
  const gate = canProgressOutbound(revisited);
  assert.notEqual(gate.stop, STOP.TERMINAL_STAGE, 'the stage is shut, not bolted');
  // Normal policy still applies — it is not open season.
  assert.equal(gate.ok, false);
  assert.equal(gate.stop, STOP.NOT_DUE, 'ordinary cadence rules take over');

  // The same act on a legacy Rejected row is still refused by the stage.
  const legacy = { ...revisited, stage: 'Rejected' };
  assert.equal(canProgressOutbound(legacy).stop, STOP.TERMINAL_STAGE);
});

// 5
test('NO_TO_US blocks future outreach', () => {
  assert.equal(CLOSED_TO_OUTREACH.has(REL.NO_TO_US), true);
  assert.equal(relationshipFromReply('decline', { text: "Please don't contact me again." }).state, REL.NO_TO_US);
  assert.equal(relationshipFromReply('decline', { text: 'Remove me from your list.' }).state, REL.NO_TO_US);
});

// 6
test('unsubscribe blocks future outreach and keeps the harder stage', () => {
  const a = actionFor(REPLY.UNSUBSCRIBE);
  assert.equal(a.stage, 'Rejected', 'unsubscribe is not filed as a soft no');
  assert.equal(a.doNotContact, true);
  assert.equal(a.unsubscribed, true);
  assert.equal(canProgressOutbound({ ...CYNTHIA, unsubscribed: 1 }).stop, STOP.UNSUBSCRIBED);
});

// 7
test('do-not-contact blocks future outreach above everything else', () => {
  const gate = canProgressOutbound({ ...CYNTHIA, do_not_contact: 1 });
  assert.equal(gate.stop, STOP.DO_NOT_CONTACT, 'it outranks even the decline');
});

// 8
test('stage no longer conflates an ordinary decline with permanent rejection', () => {
  assert.equal(actionFor(REPLY.DECLINE).stage, NOT_THIS_OFFER);
  assert.equal(actionFor(REPLY.UNSUBSCRIBE).stage, 'Rejected');
  assert.notEqual(actionFor(REPLY.DECLINE).stage, actionFor(REPLY.UNSUBSCRIBE).stage);
  // An ordinary decline never sets a boundary flag.
  assert.notEqual(actionFor(REPLY.DECLINE).doNotContact, true);
  assert.notEqual(actionFor(REPLY.DECLINE).unsubscribed, true);
  // And it is filed as parked, not closed.
  const parked = STAGE_GROUPS.find((g) => g.key === 'parked');
  const closed = STAGE_GROUPS.find((g) => g.key === 'closed');
  assert.ok(parked.stages.includes(NOT_THIS_OFFER));
  assert.equal(closed.stages.includes(NOT_THIS_OFFER), false);
});

// 9
test('stage and relationship state do not contradict each other', () => {
  const fromStage = currentState({
    events: [], doNotContact: false, unsubscribed: false, isClient: false, legacyStage: NOT_THIS_OFFER,
  });
  assert.equal(fromStage.state, REL.NO_TO_THIS_OFFER);
  assert.equal(CLOSED_TO_OUTREACH.has(fromStage.state), false, 'the stage reads open');
  assert.notEqual(canProgressOutbound(CYNTHIA).stop, STOP.TERMINAL_STAGE, 'and the gate agrees it is not terminal');
});

// 10
test('all five backfill candidates map through the canonical logic', () => {
  const candidates = [
    { ev: 8, prospect: 6547, classification: 'interested', expect: REL.INTERESTED },
    { ev: 21, prospect: 6567, classification: 'interested', expect: REL.INTERESTED },
    { ev: 23, prospect: 2595, classification: 'not-now', expect: REL.DEFERRED },
    { ev: 29, prospect: 1317, classification: 'question', expect: REL.INTERESTED },
    { ev: 31, prospect: 4860, classification: 'decline', expect: REL.NO_TO_THIS_OFFER },
  ];
  for (const c of candidates) {
    const got = relationshipFromReply(c.classification, { text: '' }).state;
    assert.equal(got, c.expect, `event ${c.ev} (${c.classification}) -> ${c.expect}`);
  }
});

// 11 + 13
test('the backfill is idempotent and writes no duplicates', async () => {
  const { recordReply } = await import('../lib/relationship-store.mjs');
  const rows = [];
  const seen = new Set();
  const db = {
    prepare: (text) => ({
      bind: (...args) => ({
        run: async () => {
          if (/INTO relationship_events/i.test(text)) {
            // The unique index, honoured.
            const key = args.slice(0, 5).join('|');
            if (seen.has(key)) return { meta: { changes: 0 } };
            seen.add(key);
            rows.push(args);
          }
          return { meta: { changes: 1 } };
        },
        all: async () => ({ results: [] }),
        first: async () => null,
      }),
    }),
  };
  const call = () => recordReply(db, {
    workspace: 'ary', prospectId: 4860, classification: 'decline',
    text: 'Yes, I prefer it this way.', occurredAt: '2026-08-12T18:16:58.000Z',
    messageId: '19ff73126313617a', threadId: '19ff6d45ffa27fbb',
    confidence: 'high', isRealReply: true, source: SOURCE.BACKFILL,
  });
  await call();
  const after1 = rows.length;
  await call();
  assert.equal(after1, 1, 'one row the first time');
  assert.equal(rows.length, 1, 'and still one the second time');
});

// 12
test('the original occurred_at is preserved, never restamped', async () => {
  const { recordReply } = await import('../lib/relationship-store.mjs');
  const rows = [];
  const db = {
    prepare: (text) => ({
      bind: (...args) => ({
        run: async () => { if (/INTO relationship_events/i.test(text)) rows.push(args); return { meta: { changes: 1 } }; },
        all: async () => ({ results: [] }),
        first: async () => null,
      }),
    }),
  };
  await recordReply(db, {
    workspace: 'ary', prospectId: 4860, classification: 'decline',
    text: 'Yes, I prefer it this way.', occurredAt: '2026-08-12T18:16:58.000Z',
    messageId: '19ff73126313617a', threadId: '19ff6d45ffa27fbb',
    confidence: 'high', isRealReply: true, source: SOURCE.BACKFILL,
  });
  assert.ok(rows[0].includes('2026-08-12T18:16:58.000Z'), 'her real reply time, not now()');
  assert.ok(rows[0].includes(SOURCE.BACKFILL), 'and marked as written after the fact');
  assert.equal(describeEvent({ source: SOURCE.BACKFILL, state: REL.NO_TO_THIS_OFFER }).who, 'LTB, recorded later');
});

// 14
test('none of this touches a package, a send, or a contact', () => {
  const a = actionFor(REPLY.DECLINE);
  assert.equal(Object.keys(a).some((k) => /send|package|email_body|contact_email/i.test(k)), false);
  assert.equal(a.doNotContact, undefined, 'no contact change');
  assert.equal(a.stopOutbound, true, 'the only effect is stopping');
});

// 15
test('both automation switches remain off', async () => {
  const { sendPolicy } = await import('../lib/send-policy.mjs');
  const p = sendPolicy({});
  assert.equal(p.autoSendApprovedFirstEmails, false);
  assert.equal(p.autoSendApprovedFollowups, false);
});

// 16
test('legacy evidence-poor Rejected rows are not reopened by any of this', () => {
  // The whole reason a new stage was added rather than softening the old one.
  const legacy = {
    stage: 'Rejected', replied: 1, reply_type: 'decline',
    reply_date: '2025-11-02', last_contact_date: '2025-11-02',
    do_not_contact: 0, unsubscribed: 0, email: 'x@example.com',
  };
  assert.equal(canProgressOutbound(legacy).ok, false);
  // Even with every reply flag cleared, the stage still refuses.
  const cleared = { ...legacy, replied: 0, reply_type: null, last_contact_date: '2025-01-01' };
  assert.equal(canProgressOutbound(cleared).stop, STOP.TERMINAL_STAGE);
  assert.equal(CLOSED_STAGES.has('Rejected'), true);
});
