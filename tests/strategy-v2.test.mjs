// Strategy V2, as tests.
//
// Every scenario below is a rule the strategy document asserts. Several of them
// are here because an earlier draft got the state machine wrong in a way that
// would have been invisible until it cost something real: a good prospect
// parked because a daily budget ran out, a verified client rewound to
// pre-qualified because their inbox filled up, an email nobody read sent under
// somebody else's approval.

import test from 'node:test';
import assert from 'node:assert/strict';

import { CTA_CLASS, classifyCta, classifyEmail, closingLine, ctaCheck, promiseFrom } from '../lib/cta.mjs';
import { CONTACT_STATE, contactStateOf, isContactable, isHeld, onBounce, onContactFound, onNoContactFound, needsReapprovalAfterRecovery } from '../lib/contact-state.mjs';
import { VERIFICATION, INELIGIBLE, eligibleForVerification, verificationDecision, waitingForBudget, paidResearchPermitted } from '../lib/verification.mjs';
import { PRIORITY, RATING, TOUCHES, strongGate, bandFor, allowedTouches, maySendStep, priorityFor, dueDateFor } from '../lib/priority.mjs';
import { RUNG, chooseRung, assetAllowed, fulfilmentFor, ASSET_TRIGGER } from '../lib/asset-ladder.mjs';
import { ORIGIN, resolveOrigin, isValidOrigin, legacyOrigin, byBatch, hasRealOrigin } from '../lib/origin.mjs';
import { defer, isDue, shouldResurface, dueToday, rejoinsColdSequence, DEFERRAL_SOURCE } from '../lib/deferral.mjs';
import { validatePackage, acceptPackage, PREPARED_BY } from '../lib/package-accept.mjs';
import { approvalFingerprint, preparedFollowups, stepCoveredByApproval, canSendNow, shadowDecision, BLOCK } from '../lib/send-guard.mjs';
import { SEND_DEFAULTS, sendPolicy, regionScopeFor } from '../lib/send-policy.mjs';
import { SUFFICIENCY } from '../lib/evidence.mjs';
import { coldSequenceExhausted, isDueProspect, HARD_TOUCH_CEILING } from '../lib/due.mjs';
import { DEFAULT_ENGINE_SETTINGS } from '../lib/engine-prompts.mjs';

// ── Fixtures ─────────────────────────────────────────────────────────────

const MICRO = 'Hi Sarah.\n\nI had a look at the Beat the Bloat guide on your homepage.\n\nOne thing I could not tell from the outside is what happens after somebody downloads it. Want me to send you a quick rundown of what I would do for that flow? If that is already handled, ignore me.';
const OPEN = 'Hi Sarah.\n\nI had a look at your homepage and noticed the freebie.\n\nHow are those going for you right now?\n\nThanks,\nAry';

const STRONG_GATE_PASS = {
  fit: true,
  contactReason: true,
  inScope: true,
  sufficiency: SUFFICIENCY.SUFFICIENT,
};

// An approved package now has to carry the fingerprint of what was approved:
// a missing one is a block in its own right, because the old check read
// `if (stored && stored !== current)` and a null skipped it rather than failing.
// These fixtures stamp a matching one so each test still exercises the gate it
// is named for rather than tripping on the new one first.
// Approved, and armed for automatic follow-up. These tests are about what the
// guard does AFTER permission, so an unarmed fixture would block on
// `automation-not-approved` before reaching the rule under test. The gate
// itself is covered in tests/auto-followup-gate.test.mjs.
const approvedPkg = (p) => ({
  ...p,
  approved_fingerprint: approvalFingerprint(p),
  auto_followup_approved: 1,
  auto_followup_max_step: 4,
});

const okPackage = (over = {}) => ({
  id: 1,
  version: 1,
  prospect_id: 7,
  contact_email: 'hello@example.com',
  email_subject: 'The guide on your homepage',
  email_body: MICRO,
  playbook: 'freebie-flow',
  priority_band: PRIORITY.P2,
  allowed_length: 3,
  prepared_by: PREPARED_BY.NATIVE,
  followups: [{ step: 2, subject: 'One more thing', body: MICRO }, { step: 3, subject: 'Last note', body: MICRO }],
  ...over,
});

// The send guard refuses a partial row on purpose, so fixtures carry every
// field it reads. That refusal is itself a regression guard: a missing column
// is not an empty value.
const guardRow = (over = {}) => ({
  id: 1,
  name: 'Test',
  business_name: 'Test Co',
  email: 'hello@example.com',
  stage: 'Engaged',
  replied: 0,
  reply_type: null,
  reply_date: null,
  last_contact_date: null,
  next_action_date: '2026-08-01',
  do_not_contact: 0,
  unsubscribed: 0,
  ...over,
});

const account = {
  email_address: 'hello@bloomwired.io',
  scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
  last_sync_at: null,
  status: 'ok',
};
const freshAccount = (now) => ({ ...account, last_sync_at: new Date(now.getTime() - 60000).toISOString().replace('T', ' ').slice(0, 19) });

// ── 13. CTA is classified semantically, never by punctuation ─────────────

test('a yes/no micro-offer is a MICRO_OFFER even though it is a question', () => {
  assert.equal(classifyCta('Want me to send it?').cls, CTA_CLASS.MICRO_OFFER);
  assert.equal(classifyCta('Want me to send you what I mean?').cls, CTA_CLASS.MICRO_OFFER);
  assert.equal(classifyCta('Shall I put together a quick rundown?').cls, CTA_CLASS.MICRO_OFFER);
  assert.equal(classifyCta('Reply and I will send a short list of the three I found.').cls, CTA_CLASS.MICRO_OFFER);
});

