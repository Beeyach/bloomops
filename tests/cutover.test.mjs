// Deciding what V2 owes somebody the old sequence was halfway through.
//
// V1 ran a five-email template; V2 allows three, two or one depending on band.
// So most of the contacted list is not mid-sequence at all — it is finished —
// and the dangerous mistakes here are the ones that would put a message in
// front of somebody who has already spoken, or dump three missed emails on
// somebody at once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { nextStepFor, dispositionFor, coldTouches, NEXT, DISPOSITION, STALE_CUTOVER_DAYS } from '../lib/cutover.mjs';
import { PRIORITY, TOUCHES, bandFor } from '../lib/priority.mjs';
import { coldSequenceExhausted, HARD_TOUCH_CEILING } from '../lib/due.mjs';
import { REL } from '../lib/relationship.mjs';

const code = (f) => readFileSync(new URL(f, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const GREEN = '💚';
const BLUE = '💙';
const CROSS = '✖️';
const recent = new Date().toISOString().slice(0, 10);
const base = { email: 'a@b.com', last_contact_date: recent };
const decide = (p, extra = {}) => nextStepFor({ prospect: { ...base, ...p }, contactOk: true, ...extra });

// ── A reply ends it, always ──────────────────────────────────────────────

test('somebody who replied never gets another cold email', () => {
  const d = decide({ rating: GREEN, emails_sent: 1, replied: 1 });
  assert.equal(d.next, NEXT.NEEDS_HUMAN);
});

test('every state that wants a person is out of the cold sequence', () => {
  for (const state of [REL.INTERESTED, REL.RECONSIDERED, REL.ACCEPTED_OFFER, REL.AMBIGUOUS, REL.BUDGET_CONCERN]) {
    const d = decide({ rating: GREEN, emails_sent: 1 }, { relationship: { state } });
    assert.equal(d.next, NEXT.NEEDS_HUMAN, `${state} belongs to a person`);
  }
});

test('the closed states are closed', () => {
  for (const state of [REL.NO_TO_US, REL.WON, REL.LOST]) {
    assert.equal(decide({ rating: GREEN, emails_sent: 1 }, { relationship: { state } }).next, NEXT.CLOSED);
  }
  assert.equal(decide({ rating: GREEN, emails_sent: 1, do_not_contact: 1 }).next, NEXT.CLOSED);
  assert.equal(decide({ rating: GREEN, emails_sent: 1, unsubscribed: 1 }).next, NEXT.CLOSED);
});

test('not this offer is NOT closed, and NOT a cold followup either', () => {
  // It keeps the relationship open, but the next move is a person's, not the
  // sequence picking up where it left off.
  const d = decide({ rating: GREEN, emails_sent: 1, replied: 1 }, { relationship: { state: REL.NO_TO_THIS_OFFER } });
  assert.equal(d.next, NEXT.NEEDS_HUMAN);
  assert.notEqual(d.next, NEXT.CLOSED);
});

// ── The ceilings ─────────────────────────────────────────────────────────

test('the ceilings are the ones the app already had', () => {
  assert.equal(TOUCHES[PRIORITY.P1], 4);
  assert.equal(TOUCHES[PRIORITY.P2], 3);
  assert.equal(TOUCHES[PRIORITY.P3], 1);
  // Not restated here.
  const lib = code('../lib/cutover.mjs');
  assert.ok(!/P1'?\]?\s*:\s*4/.test(lib), 'the ceilings are imported, never retyped');
});

test('P1 walks 1 to 2 to 3 to 4 and then stops', () => {
  assert.equal(decide({ rating: GREEN, emails_sent: 1 }).next, NEXT.ELIGIBLE_EMAIL_2);
  assert.equal(decide({ rating: GREEN, emails_sent: 2 }).next, NEXT.ELIGIBLE_EMAIL_3);
  assert.equal(decide({ rating: GREEN, emails_sent: 3 }).next, NEXT.ELIGIBLE_EMAIL_4);
  assert.equal(decide({ rating: GREEN, emails_sent: 4 }).next, NEXT.NO_ACTION_COMPLETE);
});

test('P2 gets three and stops', () => {
  assert.equal(decide({ rating: BLUE, emails_sent: 1 }).next, NEXT.ELIGIBLE_EMAIL_2);
  assert.equal(decide({ rating: BLUE, emails_sent: 2 }).next, NEXT.ELIGIBLE_EMAIL_3);
  assert.equal(decide({ rating: BLUE, emails_sent: 3 }).next, NEXT.NO_ACTION_COMPLETE);
});

test('P3 gets one and stops', () => {
  assert.equal(decide({ rating: CROSS, emails_sent: 1 }).next, NEXT.NO_ACTION_COMPLETE);
});

test('an unrated prospect is not cut short by the default band', () => {
  // bandFor defaults the unrated to P2, flagged provisional, meaning nobody has
  // looked yet. Three emails is what a real P2 gets, not what an unknown gets.
  const { provisional } = bandFor({ rating: '' }, { strong: null });
  assert.equal(provisional, true, 'the fixture must actually be the provisional case');
  assert.equal(decide({ rating: '', emails_sent: 3 }).next, NEXT.ELIGIBLE_EMAIL_4);
  assert.equal(decide({ rating: '', emails_sent: 4 }).next, NEXT.NO_ACTION_COMPLETE);
});

test('anybody past four is manual only, whatever their band', () => {
  for (const rating of [GREEN, '', CROSS]) {
    for (const sent of [5, 6, 8, 12]) {
      assert.equal(decide({ rating, emails_sent: sent }).next, NEXT.MANUAL_OVERRIDE_ONLY,
        `${sent} sent must never be automated again`);
    }
  }
});

test('a row with no band is held to the same ceiling the live cadence uses', () => {
  // These two files answering differently is the bug this test exists to stop:
  // cutover calling somebody complete while the app still queues them, or the
  // reverse. Walked across the whole range rather than at one point.
  for (let sent = 0; sent <= 6; sent += 1) {
    const p = { ...base, rating: null, emails_sent: sent };
    const exhausted = coldSequenceExhausted({ priority_band: '', emails_sent: sent });
    const d = nextStepFor({ prospect: p, contactOk: true });
    const done = d.next === NEXT.NO_ACTION_COMPLETE || d.next === NEXT.MANUAL_OVERRIDE_ONLY;
    if (sent > 0) {
      assert.equal(done, exhausted, `${sent} sent: cutover and the cadence must agree`);
    }
  }
});

test('the hard ceiling comes from due.mjs, so there is one number', () => {
  assert.equal(HARD_TOUCH_CEILING, Math.max(...Object.values(TOUCHES)));
  const lib = readFileSync(new URL('../lib/cutover.mjs', import.meta.url), 'utf8');
  assert.ok(lib.includes('HARD_TOUCH_CEILING'), 'the ceiling is imported by name');
  assert.ok(!/Math\.max\(\.\.\.Object\.values\(TOUCHES\)\)/.test(lib), 'and not recomputed here');
});

// ── One next step, never a catch-up ──────────────────────────────────────

test('only ever one next email, never the ones that were missed', () => {
  const d = decide({ rating: GREEN, emails_sent: 1 });
  assert.equal(d.step, 2);
  assert.equal(d.next, NEXT.ELIGIBLE_EMAIL_2, 'not 2 and 3 together');
});

test('a thread that went cold months ago is held, not resumed', () => {
  const old = new Date(Date.now() - (STALE_CUTOVER_DAYS + 10) * 86400000).toISOString().slice(0, 10);
  const d = decide({ rating: GREEN, emails_sent: 1, last_contact_date: old });
  assert.equal(d.next, NEXT.HOLD_STALE_EVIDENCE);
});

test('a first email is not blocked by staleness, having never been sent', () => {
  const d = decide({ rating: GREEN, emails_sent: 0, last_contact_date: null });
  assert.equal(d.next, NEXT.ELIGIBLE_EMAIL_1);
});

// ── Holds are not rejections ─────────────────────────────────────────────

test('no address is a contact problem, not a no', () => {
  const d = nextStepFor({ prospect: { rating: GREEN, emails_sent: 1 }, contactOk: false });
  assert.equal(d.next, NEXT.HOLD_CONTACT_RECOVERY);
  assert.match(d.why, /not a no/);
});

test('a future deferral waits, and a due one asks for a person', () => {
  const future = decide({ rating: GREEN, emails_sent: 1 },
    { relationship: { state: REL.DEFERRED, deferredUntil: '2027-01-01' }, now: new Date('2026-08-11') });
  assert.equal(future.next, NEXT.HOLD_DEFERRED);

  const due = decide({ rating: GREEN, emails_sent: 1 },
    { relationship: { state: REL.DEFERRED, deferredUntil: '2026-01-01' }, now: new Date('2026-08-11') });
  assert.equal(due.next, NEXT.NEEDS_HUMAN);
});

test('stale evidence holds rather than sending something out of date', () => {
  assert.equal(decide({ rating: GREEN, emails_sent: 1 }, { evidenceFresh: false }).next, NEXT.HOLD_STALE_EVIDENCE);
});

// ── Counting real touches ────────────────────────────────────────────────

test('a touch is a send that happened', () => {
  assert.equal(coldTouches({ sentCount: 3 }), 3);
  assert.equal(coldTouches({ sentCount: 0 }), 0);
  assert.equal(coldTouches({ sentCount: null }), 0);
  // Real send events win over any counter.
  assert.equal(coldTouches({ sentCount: 9, sendEvents: [{}, {}] }), 2);
});

// ── Old future work ──────────────────────────────────────────────────────

test('future work on somebody who replied is retired', () => {
  const d = decide({ rating: GREEN, emails_sent: 2, replied: 1 });
  assert.equal(dispositionFor(d, { hasPendingDraft: true }), DISPOSITION.RETIRE_OBSOLETE);
});

test('future work on somebody past the ceiling is retired', () => {
  const d = decide({ rating: CROSS, emails_sent: 1 });
  assert.equal(d.next, NEXT.NO_ACTION_COMPLETE);
  assert.equal(dispositionFor(d, { hasFutureDate: true }), DISPOSITION.RETIRE_OBSOLETE);
});

test('future work on somebody still eligible is replaced, not kept', () => {
  const d = decide({ rating: GREEN, emails_sent: 1 });
  assert.equal(dispositionFor(d, { hasPendingDraft: true }), DISPOSITION.REPLACE_WITH_V2,
    'an old draft written under the five-email template is not reused as-is');
});

test('a prospect with no future work is left entirely alone', () => {
  const d = decide({ rating: GREEN, emails_sent: 1 });
  assert.equal(dispositionFor(d, {}), DISPOSITION.KEEP_AS_HISTORY);
});

// ── What this pass cannot do ─────────────────────────────────────────────

test('the policy decides and never acts', () => {
  const lib = code('../lib/cutover.mjs');
  for (const forbidden of ['sendApproved', 'enqueue(', 'INSERT INTO', 'UPDATE ', 'DELETE ', 'spendCredits', 'askBackground', 'fetch(']) {
    assert.ok(!lib.includes(forbidden), `the cutover rule must never ${forbidden}`);
  }
});

test('the dry run has no way to write anything', () => {
  const script = code('../scripts/cutover-dry-run.mjs');
  assert.ok(!script.includes('--write'), 'there is no write mode to invoke by accident');
  for (const forbidden of ['INSERT INTO', 'UPDATE ', 'DELETE ', 'sendApproved', 'enqueue(']) {
    assert.ok(!script.includes(forbidden), `the dry run must never ${forbidden}`);
  }
});

test('sent history is never a thing this touches', () => {
  const lib = code('../lib/cutover.mjs');
  assert.ok(!lib.includes('send_events'), 'history is read elsewhere and never rewritten here');
  assert.ok(!lib.includes('send_attempts'));
});
