// What happens next with this person, in words.
//
// The old interface led with the stage: Email 1 through Email 5. 652 prospects
// sit at the end of that ladder and none of them are waiting for anything, so
// the number was the wrong thing to show. These tests are about the sentence
// that replaces it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  prospectActionState, viewFor, belongsOnToday, todayExceptions,
  PILE, VIEW, TONE, TODAY_EXCEPTION_LIMIT,
} from '../lib/prospect-action.mjs';
import { RATING } from '../lib/priority.mjs';
import { REL } from '../lib/relationship.mjs';
import { isoShift, todayIso } from '../lib/due.mjs';

const { GREEN, BLUE, CROSS } = RATING;
const p = (o) => ({ name: 'Jane', business_name: 'Jane Co', email: 'jane@example.com', ...o });
const state = (o, opts) => prospectActionState(p(o), opts);
const e1 = (daysAgo) => [{ sequence_step: 1, sent_at: `${isoShift(-daysAgo)}T09:00:00Z` }];

// ── A reply outranks the old stage ───────────────────────────────────────

test('somebody who replied is Needs you, whatever stage they were at', () => {
  for (const sent of [1, 2, 3, 5, 9]) {
    const s = state({ rating: GREEN, emails_sent: sent, replied: 1, stage: 'Email 5', last_contact_date: isoShift(-10) });
    assert.equal(s.pile, PILE.NEEDS_YOU, `${sent} sent`);
    assert.equal(s.tone, 'high');
    assert.ok(!/Email 5/.test(s.label), 'the old stage is not the headline');
  }
});

test('the relationship names the state when there is one', () => {
  const s = state({ rating: GREEN, emails_sent: 1, replied: 1 }, { relationship: { state: REL.INTERESTED } });
  assert.equal(s.pile, PILE.NEEDS_YOU);
  assert.equal(s.label, 'Interested');
});

// ── Nothing sent yet ─────────────────────────────────────────────────────

test('never contacted is a state, not an invitation', () => {
  const s = state({ rating: GREEN, emails_sent: 0 });
  assert.equal(s.pile, PILE.NOT_CONTACTED);
  assert.equal(s.label, 'Not contacted yet');
  assert.equal(belongsOnToday(s), false, 'inventory does not belong in a day of work');
});

test('only a package a person can approve makes it work', () => {
  assert.equal(state({ rating: GREEN, emails_sent: 0 }, { readyPackages: 1 }).label, 'Ready for approval');
  assert.equal(state({ rating: GREEN, emails_sent: 0 }, { approvedPackages: 1 }).label, 'Approved, not sent yet');
  assert.equal(state({ rating: GREEN, emails_sent: 0 }, { readyPackages: 1 }).pile, PILE.READY);
});

test('a never-contacted prospect with no address is not told we lost it', () => {
  // This was the bug the production run found: 4,451 rows read "we contacted
  // them before but the record no longer has a usable email", which never
  // happened to any of them.
  const s = state({ rating: GREEN, emails_sent: 0, email: null });
  assert.equal(s.label, 'No address yet');
  assert.notEqual(s.label, 'Needs email address');
  assert.equal(belongsOnToday(s), false);
});

// ── One email sent ───────────────────────────────────────────────────────

test('one email sent leads with what is next, not with the stage', () => {
  const s = state({ rating: GREEN, emails_sent: 1, stage: 'Email 1', last_contact_date: isoShift(-6) }, { sendEvents: e1(6) });
  assert.equal(s.pile, PILE.FOLLOWUP);
  assert.equal(s.label, 'Email 2 due');
  assert.match(s.context, /1 email sent/);
  assert.ok(!/Stage/.test(s.label));
});

test('a ✖️ with one email is finished, not mid-sequence', () => {
  const s = state({ rating: CROSS, emails_sent: 1, last_contact_date: isoShift(-6) }, { sendEvents: e1(6) });
  assert.equal(s.pile, PILE.FINISHED);
  assert.equal(s.label, 'Sequence finished');
});

test('an upcoming follow-up reads calm, not urgent', () => {
  const s = state({ rating: GREEN, emails_sent: 1, last_contact_date: todayIso() }, { sendEvents: e1(1) });
  assert.equal(s.label, 'Email 2 coming up');
  assert.equal(s.tone, 'calm');
});

// ── Two and three ────────────────────────────────────────────────────────

test('two sent with a real anchor gets Email 3', () => {
  const s = state({ rating: GREEN, emails_sent: 2, last_contact_date: isoShift(-4) }, { sendEvents: e1(11) });
  assert.equal(s.label, 'Email 3 due');
});

test('two sent with no anchor says timing unknown, and says why', () => {
  const s = state({ rating: GREEN, emails_sent: 2, last_contact_date: isoShift(-4) });
  assert.equal(s.pile, PILE.ATTENTION);
  assert.equal(s.label, 'Timing unknown');
  assert.match(s.detail, /never recorded/);
  assert.equal(s.tone, 'notice', 'not an error, so not styled as one');
});

test('a real P2 with three sent is finished', () => {
  const s = state({ rating: BLUE, emails_sent: 3, last_contact_date: isoShift(-4) }, { sendEvents: e1(13) });
  assert.equal(s.pile, PILE.FINISHED);
});

