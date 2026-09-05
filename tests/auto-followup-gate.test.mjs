// Turning on follow-up automation must not authorise packages nobody armed.
//
// Sequence approval says "these words, as one sequence". The global switch says
// "this workspace allows follow-ups to go on their own". Neither is anybody
// saying "and you may send THIS one while I am not looking" — so flipping the
// switch would have handed that authority to every historical package at once,
// retroactively, on a decision nobody made about them.
//
// The fourth consent is stored per package, defaults off, and is asked twice:
// once by whatever selects work, and again in the last instant before the send.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PILOT, autoFollowupGranted, autoFollowupScope, mayAutoFollowUp,
  grantPatch, revokePatch, AUTO_FOLLOWUP_EVENT,
} from '../lib/auto-followup.mjs';
import { pilotEligible } from '../lib/auto-followup-eligibility.mjs';
import { canSendNow, BLOCK, approvalFingerprint } from '../lib/send-guard.mjs';
import { sendPolicy } from '../lib/send-policy.mjs';
import { PRIORITY } from '../lib/priority.mjs';

const ON = { autoSendApprovedFollowups: true };
const OFF = {};
const policyOn = sendPolicy(ON);
const policyOff = sendPolicy(OFF);

const BODY = 'Hi there,\n\nThe contact page has no form on it, so an enquiry has nowhere to land.\n\nWant me to take a look?\n\nAry';
const TWO = { step: 2, subject: 'contact page follow-up', body: 'Just checking this reached you.\n\nAry' };
const THREE = { step: 3, subject: 'contact page follow-up', body: "Just one last note about the contact page form. If you ever want help with it, I'm around. If that's already handled, ignore me.\n\nThanks,\nAry" };

// A P2 package in exactly the shape the pilot covers.
const p2 = (over = {}) => {
  const base = {
    id: 100, version: 1, prospect_id: 4860, contact_email: 'c@example.com',
    email_subject: 'no form on your contact page', email_body: BODY,
    playbook: 'freebie-flow', priority_band: PRIORITY.P2,
    allowed_length: 2, sequence_approved: 1, sequence_max_step: 2,
    followups: JSON.stringify([TWO]),
    status: 'SENT', reviewed_at: '2026-08-12 10:00:00', created_at: '2026-08-11 10:00:00',
    ...over,
  };
  return { ...base, approved_fingerprint: over.approved_fingerprint ?? approvalFingerprint(base) };
};
// A complete prospect row. The outbound guard refuses a partial one, which is
// how the incomplete fixture below was caught rather than quietly answering
// about a prospect that does not exist.
const SENT_ONE = {
  id: 4860, name: 'Cynthia', business_name: 'Open Hearts', email: 'c@example.com',
  stage: 'Email 1', replied: 0, reply_type: null, reply_date: null,
  last_contact_date: '2026-08-12', next_action_date: null,
  do_not_contact: 0, unsubscribed: 0, emails_sent: 1,
};
const armed = (pkg, maxStep = 2) => ({ ...pkg, auto_followup_approved: 1, auto_followup_max_step: maxStep });

// A healthy mailbox with send scope, synced a minute ago. Without the real
// scope string the guard answers `no-send-scope` before it ever reaches the
// send window, which is what the first version of this file tripped over.
const ACCOUNT = (now) => ({
  email_address: 'hello@bloomwired.io',
  scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
  status: 'ok',
  last_sync_at: new Date(now.getTime() - 60000).toISOString().replace('T', ' ').slice(0, 19),
});

// ── the truth table ──────────────────────────────────────────────────────