test('an open question is an OPEN_QUESTION', () => {
  assert.equal(classifyCta('What are you doing about this?').cls, CTA_CLASS.OPEN_QUESTION);
  assert.equal(classifyCta('How are those going for you right now?').cls, CTA_CLASS.OPEN_QUESTION);
});

test('an offer wins when both shapes are present, because the yes is what gets answered', () => {
  const r = classifyCta('What is your setup there? Want me to send a rundown either way?');
  assert.equal(r.cls, CTA_CLASS.MICRO_OFFER);
});

test('the closing line skips the sign-off and the name', () => {
  assert.match(closingLine(OPEN), /^How are those going/);
  assert.equal(classifyEmail(OPEN).cls, CTA_CLASS.OPEN_QUESTION);
  assert.equal(classifyEmail(MICRO).cls, CTA_CLASS.MICRO_OFFER);
});

test('a specific offer is flagged specific, a vague one is not', () => {
  assert.equal(classifyCta('Want me to send a rundown of the three I found?').specific, true);
  assert.equal(classifyCta('Want me to take a look?').specific, false);
});

test('the escape hatch is detected, and its absence is a warning not an error', () => {
  const withIt = ctaCheck(MICRO);
  assert.equal(withIt.escapeHatch, true);
  const without = ctaCheck('Hi.\n\nWant me to send a rundown of the three I found?');
  assert.equal(without.escapeHatch, false);
  assert.ok(without.problems.some((p) => /escape hatch/i.test(p)));
});

test('the promise is extracted so fulfilment is a lookup, not a guess', () => {
  const p = promiseFrom('Want me to send you a quick rundown of what I would do for that flow?');
  assert.ok(p && /rundown/i.test(p));
});

// ── 1. No contact: nothing paid, no Claude call, recoverable ─────────────

test('a prospect with no contact is HELD, blocks paid verification, and stays recoverable', () => {
  const p = { id: 1, domain: 'example.com', ...onNoContactFound({ at: '2026-08-09 10:00:00' }) };
  assert.equal(contactStateOf(p), CONTACT_STATE.NONE);
  assert.equal(isHeld(p), true);
  assert.equal(isContactable(p), false);

  const d = verificationDecision(p, { budgetRemaining: 999 });
  // Stabilization corrected this: no address stops the SPEND without becoming
  // a verdict about the prospect. It waits for a contact, it is not parked.
  assert.equal(d.state, VERIFICATION.WAITING_FOR_CONTACT);
  assert.equal(d.mayRun, false);
  assert.equal(d.parks, false);
  assert.equal(d.shouldVerify, false);

  // Recoverable: finding an address is all it takes.
  const found = { ...p, email: 'hi@example.com', ...onContactFound({}) };
  assert.equal(contactStateOf(found), CONTACT_STATE.OK);
  assert.equal(isHeld(found), false);
});

// ── 2. Budget exhausted: waits, is NOT parked ────────────────────────────

test('an exhausted budget makes an eligible prospect WAIT, never PARK', () => {
  const p = { id: 2, email: 'hi@example.com', domain: 'example.com' };
  const d = verificationDecision(p, { budgetRemaining: 0, cost: 20 });

  assert.equal(d.eligible, true, 'still semantically eligible');
  assert.equal(d.state, VERIFICATION.WAITING_FOR_BUDGET);
  assert.equal(d.parks, false, 'budget exhaustion must never park a prospect');
  assert.equal(d.waits, true);
  assert.equal(d.shouldVerify, false);
  assert.notEqual(d.state, VERIFICATION.NOT_ELIGIBLE);
});

test('when budget returns the same prospect verifies', () => {
  const p = { id: 2, email: 'hi@example.com', domain: 'example.com' };
  const d = verificationDecision(p, { budgetRemaining: 100, cost: 20 });
  assert.equal(d.shouldVerify, true);
  assert.equal(d.state, VERIFICATION.ELIGIBLE);
});

test('waiting prospects come back oldest first', () => {
  const rows = [
    { id: 1, verification_state: VERIFICATION.WAITING_FOR_BUDGET, verification_state_at: '2026-08-09 12:00:00' },
    { id: 2, verification_state: VERIFICATION.WAITING_FOR_BUDGET, verification_state_at: '2026-08-08 12:00:00' },
    { id: 3, verification_state: VERIFICATION.NOT_ELIGIBLE, verification_state_at: '2026-08-01 12:00:00' },
  ];
  assert.deepEqual(waitingForBudget(rows).map((r) => r.id), [2, 1]);
});

test('semantic ineligibility DOES park, and is a different answer from waiting', () => {
  const p = { id: 3, email: 'hi@example.com', domain: 'example.com' };
  const d = verificationDecision(p, { prescreenOk: false, budgetRemaining: 999 });
  assert.equal(d.parks, true);
  assert.equal(d.waits, false);
  assert.equal(d.state, VERIFICATION.NOT_ELIGIBLE);
});

test('fresh site intel answers for free, without spending or waiting', () => {
  const now = new Date('2026-08-09T12:00:00Z');
  const p = {
    id: 4,
    email: 'hi@example.com',
    domain: 'example.com',
    site_intel: JSON.stringify({ checkedAt: '2026-08-06T12:00:00Z', source: 'precheck' }),
  };
  const d = verificationDecision(p, { budgetRemaining: 0, now });
  assert.equal(d.state, VERIFICATION.REUSED);
  assert.equal(d.shouldVerify, false);
  assert.equal(d.parks, false);
  assert.equal(d.waits, false);
});

// ── Verification is NEVER gated on Strong ────────────────────────────────

test('verification does not require Strong, which is what breaks the old circular gate', () => {
  // Thin evidence, no Strong anywhere in sight, still eligible to verify.
  const p = { id: 5, email: 'hi@example.com', domain: 'example.com' };
  const e = eligibleForVerification(p, { hasCandidateReason: true });
  assert.equal(e.eligible, true);
  // And Strong on the same prospect fails, because evidence is thin.
  assert.equal(strongGate({ ...STRONG_GATE_PASS, sufficiency: SUFFICIENCY.THIN }).strong, false);
});

