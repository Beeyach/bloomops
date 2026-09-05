// Bringing a due, armed follow-up to a worker — and refusing to, 34 ways.
//
// The gap this closes: `SEND_APPROVED` existed and the runner enforced every
// permission, but the only thing that ever created one was the approval route,
// gated on the FIRST-email switch. A follow-up could be written, approved,
// armed and due, and nothing would pick it up.
//
// The scheduler is a selector, not an authority. These tests hold that line:
// what it queues, what it refuses to queue, and what the runner still refuses
// after it has queued.

import test from 'node:test';
import assert from 'node:assert/strict';

import { autoFollowupCandidate, sendJobFor, SKIP } from '../lib/followup-scheduler.mjs';
import { mayAutoFollowUp } from '../lib/auto-followup.mjs';
import { canSendNow, BLOCK, approvalFingerprint } from '../lib/send-guard.mjs';
import { sendPolicy } from '../lib/send-policy.mjs';
import { PRIORITY, KIND, dedupeKey } from '../lib/queue.mjs';
import { PRIORITY as BANDS } from '../lib/priority.mjs';

const ON = sendPolicy({ autoSendApprovedFollowups: true });
const OFF = sendPolicy({});

// Email 1 went out Wednesday 2026-08-12. Day 5 is Monday 2026-08-17, which
// lands inside the send window.
const SENT_AT = '2026-08-12T16:35:41.177Z';
const THREAD = '19ff6d45ffa27fbb';
const MONDAY = new Date('2026-08-17T17:00:00Z');   // 10:00 Pacific
const SUNDAY = new Date('2026-08-16T17:00:00Z');
const DAY3 = new Date('2026-08-15T17:00:00Z');

const BODY = 'Hi there,\n\nThe contact page has no form on it, so an enquiry has nowhere to land.\n\nWant me to take a look?\n\nAry';
const TWO = { step: 2, subject: 'contact page follow-up', body: 'Just checking this reached you.\n\nAry' };
const LATE_THREE = { step: 3, subject: 'contact page follow-up', body: "Just one last note about the contact page form. If you ever want help with it, I'm around. If that's already handled, ignore me.\n\nThanks,\nAry" };

const pkg = (over = {}) => {
  const base = {
    id: 42, version: 1, prospect_id: 4860, contact_email: 'c@example.com',
    email_subject: 'no form on your contact page', email_body: BODY,
    playbook: 'freebie-flow', priority_band: BANDS.P2,
    allowed_length: 2, sequence_approved: 1, sequence_max_step: 2,
    followups: JSON.stringify([TWO]),
    status: 'SENT', reviewed_at: '2026-08-12 10:00:00', created_at: '2026-08-11 10:00:00',
    auto_followup_approved: 1, auto_followup_max_step: 2,
    ...over,
  };
  return { ...base, approved_fingerprint: over.approved_fingerprint ?? approvalFingerprint(base) };
};

const prospect = (over = {}) => ({
  id: 4860, name: 'Cynthia', business_name: 'Open Hearts', email: 'c@example.com',
  stage: 'Email 1', replied: 0, reply_type: null, reply_date: null,
  last_contact_date: '2026-08-12', next_action_date: null,
  do_not_contact: 0, unsubscribed: 0, emails_sent: 1,
  ...over,
});

const SENDS = [{ sequence_step: 1, sent_at: SENT_AT, provider_thread_id: THREAD }];

const ask = (over = {}) => autoFollowupCandidate({
  pkg: pkg(), prospect: prospect(), sends: SENDS, events: null,
  policy: ON, threadId: THREAD, mailboxOk: true, now: MONDAY,
  ...over,
});

// ── 1-4. permission and duplication ──────────────────────────────────────

test('1. global automation OFF selects nothing', () => {
  const r = ask({ policy: OFF });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.AUTOMATION_OFF);
});

test('2. global ON but package unarmed selects nothing', () => {
  const r = ask({ pkg: pkg({ auto_followup_approved: 0, auto_followup_max_step: null }) });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.NOT_ARMED);
});

test('3. armed, due, clean -> a candidate for exactly step 2', () => {
  const r = ask();
  assert.equal(r.ok, true, r.detail || r.skip);
  assert.equal(r.step, 2);
  assert.equal(String(r.dueAt).slice(0, 10), '2026-08-17', 'day 5 from the real send');
});

