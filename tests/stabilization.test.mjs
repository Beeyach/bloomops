// V2 stabilization.
//
// Several of these exist because a rule was expressed correctly in one module
// and contradicted at a boundary, which is the failure this codebase keeps
// producing: a state machine that is right on paper and wrong where two of them
// meet.

import test from 'node:test';
import assert from 'node:assert/strict';

import { RECONCILE, reconcileForApproval, approvalPatch, approvalSummary, allFollowups } from '../lib/approval.mjs';
import { PRIORITY, RATING } from '../lib/priority.mjs';
import { VERIFICATION, BLOCKED, INELIGIBLE, verificationDecision, isParked, isRecoverable, waitingForContact } from '../lib/verification.mjs';
import { CONTACT_STATE, onBounce, contactStateOf } from '../lib/contact-state.mjs';
import { ORIGIN, resolveOrigin } from '../lib/origin.mjs';
import { preparedFollowups, approvalFingerprint, stepCoveredByApproval, canSendNow, BLOCK } from '../lib/send-guard.mjs';
import { SEND_DEFAULTS, sendPolicy } from '../lib/send-policy.mjs';
import { postconditions, classify, VERDICT } from '../scripts/ledger-audit.mjs';

const BODY = 'Hi.\n\nI noticed the guide on your homepage. Want me to send a quick rundown of what I would do for that flow? If that is already handled, ignore me.';

const provisionalP2 = (over = {}) => ({
  id: 1, version: 1, prospect_id: 7,
  contact_email: 'hello@example.com',
  email_subject: 'The guide on your homepage',
  email_body: BODY,
  playbook: 'freebie-flow',
  priority_band: PRIORITY.P2,
  band_was_provisional: 1,
  allowed_length: 3,
  followups: [{ step: 2, subject: 'One more thing', body: BODY }],
  ...over,
});

// ── 1. Provisional P2 rated green needs Email 3 BEFORE approval ──────────

test('rating up at approval reports the shortfall rather than blocking', () => {
  // CORRECTED. This used to assert that approval was refused until every email
  // the band allows had been written. That read the band as a quota, and the
  // strategy says the opposite: its priority table reads "up to 3" for P1, and
  // `allowedTouches` is documented as how many emails a prospect MAY EVER
  // receive. Reading it as a requirement blocked every package in production,
  // because none of them carry follow-ups at all.
  //
  // The safeguard lives in the send guard instead, and is asserted below.
  const r = reconcileForApproval(provisionalP2(), { id: 7 }, { rating: RATING.GREEN });
  assert.equal(r.finalBand, PRIORITY.P1);
  assert.equal(r.finalLength, 4);
  assert.equal(r.status, RECONCILE.PARTIAL);
  assert.equal(r.canApprove, true);
  assert.deepEqual(r.missingSteps, [3, 4]);
  assert.match(r.reason, /covers 2 of the 4/);

  const patch = approvalPatch(provisionalP2(), { id: 7 }, { rating: RATING.GREEN });
  assert.equal(patch.ok, true);
});

test('an email nobody wrote still cannot be sent', () => {
  // The safeguard that actually matters, unchanged by the above.
  const approved = provisionalP2();
  assert.equal(stepCoveredByApproval(approved, 2).ok, true);
  assert.equal(stepCoveredByApproval(approved, 3).ok, false);
});

test('once all four emails exist, the same rating approves cleanly', () => {
  const pkg = provisionalP2({
    followups: [
      { step: 2, subject: 'One more thing', body: BODY },
      { step: 3, subject: 'Last one', body: BODY },
      { step: 4, subject: 'Final note', body: BODY },
    ],
  });
  const r = reconcileForApproval(pkg, { id: 7 }, { rating: RATING.GREEN });
  assert.equal(r.status, RECONCILE.READY);
  assert.equal(r.canApprove, true);

  const patch = approvalPatch(pkg, { id: 7 }, { rating: RATING.GREEN, at: '2026-08-12 10:00:00' });
  assert.equal(patch.ok, true);
  assert.equal(patch.patch.allowed_length, 4);
  assert.equal(patch.patch.priority_band, PRIORITY.P1);
  assert.equal(patch.patch.band_was_provisional, 0);
});

// ── 2. Provisional P2 rated cross approves exactly one touch ─────────────

test('rating down at approval leaves one approved email and demotes the rest', () => {
  const r = reconcileForApproval(provisionalP2(), { id: 7 }, { rating: RATING.CROSS });
  assert.equal(r.finalBand, PRIORITY.P3);
  assert.equal(r.finalLength, 1);
  assert.equal(r.status, RECONCILE.TRIMMED);
  assert.equal(r.canApprove, true, 'removing an email needs nobody to judge anything');
  assert.deepEqual(r.demotedSteps, [2]);

  // Email 2 is kept on the record, and is not sendable.
  const kept = r.followups.find((f) => f.step === 2);
  assert.ok(kept, 'the draft is kept rather than destroyed');
  assert.equal(kept.approved, false);

  const patch = approvalPatch(provisionalP2(), { id: 7 }, { rating: RATING.CROSS });
  assert.equal(patch.ok, true);
  assert.equal(patch.patch.allowed_length, 1);
  assert.equal(patch.patch.sequence_max_step, 1);

  // And the send guard cannot see it.
  const approved = { ...provisionalP2(), followups: patch.patch.followups };
  assert.deepEqual(preparedFollowups(approved), []);
  assert.equal(stepCoveredByApproval(approved, 2).ok, false);
});