// ── 3. Known 💚 candidate: thin evidence, verify, then P1 with 3 ─────────

test('a known green candidate verifies on thin evidence and becomes P1 with four touches', () => {
  const p = { id: 6, email: 'hi@example.com', domain: 'example.com', rating: RATING.GREEN };
  assert.equal(paidResearchPermitted(p), true);
  assert.equal(verificationDecision(p, { budgetRemaining: 100, hasCandidateReason: true }).shouldVerify, true);

  const r = priorityFor(p, STRONG_GATE_PASS);
  assert.equal(r.strong, true);
  assert.equal(r.band, PRIORITY.P1);
  assert.equal(r.bandProvisional, false);
  assert.equal(r.allowedTouches, 4);
});

// ── 4. Unrated candidate: provisional, then P2 with 2 ────────────────────

test('an unrated candidate runs provisional and lands on P2 with three touches', () => {
  const p = { id: 7, email: 'hi@example.com', domain: 'example.com' };
  const r = priorityFor(p, STRONG_GATE_PASS);
  assert.equal(r.band, PRIORITY.P2);
  assert.equal(r.bandProvisional, true, 'the work was done before anybody looked, and that has to be recorded');
  assert.equal(r.allowedTouches, 3);
});

// ── 5. Approval-time 💚 raises the future, not the past ──────────────────

test('a green applied at approval lifts allowed length and does not rewrite spend', () => {
  const before = priorityFor({ id: 8, email: 'a@b.com' }, STRONG_GATE_PASS);
  assert.equal(before.allowedTouches, 3);
  assert.equal(before.bandProvisional, true);

  const after = priorityFor({ id: 8, email: 'a@b.com', rating: RATING.GREEN }, STRONG_GATE_PASS);
  assert.equal(after.band, PRIORITY.P1);
  assert.equal(after.allowedTouches, 4);
  assert.equal(after.bandProvisional, false);

  // The research already bought is not a field this touches. Nothing in the
  // returned patch can undo it, which is the point of the assertion.
  assert.equal(Object.keys(after).includes('credits_spent'), false);
});

// ── 6. Approval-time ✖️ drops to P3 and forbids FUTURE research only ─────

test('a cross applied at approval gives one touch and stops future research', () => {
  const p = { id: 9, email: 'a@b.com', domain: 'b.com', rating: RATING.CROSS };
  const r = priorityFor(p, STRONG_GATE_PASS);
  assert.equal(r.band, PRIORITY.P3);
  assert.equal(r.allowedTouches, 1);
  assert.equal(maySendStep(PRIORITY.P3, 2).ok, false);

  // Future paid verification is refused, and that is not a park either: they
  // still get their one touch.
  assert.equal(paidResearchPermitted(p), false);
  const d = verificationDecision(p, { budgetRemaining: 999 });
  assert.equal(d.state, VERIFICATION.RESEARCH_PROHIBITED);
  assert.equal(d.mayRun, false);
  assert.equal(d.parks, false);
});

// ── 7. Pre-existing ✖️ + thin evidence: free discovery yes, paid no ──────

test('a pre-existing cross gets free discovery but no paid verification, and no send without evidence', () => {
  const p = { id: 10, email: 'a@b.com', domain: 'b.com', rating: RATING.CROSS };

  // Free native discovery is not blocked by the rating: it costs a page fetch
  // that signals needs anyway.
  assert.equal(isContactable(p), true);

  // Paid verification is refused.
  assert.equal(verificationDecision(p, { budgetRemaining: 999 }).mayRun, false);

  // And with evidence still thin, Strong fails, so nothing cold goes out.
  const r = priorityFor(p, { ...STRONG_GATE_PASS, sufficiency: SUFFICIENCY.THIN });
  assert.equal(r.strong, false);
  assert.equal(r.band, null);
  assert.equal(r.allowedTouches, 0);
});

// ── 8. P3 with sufficient existing evidence gets a canonical package ─────

test('a P3 with existing evidence becomes Strong without paid verification and gets a real package', () => {
  const p = { id: 11, email: 'hello@example.com', domain: 'example.com', rating: RATING.CROSS };
  const r = priorityFor(p, STRONG_GATE_PASS);
  assert.equal(r.strong, true);
  assert.equal(r.band, PRIORITY.P3);
  assert.equal(r.allowedTouches, 1);

  // One touch, and it goes through the same door as everything else.
  const res = acceptPackage(
    okPackage({ priority_band: PRIORITY.P3, allowed_length: 1, followups: [] }),
    { prospect: p, strong: true }
  );
  assert.equal(res.accepted, true, res.reason);
  assert.equal(res.package.allowed_length, 1);

  // No follow-up, and no asset.
  assert.equal(maySendStep(PRIORITY.P3, 2).ok, false);
  assert.equal(assetAllowed({ trigger: ASSET_TRIGGER.ACCEPTED_OFFER, offerAccepted: false }).ok, false);
});

test('a P3 package that tries to carry a follow-up is rejected', () => {
  const res = acceptPackage(
    okPackage({ priority_band: PRIORITY.P3, allowed_length: 1 }),
    { prospect: { id: 7, email: 'hello@example.com' }, strong: true }
  );
  assert.equal(res.accepted, false);
  assert.ok(res.errors.some((e) => /allows 1 cold email/.test(e)), res.errors.join(' '));
});

// ── 9 & 10. Reply semantics are canonical, and shared ────────────────────