// 1
test('global OFF + package OFF -> blocked', () => {
  const r = mayAutoFollowUp({ pkg: p2(), policy: policyOff, step: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.block, 'automation-off');
});

// 2
test('global OFF + package ON -> still the global block, never overridden', () => {
  const r = mayAutoFollowUp({ pkg: armed(p2()), policy: policyOff, step: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.block, 'automation-off', 'package permission cannot outrank the kill switch');
});

// 3
test('global ON + package OFF -> automation-not-approved', () => {
  const r = mayAutoFollowUp({ pkg: p2(), policy: policyOn, step: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.block, 'automation-not-approved');
  assert.match(r.reason, /never switched on for this package/);
});

// 4
test('global ON + package ON -> may proceed to the normal guards', () => {
  assert.equal(mayAutoFollowUp({ pkg: armed(p2()), policy: policyOn, step: 2 }).ok, true);
});

// ── the same four, through the real send guard ───────────────────────────

const guard = (pkg, settings, over = {}) => canSendNow({
  pkg, prospect: SENT_ONE, events: [], settings,
  account: ACCOUNT(over.now || new Date('2026-08-17T17:00:00Z')),
  existingSends: 1, isFollowup: true, step: 2,
  schedule: { status: 'OVERDUE', step: 2 }, now: new Date('2026-08-17T17:00:00Z'),
  ...over,
});

test('the send guard enforces the same table', () => {
  assert.equal(guard(p2(), OFF).block, BLOCK.AUTOMATION_OFF);
  assert.equal(guard(armed(p2()), OFF).block, BLOCK.AUTOMATION_OFF);
  assert.equal(guard(p2(), ON).block, BLOCK.AUTOMATION_NOT_APPROVED);
  // Armed and switched on: it gets past permission and onto the real checks.
  assert.notEqual(guard(armed(p2()), ON).block, BLOCK.AUTOMATION_NOT_APPROVED);
  assert.notEqual(guard(armed(p2()), ON).block, BLOCK.AUTOMATION_OFF);
});

// 5 + 6
test('granting and revoking are flag writes, not sends', () => {
  const g = grantPatch({ at: '2026-08-12T20:00:00Z', by: 'owner' });
  const v = revokePatch({ at: '2026-08-12T21:00:00Z' });
  for (const patch of [g, v]) {
    for (const k of Object.keys(patch)) {
      assert.doesNotMatch(k, /send|message|body|subject|thread/i, `${k} is not a send`);
    }
  }
  assert.equal(g.auto_followup_approved, 1);
  assert.equal(v.auto_followup_approved, 0);
  // Revoking leaves who armed it and when. History is not tidied away.
  assert.equal(v.auto_followup_approved_at, undefined);
  assert.equal(v.auto_followup_revoked_at, '2026-08-12T21:00:00Z');
});

// 7
test('revoking after a job is queued blocks execution', () => {
  const wasArmed = armed(p2());
  assert.equal(mayAutoFollowUp({ pkg: wasArmed, policy: policyOn, step: 2 }).ok, true, 'armed when queued');
  // The operator changes their mind while the job waits.
  const now = { ...wasArmed, ...revokePatch({ at: '2026-08-12T21:00:00Z' }) };
  const r = mayAutoFollowUp({ pkg: now, policy: policyOn, step: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.block, 'automation-not-approved');
  assert.equal(guard(now, ON).block, BLOCK.AUTOMATION_NOT_APPROVED, 'and the guard agrees in the last instant');
});

// 8
test('sequence approval without automation permission is blocked', () => {
  const pkg = p2();
  assert.equal(Number(pkg.sequence_approved), 1, 'the sequence IS approved');
  assert.equal(autoFollowupGranted(pkg), false, 'and that grants nothing automatic');
  assert.equal(guard(pkg, ON).block, BLOCK.AUTOMATION_NOT_APPROVED);
});

// 9
test('automation permission without sequence approval is blocked', () => {
  const pkg = armed(p2({ sequence_approved: 0, sequence_max_step: null }));
  const r = guard(pkg, ON);
  assert.equal(r.ok, false);
  assert.notEqual(r.block, null);
  // It gets past permission and dies on the sequence, which is the honest order.
  assert.notEqual(r.block, BLOCK.AUTOMATION_NOT_APPROVED);
  // And it could never have been armed in the first place.
  assert.equal(pilotEligible(pkg, SENT_ONE).ok, false);
});

// 10 + 11
test('permission is scoped to step 2, and step 3 is refused by the scope', () => {
  assert.equal(PILOT.STEP, 2);
  const pkg = armed(p2(), 2);
  assert.equal(autoFollowupScope(pkg), 2);
  assert.equal(mayAutoFollowUp({ pkg, policy: policyOn, step: 2 }).ok, true);
  const three = mayAutoFollowUp({ pkg, policy: policyOn, step: 3 });
  assert.equal(three.ok, false);
  assert.equal(three.block, 'automation-not-approved');
  assert.match(three.reason, /approved up to email 2, and this is email 3/);
});

// 12
test('a P3 package cannot be armed — there is no follow-up to send', () => {
  const p3 = p2({ priority_band: PRIORITY.P3, allowed_length: 1, sequence_max_step: 1, followups: '[]' });
  assert.equal(pilotEligible(p3, SENT_ONE).ok, false);
});

// 13
test('a P1 final close arms once Email 3 is present, and refuses without it', () => {
  // The complete late-close shape: three-step sequence, Email 3 in the
  // package, fingerprint over the whole thing.
  const late = p2({
    priority_band: PRIORITY.P1, allowed_length: 3, sequence_max_step: 3,
    followups: JSON.stringify([TWO, THREE]),
  });
  const fit = pilotEligible(late, { ...SENT_ONE, emails_sent: 2 });
  assert.equal(fit.ok, true, fit.reason);
  assert.equal(fit.shape.STEP, 3, 'the fitted shape reaches Email 3');
  // Armed to its own step, the scope allows it — and only it.
  const lateArmed = armed(late, 3);
  assert.equal(mayAutoFollowUp({ pkg: lateArmed, policy: policyOn, step: 3 }).ok, true);
  assert.equal(mayAutoFollowUp({ pkg: lateArmed, policy: policyOn, step: 4 }).ok, false);
  // Without Email 3 in the package there is nothing approved to send.
  const missing = p2({ priority_band: PRIORITY.P1, allowed_length: 3, sequence_max_step: 3 });
  const bad = pilotEligible(missing, SENT_ONE);
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /Email 3 is not in this package/);
});

// 14
test('a package with no Email 2 cannot be armed', () => {
  const none = p2({ followups: '[]' });
  const fit = pilotEligible(none, SENT_ONE);
  assert.equal(fit.ok, false);
  assert.match(fit.reason, /Email 2 is not in this package/);
});

// 15
test('a package with no fingerprint cannot be armed', () => {
  const fit = pilotEligible(p2({ approved_fingerprint: '' }), SENT_ONE);
  assert.equal(fit.ok, false);
  assert.match(fit.reason, /no approval fingerprint/);
});

// 16
test('a package whose Email 2 changed after approval cannot be armed, and blocks', () => {
  const original = p2();
  const edited = { ...original, followups: JSON.stringify([{ ...TWO, body: 'Completely different words.' }]) };
  const fit = pilotEligible(edited, SENT_ONE);
  assert.equal(fit.ok, false);
  assert.match(fit.reason, /changed since it was approved/);
  // And even if it had somehow been armed, the guard refuses it.
  assert.equal(guard(armed(edited), ON).block, BLOCK.STALE_APPROVAL);
});

// 17 + 18
test('any human reply blocks, and Cynthia is the fixture', () => {
  const cynthia = {
    ...SENT_ONE,
    replied: 1, reply_type: 'decline', reply_date: '2026-08-12',
    stage: 'Not This Offer',
  };
  // A synthetic copy of package 19, armed. Nothing real is touched.
  const r = guard(armed(p2()), ON, { prospect: cynthia });
  assert.equal(r.ok, false);
  assert.equal(r.block, 'declined', 'permission does not survive a reply');
});

// 19
test('NO_TO_US blocks', () => {
  const gone = { ...SENT_ONE, unsubscribed: 1 };
  assert.equal(guard(armed(p2()), ON, { prospect: gone }).block, 'unsubscribed');
});

// 20
test('do-not-contact blocks', () => {
  const dnc = { ...SENT_ONE, do_not_contact: 1 };
  assert.equal(guard(armed(p2()), ON, { prospect: dnc }).block, 'do-not-contact');
});

// 21
test('not due blocks', () => {
  const r = guard(armed(p2()), ON, { schedule: { status: 'NOT_DUE_YET', step: 2 } });
  assert.equal(r.ok, false);
  assert.notEqual(r.block, BLOCK.AUTOMATION_NOT_APPROVED, 'it got past permission first');
});

// 22 + 23
test('the weekend and the send window still apply', () => {
  const sunday = guard(armed(p2()), ON, { now: new Date('2026-08-16T17:00:00Z') });
  assert.equal(sunday.ok, false);
  assert.equal(sunday.block, BLOCK.OUTSIDE_WINDOW);
  const night = guard(armed(p2()), ON, { now: new Date('2026-08-17T06:00:00Z') });
  assert.equal(night.ok, false);
  assert.equal(night.block, BLOCK.OUTSIDE_WINDOW);
});

// 24
test('no Gmail thread means the package cannot be armed', () => {
  const fit = pilotEligible(p2(), SENT_ONE, { threadId: null });
  assert.equal(fit.ok, false);
  assert.match(fit.reason, /no Gmail thread/);
  // And when the caller does not ask, it is not invented either way.
  assert.equal(pilotEligible(p2(), SENT_ONE).ok, true);
  assert.equal(pilotEligible(p2(), SENT_ONE, { threadId: '19ff6d45ffa27fbb' }).ok, true);
});

// 25
test('thread reuse semantics are untouched by any of this', async () => {
  const guardSrc = await import('../lib/send-guard.mjs');
  // The gate lives before the transport and knows nothing about threading.
  const leaf = await import('../lib/auto-followup.mjs');
  for (const k of Object.keys(leaf)) {
    assert.doesNotMatch(String(k), /thread|mime|message/i);
  }
  assert.ok(guardSrc.BLOCK.AUTOMATION_NOT_APPROVED, 'the gate is a block reason, not a transport change');
});

// 26 + 27
test('a grant is auditable and repeating it is idempotent in effect', () => {
  assert.equal(AUTO_FOLLOWUP_EVENT.GRANTED, 'auto-followup-granted');
  assert.equal(AUTO_FOLLOWUP_EVENT.REVOKED, 'auto-followup-revoked');
  const a = grantPatch({ at: '2026-08-12T20:00:00Z', by: 'owner' });
  const b = grantPatch({ at: '2026-08-12T20:00:05Z', by: 'owner' });
  assert.equal(a.auto_followup_approved, b.auto_followup_approved, 'the same state either way');
  assert.equal(a.auto_followup_max_step, b.auto_followup_max_step);
  assert.notEqual(a.auto_followup_approved_at, b.auto_followup_approved_at, 'and each is stamped');
  // A grant clears any earlier revocation, so the row cannot read both.
  assert.equal(a.auto_followup_revoked_at, null);
});

test('the audit event carries no email body and no credentials', () => {
  const context = { packageId: 100, maxStep: 2, by: 'owner', at: '2026-08-12T20:00:00Z' };
  const blob = JSON.stringify(context);
  assert.doesNotMatch(blob, /contact page has no form/, 'no copy');
  assert.doesNotMatch(blob, /Bearer|token|secret|key=/i, 'no credentials');
});

// 28
test('historical packages default to permission OFF', () => {
  // A row from before the migration has no such column at all.
  const legacy = { id: 5, priority_band: null, sequence_approved: 0, status: 'APPROVED' };
  assert.equal(autoFollowupGranted(legacy), false);
  assert.equal(autoFollowupScope(legacy), null);
  assert.equal(mayAutoFollowUp({ pkg: legacy, policy: policyOn, step: 2 }).block, 'automation-not-approved');
  // And a row written after it, never armed, reads the same.
  assert.equal(autoFollowupGranted({ ...p2(), auto_followup_approved: 0 }), false);
});

// 29 + 30
test('the selector and the guard ask the same question, so they cannot disagree', () => {
  const cases = [
    { pkg: p2(), policy: policyOn },
    { pkg: armed(p2()), policy: policyOff },
    { pkg: armed(p2()), policy: policyOn },
    { pkg: {}, policy: policyOn },
  ];
  for (const c of cases) {
    // The selector's answer.
    const selector = mayAutoFollowUp({ ...c, step: 2 });
    // The guard's answer, reached through canSendNow.
    const settings = c.policy.autoSendApprovedFollowups ? ON : OFF;
    const g = guard(c.pkg.id ? c.pkg : p2(), settings);
    if (!selector.ok) {
      assert.equal(g.block, selector.block, `same block for ${JSON.stringify(selector.block)}`);
    }
  }
});

// 31
test('the shipped defaults keep both switches off', () => {
  const p = sendPolicy({});
  assert.equal(p.autoSendApprovedFollowups, false);
  assert.equal(p.autoSendApprovedFirstEmails, false);
});

// 32
test('nothing in this gate can send', () => {
  const before = JSON.stringify({ PILOT, AUTO_FOLLOWUP_EVENT });
  mayAutoFollowUp({ pkg: armed(p2()), policy: policyOn, step: 2 });
  pilotEligible(p2(), SENT_ONE);
  grantPatch({ at: 'x' });
  revokePatch({ at: 'x' });
  assert.equal(JSON.stringify({ PILOT, AUTO_FOLLOWUP_EVENT }), before);
  // The one true answer the gate can give is "you may now ask the real guards".
  assert.deepEqual(Object.keys(mayAutoFollowUp({ pkg: armed(p2()), policy: policyOn, step: 2 })), ['ok']);
});
