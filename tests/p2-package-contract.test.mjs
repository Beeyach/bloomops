// What a P2 package has to contain before anybody approves it.
//
// Cynthia's first package held Email 1 and nothing else, and the review object
// Ary was handed was "approve a two-touch sequence" with one email in it. The
// send guard would have refused to send an Email 2 that was never approved, so
// nothing unsafe could have happened — but the sequence would have quietly
// stopped after one message, and the thing Ary agreed to would not have been
// the thing that existed.
//
// So the contract is: the band decides the ceiling, every touch up to it is
// written during preparation, and the approval fingerprint covers all of them.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ensureSignOff } from '../lib/outreach.mjs';
import { PLAYBOOKS } from '../lib/playbooks.mjs';
import { allFollowups, reconcileForApproval } from '../lib/approval.mjs';
import { approvalFingerprint, preparedFollowups } from '../lib/send-guard.mjs';

const SETTINGS = { operatorName: 'Ary', businessName: 'Bloomwired' };

const pkgWith = (followups, extra = {}) => ({
  id: 16, version: 1, playbook: 'lead-capture-gap', playbook_version: 2,
  generator_version: 'g1', evidence_hash: 'e1', workspace_context_hash: 'w1',
  contact_email: 'her@example.com',
  email_subject: 'quick question about your contact page',
  email_body: 'Hi Cynthia.\n\nThe body.\n\nThanks,\nAry',
  allowed_length: 3, sequence_max_step: null, priority_band: 'P2',
  followups: JSON.stringify(followups),
  ...extra,
});

const FOLLOWUP_2 = { step: 2, subject: 'following up on the contact page', body: 'Second email.\n\nThanks,\nAry' };
const FOLLOWUP_3 = { step: 3, subject: 'one last thought on the contact page', body: 'Third email.\n\nThanks,\nAry' };

// ── the sign-off ─────────────────────────────────────────────────────────

test('a body with no sign-off gets one', () => {
  const out = ensureSignOff('Hi Cynthia.\n\nSomething true.', SETTINGS);
  assert.ok(out.endsWith('\n\nThanks,\nAry'), out);
});

test('a body that already signs off is left alone', () => {
  const body = 'Hi Cynthia.\n\nSomething true.\n\nThanks,\nAry';
  assert.equal(ensureSignOff(body, SETTINGS), body);
});

test('other closing words count as signed', () => {
  for (const close of ['Cheers', 'Best', 'Thank you']) {
    const body = `Hi.\n\nSomething.\n\n${close},\nAry`;
    assert.equal(ensureSignOff(body, SETTINGS), body, close);
  }
});

test('a bare name at the end counts as signed', () => {
  const body = 'Hi.\n\nSomething.\n\nAry';
  assert.equal(ensureSignOff(body, SETTINGS), body);
});

test('no operator name means nothing is invented', () => {
  const body = 'Hi.\n\nSomething.';
  assert.equal(ensureSignOff(body, {}), body);
});

// ── the CTA contract ─────────────────────────────────────────────────────

test('every playbook closes on an offer, not an open question', () => {
  // The old CTAs all began "Ask ...", which is why every cold email this system
  // wrote ended by asking a stranger to explain their own business.
  const asking = PLAYBOOKS.filter((p) => /^ask\b/i.test(String(p.cta || '')));
  assert.deepEqual(asking.map((p) => p.id), [], 'a playbook still opens its CTA with "Ask"');
});

test('the lead-capture-gap CTA offers something concrete', () => {
  const pb = PLAYBOOKS.find((p) => p.id === 'lead-capture-gap');
  assert.match(pb.cta, /offer to send/i);
  assert.match(pb.cta, /rundown|change/i);
});

// ── what the fingerprint covers ──────────────────────────────────────────

test('the fingerprint covers Email 2 exactly', () => {
  const a = approvalFingerprint(pkgWith([FOLLOWUP_2]));
  const b = approvalFingerprint(pkgWith([{ ...FOLLOWUP_2, body: 'Different second email.' }]));
  assert.notEqual(a, b, 'changing Email 2 must change the fingerprint');
});

test('the fingerprint covers Email 1 exactly', () => {
  const a = approvalFingerprint(pkgWith([FOLLOWUP_2]));
  const b = approvalFingerprint(pkgWith([FOLLOWUP_2], { email_body: 'Rewritten.' }));
  assert.notEqual(a, b);
});

test('the fingerprint covers the allowed length', () => {
  const a = approvalFingerprint(pkgWith([FOLLOWUP_2]));
  const b = approvalFingerprint(pkgWith([FOLLOWUP_2], { allowed_length: 4 }));
  assert.notEqual(a, b, 'approving three emails is not approving four');
});