test('the guard asks the canonical reply rule, so an autoresponder stops nothing', () => {
  const now = new Date('2026-08-12T18:00:00Z');
  const prospect = guardRow({ id: 12 });
  const events = [
    { direction: 'outbound', occurred_at: '2026-08-05 10:00:00', classification: null },
    { direction: 'inbound', occurred_at: '2026-08-05 10:01:00', classification: 'out-of-office' },
  ];
  const pkg = { ...okPackage(), status: 'APPROVED', reviewed_at: '2026-08-12 10:00:00', created_at: '2026-08-11 10:00:00' };
  const r = canSendNow({
    pkg: approvedPkg(pkg), prospect, events, settings: { autoSendApprovedFollowups: true },
    account: freshAccount(now), now, isFollowup: true, schedule: { status: 'OVERDUE', step: 2 }, step: 2,
  });
  assert.equal(r.ok, true, r.reason);
});

test('a human reply stops the sequence immediately', () => {
  const now = new Date('2026-08-12T18:00:00Z');
  const prospect = guardRow({ id: 13 });
  const events = [
    { direction: 'outbound', occurred_at: '2026-08-05 10:00:00', classification: null },
    { direction: 'inbound', occurred_at: '2026-08-05 11:00:00', classification: 'question' },
  ];
  const pkg = { ...okPackage(), status: 'APPROVED', reviewed_at: '2026-08-12 10:00:00', created_at: '2026-08-11 10:00:00' };
  const r = canSendNow({
    pkg: approvedPkg(pkg), prospect, events, settings: { autoSendApprovedFollowups: true },
    account: freshAccount(now), now, isFollowup: true, schedule: { status: 'OVERDUE', step: 2 }, step: 2,
  });
  assert.equal(r.ok, false);
  assert.equal(r.block, 'unanswered-reply');
});

// ── 11. A bounce after Strong does not erase Strong ──────────────────────

test('a bounce invalidates the contact and leaves qualification history intact', () => {
  const p = {
    id: 14,
    email: 'hello@example.com',
    // A prospect that reached VERIFIED necessarily had a site to verify.
    domain: 'example.com',
    rating: RATING.GREEN,
    site_intel: '{"at":"2026-08-01T00:00:00Z"}',
    verification_state: VERIFICATION.VERIFIED,
    priority_band: PRIORITY.P1,
  };
  const patch = onBounce({ at: '2026-08-09 12:00:00' });

  // The patch touches contact fields and nothing else.
  assert.deepEqual(Object.keys(patch).sort(), ['contact_state', 'contact_state_at', 'contact_state_reason']);
  for (const k of ['verification_state', 'priority_band', 'site_intel', 'rating']) {
    assert.equal(k in patch, false, `${k} must survive a bounce`);
  }

  const after = { ...p, ...patch };
  assert.equal(contactStateOf(after), CONTACT_STATE.NEEDS_CONTACT_RECOVERY);
  assert.equal(isContactable(after), false);
  assert.equal(isHeld(after), false, 'a bounce is not the same state as never having found an address');
  // Strong survives.
  assert.equal(after.verification_state, VERIFICATION.VERIFIED);
  assert.equal(after.priority_band, PRIORITY.P1);
  // And nothing paid runs again until a contact is recovered, without any of
  // that being rewritten as a judgement.
  const d = verificationDecision(after, { budgetRemaining: 999 });
  assert.equal(d.state, VERIFICATION.WAITING_FOR_CONTACT);
  assert.equal(d.mayRun, false);
  assert.equal(d.parks, false);
});

test('a recovered address needs re-approval before the old package continues', () => {
  const pkg = { status: 'APPROVED', contact_email: 'old@example.com' };
  const p = { email: 'new@example.com', contact_state: CONTACT_STATE.OK };
  assert.equal(needsReapprovalAfterRecovery(p, pkg), true);
  assert.equal(needsReapprovalAfterRecovery({ ...p, email: 'old@example.com' }, pkg), false);
});

// ── 12. The fingerprint covers follow-up copy ────────────────────────────

test('a follow-up that existed at approval is eligible; one created afterwards is not', () => {
  const pkg = okPackage({ followups: [{ step: 2, subject: 'One more thing', body: MICRO }] });
  assert.equal(stepCoveredByApproval(pkg, 1).ok, true);
  assert.equal(stepCoveredByApproval(pkg, 2).ok, true);
  const three = stepCoveredByApproval(pkg, 3);
  assert.equal(three.ok, false);
  assert.match(three.reason, /nobody has read it/);
});

test('editing a follow-up after approval makes the fingerprint stale', () => {
  const pkg = okPackage();
  const before = approvalFingerprint(pkg);
  const edited = { ...pkg, followups: [{ step: 2, subject: 'One more thing', body: `${MICRO} And another thing.` }] };
  assert.notEqual(approvalFingerprint(edited), before, 'regenerated copy must not pass as approved');
});

test('changing the allowed length or the band also breaks the fingerprint', () => {
  const pkg = okPackage();
  const base = approvalFingerprint(pkg);
  assert.notEqual(approvalFingerprint({ ...pkg, allowed_length: 4 }), base);
  assert.notEqual(approvalFingerprint({ ...pkg, priority_band: PRIORITY.P1 }), base);
});

test('the guard blocks a step whose copy was never approved', () => {
  const now = new Date('2026-08-12T18:00:00Z');
  const prospect = guardRow({ id: 15 });
  const pkg = {
    ...okPackage({ allowed_length: 4, priority_band: PRIORITY.P1 }),
    status: 'APPROVED', reviewed_at: '2026-08-12 10:00:00', created_at: '2026-08-11 10:00:00',
  };
  const r = canSendNow({
    pkg: approvedPkg(pkg), prospect, settings: { autoSendApprovedFollowups: true },
    account: freshAccount(now), now, isFollowup: true, schedule: { status: 'OVERDUE', step: 2 }, step: 4,
  });
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.COPY_NOT_APPROVED);
});