test('the approval summary says how many emails it authorises, not how many exist', () => {
  const asCross = approvalSummary(provisionalP2(), { id: 7 }, { rating: RATING.CROSS });
  assert.equal(asCross.authorising, 1);
  assert.equal(asCross.steps.length, 2, 'both are shown, only one is authorised');

  const asIs = approvalSummary(provisionalP2(), { id: 7 }, { rating: '' });
  assert.equal(asIs.authorising, 2);
});

// ── 3. The fingerprint covers the final reconciled package ───────────────

test('the fingerprint changes when the final band changes', () => {
  const asP2 = approvalPatch(provisionalP2(), { id: 7 }, { rating: '' });
  const asP3 = approvalPatch(provisionalP2(), { id: 7 }, { rating: RATING.CROSS });
  assert.notEqual(asP2.fingerprint, asP3.fingerprint, 'a different band is a different approval');
});

test('Stage B cannot use copy that entered the package after approval', () => {
  const approved = provisionalP2();
  const fp = approvalFingerprint(approved);
  // Somebody adds Email 3 afterwards.
  const later = {
    ...approved,
    allowed_length: 3,
    followups: [...allFollowups(approved), { step: 3, subject: 'new', body: BODY }],
  };
  assert.notEqual(approvalFingerprint(later), fp);
  assert.equal(stepCoveredByApproval(approved, 3).ok, false);
});

// ── 4. Missing contact is recoverable, never a verdict ───────────────────

test('no contact does not park the prospect', () => {
  const p = { id: 1, domain: 'example.com', contact_state: CONTACT_STATE.NONE };
  const d = verificationDecision(p, { budgetRemaining: 999 });

  assert.equal(d.state, VERIFICATION.WAITING_FOR_CONTACT);
  assert.equal(d.reason, BLOCKED.NO_CONTACT);
  assert.equal(d.mayRun, false, 'still no spend, because there is nobody to follow up with');
  assert.equal(d.parks, false, 'a missing address is a prerequisite, not a judgement');
  assert.equal(d.recoverable, true);
  assert.equal(d.needsContact, true);
  assert.equal(isParked(d.state), false);
  assert.equal(isRecoverable(d.state), true);

  // And it is not reachable through the ineligibility vocabulary at all.
  assert.equal(Object.values(INELIGIBLE).includes('no-contact'), false);
});

test('only a real judgement parks', () => {
  const p = { id: 2, email: 'a@b.com', domain: 'b.com' };
  for (const [opts, reason] of [
    [{ prescreenOk: false }, INELIGIBLE.PRESCREEN_FAILED],
    [{ fitPlausible: false }, INELIGIBLE.NO_FIT],
    [{ hasCandidateReason: false }, INELIGIBLE.NOTHING_TO_VERIFY],
  ]) {
    const d = verificationDecision(p, { ...opts, budgetRemaining: 999 });
    assert.equal(d.parks, true, `${reason} should park`);
    assert.equal(d.state, VERIFICATION.NOT_ELIGIBLE);
  }
});

// ── 5. A broken contact preserves everything already established ─────────

test('contact-broken keeps Strong, Vet and evidence and stays recoverable', () => {
  const before = {
    id: 3, email: 'a@b.com', domain: 'b.com',
    verification_state: VERIFICATION.VERIFIED,
    priority_band: PRIORITY.P1,
    site_intel: '{"checkedAt":"2026-08-01T00:00:00Z"}',
    own_findings: '["a real finding"]',
  };
  const after = { ...before, ...onBounce({ at: '2026-08-12 10:00:00' }) };

  const d = verificationDecision(after, { budgetRemaining: 999 });
  assert.equal(d.state, VERIFICATION.WAITING_FOR_CONTACT);
  assert.equal(d.reason, BLOCKED.CONTACT_BROKEN);
  assert.equal(d.parks, false);
  assert.equal(d.recoverable, true);

  // Nothing about the qualification moved.
  assert.equal(after.verification_state, VERIFICATION.VERIFIED);
  assert.equal(after.priority_band, PRIORITY.P1);
  assert.equal(after.own_findings, before.own_findings);
  assert.equal(after.site_intel, before.site_intel);
  assert.equal(contactStateOf(after), CONTACT_STATE.NEEDS_CONTACT_RECOVERY);
});

test('a cross blocks paid research without parking or judging', () => {
  const d = verificationDecision({ id: 4, email: 'a@b.com', domain: 'b.com', rating: RATING.CROSS }, { budgetRemaining: 999 });
  assert.equal(d.state, VERIFICATION.RESEARCH_PROHIBITED);
  assert.equal(d.mayRun, false);
  assert.equal(d.parks, false, 'they still get their one touch');
});