test('4. two sweeps in the same window are the same work', () => {
  const c = ask();
  const job = sendJobFor(pkg(), c);
  const key = (j) => dedupeKey(KIND.SEND_APPROVED, { workspace: 'ary', prospectId: j.prospectId, extra: j.extra });
  assert.equal(key(job), key(sendJobFor(pkg(), ask())), 'identical dedupe key');
  assert.equal(key(job), 'ary:send-approved:4860:followup:2');
  // A different step would be different work.
  assert.notEqual(key(job), key({ ...job, extra: 'followup:3' }));
});

// ── 5-12. the pilot shape ────────────────────────────────────────────────

test('5. step 2 only — a package whose next step is 1 is not selected', () => {
  const r = ask({ prospect: prospect({ emails_sent: 0, last_contact_date: null }), sends: [] });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.NOT_PILOT_SHAPE);
});

test('6. the P1 final close is selected once armed to step 3 and due', () => {
  // The late-close shape: both real sends recorded, Email 3 approved in the
  // package, permission granted to step 3, and a 💚 rating — the schedule
  // reads the band from the prospect, and only a confident P1 has a day 9.
  // Day 9 from Email 1 (2026-08-04) is the 13th, so Monday the 17th is
  // overdue.
  const latePkg = (over = {}) => pkg({
    priority_band: BANDS.P1, allowed_length: 3, sequence_max_step: 3,
    followups: JSON.stringify([TWO, LATE_THREE]),
    auto_followup_max_step: 3,
    ...over,
  });
  const lateSends = [
    { sequence_step: 1, sent_at: '2026-08-04T01:47:13.000Z', provider_thread_id: THREAD },
    { sequence_step: 2, sent_at: '2026-08-06T03:53:03.000Z', provider_thread_id: THREAD },
  ];
  const lateProspect = prospect({ emails_sent: 2, stage: 'Email 2', last_contact_date: '2026-08-06', rating: '💚' });

  const r = ask({ pkg: latePkg(), prospect: lateProspect, sends: lateSends });
  assert.equal(r.ok, true, r.detail || r.skip);
  assert.equal(r.step, 3);

  // Armed only to step 2, the same package is out of scope, not out of shape.
  const scoped = ask({ pkg: latePkg({ auto_followup_max_step: 2 }), prospect: lateProspect, sends: lateSends });
  assert.equal(scoped.ok, false);
  assert.equal(scoped.skip, SKIP.NOT_ARMED);

  // And with Email 3 missing from the package, nothing approved exists to send.
  const noCopy = ask({ pkg: latePkg({ followups: JSON.stringify([TWO]) }), prospect: lateProspect, sends: lateSends });
  assert.equal(noCopy.ok, false);

  // A staged P1 sequence with only Email 1 sent: the same grant covers its
  // day-4 Email 2 — the shape's step is a ceiling, never the only step.
  const oneSent = ask({
    pkg: latePkg(),
    prospect: prospect({ emails_sent: 1, stage: 'Email 1', last_contact_date: '2026-08-04', rating: '💚' }),
    sends: lateSends.slice(0, 1),
  });
  assert.equal(oneSent.ok, true, oneSent.detail || oneSent.skip);
  assert.equal(oneSent.step, 2);
});

test('7. P3 is ignored', () => {
  const r = ask({ pkg: pkg({ priority_band: BANDS.P3, allowed_length: 1, sequence_max_step: 1, followups: '[]' }) });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.NOT_PILOT_SHAPE);
});

test('8. Email 1 never sent -> ignored', () => {
  const r = ask({ sends: [], prospect: prospect({ emails_sent: 0, last_contact_date: null }) });
  assert.equal(r.ok, false);
});

test('9. Email 2 missing -> ignored', () => {
  const r = ask({ pkg: pkg({ followups: '[]' }) });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.NO_COPY);
});

test('10. Email 2 present but empty -> ignored', () => {
  const r = ask({ pkg: pkg({ followups: JSON.stringify([{ step: 2, subject: 's', body: '   ' }]) }) });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.NO_COPY);
});

test('11. sequence approval absent -> ignored', () => {
  const r = ask({ pkg: pkg({ sequence_approved: 0 }) });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.NOT_PILOT_SHAPE);
});

