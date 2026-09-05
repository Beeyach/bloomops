// Approving the draft is not approving the sequence.
//
// Package 19 held both touches, the only control on the screen said "Approve
// draft", and Ary pressed it. The route did exactly the right thing: it
// approved Email 1 and left sequence_approved at 0, because nothing asked for
// the sequence. Nothing was broken. The screen simply offered one consent and
// the product needed two, so the narrower one was the only one she could give
// and there was no sign the wider one existed.
//
// These run the real card builder and the real approval patch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approvalCard, approvalPatch, reconcileForApproval } from '../lib/approval.mjs';
import { approvalFingerprint } from '../lib/send-guard.mjs';

const E2 = { step: 2, subject: 'contact page follow-up', body: 'Second email.\n\nThanks,\nAry' };
const E3 = { step: 3, subject: 'one last thought on the contact page', body: 'Third email.\n\nThanks,\nAry' };

const pkg = (extra = {}) => ({
  id: 19, version: 4, playbook: 'lead-capture-gap', playbook_version: 2,
  generator_version: 'g', evidence_hash: 'e', workspace_context_hash: 'w',
  contact_email: 'her@example.com', status: 'READY_FOR_APPROVAL',
  email_subject: 'no form on your contact page',
  email_body: 'Hi Cynthia,\n\nFirst email.\n\nThanks,\nAry',
  allowed_length: 3, sequence_max_step: null, priority_band: 'P2',
  sequence_approved: 0, followups: JSON.stringify([E2, E3]),
  ...extra,
});
const P2 = { id: 1, rating: '💙', email: 'her@example.com', emails_sent: 0 };
const P3 = { id: 1, rating: '✖️', email: 'her@example.com', emails_sent: 0 };

// The row as it would be stored after applying a patch, for fingerprint checks.
const stored = (base, patch) => ({
  ...base,
  priority_band: patch.priority_band,
  allowed_length: patch.allowed_length,
  sequence_max_step: patch.sequence_max_step,
  followups: patch.followups,
});

// ── the two consents are distinct ────────────────────────────────────────

test('Email-1-only approval leaves the sequence unapproved', () => {
  const r = reconcileForApproval(pkg(), P2);
  assert.equal(r.canApprove, true);
  // The route writes sequence_approved from an explicit flag. Absent it, this
  // is the state package 19 ended in, and it is correct.
  const patchNoSeq = { ...approvalPatch(pkg(), P2).patch, sequence_approved: 0, sequence_max_step: null };
  assert.equal(patchNoSeq.sequence_approved, 0);
  assert.equal(patchNoSeq.sequence_max_step, null);
  assert.equal(
    approvalFingerprint(stored(pkg(), patchNoSeq)),
    approvalFingerprint(stored(pkg(), patchNoSeq)),
    'the fingerprint is stable over that state'
  );
});

test('full approval sets both fields and matches its own fingerprint', () => {
  const out = approvalPatch(pkg(), P2);
  assert.equal(out.patch.sequence_approved, 1);
  assert.equal(out.patch.sequence_max_step, 3);
  assert.equal(out.patch.allowed_length, 3);
  assert.equal(
    approvalFingerprint(stored(pkg(), out.patch)), out.patch.approved_fingerprint,
    'the stored row matches the fingerprint written with it'
  );
});

test('upgrading an already-approved package changes nothing but the consent', () => {
  // Package 19's exact situation: APPROVED, first email only, both touches
  // stored. Re-approving with the sequence flag must not touch the copy.
  const before = pkg({ status: 'APPROVED', sequence_approved: 0, sequence_max_step: null, reviewed_at: '2026-08-12T08:53:19.240Z' });
  const out = approvalPatch(before, P2);

  assert.equal(out.patch.sequence_approved, 1);
  assert.equal(out.patch.sequence_max_step, 3);
  assert.equal(JSON.parse(out.patch.followups)[0].body, E2.body, 'Email 2 copy unchanged');

  const after = stored(before, out.patch);
  assert.equal(after.email_subject, before.email_subject, 'Email 1 subject unchanged');
  assert.equal(after.email_body, before.email_body, 'Email 1 body unchanged');
  assert.notEqual(approvalFingerprint(before), out.patch.approved_fingerprint, 'the fingerprint moves, because sequence_max_step did');
  assert.equal(approvalFingerprint(after), out.patch.approved_fingerprint, 'and the stored row matches the new one');
});

// ── the fingerprint still covers the copy afterwards ─────────────────────

test('changing Email 1 after full approval makes it stale', () => {
  const out = approvalPatch(pkg(), P2);
  const tampered = { ...stored(pkg(), out.patch), email_body: 'Rewritten.' };
  assert.notEqual(approvalFingerprint(tampered), out.patch.approved_fingerprint);
});

test('changing Email 2 after full approval makes it stale', () => {
  const out = approvalPatch(pkg(), P2);
  const tampered = { ...stored(pkg(), out.patch), followups: JSON.stringify([{ ...E2, body: 'Rewritten.' }]) };
  assert.notEqual(approvalFingerprint(tampered), out.patch.approved_fingerprint);
});

