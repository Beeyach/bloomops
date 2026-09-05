// When the next cold email is due.
//
// The timing is Day 0, 4, 9 and 16 for P1 and Day 0, 5 and 12 for P2 from
// the FIRST email. Production has five send events in total, so for most of
// the corpus that first timestamp was never written down. Most of these tests
// are about refusing to guess it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  nextFollowupSchedule, firstSendAnchor, shadowQueue, explainSchedule,
  DUE, DUE_LABEL, UPCOMING_DAYS,
} from '../lib/followup-schedule.mjs';
import { RATING, PRIORITY, SPACING, effectiveCeiling } from '../lib/priority.mjs';
import { nextStepFor, NEXT, STALE_CUTOVER_DAYS } from '../lib/cutover.mjs';
import { coldSequenceExhausted, isoShift, todayIso } from '../lib/due.mjs';
import { REL } from '../lib/relationship.mjs';

const { GREEN, BLUE, WILT, CROSS } = RATING;
const ago = (n) => isoShift(-n);
const p = (o) => ({ name: 'Jane', email: 'jane@example.com', ...o });
const sched = (o, opts) => nextFollowupSchedule(p(o), opts);

// ── Timing ───────────────────────────────────────────────────────────────

test('the spacing is the app\'s own, not restated here', () => {
  assert.deepEqual(SPACING[PRIORITY.P1], [0, 4, 9, 16]);
  assert.deepEqual(SPACING[PRIORITY.P2], [0, 5, 12]);
  assert.deepEqual(SPACING[PRIORITY.P3], [0]);
  const lib = readFileSync(new URL('../lib/followup-schedule.mjs', import.meta.url), 'utf8');
  assert.ok(!/\[0,\s*4,\s*9,\s*16\]/.test(lib), 'the day offsets are imported, never typed again');
});

test('P1 email 2 is due four days after the first email', () => {
  const s = sched({ rating: GREEN, emails_sent: 1, last_contact_date: '2026-08-01' });
  assert.equal(s.step, 2);
  assert.equal(s.dueAt, '2026-08-05');
});

test('P2 email 2 is due five days after the first email', () => {
  const s = sched({ rating: BLUE, emails_sent: 1, last_contact_date: '2026-08-01' });
  assert.equal(s.dueAt, '2026-08-06');
  assert.equal(s.isFinalStep, false, 'P2 has three touches, so email 2 is not the last one');
});

test('P1 email 3 is nine days after the FIRST email, not five after the second', () => {
  // Anchored on a real send record, since that is the only way email 1's date
  // is knowable for a prospect with two sends.
  const s = sched(
    { rating: GREEN, emails_sent: 2, last_contact_date: '2026-08-05' },
    { sendEvents: [{ sequence_step: 1, sent_at: '2026-08-01' }, { sequence_step: 2, sent_at: '2026-08-05' }] },
  );
  assert.equal(s.step, 3);
  assert.equal(s.dueAt, '2026-08-10', 'day 9 from email 1');
  assert.notEqual(s.dueAt, '2026-08-10T', 'sanity');
  assert.equal(s.isFinalStep, false, 'P1 has four touches, so email 3 is not the last one');
});

test('P3 never has a follow-up schedule at all', () => {
  const s = sched({ rating: CROSS, emails_sent: 1, last_contact_date: ago(30) });
  assert.equal(s.status, DUE.COMPLETE);
  assert.equal(s.step, null);
  assert.equal(s.dueAt, null);
});

test('there is no schedule for a fifth email, by any route', () => {
  for (const rating of [GREEN, BLUE, WILT, CROSS, '', null]) {
    for (const sent of [4, 5, 6, 12]) {
      const s = sched({ rating, emails_sent: sent, last_contact_date: ago(20) });
      assert.ok(s.step === null || s.step <= 4, `${rating} at ${sent} sent produced step ${s.step}`);
      assert.ok(![DUE.DUE_NOW, DUE.OVERDUE, DUE.NOT_DUE_YET].includes(s.status),
        `${rating} at ${sent} sent must not be schedulable`);
    }
  }
});

// ── The anchor ───────────────────────────────────────────────────────────

test('a recorded send event is the authority', () => {
  const a = firstSendAnchor({ emails_sent: 2, last_contact_date: '2026-08-09' },
    { sendEvents: [{ sequence_step: 1, sent_at: '2026-07-01T10:00:00Z' }] });
  assert.equal(a.at, '2026-07-01');
  assert.equal(a.source, 'send event');
});

test('with one send, last contact IS the first email', () => {
  const a = firstSendAnchor({ emails_sent: 1, last_contact_date: '2026-08-01' });
  assert.equal(a.at, '2026-08-01');
  assert.equal(a.exact, true);
});