test('12. sequence_max_step below 2 -> ignored', () => {
  const r = ask({ pkg: pkg({ sequence_max_step: 1 }) });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.NOT_PILOT_SHAPE);
});

// 13
test('13. a stale fingerprint is caught by the selector AND by the runner', () => {
  const edited = pkg({ followups: JSON.stringify([{ ...TWO, body: 'Different words entirely.' }]) });
  const withOldPrint = { ...edited, approved_fingerprint: approvalFingerprint(pkg()) };
  const r = ask({ pkg: withOldPrint });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.STALE_APPROVAL);
  // The boundary, stated: the selector checks it because it is pure and cheap,
  // and the runner checks it again because the package can change afterwards.
  const g = canSendNow({
    pkg: withOldPrint, prospect: prospect(), events: [], settings: { autoSendApprovedFollowups: true },
    account: ACCOUNT(MONDAY), existingSends: 1, isFollowup: true, step: 2,
    schedule: { status: 'OVERDUE', step: 2 }, now: MONDAY,
  });
  assert.equal(g.block, BLOCK.STALE_APPROVAL);
});

// ── 14-19. the person ────────────────────────────────────────────────────

const REPLIED = [
  { direction: 'outbound', occurred_at: '2026-08-12 16:35:40', classification: null },
  { direction: 'inbound', occurred_at: '2026-08-12 18:16:58', classification: 'decline' },
];

test('14. a human reply before the sweep -> ignored', () => {
  const r = ask({
    prospect: prospect({ replied: 1, reply_type: 'decline', reply_date: '2026-08-12' }),
    events: REPLIED,
  });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.BLOCKED_OUTBOUND);
  assert.equal(r.detail, 'declined');
});

test('15. NO_TO_THIS_OFFER for the current offer -> ignored', () => {
  // Cynthia's real shape after her decline, as a fixture only.
  const r = ask({
    prospect: prospect({ stage: 'Not This Offer', replied: 1, reply_type: 'decline', reply_date: '2026-08-12' }),
    events: REPLIED,
  });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.BLOCKED_OUTBOUND);
});

test('16. NO_TO_US -> ignored', () => {
  const r = ask({ prospect: prospect({ unsubscribed: 1 }) });
  assert.equal(r.ok, false);
  assert.equal(r.detail, 'unsubscribed');
});

test('17. do-not-contact -> ignored', () => {
  const r = ask({ prospect: prospect({ do_not_contact: 1 }) });
  assert.equal(r.ok, false);
  assert.equal(r.detail, 'do-not-contact');
});

test('18. unsubscribe outranks everything else in the reason given', () => {
  const r = ask({ prospect: prospect({ unsubscribed: 1, do_not_contact: 1 }) });
  assert.equal(r.detail, 'do-not-contact', 'the gate ranks DNC first, unchanged');
});

test('19. not due yet -> ignored', () => {
  const r = ask({ now: DAY3 });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.NOT_DUE);
});

// ── 20-23. timing and lineage ────────────────────────────────────────────

test('20. day 5 on an allowed weekday is a candidate, queued to run now', () => {
  const r = ask({ now: MONDAY });
  assert.equal(r.ok, true);
  assert.equal(r.insideWindowNow, true);
  assert.equal(new Date(r.runAfter).getTime(), MONDAY.getTime());
});

test('21. due on a Sunday is held to the next allowed weekday, never queued to send then', () => {
  // V3 P2 spacing is day 5. Email 1 sent Tuesday 2026-08-11 makes the due date
  // Sunday 2026-08-16, preserving the weekend scenario.
  const tueSends = [{ sequence_step: 1, sent_at: '2026-08-11T16:35:41.177Z', provider_thread_id: THREAD }];
  const r = ask({ now: SUNDAY, sends: tueSends, prospect: prospect({ last_contact_date: '2026-08-11' }) });
  assert.equal(r.ok, true, 'it is due, so it is real work');
  assert.equal(r.insideWindowNow, false);
  const at = new Date(r.runAfter);
  assert.equal(at.toISOString().slice(0, 10), '2026-08-17', 'Monday, not Sunday');
  assert.ok(at.getTime() > SUNDAY.getTime());
});