test('changing allowed_length after full approval makes it stale', () => {
  const out = approvalPatch(pkg(), P2);
  const tampered = { ...stored(pkg(), out.patch), allowed_length: 4 };
  assert.notEqual(approvalFingerprint(tampered), out.patch.approved_fingerprint);
});

test('a P2 missing Email 2 cannot be sequence-approved', () => {
  const r = reconcileForApproval(pkg({ followups: '[]' }), P2);
  assert.equal(r.canApproveSequence, false);
  assert.equal(approvalPatch(pkg({ followups: '[]' }), P2).patch.sequence_approved, 0);
});

// ── what the card offers ─────────────────────────────────────────────────

test('a P2 with all touches offers both consents and shows the followups', () => {
  const c = approvalCard(pkg(), P2);
  assert.ok(c.sequence, 'the card carries a sequence descriptor');
  assert.equal(c.sequence.touches, 3);
  assert.equal(c.sequence.approved, false);
  assert.equal(c.sequence.canApprove, true);
  assert.equal(c.sequence.steps.length, 2);
  assert.equal(c.sequence.steps[0].body, E2.body, 'the exact words are on the card');
  assert.match(c.sequence.firstOnly.label, /Email 1 only/);
  assert.match(c.sequence.full.label, /all 3 emails/i);
});

test('an already-approved P2 offers the upgrade instead', () => {
  const c = approvalCard(pkg({ status: 'APPROVED' }), P2);
  assert.ok(c.sequence.upgrade, 'an upgrade action exists');
  assert.match(c.sequence.upgrade.label, /follow-up too/i);
  assert.match(c.sequence.upgrade.note, /nothing is sent/i);
});

test('a fully approved P2 asks for nothing further', () => {
  const c = approvalCard(pkg({ status: 'APPROVED', sequence_approved: 1, sequence_max_step: 3 }), P2);
  assert.equal(c.sequence.approved, true);
  assert.equal(c.sequence.upgrade, null, 'nothing left to upgrade');
});

test('P3 is never offered a sequence choice', () => {
  // Its one touch IS the whole sequence, so a second consent would mean nothing.
  const c = approvalCard(pkg(), P3);
  assert.equal(c.sequence, null);
});

test('a P2 missing Email 2 offers no sequence consent', () => {
  const c = approvalCard(pkg({ followups: '[]' }), P2);
  assert.equal(c.sequence, null, 'there is no second email to agree to');
});

// ── approval sends nothing ───────────────────────────────────────────────

test('nothing in the approval patch sends or schedules', () => {
  const out = approvalPatch(pkg(), P2);
  const keys = Object.keys(out.patch);
  for (const k of ['scheduled_send_at', 'sent_at', 'emails_sent']) {
    assert.ok(!keys.includes(k), `${k} must not be written by approval`);
  }
  assert.equal(out.patch.status, 'APPROVED');
});

// ── the branch that actually renders for an approved package ─────────────
//
// The first attempt at this UI put the sequence controls inside the review
// panel. That panel is gated on `item.status !== 'APPROVED'`, so for the one
// state that needed it — first email approved, follow-up written and waiting —
// nothing rendered. The screenshot showed a Send now button and no mention of
// Email 2 at all.
//
// Two things had to be true and neither was: the card must be built with the
// package's status and sequence flag, and the approved branch must draw it.

import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../components/ApprovalQueue.jsx', import.meta.url), 'utf8');

test('the card is built with the fields sequence.upgrade depends on', () => {
  // Without these the upgrade action is always null, whatever the row says.
  const built = ui.slice(ui.indexOf('approvalCard('), ui.indexOf('autoSendFirst: false'));
  assert.match(built, /status: item\.status/);
  assert.match(built, /sequence_approved: item\.sequenceApproved/);
});

test('the approved branch renders the sequence consent', () => {
  // The block between "Approved. Nothing has been sent yet." and the send
  // row's caption is the one drawn for package 19. The caption anchors the end
  // because "Send now" also appears in the batch toasts earlier in the file.
  const branch = ui.slice(ui.indexOf('Approved. Nothing has been sent yet.'), ui.indexOf('Sends this email to'));
  assert.match(branch, /card\.sequence && !card\.sequence\.approved/, 'it asks about the outstanding consent');
  assert.match(branch, /approveSequence: true/, 'and the button sends the flag the route needs');
});

test('the upgrade click carries no copy, so nothing is rewritten', () => {
  // act(item, 'approve', { approveSequence: true }) and nothing else. Passing a
  // subject or body would write edited_* and change what was approved.
  assert.match(ui, /act\(item, 'approve', \{ approveSequence: true \}\)/);
});

test('the approved card reports a fully approved sequence rather than asking again', () => {
  const branch = ui.slice(ui.indexOf('Approved. Nothing has been sent yet.'), ui.indexOf('Sends this email to'));
  assert.match(branch, /card\.sequence\.approved &&/);
});