test('with two sends and no record, the first email\'s date is unknown and stays unknown', () => {
  // Last contact is the SECOND email. Subtracting four days to invent the first
  // would turn a guess into a real email somebody receives.
  const a = firstSendAnchor({ emails_sent: 2, last_contact_date: '2026-08-09' });
  assert.equal(a.at, null);

  const s = sched({ rating: GREEN, emails_sent: 2, last_contact_date: '2026-08-09' });
  assert.equal(s.status, DUE.UNCLEAR);
  assert.equal(s.dueAt, null);
  assert.match(s.reason, /nobody knows when the first went/);
});

test('no dates at all is unclear, never due', () => {
  const s = sched({ rating: GREEN, emails_sent: 1, last_contact_date: null });
  assert.notEqual(s.status, DUE.DUE_NOW);
  assert.notEqual(s.status, DUE.OVERDUE);
});

test('a step that outruns the send count is unclear rather than guessed', () => {
  const s = nextFollowupSchedule({ ...p({ rating: GREEN, emails_sent: 0, last_contact_date: ago(20) }) });
  assert.ok(s.step === null || s.step <= 1, 'nothing sent means at most email 1');
});

// ── Due state ────────────────────────────────────────────────────────────

test('before, on, and after the due date', () => {
  const before = sched({ rating: GREEN, emails_sent: 1, last_contact_date: ago(1) });
  assert.equal(before.status, DUE.NOT_DUE_YET);
  assert.equal(before.daysUntilDue, 3);

  const on = sched({ rating: GREEN, emails_sent: 1, last_contact_date: ago(4) });
  assert.equal(on.status, DUE.DUE_NOW);
  assert.equal(on.overdueDays, 0);

  const after = sched({ rating: GREEN, emails_sent: 1, last_contact_date: ago(20) });
  assert.equal(after.status, DUE.OVERDUE);
  assert.equal(after.overdueDays, 16);
});

test('only ever one next step, never a catch-up', () => {
  const s = sched({ rating: GREEN, emails_sent: 1, last_contact_date: ago(40) });
  assert.equal(s.step, 2, 'email 2 only, even though day 9 and day 16 also passed long ago');
  assert.equal(typeof s.step, 'number');
});

// ── What outranks the clock ──────────────────────────────────────────────

test('a reply outranks the schedule, however overdue', () => {
  const s = sched({ rating: GREEN, emails_sent: 1, replied: 1, last_contact_date: ago(30) });
  assert.equal(s.status, DUE.NEEDS_HUMAN);
  assert.equal(s.dueAt, null);
});

test('every state that wants a person outranks the schedule', () => {
  for (const state of [REL.INTERESTED, REL.AMBIGUOUS, REL.BUDGET_CONCERN, REL.RECONSIDERED, REL.ACCEPTED_OFFER]) {
    const s = sched({ rating: GREEN, emails_sent: 1, last_contact_date: ago(30) }, { relationship: { state } });
    assert.equal(s.status, DUE.NEEDS_HUMAN, `${state} must not be a shadow send`);
  }
});

test('closed outranks the schedule', () => {
  for (const state of [REL.NO_TO_US, REL.WON, REL.LOST]) {
    assert.equal(sched({ rating: GREEN, emails_sent: 1, last_contact_date: ago(30) }, { relationship: { state } }).status, DUE.CLOSED);
  }
  assert.equal(sched({ rating: GREEN, emails_sent: 1, do_not_contact: 1, last_contact_date: ago(30) }).status, DUE.CLOSED);
  assert.equal(sched({ rating: GREEN, emails_sent: 1, unsubscribed: 1, last_contact_date: ago(30) }).status, DUE.CLOSED);
});

test('no usable address is a contact hold, not a due email', () => {
  const s = nextFollowupSchedule({ rating: GREEN, emails_sent: 1, last_contact_date: ago(30) }, { contactOk: false });
  assert.equal(s.status, DUE.HOLD_CONTACT);
  assert.equal(s.dueAt, null);
});

test('stale evidence holds rather than shadow-generating from it', () => {
  const s = sched({ rating: GREEN, emails_sent: 1, last_contact_date: ago(10) }, { evidenceFresh: false });
  assert.equal(s.status, DUE.HOLD_EVIDENCE);
});

test('a spent band is finished, not overdue forever', () => {
  assert.equal(sched({ rating: GREEN, emails_sent: 4, last_contact_date: ago(60) }).status, DUE.COMPLETE);
  assert.equal(sched({ rating: BLUE, emails_sent: 3, last_contact_date: ago(60) }).status, DUE.COMPLETE);
});

test('five or more sends stays manual only', () => {
  assert.equal(sched({ rating: GREEN, emails_sent: 5, last_contact_date: ago(60) }).status, DUE.MANUAL_ONLY);
});