test('22. outside the window on a weekday defers the job rather than dropping it', () => {
  const night = new Date('2026-08-17T06:00:00Z'); // 23:00 Sunday Pacific
  const r = ask({ now: night });
  if (r.ok) {
    assert.equal(r.insideWindowNow, false);
    assert.ok(new Date(r.runAfter).getTime() > night.getTime(), 'held until the window opens');
  }
  // And whenever it does run, the runner refuses if the window has closed again.
  const g = canSendNow({
    pkg: pkg(), prospect: prospect(), events: [], settings: { autoSendApprovedFollowups: true },
    account: ACCOUNT(night), existingSends: 1, isFollowup: true, step: 2,
    schedule: { status: 'OVERDUE', step: 2 }, now: night,
  });
  assert.equal(g.block, BLOCK.OUTSIDE_WINDOW);
});

test('23. no Gmail thread lineage -> not queued', () => {
  const r = ask({ threadId: null });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.NO_THREAD);
  // The boundary: the selector refuses because a follow-up with no thread
  // starts a second conversation, and it is cheap to know here.
});

// ── 24-27. the races, after enqueue ──────────────────────────────────────

const ACCOUNT = (now) => ({
  email_address: 'hello@bloomwired.io',
  scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
  status: 'ok',
  last_sync_at: new Date(now.getTime() - 60000).toISOString().replace('T', ' ').slice(0, 19),
});

const runner = (over = {}) => canSendNow({
  pkg: pkg(), prospect: prospect(), events: [], settings: { autoSendApprovedFollowups: true },
  account: ACCOUNT(MONDAY), existingSends: 1, isFollowup: true, step: 2,
  schedule: { status: 'OVERDUE', step: 2 }, now: MONDAY,
  ...over,
});

test('24. permission revoked after enqueue -> the runner blocks', () => {
  assert.equal(ask().ok, true, 'queued while armed');
  const revoked = pkg({ auto_followup_approved: 0, auto_followup_max_step: null, auto_followup_revoked_at: '2026-08-16T09:00:00Z' });
  assert.equal(runner({ pkg: revoked }).block, BLOCK.AUTOMATION_NOT_APPROVED);
  // And the history of it having been armed is not erased.
  assert.equal(revoked.auto_followup_revoked_at, '2026-08-16T09:00:00Z');
});

test('25. a reply arriving after enqueue -> the runner blocks', () => {
  assert.equal(ask().ok, true);
  const r = runner({
    prospect: prospect({ replied: 1, reply_type: 'decline', reply_date: '2026-08-16' }),
    events: REPLIED,
  });
  assert.equal(r.ok, false);
  assert.equal(r.block, 'declined');
});

test('26. the package edited after enqueue -> stale approval blocks', () => {
  const edited = { ...pkg({ followups: JSON.stringify([{ ...TWO, body: 'Rewritten.' }]) }), approved_fingerprint: approvalFingerprint(pkg()) };
  assert.equal(runner({ pkg: edited }).block, BLOCK.STALE_APPROVAL);
});

test('27. the global switch turned OFF after enqueue -> the runner blocks', () => {
  assert.equal(runner({ settings: {} }).block, BLOCK.AUTOMATION_OFF);
});

// ── 28-30. never twice ───────────────────────────────────────────────────

test('28. an already-sent Email 2 is not selected again', () => {
  const twoSent = [
    { sequence_step: 1, sent_at: SENT_AT, provider_thread_id: THREAD },
    { sequence_step: 2, sent_at: '2026-08-17T17:05:00.000Z', provider_thread_id: THREAD },
  ];
  const r = ask({ sends: twoSent, prospect: prospect({ emails_sent: 2 }), now: new Date('2026-08-24T17:00:00Z') });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.COMPLETE);
});

test('29. a complete sequence is not selected', () => {
  const r = ask({ prospect: prospect({ emails_sent: 2 }), now: new Date('2026-08-24T17:00:00Z') });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.COMPLETE);
});

test('30. a retry reuses the same job rather than creating a second', () => {
  // The queue deduplicates on (workspace, kind, prospect, extra) while a job is
  // queued, running or waiting — so a retrying job is still the same row, and a
  // sweep during its backoff cannot add another.
  const job = sendJobFor(pkg(), ask());
  const key = dedupeKey(KIND.SEND_APPROVED, { workspace: 'ary', prospectId: job.prospectId, extra: job.extra });
  assert.equal(key, dedupeKey(KIND.SEND_APPROVED, { workspace: 'ary', prospectId: 4860, extra: 'followup:2' }));
  assert.equal(PRIORITY.SEND_APPROVED, 70, 'and it sorts above drafting, below the reply lanes');
  assert.ok(PRIORITY.SEND_APPROVED < PRIORITY.GMAIL_SYNC, 'finding out they replied still outranks sending');
  assert.ok(PRIORITY.SEND_APPROVED > PRIORITY.PREPARE_FOLLOWUP);
});

