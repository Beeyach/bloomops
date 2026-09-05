// The approval fingerprint, and what happens when it is missing.
//
// The canary sent an Email 2 whose package had `approved_fingerprint = NULL`.
// It went out correctly, but not because the guard checked: the check read
// `if (stored && stored !== current)`, so a null skipped it rather than failing
// it. The stale-copy guard did not pass — it did not run. That was safe only
// because a person had read the body first, which is not a control that
// survives unattended sending.
//
// These hold the closed version: no fingerprint, no send.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { canSendNow, approvalFingerprint, BLOCK } from '../lib/send-guard.mjs';
import { GMAIL_SEND_SCOPE } from '../lib/gmail.mjs';
import { readFileSync } from 'node:fs';

const NOW = new Date('2026-08-11T16:05:00Z');

const PKG = {
  id: 1, status: 'APPROVED', reviewed_at: '2026-08-11T15:00:00Z', version: 1,
  playbook: 'own-finding', playbook_version: 2, generator_version: 'g1',
  evidence_hash: 'e1', workspace_context_hash: 'w1',
  contact_email: 'pat@x.com', email_subject: 'your booking form', email_body: 'Hi Pat.',
};

const ARGS = (pkg) => ({
  pkg,
  prospect: {
    id: 1, name: 'Pat', business_name: null, email: 'pat@x.com', stage: 'New',
    replied: 0, reply_type: null, reply_date: null, last_contact_date: null,
    next_action_date: null, do_not_contact: 0, unsubscribed: 0,
  },
  settings: { autoSendApprovedFirstEmails: true, minimumDelayAfterApprovalMinutes: 15 },
  account: {
    id: 1, email_address: 'me@x.com', status: 'connected',
    scope: `x ${GMAIL_SEND_SCOPE}`, last_sync_at: '2026-08-11 16:00:00',
  },
  now: NOW,
});

const sealed = (over = {}) => {
  const p = { ...PKG, ...over };
  return { ...p, approved_fingerprint: approvalFingerprint(p) };
};

// ── Missing ──────────────────────────────────────────────────────────────

test('a package approved without a fingerprint does not send', () => {
  const r = canSendNow(ARGS(PKG));
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.APPROVAL_INCOMPLETE);
  // The reason is for a person, and it says what to do about it.
  assert.match(r.reason, /Needs review/);
  assert.match(r.reason, /approve the email again/);
});

test('an empty or blank fingerprint counts as missing, not as a match', () => {
  for (const bad of ['', '   ', null, undefined]) {
    const r = canSendNow(ARGS({ ...PKG, approved_fingerprint: bad }));
    assert.equal(r.block, BLOCK.APPROVAL_INCOMPLETE, `${JSON.stringify(bad)} must not pass`);
  }
});

test('a manual send is not a way around a missing fingerprint', () => {
  // Manual skips the automation switch and nothing else. A person pressing the
  // button is authorisation to send what was approved, not authorisation to
  // send something nobody can prove was approved.
  const r = canSendNow({ ...ARGS(PKG), settings: {}, manual: true });
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.APPROVAL_INCOMPLETE);
});

test('the guard never writes a fingerprint of its own', () => {
  // Generating one at send time would let the thing being sent approve itself,
  // which is worse than the gap it closes.
  const pkg = { ...PKG };
  canSendNow(ARGS(pkg));
  assert.equal(pkg.approved_fingerprint, undefined, 'the package is not mutated');
});

// ── Present ──────────────────────────────────────────────────────────────

test('a matching fingerprint sends', () => {
  const r = canSendNow(ARGS(sealed()));
  assert.equal(r.ok, true, r.reason);
});

test('a mismatched fingerprint is stale, which is a different fault', () => {
  const r = canSendNow(ARGS({ ...sealed(), approved_fingerprint: 'not-the-one' }));
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.STALE_APPROVAL);
  // Distinct from missing, because they mean different things: one says the
  // copy changed, the other says nobody can tell.
  assert.notEqual(BLOCK.STALE_APPROVAL, BLOCK.APPROVAL_INCOMPLETE);
});

test('a malformed fingerprint blocks too, as a mismatch', () => {
  for (const junk of ['|||', '{}', 'null', '1|2|3']) {
    const r = canSendNow(ARGS({ ...sealed(), approved_fingerprint: junk }));
    assert.equal(r.ok, false, `${junk} must not send`);
    assert.equal(r.block, BLOCK.STALE_APPROVAL);
  }
});

// ── Editing after approval ───────────────────────────────────────────────

test('editing the body after approval invalidates it', () => {
  const r = canSendNow(ARGS({ ...sealed(), email_body: 'Hi Pat, and one more thing.' }));
  assert.equal(r.block, BLOCK.STALE_APPROVAL);
});

test('editing the subject after approval invalidates it', () => {
  const r = canSendNow(ARGS({ ...sealed(), email_subject: 'something else' }));
  assert.equal(r.block, BLOCK.STALE_APPROVAL);
});

test('changing the recipient after approval invalidates it', () => {
  const r = canSendNow(ARGS({ ...sealed(), contact_email: 'someone@else.com' }));
  assert.notEqual(r.ok, true);
});