test('the guard blocks a step past the app-owned allowed length', () => {
  const now = new Date('2026-08-12T18:00:00Z');
  const prospect = guardRow({ id: 16 });
  const pkg = {
    ...okPackage({
      allowed_length: 3,
      followups: [
        { step: 2, subject: 'a', body: MICRO },
        { step: 3, subject: 'b', body: MICRO },
        { step: 4, subject: 'c', body: MICRO },
      ],
    }),
    status: 'APPROVED', reviewed_at: '2026-08-12 10:00:00', created_at: '2026-08-11 10:00:00',
  };
  const r = canSendNow({
    pkg: approvedPkg(pkg), prospect, settings: { autoSendApprovedFollowups: true },
    account: freshAccount(now), now, isFollowup: true, schedule: { status: 'OVERDUE', step: 2 }, step: 4,
  });
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.PAST_ALLOWED_LENGTH);
});

test('stale evidence pauses a follow-up rather than repeating a claim about a changed page', () => {
  const now = new Date('2026-08-12T18:00:00Z');
  const prospect = guardRow({ id: 17 });
  const pkg = {
    ...okPackage(),
    status: 'APPROVED', reviewed_at: '2026-08-12 10:00:00',
    created_at: '2026-01-01 10:00:00',
  };
  const r = canSendNow({
    pkg: approvedPkg(pkg), prospect, settings: { autoSendApprovedFollowups: true },
    account: freshAccount(now), now, isFollowup: true, schedule: { status: 'OVERDUE', step: 2 }, step: 2,
  });
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.EVIDENCE_STALE);
});

// ── Stage B ships OFF, and shadow mode sends nothing ─────────────────────

test('both auto-send switches default off', () => {
  assert.equal(SEND_DEFAULTS.autoSendApprovedFirstEmails, false);
  assert.equal(SEND_DEFAULTS.autoSendApprovedFollowups, false);
  const p = sendPolicy({});
  assert.equal(p.autoSendApprovedFirstEmails, false);
  assert.equal(p.autoSendApprovedFollowups, false);
});

test('with the switch off the guard refuses, whatever else is true', () => {
  const now = new Date('2026-08-12T18:00:00Z');
  const prospect = guardRow({ id: 18 });
  const pkg = { ...okPackage(), status: 'APPROVED', reviewed_at: '2026-08-12 10:00:00', created_at: '2026-08-11 10:00:00' };
  const r = canSendNow({ pkg: approvedPkg(pkg), prospect, settings: {}, account: freshAccount(now), now, isFollowup: true, schedule: { status: 'OVERDUE', step: 2 }, step: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.AUTOMATION_OFF);
});

test('shadow mode reports what would happen and never carries permission to send', () => {
  const now = new Date('2026-08-12T18:00:00Z');
  const prospect = guardRow({ id: 19 });
  const pkg = approvedPkg({ ...okPackage(), status: 'APPROVED', reviewed_at: '2026-08-12 10:00:00', created_at: '2026-08-11 10:00:00' });

  const would = shadowDecision({ pkg, prospect, settings: {}, account: freshAccount(now), now, step: 2, schedule: { status: 'OVERDUE', step: 2 } });
  assert.equal(would.decision, 'WOULD_SEND');
  assert.equal(would.send, false, 'a shadow decision must never authorise a send');

  const blocked = shadowDecision({ pkg, prospect, settings: {}, account: freshAccount(now), now, step: 4, schedule: { status: 'OVERDUE', step: 4 } });
  assert.equal(blocked.decision, 'WOULD_BLOCK');
  assert.equal(blocked.block, BLOCK.COPY_NOT_APPROVED);
  assert.equal(blocked.send, false);
});

// ── 14. No sequence step can trigger an asset ────────────────────────────

test('reaching email 3 cannot trigger a video, and no step can trigger a PDF', () => {
  // There is deliberately no step argument to reach for.
  assert.equal(assetAllowed({}).ok, false);
  assert.equal(assetAllowed({ trigger: ASSET_TRIGGER.ACCEPTED_OFFER, offerAccepted: false }).ok, false);
  assert.equal(fulfilmentFor({ id: 1 }, { promise: 'the broken booking flow' }).ok, false);
});

test('an accepted offer is what unlocks an asset, and Ary can always ask', () => {
  assert.equal(assetAllowed({ trigger: ASSET_TRIGGER.ACCEPTED_OFFER, offerAccepted: true }).ok, true);
  assert.equal(assetAllowed({ aryRequested: true }).ok, true);
});

// ── 15. The ladder stops at the smallest useful rung ─────────────────────

test('a simple finding is fulfilled with plain text, not a video', () => {
  const p = { id: 1, offer_accepted_at: '2026-08-09 10:00:00' };
  const r = fulfilmentFor(p, { promise: 'a note on the missing phone number', findings: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.rung, RUNG.PLAIN_TEXT);
});

test('several points become a written rundown', () => {
  const p = { id: 1, offer_accepted_at: '2026-08-09 10:00:00' };
  assert.equal(fulfilmentFor(p, { promise: 'the things I noticed', findings: 4 }).rung, RUNG.RUNDOWN);
});

test('a genuinely visual finding may become a video', () => {
  const p = { id: 1, offer_accepted_at: '2026-08-09 10:00:00' };
  const r = fulfilmentFor(p, { promise: 'the booking flow that dead ends on mobile', findings: 1 });
  assert.equal(r.rung, RUNG.VIDEO);
});

test('something they will forward internally becomes a PDF', () => {
  const p = { id: 1, offer_accepted_at: '2026-08-09 10:00:00' };
  assert.equal(fulfilmentFor(p, { promise: 'a breakdown of the costs for your team' }).rung, RUNG.PDF);
});

test('asking to talk goes straight to a live audit', () => {
  const p = { id: 1, offer_accepted_at: '2026-08-09 10:00:00' };
  assert.equal(fulfilmentFor(p, { promise: 'happy to hop on a call' }).rung, RUNG.LIVE_AUDIT);
});

// ── 16. Skill and native parity ──────────────────────────────────────────

test('the same package is accepted identically whichever mode prepared it', () => {
  const ctx = { prospect: { id: 7, email: 'hello@example.com' }, strong: true };
  const native = acceptPackage(okPackage({ prepared_by: PREPARED_BY.NATIVE }), ctx);
  const skill = acceptPackage(okPackage({ prepared_by: PREPARED_BY.SKILL }), ctx);

  assert.equal(native.accepted, true, native.reason);
  assert.equal(skill.accepted, true, skill.reason);
  assert.equal(native.package.cta_class, skill.package.cta_class);
  assert.equal(native.package.allowed_length, skill.package.allowed_length);
  assert.equal(native.package.followups, skill.package.followups);
  // The only difference is the label that exists to measure them.
  assert.equal(skill.package.prepared_by, PREPARED_BY.SKILL);
});

test('a skill package that breaks a rule is rejected exactly like a native one', () => {
  const ctx = { prospect: { id: 7, email: 'hello@example.com' }, strong: true };
  const bad = { allowed_length: 5, followups: [{ step: 2, subject: 'a', body: MICRO }] };
  const nativeBad = acceptPackage(okPackage({ prepared_by: PREPARED_BY.NATIVE, ...bad }), ctx);
  const skillBad = acceptPackage(okPackage({ prepared_by: PREPARED_BY.SKILL, ...bad }), ctx);
  assert.equal(nativeBad.accepted, false);
  assert.equal(skillBad.accepted, false);
  assert.deepEqual(nativeBad.errors, skillBad.errors, 'no privileged path for either mode');
});

test('no package may bypass Strong, or address somebody else, or invent its own length', () => {
  const prospect = { id: 7, email: 'hello@example.com' };
  assert.equal(acceptPackage(okPackage(), { prospect, strong: false }).accepted, false);
  assert.equal(acceptPackage(okPackage({ contact_email: 'someone@else.com' }), { prospect, strong: true }).accepted, false);

  const wrongLen = validatePackage(okPackage({ allowed_length: 5 }), { prospect, strong: true });
  assert.equal(wrongLen.ok, false);
  assert.ok(wrongLen.errors.some((e) => /P2 allows 3/.test(e)), wrongLen.errors.join(' '));
});

test('an open-question close warns but does not block, because Ary may choose one', () => {
  const r = validatePackage(okPackage({ email_body: OPEN, followups: [] , allowed_length: 3}), {
    prospect: { id: 7, email: 'hello@example.com' }, strong: true,
  });
  assert.equal(r.ok, true);
  assert.equal(r.cta.cls, CTA_CLASS.OPEN_QUESTION);
  assert.ok(r.warnings.some((w) => /open question/i.test(w)));
});

test('follow-ups with gaps are rejected, because step 3 could send while step 2 never existed', () => {
  const r = validatePackage(
    okPackage({ priority_band: PRIORITY.P1, allowed_length: 4, followups: [{ step: 3, subject: 'a', body: MICRO }] }),
    { prospect: { id: 7, email: 'hello@example.com' }, strong: true }
  );
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /no gaps/.test(e)), r.errors.join(' '));
});