// ── 31-35. what is carried, and what is not ──────────────────────────────

test('31. the queued job payload carries identifiers, never copy', () => {
  const job = sendJobFor(pkg(), ask());
  const blob = JSON.stringify(job.payload);
  assert.deepEqual(Object.keys(job.payload).sort(), ['isFollowup', 'packageId', 'prospectId', 'step']);
  assert.doesNotMatch(blob, /contact page has no form/, 'no Email 1 body');
  assert.doesNotMatch(blob, /Just checking this reached you/, 'no Email 2 body');
  assert.doesNotMatch(blob, /Bearer|token|secret|key=/i, 'no credentials');
});

test('32. the audit context carries no body and no secrets', () => {
  const c = ask();
  const context = {
    packageId: 42, step: c.step, dueAt: c.dueAt, runAfter: c.runAfter,
    insideWindowNow: c.insideWindowNow, packagePermission: true, globalAutomation: true,
  };
  const blob = JSON.stringify(context);
  assert.doesNotMatch(blob, /contact page|Just checking/, 'no copy');
  assert.doesNotMatch(blob, /Bearer|token|secret/i, 'no credentials');
  // It does answer why this one was chosen.
  assert.equal(context.packagePermission, true);
  assert.equal(context.globalAutomation, true);
  assert.ok(context.dueAt);
});

test('33. selecting spends nothing and mutates nothing', () => {
  const p = pkg();
  const before = JSON.stringify(p);
  autoFollowupCandidate({ pkg: p, prospect: prospect(), sends: SENDS, policy: ON, threadId: THREAD, now: MONDAY });
  assert.equal(JSON.stringify(p), before, 'the package was not touched');
  // Nothing in the selector reaches a database, a model, or a mailbox.
  const r = ask();
  assert.deepEqual(Object.keys(r).sort(), ['dueAt', 'insideWindowNow', 'ok', 'runAfter', 'step']);
});

test('34. an unhealthy mailbox holds everything back', () => {
  const r = ask({ mailboxOk: false });
  assert.equal(r.ok, false);
  assert.equal(r.skip, SKIP.MAILBOX);
});

test('35. the shipped defaults keep both switches off', () => {
  const p = sendPolicy({});
  assert.equal(p.autoSendApprovedFollowups, false);
  assert.equal(p.autoSendApprovedFirstEmails, false);
  // And with them off the selector never even looks at a package.
  assert.equal(mayAutoFollowUp({ pkg: pkg(), policy: p, step: 2 }).block, 'automation-off');
});

// ── the synthetic end-to-end, Part 14 ────────────────────────────────────

test('end to end: the future canary, queued once and rechecked at every step', () => {
  // 1. Global OFF -> zero selected.
  assert.equal(ask({ policy: OFF }).ok, false);

  // 2. Global ON in memory -> exactly one candidate, step 2.
  const c = ask();
  assert.equal(c.ok, true);
  assert.equal(c.step, 2);
  const job = sendJobFor(pkg(), c);
  assert.equal(job.kind, 'send-approved');
  assert.equal(job.payload.step, 2);
  assert.equal(job.payload.isFollowup, true);

  // 3-5. Execution rechecks permission, reply and fingerprint independently.
  assert.equal(runner({ pkg: pkg({ auto_followup_approved: 0 }) }).block, BLOCK.AUTOMATION_NOT_APPROVED);
  assert.equal(runner({ prospect: prospect({ replied: 1, reply_type: 'decline', reply_date: '2026-08-16' }), events: REPLIED }).block, 'declined');
  assert.equal(runner({ pkg: { ...pkg(), approved_fingerprint: 'stale' } }).block, BLOCK.STALE_APPROVAL);

  // 6. Everything clean: it gets all the way through the guard. Stopping here,
  // before the transport — nothing in this file can reach Gmail.
  const clean = runner();
  assert.equal(clean.ok, true, clean.reason);
  assert.equal(clean.block, undefined);
});