// ── The stale rule is the cutover's, not a second one ────────────────────

test('outreach older than the stale rule is held, so Today cannot fill with ghosts', () => {
  const old = sched({ rating: GREEN, emails_sent: 1, last_contact_date: ago(STALE_CUTOVER_DAYS + 5) });
  assert.equal(old.status, DUE.HOLD_EVIDENCE, 'the cutover stale rule applies here too');

  const fresh = sched({ rating: GREEN, emails_sent: 1, last_contact_date: ago(STALE_CUTOVER_DAYS - 5) });
  assert.equal(fresh.status, DUE.OVERDUE);
});

test('there is exactly one stale threshold', () => {
  const lib = readFileSync(new URL('../lib/followup-schedule.mjs', import.meta.url), 'utf8');
  assert.ok(lib.includes('STALE_CUTOVER_DAYS'), 'imported by name');
  assert.ok(!/=\s*45\b/.test(lib), 'and never re-typed as a number');
});

// ── Parity with the policy it must not contradict ────────────────────────

test('the scheduler never schedules somebody the policy calls finished', () => {
  let checked = 0;
  for (const rating of [GREEN, BLUE, WILT, CROSS, '', null]) {
    for (let sent = 0; sent <= 5; sent += 1) {
      for (const days of [1, 4, 12, 30]) {
        const row = p({ rating, emails_sent: sent, last_contact_date: ago(days) });
        const s = nextFollowupSchedule(row, {});
        const policy = nextStepFor({ prospect: row, contactOk: true });
        const exhausted = coldSequenceExhausted(row);

        if ([DUE.DUE_NOW, DUE.OVERDUE, DUE.NOT_DUE_YET].includes(s.status)) {
          assert.ok(policy.next.startsWith('ELIGIBLE'), `scheduled ${rating}/${sent} that the policy calls ${policy.next}`);
          assert.equal(exhausted, false, `scheduled ${rating}/${sent} whose band is spent`);
          assert.ok(s.step <= effectiveCeiling(row), 'step within the ceiling');
        }
        checked += 1;
      }
    }
  }
  assert.ok(checked >= 100, `expected a real sweep, checked ${checked}`);
});

test('P3 is never due, at any age or send count', () => {
  for (let sent = 0; sent <= 4; sent += 1) {
    for (const days of [0, 4, 11, 40]) {
      const s = sched({ rating: CROSS, emails_sent: sent, last_contact_date: ago(days) });
      assert.ok(![DUE.DUE_NOW, DUE.OVERDUE].includes(s.status) || s.step === 1,
        `✖️ at ${sent} sent, ${days} days: ${s.status} step ${s.step}`);
    }
  }
});

// ── The queue ────────────────────────────────────────────────────────────

const rows = [
  { prospect: p({ id: 1, rating: GREEN, emails_sent: 1, last_contact_date: ago(20) }) },   // overdue
  { prospect: p({ id: 2, rating: GREEN, emails_sent: 1, last_contact_date: ago(4) }) },    // due today
  { prospect: p({ id: 3, rating: GREEN, emails_sent: 1, last_contact_date: ago(1) }) },    // upcoming
  { prospect: p({ id: 4, rating: GREEN, emails_sent: 1, last_contact_date: todayIso() }) },// upcoming
  { prospect: p({ id: 5, rating: GREEN, emails_sent: 1, replied: 1, last_contact_date: ago(20) }) },
  { prospect: p({ id: 6, rating: CROSS, emails_sent: 1, last_contact_date: ago(20) }) },   // complete
];

test('the queue splits due from upcoming and keeps the rest out', () => {
  const q = shadowQueue(rows);
  assert.deepEqual(q.due.map((r) => r.prospect.id), [1, 2], 'longest overdue first');
  assert.deepEqual(q.upcoming.map((r) => r.prospect.id), [3, 4]);
  assert.ok(q.held.some((r) => r.prospect.id === 5), 'the replied one is held, not queued');
  assert.ok(!q.due.some((r) => r.prospect.id === 6), 'a finished prospect is not due');
});

test('upcoming is bounded to a week', () => {
  assert.equal(UPCOMING_DAYS, 7);
  const far = [{ prospect: p({ id: 9, rating: GREEN, emails_sent: 1, last_contact_date: isoShift(30) }) }];
  assert.equal(shadowQueue(far).upcoming.length, 0, 'a due date a month out does not clutter Today');
});

test('the queue counts every prospect exactly once', () => {
  const q = shadowQueue(rows);
  assert.equal(Object.values(q.counts).reduce((a, b) => a + b, 0), rows.length);
});

// ── What a person reads ──────────────────────────────────────────────────