// ── 17. Source provenance ────────────────────────────────────────────────

test('new intake must name an origin and may not be given UNKNOWN', () => {
  assert.equal(resolveOrigin({}).ok, false);
  assert.equal(resolveOrigin({ origin_class: ORIGIN.UNKNOWN }).ok, false);
  assert.equal(resolveOrigin({ origin_class: 'INVENTED' }).ok, false);
});

test('an importer that does not know says MANUAL or OTHER out loud', () => {
  const r = resolveOrigin({ origin_class: ORIGIN.OTHER, origin_batch: 'import-2026-08-09' });
  assert.equal(r.ok, true);
  assert.equal(r.origin.origin_class, ORIGIN.OTHER);
  assert.equal(r.origin.origin_batch, 'import-2026-08-09');
  assert.ok(r.origin.origin_at);
});

test('origin is never inferred from evidence or provider', () => {
  // A record whose evidence is a map listing and whose provider is apify still
  // fails without an explicit origin. This is the whole point.
  const r = resolveOrigin({ source_provider: 'apify', source: 'MAP_LISTING' });
  assert.equal(r.ok, false);
  assert.match(r.error, /needs an origin/);
});

test('legacy rows keep UNKNOWN and are not fabricated', () => {
  const l = legacyOrigin();
  assert.equal(l.origin_class, ORIGIN.UNKNOWN);
  assert.equal(l.origin_batch, null);
  assert.equal(hasRealOrigin({ origin_class: ORIGIN.UNKNOWN }), false);
  assert.equal(isValidOrigin(ORIGIN.UNKNOWN), false);
});

test('batches group into cohorts, which is what makes acquisition answerable', () => {
  const rows = [
    { id: 1, origin_class: ORIGIN.MAP_LISTING, origin_batch: 'a' },
    { id: 2, origin_class: ORIGIN.MAP_LISTING, origin_batch: 'a' },
    { id: 3, origin_class: ORIGIN.SOCIAL_POST, origin_batch: 'b' },
  ];
  const g = byBatch(rows);
  assert.equal(g[0].batch, 'a');
  assert.equal(g[0].n, 2);
});

// ── 18. Deferrals ────────────────────────────────────────────────────────