test('adding Email 2 after approval makes the approval stale', () => {
  // The exact hole this task closes. A package approved with no follow-up
  // fingerprints an empty list; copy written afterwards cannot match it.
  const approvedWithNothing = approvalFingerprint(pkgWith([]));
  const laterWithCopy = approvalFingerprint(pkgWith([FOLLOWUP_2]));
  assert.notEqual(approvedWithNothing, laterWithCopy);
});

test('a follow-up written after approval is not sendable copy', () => {
  // preparedFollowups is what the send path reads. Nothing in the package
  // means nothing to send, which is the fail-closed half of the same rule.
  assert.deepEqual(preparedFollowups(pkgWith([])), []);
  assert.equal(preparedFollowups(pkgWith([FOLLOWUP_2])).length, 1);
});

// ── ceilings stay where they were ────────────────────────────────────────

const prospectFor = (rating) => ({ id: 1, rating, email: 'x@y.com', emails_sent: 0 });

test('P2 stays at three touches', () => {
  const r = reconcileForApproval(pkgWith([FOLLOWUP_2, FOLLOWUP_3]), prospectFor('💙'));
  assert.equal(r.finalLength, 3);
  assert.equal(r.finalBand, 'P2');
  assert.deepEqual(r.missingSteps, [], 'all three touches are present');
});

test('P3 stays at one touch and demotes a second', () => {
  const r = reconcileForApproval(pkgWith([FOLLOWUP_2]), prospectFor('✖️'));
  assert.equal(r.finalLength, 1);
  assert.deepEqual(r.demotedSteps, [2], 'the extra email is kept as a draft, not approved');
  assert.equal(r.followups.find((f) => f.step === 2).approved, false);
});

test('P1 is not widened past four', () => {
  const r = reconcileForApproval(pkgWith([FOLLOWUP_2]), prospectFor('💚'));
  assert.ok(r.finalLength <= 4, `P1 allowed ${r.finalLength}`);
});

test('a P2 package missing its followups is reported as incomplete', () => {
  const r = reconcileForApproval(pkgWith([]), prospectFor('💙'));
  assert.deepEqual(r.missingSteps, [2, 3], 'the missing touches are named, not silently dropped');
});

test('allFollowups never invents a step past what is stored', () => {
  assert.equal(allFollowups(pkgWith([FOLLOWUP_2])).length, 1);
  assert.deepEqual(allFollowups(pkgWith([])), []);
});

// ── the sequence-approval invariant ──────────────────────────────────────
//
// Added after the first version of this fix turned out to be insufficient.
// Saving a P2 short and letting reconciliation "report the missing step" was
// not enough: PARTIAL is approvable, and the route wrote sequence_approved
// straight from the caller's flag without checking the emails existed. So a
// two-touch sequence could be approved with one email in it. Nothing unsafe
// could ship, because the send guard refuses copy that was never approved, but
// the consent record said two and meant one.

import { approvalPatch } from '../lib/approval.mjs';

test('a P2 missing its followups cannot receive sequence approval', () => {
  const r = reconcileForApproval(pkgWith([]), prospectFor('💙'));
  assert.equal(r.canApprove, true, 'the first email may still be approved on its own');
  assert.equal(r.canApproveSequence, false, 'the sequence may not');
  assert.deepEqual(r.missingSteps, [2, 3]);
});

test('the approval patch refuses to stamp a sequence it cannot justify', () => {
  const out = approvalPatch(pkgWith([]), prospectFor('💙'));
  assert.equal(out.ok, true);
  assert.equal(out.patch.sequence_approved, 0, 'no sequence consent without the copy');
  assert.equal(out.patch.sequence_max_step, null, 'and no step ceiling implying one');
});

test('a complete P2 approves normally, sequence and all', () => {
  const r = reconcileForApproval(pkgWith([FOLLOWUP_2, FOLLOWUP_3]), prospectFor('💙'));
  assert.equal(r.canApprove, true);
  assert.equal(r.canApproveSequence, true);
  assert.deepEqual(r.missingSteps, []);

  const out = approvalPatch(pkgWith([FOLLOWUP_2, FOLLOWUP_3]), prospectFor('💙'));
  assert.equal(out.patch.sequence_approved, 1);
  assert.equal(out.patch.sequence_max_step, 3);
  assert.equal(out.patch.allowed_length, 3);
  assert.ok(out.patch.approved_fingerprint, 'and it is fingerprinted');
});