test('the held bucket is exactly the prospects waiting on an address', () => {
  const rows = [
    { id: 1, contact_state: CONTACT_STATE.NONE },
    { id: 2, contact_state: CONTACT_STATE.NEEDS_CONTACT_RECOVERY },
    { id: 3, email: 'a@b.com' },
  ];
  assert.deepEqual(waitingForContact(rows).map((r) => r.id), [1, 2]);
});

// ── 6, 7, 8. Origin is where they were found, not how the row got in ─────

test('an explicit social origin survives a manual insertion', () => {
  const r = resolveOrigin({ origin_class: ORIGIN.SOCIAL_POST, origin_subtype: 'Facebook' });
  assert.equal(r.ok, true);
  assert.equal(r.origin.origin_class, ORIGIN.SOCIAL_POST);
  assert.equal(r.origin.origin_subtype, 'Facebook');
});

test('an explicit map origin survives a manual insertion', () => {
  const r = resolveOrigin({ origin_class: ORIGIN.MAP_LISTING, origin_query: 'pilates studio austin' });
  assert.equal(r.ok, true);
  assert.equal(r.origin.origin_class, ORIGIN.MAP_LISTING);
  assert.equal(r.origin.origin_query, 'pilates studio austin');
});

test('nothing is inferred from the insertion path', () => {
  // No default is offered, so the form has to ask. Typing a business in does
  // not make its origin MANUAL, and this is the assertion that stops that
  // shortcut coming back.
  assert.equal(resolveOrigin({}).ok, false);
  assert.equal(resolveOrigin({ source_provider: 'apify', source: 'Google Maps' }).ok, false);
  assert.equal(resolveOrigin({ origin_class: ORIGIN.UNKNOWN }).ok, false);
});

// ── 9. The ledger tool refuses to record what it cannot prove ────────────

test('the ledger audit only calls a migration applied when every postcondition is present', () => {
  const post = postconditions(`
    CREATE TABLE IF NOT EXISTS widgets (id INTEGER);
    ALTER TABLE prospects ADD COLUMN widget_id TEXT;
    CREATE INDEX IF NOT EXISTS idx_widget ON widgets(id);
  `);
  assert.deepEqual(post.tables, ['widgets']);
  assert.deepEqual(post.columns, [{ table: 'prospects', column: 'widget_id' }]);
  assert.deepEqual(post.indexes, ['idx_widget']);

  const all = { tables: new Set(['widgets']), indexes: new Set(['idx_widget']), columns: { prospects: new Set(['widget_id']) } };
  assert.equal(classify(post, all).verdict, VERDICT.PROVEN);

  // One missing index is enough to refuse. Half a migration is the dangerous
  // case, and calling it applied is how a gap becomes a mystery later.
  const partial = { tables: new Set(['widgets']), indexes: new Set(), columns: { prospects: new Set(['widget_id']) } };
  assert.equal(classify(post, partial).verdict, VERDICT.PARTIAL);

  const none = { tables: new Set(), indexes: new Set(), columns: {} };
  assert.equal(classify(post, none).verdict, VERDICT.NOT_APPLIED);

  // Nothing inspectable means nothing proven, rather than a free pass.
  assert.equal(classify(postconditions('UPDATE prospects SET x = 1;'), all).verdict, VERDICT.CANNOT_PROVE);
});

test('scaffolding tables in a rebuild are not treated as missing', () => {
  // sqlite has no ALTER COLUMN, so changing one means build-copy-rename-drop.
  // Migration 004 does exactly this and briefly looked like drift because of it.
  const post = postconditions(`
    CREATE TABLE settings_new (workspace TEXT);
    INSERT INTO settings_new SELECT * FROM settings;
    DROP TABLE settings;
    ALTER TABLE settings_new RENAME TO settings;
  `);
  assert.equal(post.tables.includes('settings_new'), false);
  assert.equal(post.tables.includes('settings'), true);
});

// ── 10, 12. Nothing is sent while the switches are off ───────────────────

test('both send switches are off by default and stay off', () => {
  assert.equal(SEND_DEFAULTS.autoSendApprovedFirstEmails, false);
  assert.equal(SEND_DEFAULTS.autoSendApprovedFollowups, false);
  const p = sendPolicy({});
  assert.equal(p.autoSendApprovedFirstEmails, false);
  assert.equal(p.autoSendApprovedFollowups, false);
});

test('with the follow-up switch off the guard refuses every follow-up', () => {
  const now = new Date('2026-08-12T18:00:00Z');
  const prospect = {
    id: 9, name: 'T', business_name: 'T', email: 'hello@example.com', stage: 'Engaged',
    replied: 0, reply_type: null, reply_date: null,
    last_contact_date: null, next_action_date: '2026-08-01', do_not_contact: 0, unsubscribed: 0,
  };
  const pkg = { ...provisionalP2(), status: 'APPROVED', reviewed_at: '2026-08-12 10:00:00', created_at: '2026-08-11 10:00:00' };
  const r = canSendNow({ pkg, prospect, settings: {}, account: null, now, isFollowup: true, step: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.AUTOMATION_OFF);
});