test('a deferral records the date, their words and the promise', () => {
  const d = defer({
    until: '2026-09-15',
    reason: 'Ask me again after our rebrand in September.',
    promise: 'Send the booking rundown once the new site is up.',
    source: DEFERRAL_SOURCE.REPLY,
  });
  assert.equal(d.ok, true);
  assert.equal(d.patch.deferred_until, '2026-09-15');
  // The operational date the outbound guard already reads moves with it, so
  // there is one answer to "is this due", not two.
  assert.equal(d.patch.next_action_date, '2026-09-15');
  assert.match(d.patch.deferral_reason, /rebrand/);
  assert.match(d.patch.deferral_promise, /booking rundown/);
});

test('a deferral without a real date is refused', () => {
  assert.equal(defer({ until: 'soon' }).ok, false);
  assert.equal(defer({}).ok, false);
});

test('a deferral surfaces on its due date and never auto-sends', () => {
  const now = new Date('2026-09-15T12:00:00Z');
  const rows = [
    { id: 1, name: 'Kori Burkholder', stage: 'Engaged', deferred_until: '2026-07-30', deferral_reason: 'Circle back after summer.', deferral_promise: 'Send the two things I noticed.' },
    { id: 2, name: 'Later', stage: 'Engaged', deferred_until: '2026-12-01' },
  ];
  const due = dueToday(rows, { now });
  assert.equal(due.length, 1);
  assert.equal(due[0].name, 'Kori Burkholder');
  assert.equal(due[0].autoSend, false, 'reactivation is the one deliberate exception to Stage B');
  assert.match(due[0].suggested, /two things I noticed/);
});

test('closed and opted-out prospects are not resurfaced', () => {
  const now = new Date('2026-09-15T12:00:00Z');
  assert.equal(shouldResurface({ stage: 'Client', deferred_until: '2026-01-01' }, { now }), false);
  assert.equal(shouldResurface({ stage: 'Rejected', deferred_until: '2026-01-01' }, { now }), false);
  assert.equal(shouldResurface({ stage: 'Engaged', deferred_until: '2026-01-01', unsubscribed: 1 }, { now }), false);
  assert.equal(shouldResurface({ stage: 'Engaged', deferred_until: '2026-01-01' }, { now }), true);
});

test('a woken deferral does not rejoin the cold sequence', () => {
  assert.equal(rejoinsColdSequence(), false);
  assert.equal(isDue({ deferred_until: '2026-01-01' }, { now: new Date('2026-08-09T00:00:00Z') }), true);
});

// ── Sequence policy is the app's, and nothing may exceed it ──────────────

test('the band decides the length, and emails 5+ are never routine', () => {
  assert.equal(TOUCHES[PRIORITY.P1], 4);
  assert.equal(TOUCHES[PRIORITY.P2], 3);
  assert.equal(TOUCHES[PRIORITY.P3], 1);

  assert.equal(maySendStep(PRIORITY.P1, 4).ok, true);
  assert.equal(maySendStep(PRIORITY.P1, 5).ok, false);
  // Available only as a deliberate manual override on a named prospect.
  assert.equal(maySendStep(PRIORITY.P1, 5, { manualOverride: true }).ok, true);
  assert.equal(maySendStep(PRIORITY.P1, 5, { manualOverride: true }).override, true);
});

test('no band means no touches, so nothing pre-Strong can send', () => {
  assert.equal(allowedTouches(null), 0);
  assert.equal(maySendStep(null, 1).ok, false);
});

test('spacing follows the band', () => {
  assert.equal(dueDateFor(PRIORITY.P1, 1, '2026-08-01 09:00:00'), '2026-08-01');
  assert.equal(dueDateFor(PRIORITY.P1, 2, '2026-08-01 09:00:00'), '2026-08-05');
  assert.equal(dueDateFor(PRIORITY.P1, 3, '2026-08-01 09:00:00'), '2026-08-10');
  assert.equal(dueDateFor(PRIORITY.P1, 4, '2026-08-01 09:00:00'), '2026-08-17');
  assert.equal(dueDateFor(PRIORITY.P2, 2, '2026-08-01 09:00:00'), '2026-08-06');
  assert.equal(dueDateFor(PRIORITY.P2, 3, '2026-08-01 09:00:00'), '2026-08-13');
  assert.equal(dueDateFor(PRIORITY.P2, 4, '2026-08-01 09:00:00'), null);
});

// ── Strong is four tests, and FIT is not "can they pay" ──────────────────

test('Strong needs all four tests', () => {
  assert.equal(strongGate(STRONG_GATE_PASS).strong, true);
  for (const k of ['fit', 'contactReason', 'inScope']) {
    assert.equal(strongGate({ ...STRONG_GATE_PASS, [k]: false }).strong, false, `${k} must be required`);
  }
  assert.equal(strongGate({ ...STRONG_GATE_PASS, sufficiency: SUFFICIENCY.THIN }).strong, false);
  assert.equal(strongGate({ ...STRONG_GATE_PASS, sufficiency: SUFFICIENCY.NONE }).strong, false);
  assert.equal(strongGate({ ...STRONG_GATE_PASS, sufficiency: SUFFICIENCY.STRONG }).strong, true);
});

test('ability to pay disqualifies only on an explicit flag, never on a proxy', () => {
  // There is no argument here that takes a price, a postcode or a site score.
  assert.equal(strongGate({ ...STRONG_GATE_PASS, explicitCannotPay: true }).strong, false);
  assert.equal(strongGate(STRONG_GATE_PASS).strong, true);
});

test('a rating never satisfies a Strong test', () => {
  const green = { id: 1, rating: RATING.GREEN };
  const r = priorityFor(green, { ...STRONG_GATE_PASS, contactReason: false });
  assert.equal(r.strong, false, 'a green rating cannot invent a reason to write to somebody');
  assert.equal(r.band, null);
});