test('P3 needs exactly one touch and approves complete', () => {
  // One email IS the whole P3 sequence, so nothing is missing and the sequence
  // consent is real rather than a partial.
  const r = reconcileForApproval(pkgWith([]), prospectFor('✖️'));
  assert.equal(r.finalLength, 1);
  assert.deepEqual(r.missingSteps, [], 'a one-touch band is not missing a second email');
  assert.equal(r.canApproveSequence, true);
});

test('a package with no first email is approvable by nothing', () => {
  const r = reconcileForApproval(pkgWith([FOLLOWUP_2], { email_body: '', edited_body: '' }), prospectFor('💙'));
  assert.equal(r.canApprove, false);
  assert.equal(r.canApproveSequence, false);
  assert.equal(approvalPatch(pkgWith([FOLLOWUP_2], { email_body: '', edited_body: '' }), prospectFor('💙')).patch, null);
});

test('the fingerprint still covers every approved touch after the change', () => {
  const out = approvalPatch(pkgWith([FOLLOWUP_2, FOLLOWUP_3]), prospectFor('💙'));
  const changed = approvalPatch(
    pkgWith([{ ...FOLLOWUP_2, body: 'Rewritten after approval.' }, FOLLOWUP_3]), prospectFor('💙')
  );
  assert.notEqual(out.patch.approved_fingerprint, changed.patch.approved_fingerprint);
});

test('the patch matches the object the fingerprint was taken over', () => {
  // These two drifting apart made every approved package stale the moment it
  // was approved. sequence_max_step is now conditional, so it is the field
  // most likely to drift again.
  for (const rating of ['💙', '✖️']) {
    for (const fups of [[], [FOLLOWUP_2]]) {
      const out = approvalPatch(pkgWith(fups), prospectFor(rating));
      if (!out.patch) continue;
      const stored = {
        ...pkgWith(fups),
        priority_band: out.patch.priority_band,
        allowed_length: out.patch.allowed_length,
        sequence_max_step: out.patch.sequence_max_step,
        followups: out.patch.followups,
      };
      assert.equal(
        approvalFingerprint(stored), out.patch.approved_fingerprint,
        `stored row must match its own fingerprint (${rating}, ${fups.length} followups)`
      );
    }
  }
});

// ── preparation never hands over an incomplete sequence ──────────────────

import { ACTIONABLE_STATUSES, missingSequenceSteps, STATUS } from '../lib/outreach.mjs';

test('an unfinished preparation is not actionable', () => {
  // PREPARING is where a P2 lands when its second email could not be written.
  // It must be on no screen and must not block the retry that completes it.
  assert.ok(!ACTIONABLE_STATUSES.includes(STATUS.PREPARING), 'PREPARING must not be actionable');
  assert.deepEqual(ACTIONABLE_STATUSES, ['READY_FOR_APPROVAL', 'NEEDS_DECISION', 'APPROVED']);
});

test('P2 with no followups written is an incomplete sequence', () => {
  assert.deepEqual(missingSequenceSteps(3, []), [2, 3]);
  assert.deepEqual(missingSequenceSteps(3, [{ step: 3 }]), [2], 'a later step does not satisfy step 2');
});

test('P2 with all three touches is complete, so preparation may publish it', () => {
  assert.deepEqual(missingSequenceSteps(3, [FOLLOWUP_2, FOLLOWUP_3]), []);
});

test('P3 needs exactly one touch, so it is never incomplete', () => {
  assert.deepEqual(missingSequenceSteps(1, []), [], 'one touch IS the whole P3 sequence');
});

test('P1 needs all four before it is complete', () => {
  assert.deepEqual(missingSequenceSteps(4, [FOLLOWUP_2]), [3, 4]);
  assert.deepEqual(missingSequenceSteps(4, [FOLLOWUP_2, { step: 3 }, { step: 4 }]), []);
});

test('a retry that writes the missing steps makes the package complete', () => {
  // The recovery path: first attempt got nothing, the retry filled in all
  // followups, and only then does the sequence become publishable and
  // sequence-approvable.
  const firstAttempt = [];
  assert.deepEqual(missingSequenceSteps(3, firstAttempt), [2, 3]);
  assert.equal(reconcileForApproval(pkgWith(firstAttempt), prospectFor('💙')).canApproveSequence, false);

  const retry = [FOLLOWUP_2, FOLLOWUP_3];
  assert.deepEqual(missingSequenceSteps(3, retry), []);
  const r = reconcileForApproval(pkgWith(retry), prospectFor('💙'));
  assert.equal(r.canApproveSequence, true);
  assert.equal(r.finalLength, 3);
});