test('the follow-up copy is inside the fingerprint, so editing Email 2 invalidates it', () => {
  const withTwo = sealed({ followups: [{ step: 2, subject: 'a', body: 'first version' }] });
  const edited = { ...withTwo, followups: [{ step: 2, subject: 'a', body: 'second version' }] };
  assert.notEqual(approvalFingerprint(edited), withTwo.approved_fingerprint);
  const r = canSendNow({
    ...ARGS(edited), manual: true, isFollowup: true, step: 2,
    schedule: { status: 'OVERDUE', step: 2 },
  });
  assert.equal(r.block, BLOCK.STALE_APPROVAL);
});

// ── Legacy ───────────────────────────────────────────────────────────────

test('a legacy approved package does not silently send, and re-approval fixes it', () => {
  // Exactly the shape of the one production package that predates the write:
  // APPROVED, reviewed, and no fingerprint.
  const legacy = { ...PKG, approved_fingerprint: null };
  assert.equal(canSendNow(ARGS(legacy)).block, BLOCK.APPROVAL_INCOMPLETE);

  // Re-approving writes the fingerprint of what is there now, and it sends.
  const reapproved = { ...legacy, approved_fingerprint: approvalFingerprint(legacy) };
  assert.equal(canSendNow(ARGS(reapproved)).ok, true);
});

test('the approval route computes the fingerprint from the fields it just wrote', () => {
  const route = readRoute();
  assert.match(route, /approved_fingerprint: approvalFingerprint\(\{ \.\.\.pkg, \.\.\.approvedFields \}\)/);
  // Written in the same setStatus call as the approval itself, so there is no
  // window where a package is approved and unfingerprinted.
  const at = route.indexOf('approved_fingerprint: approvalFingerprint');
  const call = route.lastIndexOf('await setStatus(STATUS.APPROVED', 0 + at);
  assert.ok(call !== -1 && call < at, 'the fingerprint is part of the approval write');
});

function readRoute() {
  return readFileSync(new URL('../app/api/outreach/route.js', import.meta.url), 'utf8');
}

// ── A real sequence, after Email 1 has actually gone ──────────────────────

test('a sequence-approved package can still send Email 2 once Email 1 has really been sent', () => {
  // The threading canary found this. A package moves to SENT the moment its
  // first email goes out, and the guard required APPROVED — so after a REAL
  // Email 1, Email 2 could never send. Every native follow-up in a real
  // sequence was unreachable. The earlier canary missed it because its Email 1
  // was synthetic, leaving the package APPROVED when Email 2 went.
  const pkg = sealed({
    status: 'SENT', sequence_approved: 1, sequence_max_step: 2, allowed_length: 2,
    followups: [{ step: 2, subject: 'same subject', body: 'the second one' }],
  });
  const r = canSendNow({
    ...ARGS(pkg), manual: true, isFollowup: true, step: 2,
    existingSends: 1, schedule: { status: 'DUE_NOW', step: 2 },
  });
  assert.equal(r.ok, true, r.reason);
});

test('SENT does not become a way in for a step nobody approved', () => {
  // The narrow exception is only for steps that were in the package when a
  // person read it. Step 3 was not, so it is still refused.
  const pkg = sealed({
    status: 'SENT', sequence_approved: 1, sequence_max_step: 2, allowed_length: 2,
    followups: [{ step: 2, subject: 'same subject', body: 'the second one' }],
  });
  const r = canSendNow({
    ...ARGS(pkg), manual: true, isFollowup: true, step: 3,
    existingSends: 2, schedule: { status: 'DUE_NOW', step: 3 },
  });
  assert.equal(r.ok, false);
});

test('a SENT package that was never sequence-approved stays closed', () => {
  const pkg = sealed({ status: 'SENT', sequence_approved: 0 });
  const r = canSendNow({
    ...ARGS(pkg), manual: true, isFollowup: true, step: 2,
    existingSends: 1, schedule: { status: 'DUE_NOW', step: 2 },
  });
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.NOT_APPROVED);
});

test('SENT never opens a first email back up', () => {
  const pkg = sealed({ status: 'SENT', sequence_approved: 1 });
  const r = canSendNow({ ...ARGS(pkg), manual: true, isFollowup: false, step: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.NOT_APPROVED);
});

// ── The audit trail of what actually passed the guard ────────────────────

test('a send event records the fingerprint the guard compared', async () => {
  const { readFileSync } = await import('node:fs');
  const events = readFileSync(new URL('../lib/send-events.mjs', import.meta.url), 'utf8');
  // Written on the insert, from a value the caller passes in.
  assert.match(events, /approval_fingerprint\)/);
  assert.match(events, /approvalFingerprint \|\| null/);

  const runner = readFileSync(new URL('../lib/send-runner.mjs', import.meta.url), 'utf8');
  // Exactly the stored value canSendNow compared — not recomputed after the
  // send, which would record what the package says now rather than what was
  // checked.
  assert.match(runner, /approvalFingerprint: pkg\.approved_fingerprint \|\| null/);
  assert.ok(!runner.includes('approvalFingerprint: approvalFingerprint('), 'never recomputed at write time');
});

test('historical rows stay NULL rather than being invented', async () => {
  const { readFileSync } = await import('node:fs');
  const events = readFileSync(new URL('../lib/send-events.mjs', import.meta.url), 'utf8');
  // Forward-only. There is no backfill, because a value inferred now would
  // claim a check that nobody can show happened.
  assert.ok(!/UPDATE send_events SET approval_fingerprint/i.test(events));
  assert.match(events, /Those rows stay NULL/);
});