// ── Region scope belongs to the app ──────────────────────────────────────

test('region scope is workspace config the app owns, and the skill reads it', () => {
  const p = sendPolicy({});
  assert.ok(Array.isArray(p.regionScopes) && p.regionScopes.length);
  assert.equal(regionScopeFor(p, { country: 'AU' })?.name, 'AU/NZ');
  assert.equal(regionScopeFor(p, { country: 'US' })?.name, 'US/CA');
  assert.equal(regionScopeFor(p, {}), null);

  // A workspace may override it. A skill may not carry its own.
  const custom = sendPolicy({ regionScopes: [{ name: 'PH', countries: ['PH'], startHour: 9, endHour: 18 }] });
  assert.equal(regionScopeFor(custom, { country: 'PH' })?.name, 'PH');
  assert.equal(regionScopeFor(custom, { country: 'US' }), null);
});

test('evidence staleness is configurable policy with a documented default', () => {
  assert.equal(SEND_DEFAULTS.evidenceStaleDays, 90);
  assert.equal(sendPolicy({ evidenceStaleDays: 30 }).evidenceStaleDays, 30);
  assert.equal(sendPolicy({ evidenceStaleDays: 'nonsense' }).evidenceStaleDays, 90);
});

// ── Follow-up parsing ────────────────────────────────────────────────────

test('follow-ups parse from JSON or an array, and step 1 is never a follow-up', () => {
  const list = [{ step: 2, subject: 'a', body: 'b' }, { step: 1, subject: 'x', body: 'y' }];
  assert.equal(preparedFollowups({ followups: list }).length, 1);
  assert.equal(preparedFollowups({ followups: JSON.stringify(list) })[0].step, 2);
  assert.deepEqual(preparedFollowups({ followups: 'not json' }), []);
  assert.deepEqual(preparedFollowups({}), []);
});

// ── Origin defaults are a fact about the code path, never an inference ────

test('the manual creation path may default to MANUAL, and bulk importers may not', () => {
  const manual = resolveOrigin({}, { defaultClass: ORIGIN.MANUAL });
  assert.equal(manual.ok, true, 'a person typing a business into a form is genuinely MANUAL');
  assert.equal(manual.origin.origin_class, ORIGIN.MANUAL);

  // No default offered means the caller has to say. This is what keeps
  // "which import was this" answerable.
  assert.equal(resolveOrigin({}).ok, false);
  // And a default can never launder UNKNOWN into new intake.
  assert.equal(resolveOrigin({}, { defaultClass: ORIGIN.UNKNOWN }).ok, false);
});

// ── No second sequence or send-window policy anywhere ────────────────────

test('a spent band is not surfaced as due, whatever the legacy stage cadence says', () => {
  // The stage strings still run to "Email 5" because renaming them would break
  // every skill and saved view. The policy moved; the labels did not.
  const spent = { stage: 'Email 3', priority_band: PRIORITY.P2, emails_sent: 3, last_contact_date: '2020-01-01' };
  assert.equal(coldSequenceExhausted(spent), true);
  assert.equal(isDueProspect(spent), false);

  const room = { ...spent, emails_sent: 1 };
  assert.equal(coldSequenceExhausted(room), false);
  assert.equal(isDueProspect(room), true);

  // A P1 gets one more than a P2 from exactly the same row.
  assert.equal(coldSequenceExhausted({ ...spent, priority_band: PRIORITY.P1 }), false);
  // And a P3 is done after one.
  assert.equal(coldSequenceExhausted({ ...spent, priority_band: PRIORITY.P3, emails_sent: 1 }), true);
});

test('a row with no band still follows the old cadence below the hard ceiling', () => {
  const legacy = { stage: 'Email 2', emails_sent: 1, last_contact_date: '2020-01-01' };
  assert.equal(coldSequenceExhausted(legacy), false);
  assert.equal(isDueProspect(legacy), true);
});

test('no band is not permission to pass the hard ceiling', () => {
  // This used to return false, and the production backlog is what changed it:
  // 622 prospects had four or more emails sent and not one had a band, so the
  // V2 limit applied to nobody it was written for.
  const over = { stage: 'Email 2', emails_sent: 4, last_contact_date: '2020-01-01' };
  assert.equal(coldSequenceExhausted(over), true);
  assert.equal(isDueProspect(over), false);

  // At the ceiling counts as spent, the same as it does for a banded row.
  assert.equal(coldSequenceExhausted({ ...over, emails_sent: HARD_TOUCH_CEILING }), true);
  assert.equal(coldSequenceExhausted({ ...over, emails_sent: HARD_TOUCH_CEILING - 1 }), false);
});

test('the hard ceiling is derived from the bands, never typed twice', () => {
  assert.equal(HARD_TOUCH_CEILING, Math.max(...Object.values(TOUCHES)));
  // No band may ever allow more than the hard ceiling, or a banded row could
  // outlive an unbanded one.
  for (const band of Object.values(PRIORITY)) {
    assert.ok(allowedTouches(band) <= HARD_TOUCH_CEILING, `${band} must not exceed the hard ceiling`);
  }
});

test('the engine settings template carries the send defaults rather than copying them', () => {
  // A copied literal is a second send policy waiting to drift from the first.
  for (const k of ['dailySendLimit', 'sendWindowStartHour', 'sendWindowEndHour', 'workspaceTimezone', 'evidenceStaleDays']) {
    assert.deepEqual(DEFAULT_ENGINE_SETTINGS[k], SEND_DEFAULTS[k], `${k} must come from send-policy`);
  }
  assert.equal(DEFAULT_ENGINE_SETTINGS.autoSendApprovedFirstEmails, false);
  assert.equal(DEFAULT_ENGINE_SETTINGS.autoSendApprovedFollowups, false);
});