test('four sent is finished for everybody', () => {
  for (const rating of [GREEN, BLUE, CROSS, '']) {
    const s = state({ rating, emails_sent: 4, last_contact_date: isoShift(-4) }, { sendEvents: e1(20) });
    assert.equal(s.pile, PILE.FINISHED, `${rating} at 4 sent`);
  }
});

// ── The 652 ──────────────────────────────────────────────────────────────

test('four or more is old sequence finished, and does not read as broken', () => {
  const s = state({ rating: GREEN, emails_sent: 6, stage: 'Email 5', last_contact_date: isoShift(-40) });
  assert.equal(s.pile, PILE.FINISHED);
  assert.equal(s.label, 'Old sequence finished');
  assert.equal(s.tone, 'quiet');
  assert.equal(belongsOnToday(s), false, '622 rows must not flood Today');
  assert.match(s.detail, /Nothing goes out automatically/);
  for (const alarm of ['error', 'failed', 'broken', 'problem']) {
    assert.ok(!s.detail.toLowerCase().includes(alarm), `${alarm} is the wrong word for history`);
  }
});

// ── The exceptions ───────────────────────────────────────────────────────

test('a lost address after contact is named plainly', () => {
  const s = prospectActionState({ name: 'Jane', rating: GREEN, emails_sent: 1, email: null, last_contact_date: isoShift(-6) });
  assert.equal(s.pile, PILE.ATTENTION);
  assert.equal(s.label, 'Needs email address');
  assert.match(s.detail, /contacted them before/);
});

test('stale outreach asks for a fresh check', () => {
  const s = state({ rating: GREEN, emails_sent: 1, last_contact_date: isoShift(60) && isoShift(-60) });
  assert.equal(s.label, 'Needs a fresh check');
  assert.equal(s.tone, 'notice');
});

// ── Today ────────────────────────────────────────────────────────────────

test('only work belongs on Today', () => {
  const onToday = [PILE.NEEDS_YOU, PILE.READY, PILE.FOLLOWUP, PILE.ATTENTION];
  const off = [PILE.FINISHED, PILE.NOT_CONTACTED, PILE.WAITING];
  for (const pile of onToday) assert.equal(belongsOnToday({ pile }), true, pile);
  for (const pile of off) assert.equal(belongsOnToday({ pile }), false, pile);
});

test('the exception list is capped so it cannot bury the replies', () => {
  const many = Array.from({ length: 220 }, () => ({ pile: PILE.ATTENTION }));
  const r = todayExceptions(many);
  assert.equal(r.shown.length, TODAY_EXCEPTION_LIMIT);
  assert.equal(r.hidden, 220 - TODAY_EXCEPTION_LIMIT);
  assert.equal(r.total, 220);
});

// ── The views ────────────────────────────────────────────────────────────

test('every pile lands in exactly one list view', () => {
  const seen = new Set();
  for (const pile of Object.values(PILE)) {
    const v = viewFor({ pile });
    assert.ok(Object.values(VIEW).includes(v), `${pile} -> ${v}`);
    seen.add(v);
  }
  assert.ok(seen.size >= 4, 'the views are actually used');
});

test('a follow-up is in outreach, a reply is in replied, history is finished', () => {
  assert.equal(viewFor({ pile: PILE.FOLLOWUP }), VIEW.IN_OUTREACH);
  assert.equal(viewFor({ pile: PILE.NEEDS_YOU }), VIEW.REPLIED);
  assert.equal(viewFor({ pile: PILE.FINISHED }), VIEW.FINISHED);
  assert.equal(viewFor({ pile: PILE.NOT_CONTACTED }), VIEW.NOT_CONTACTED);
});

// ── What a person never has to read ──────────────────────────────────────

test('no label or detail is an enum, a code or an id', () => {
  const samples = [
    state({ rating: GREEN, emails_sent: 1, last_contact_date: isoShift(-6) }, { sendEvents: e1(6) }),
    state({ rating: GREEN, emails_sent: 2, last_contact_date: isoShift(-4) }),
    state({ rating: GREEN, emails_sent: 6, last_contact_date: isoShift(-40) }),
    state({ rating: GREEN, emails_sent: 1, replied: 1 }),
    state({ rating: GREEN, emails_sent: 0 }),
  ];
  for (const s of samples) {
    for (const text of [s.label, s.detail, s.context]) {
      assert.ok(!/_/.test(text), `"${text}" still looks like an enum`);
      assert.ok(!/\b(NULL|undefined|NaN)\b/.test(text), `"${text}" leaked a value`);
      assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}/.test(text), `"${text}" leaked an id`);
      assert.ok(!/T\d{2}:\d{2}:\d{2}/.test(text), `"${text}" leaked a raw timestamp`);
    }
    // The code stays reachable for the collapsed technical section.
    assert.ok(s.code, 'diagnostics are kept, just not shown');
  }
});

test('this file reports policy and never decides it', () => {
  const src = readFileSync(new URL('../lib/prospect-action.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['TOUCHES', 'SPACING', 'STALE_CUTOVER_DAYS', 'sendApproved', 'enqueue(',
    'INSERT INTO', 'UPDATE ', 'DELETE ', 'askBackground', 'fetch(']) {
    assert.ok(!src.includes(forbidden), `the display router must never ${forbidden}`);
  }
});
