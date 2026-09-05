// A provisional cap must not speak over a package somebody actually approved.
//
// Package 19 was prepared and approved for two emails. The prospect behind it
// is unrated, so the generic helper answered 3 and an operator was told
// "P2 allows 3" about a two-email sequence. These tests fix the meaning of each
// ceiling separately, so no caller can pick up the wrong one by accident again.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  prospectPreparationCeiling,
  packageAllowedLength,
  approvedSequenceCeiling,
  sequenceCeilingFor,
  packageRecordsCeiling,
  ceilingWording,
} from '../lib/sequence-ceiling.mjs';
import { RATING, HARD_TOUCH_CEILING } from '../lib/priority.mjs';
import { nextStepFor, NEXT } from '../lib/cutover.mjs';
import { nextFollowupSchedule, DUE } from '../lib/followup-schedule.mjs';
import { coldSequenceExhausted } from '../lib/due.mjs';

const { GREEN, BLUE, CROSS } = RATING;

// Package 19 as production holds it.
const PKG19 = { allowed_length: 2, sequence_approved: 1, sequence_max_step: 2 };
const CYNTHIA = { id: 4860, rating: null, priority_band: null, emails_sent: 1, email: 'c@example.com' };
const SENT_AT = '2026-08-12T16:35:41.177Z';
const SENDS = [{ sequence_step: 1, sent_at: SENT_AT }];

// 1
test('an unrated prospect with no package keeps the provisional preparation cap', () => {
  assert.equal(prospectPreparationCeiling({ rating: null }), HARD_TOUCH_CEILING);
  assert.equal(prospectPreparationCeiling({ rating: null }), 4);
  // And nothing calls that a band allowance.
  assert.match(ceilingWording({ rating: null }, null), /^Not rated yet, so up to 4 emails may be planned/);
});

// 2
test('an unrated prospect with a prepared P2 package has a package ceiling of 2', () => {
  const pkg = { allowed_length: 2, sequence_approved: 0, sequence_max_step: null };
  assert.equal(packageAllowedLength(pkg), 2);
  assert.equal(prospectPreparationCeiling(CYNTHIA), 4, 'the prospect cap is untouched');
  assert.notEqual(sequenceCeilingFor(CYNTHIA, pkg), 4, 'but it no longer answers for the package');
});

// 3
test('an approved P2 package with allowed_length 2 and sequence_max_step 2 sends at most 2', () => {
  assert.equal(approvedSequenceCeiling(PKG19), 2);
  assert.equal(sequenceCeilingFor(CYNTHIA, PKG19), 2);
});

// 4
test('email 3 on that package is outside the sequence, and is never called a band allowance', () => {
  assert.equal(coldSequenceExhausted({ ...CYNTHIA, emails_sent: 2 }, PKG19), true, 'two sent exhausts it');
  const why = nextStepFor({ prospect: { ...CYNTHIA, emails_sent: 2 }, pkg: PKG19, contactOk: true }).why;
  assert.match(why, /allows 2/);
  assert.doesNotMatch(why, /allows 3/);
  for (const band of ['P1', 'P2', 'P3']) {
    assert.doesNotMatch(why, new RegExp(`${band} allows`), `never "${band} allows N"`);
  }
});

// 5
test('a P3 package allows exactly one email', () => {
  const p3 = { allowed_length: 1, sequence_approved: 1, sequence_max_step: 1 };
  assert.equal(approvedSequenceCeiling(p3), 1);
  assert.equal(prospectPreparationCeiling({ rating: CROSS }), 1, 'and a rated P3 prospect matches');
  assert.equal(coldSequenceExhausted({ rating: CROSS, emails_sent: 1 }, p3), true);
});

// 6
test('a P1 package allows four', () => {
  const p1 = { allowed_length: 4, sequence_approved: 1, sequence_max_step: 4 };
  assert.equal(approvedSequenceCeiling(p1), 4);
  assert.equal(prospectPreparationCeiling({ rating: GREEN }), 4);
  assert.equal(coldSequenceExhausted({ rating: GREEN, emails_sent: 2 }, p1), false, 'emails 3 and 4 are still owed');
});

// 7
test('a package long enough for two does not imply both were approved', () => {
  const unapproved = { allowed_length: 2, sequence_approved: 0, sequence_max_step: null };
  assert.equal(packageAllowedLength(unapproved), 2, 'the copy is two long');
  assert.equal(approvedSequenceCeiling(unapproved), 1, 'but only one was consented to');
  assert.equal(
    ceilingWording(CYNTHIA, unapproved),
    'Only the first email is approved. Anything after it is outside this approval.',
  );
});

// 8
test('a lower sequence_max_step wins over a longer package', () => {
  assert.equal(approvedSequenceCeiling({ allowed_length: 3, sequence_approved: 1, sequence_max_step: 2 }), 2);
});

// 9
test('a lower allowed_length wins over a higher sequence_max_step', () => {
  assert.equal(approvedSequenceCeiling({ allowed_length: 2, sequence_approved: 1, sequence_max_step: 3 }), 2);
});

// 10
test('a package that recorded no ceiling at all does not get a vote', () => {
  const legacy = { allowed_length: null, sequence_approved: null, sequence_max_step: null };
  assert.equal(packageRecordsCeiling(legacy), false);
  assert.equal(sequenceCeilingFor({ rating: GREEN }, legacy), 4, 'falls back to the prospect cap, unchanged');
  assert.equal(sequenceCeilingFor({ rating: BLUE }, legacy), 3);
  assert.equal(coldSequenceExhausted({ rating: GREEN, emails_sent: 2 }, legacy), false);
});