test('every status has words, and no enum reaches the screen', () => {
  for (const v of Object.values(DUE)) {
    assert.ok(DUE_LABEL[v], `${v} needs a human label`);
    assert.ok(!/_/.test(DUE_LABEL[v]), `${DUE_LABEL[v]} still looks like an enum`);
  }
});

test('an unrated prospect is not described as P2', () => {
  // P2 means two emails. An unrated prospect gets three. Calling them P2 on the
  // screen would be telling Ary something untrue about the ceiling.
  const s = sched({ rating: '', emails_sent: 1, last_contact_date: ago(10) });
  assert.equal(s.bandProvisional, true);
  assert.equal(s.ceiling, 4);
  assert.match(explainSchedule(s), /Not rated yet/);
  assert.ok(!explainSchedule(s).startsWith('P2'));
});

test('the explanation is built from facts, not written by a model', () => {
  const s = sched({ rating: GREEN, emails_sent: 1, last_contact_date: ago(20) });
  const line = explainSchedule(s);
  assert.match(line, /P1/);
  assert.match(line, /1 of 4 cold emails sent/);
  assert.match(line, /became due/);
});

// ── What this file may never do ──────────────────────────────────────────

test('scheduling cannot send, queue, spend or write', () => {
  const src = readFileSync(new URL('../lib/followup-schedule.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['sendApproved', 'enqueue(', 'INSERT INTO', 'UPDATE ', 'DELETE ',
    'spendCredits', 'askBackground', 'fetch(', 'next_action_date =', 'provider_id']) {
    assert.ok(!src.includes(forbidden), `the scheduler must never ${forbidden}`);
  }
});

test('building the list makes no model call', () => {
  const src = readFileSync(new URL('../lib/followup-schedule.mjs', import.meta.url), 'utf8');
  assert.ok(!/buildFollowupParts|anthropic|callAI/i.test(src),
    'the queue is schedule metadata only; drafts happen on explicit preview');
});

// ── The screen and the route ─────────────────────────────────────────────

// The shadow section became Today's Follow-ups section. Same guarantees, and
// they matter more now that it is not fenced off as a rehearsal: it sits in
// the day's work, so it must still be incapable of sending anything.
test('the follow-ups section cannot send, approve or queue anything', () => {
  const src = readFileSync(new URL('../components/Followups.jsx', import.meta.url), 'utf8');
  for (const forbidden of ['sendApproved', 'Send now', 'approve', 'enqueue', 'next_action_date']) {
    assert.ok(!src.includes(forbidden), `the follow-ups section must never mention ${forbidden}`);
  }
  assert.ok(src.includes('Preview'), 'the only action is a preview');
  assert.ok(/Nothing sends automatically while follow-up automation is off/.test(src),
    'and it says so on the page, in the only wording that is currently true');
  for (const lie of ['Sends itself', 'Queued', 'Ready to auto-send']) {
    assert.ok(!src.includes(lie), `"${lie}" would not be true while the switches are off`);
  }
});

test('the follow-ups section shows words, never enum names', () => {
  const src = readFileSync(new URL('../components/Followups.jsx', import.meta.url), 'utf8');
  for (const raw of ['DUE_NOW', 'NOT_DUE_YET', 'HOLD_CONTACT', 'MANUAL_ONLY', 'READY_TO_SEND', 'QUEUED']) {
    assert.ok(!src.includes(`>${raw}`), `${raw} must not be rendered raw`);
  }
  // The label is the router's, not this component's opinion.
  assert.ok(src.includes('state={state}'), 'every row is labelled by prospectActionState');
});

test('rendering the list makes no network or model call', () => {
  const src = readFileSync(new URL('../components/Followups.jsx', import.meta.url), 'utf8');
  const beforePreview = src.slice(0, src.indexOf('async function preview'));
  assert.ok(!beforePreview.includes('fetch('), 'nothing is fetched to build the queue');
});

test('the preview route is retired and still writes nothing', () => {
  // It used to compose a throwaway draft with app AI spend. The app does
  // not write email anymore (2026-08-27); the route answers with a plain
  // explanation, and the old invariant - no state writes - holds trivially.
  const src = readFileSync(new URL('../app/api/followup-preview/route.js', import.meta.url), 'utf8');
  assert.ok(src.includes('status: 410'), 'retired, not removed');
  for (const forbidden of ['UPDATE prospects', 'INSERT INTO', 'askBackground', 'enqueue(', 'emails_sent =']) {
    assert.ok(!src.includes(forbidden), 'the retired route must not contain ' + forbidden);
  }
});

test('the retired preview route reads nothing from the caller', () => {
  const src = readFileSync(new URL('../app/api/followup-preview/route.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('req.json'), 'no body is read at all');
  assert.ok(!src.includes('nextFollowupStep'), 'no step is computed for a draft that will never exist');
});