// 11
test('copy still has to exist and be approved — the ceiling is not the only gate', async () => {
  const { BLOCK, preparedFollowups } = await import('../lib/send-guard.mjs');
  assert.ok(BLOCK.COPY_NOT_APPROVED, 'the independent copy gate is still a thing');
  assert.ok(BLOCK.PAST_ALLOWED_LENGTH, 'and so is the length gate');
  // A correct ceiling of 2 does not conjure an Email 2 body into the package.
  assert.deepEqual(preparedFollowups({ ...PKG19, followups: '[]' }), [], 'no copy means no send, ceiling or not');
});

// 12
test('package 19 as production holds it returns 2, not 4', () => {
  assert.equal(sequenceCeilingFor(CYNTHIA, PKG19), 2);
  const s = nextFollowupSchedule({ ...CYNTHIA, last_contact_date: '2026-08-12' }, {
    sendEvents: SENDS, pkg: PKG19, now: new Date('2026-08-13T12:00:00Z'),
  });
  assert.equal(s.ceiling, 2);
  assert.match(s.reason, /allows 2/);
});

// 13
test('email 2 is still due on day 5 counted from the real email 1 send', () => {
  const at3 = nextFollowupSchedule({ ...CYNTHIA, last_contact_date: '2026-08-12' }, {
    sendEvents: SENDS, pkg: PKG19, now: new Date('2026-08-15T12:00:00Z'),
  });
  assert.equal(at3.status, DUE.NOT_DUE_YET, 'day 3 is early');
  assert.equal(at3.step, 2);
  assert.equal(String(at3.dueAt).slice(0, 10), '2026-08-17', 'day 5 from 2026-08-12');
});

// 14
test('the weekend window is unchanged by any of this', async () => {
  const { sendPolicy, insideSendWindow } = await import('../lib/send-policy.mjs');
  const policy = sendPolicy({});
  assert.deepEqual(policy.sendDays ?? [1, 2, 3, 4, 5], [1, 2, 3, 4, 5], 'weekdays only');
  // Email 2's canonical day 5 is Monday 2026-08-17. No weekend delay.
  const sunday = insideSendWindow(policy, new Date('2026-08-16T17:00:00Z'));
  assert.equal(sunday.ok, false, 'Sunday is closed');
  assert.match(sunday.reason, /sending day/i);
  const monday = insideSendWindow(policy, new Date('2026-08-17T17:00:00Z'));
  assert.equal(monday.ok, true, 'Monday 10:00 Pacific is open');
});

// 15
test('both automation switches remain the authority, whatever the ceiling says', async () => {
  const { sendPolicy } = await import('../lib/send-policy.mjs');
  const policy = sendPolicy({});
  assert.equal(policy.autoSendApprovedFirstEmails, false);
  assert.equal(policy.autoSendApprovedFollowups, false);
});

// 16
test('nothing here writes, sends, or mutates', () => {
  // Every helper in this module is pure: same input, same answer, no handle.
  const before = JSON.stringify({ CYNTHIA, PKG19 });
  sequenceCeilingFor(CYNTHIA, PKG19);
  approvedSequenceCeiling(PKG19);
  prospectPreparationCeiling(CYNTHIA);
  packageAllowedLength(PKG19);
  ceilingWording(CYNTHIA, PKG19);
  nextStepFor({ prospect: CYNTHIA, pkg: PKG19, contactOk: true });
  assert.equal(JSON.stringify({ CYNTHIA, PKG19 }), before, 'no argument was touched');
});

// The regression that started it: the exact sentence must be gone.
test('no surface says "P2 allows 3" for an unrated prospect with a two-email package', () => {
  const d = nextStepFor({ prospect: CYNTHIA, pkg: PKG19, contactOk: true });
  assert.equal(d.next, NEXT.ELIGIBLE_EMAIL_2);
  assert.doesNotMatch(d.why, /P2 allows 3/);
  assert.match(d.why, /This sequence allows 2/);
});

// ── Grandfather rule ────────────────────────────────────────────────────
//
// V2 P1 packages were approved with allowed_length 3. V3 raises P1 to 4,
// but in-flight packages keep their recorded ceiling.

test('a V2 P1 package approved at allowed_length 3 keeps its ceiling at 3 under V3', () => {
  const v2Pkg = { allowed_length: 3, sequence_approved: 1, sequence_max_step: 3 };
  const greenProspect = { id: 99, rating: GREEN, emails_sent: 2, email: 'g@example.com' };

  assert.equal(packageRecordsCeiling(v2Pkg), true, 'the package recorded a ceiling');
  assert.equal(approvedSequenceCeiling(v2Pkg), 3, 'the approved ceiling is the recorded 3');
  assert.equal(sequenceCeilingFor(greenProspect, v2Pkg), 3, 'V3 P1=4 does not widen it');
  assert.equal(prospectPreparationCeiling(greenProspect), 4, 'the prospect cap IS 4 now');

  assert.equal(coldSequenceExhausted({ ...greenProspect, emails_sent: 3 }, v2Pkg), true,
    'three sent exhausts this grandfather package');
  const d = nextStepFor({ prospect: { ...greenProspect, emails_sent: 3 }, pkg: v2Pkg, contactOk: true });
  assert.match(d.why, /allows 3/, 'the refusal cites 3, not 4');
});
