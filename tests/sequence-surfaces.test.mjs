// The threading-canary timing override: what it was, and why it is gone.
//
// It existed for one job — release Email 2 early so real Gmail threading could
// be proved without waiting four days for the P1 gap. It did that job on
// 2026-08-11, and the acceptance is recorded in
// V2-FOLLOWUP-FINAL-HARDENING-PRODUCTION-REPORT.md with the real message and
// thread ids.
//
// It is now removed from the production send path entirely. It was narrow and
// tested — manual only, one exact business name, one exact recipient, step 2
// only, and it could not invent a step or revive a stopped sequence — but a
// timing bypass that no longer has a job does not get to keep living in the
// runtime on the strength of being well behaved.
//
// What remains here is the guard that it stays gone, and the invariants about
// the screen it was built to exercise.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { SPACING, PRIORITY } from '../lib/priority.mjs';
import { nextFollowupSchedule } from '../lib/followup-schedule.mjs';

test('the timing override is gone from the codebase', () => {
  assert.equal(existsSync(new URL('../lib/canary-due.mjs', import.meta.url)), false);
});

test('nothing in the send path can force a schedule due', () => {
  const runner = readFileSync(new URL('../lib/send-runner.mjs', import.meta.url), 'utf8');
  for (const gone of ['applyCanaryDue', 'canary-due', 'effectiveSchedule', 'testOverride']) {
    assert.ok(!runner.includes(gone), `${gone} must not be reachable from a send`);
  }
  // The schedule the guard sees is the one the scheduler produced, unmodified.
  assert.match(runner, /schedule,/);
});

test('the real cadence is what it always was', () => {
  // The override never touched this, and its removal must not either.
  assert.deepEqual(SPACING[PRIORITY.P1], [0, 4, 9, 16]);
  assert.deepEqual(SPACING[PRIORITY.P2], [0, 5, 12]);
  assert.deepEqual(SPACING[PRIORITY.P3], [0]);
});

test('an ordinary prospect schedules exactly as it did before', () => {
  const p = { id: 1, rating: '💚', emails_sent: 1, email: 'a@b.example', replied: 0, stage: 'Email 1' };
  const events = [{ prospect_id: 1, sequence_step: 1, sent_at: '2026-08-06T09:00:00' }];
  const s = nextFollowupSchedule(p, { sendEvents: events, now: new Date('2026-08-11T12:00:00Z') });
  assert.equal(s.dueAt, '2026-08-10');
  assert.equal(s.step, 2);
  assert.equal(s.status, 'OVERDUE');
});

// ── The screen that has the only send button in the app ──────────────────

test('a sequence part way through stays on the approval queue', () => {
  // The package flips to SENT when its FIRST email goes out. The queue listed
  // only READY_FOR_APPROVAL, NEEDS_DECISION and APPROVED, so a sequence-
  // approved package disappeared from the one screen in the app with a send
  // button on it, and the follow-up it had already authorised could not be
  // sent by anybody. The guard fix alone did not help: there was nothing to
  // press.
  const route = readFileSync(new URL('../app/api/outreach/route.js', import.meta.url), 'utf8');
  assert.match(route, /k\.status = 'SENT'/);
  assert.match(route, /k\.sequence_approved = 1/);
  // Bounded, so a finished sequence drops off again rather than sitting there
  // forever with nothing left to send.
  assert.match(route, /COALESCE\(k\.allowed_length, k\.sequence_max_step, 1\)/);
  // The flag is now the offer predicate AND the in-flight check, so a replied
  // prospect never gets a Send button drawn over them.
  assert.match(route, /sequenceInFlight: mayOfferSendFor\(r, r, \{ sent: r\.emails_sent \}\)/);
  assert.match(route, /&& isSequenceInFlight\(r, \{ sent: r\.emails_sent \}\)/);
});

test('the card offers the button for a sequence in flight, and says so honestly', () => {
  const card = readFileSync(new URL('../components/ApprovalQueue.jsx', import.meta.url), 'utf8');
  assert.match(card, /item\.status === 'APPROVED' \|\| item\.sequenceInFlight/);
  // "Nothing has been sent yet" would be false once Email 1 has gone.
  assert.match(card, /The first email has gone\. The next approved one in this sequence has not\./);
});

test('a sequence in flight sits with the cards, not in the problem pile', () => {
  // Making the API return it was not enough. The component splits what it
  // fetched into an actionable pile and a problems pile, and SENT fell into the
  // second one — rendered as a bare name over "Open prospect", with nothing to
  // press. That is exactly what the comment above that split already records
  // happening to APPROVED, one step earlier in the sequence.
  const card = readFileSync(new URL('../components/ApprovalQueue.jsx', import.meta.url), 'utf8');
  assert.match(card, /const isActionable = \(i\) => ACTIONABLE\.has\(i\.status\) \|\| Boolean\(i\.sequenceInFlight\)/);
  assert.match(card, /const ready = visible\.filter\(isActionable\)/);
  assert.match(card, /const needsCall = visible\.filter\(\(i\) => !isActionable\(i\)\)/);
});

// ── Every gate that assumed a package sends exactly once ─────────────────

test('SENT has a name, so comparing against it is not silently undefined', async () => {
  const { STATUS, LIVE } = await import('../lib/outreach.mjs');
  // STATUS.SENT was typed out in two places while the constant did not exist.
  // undefined === 'SENT' is false, so the check would never have fired and the
  // send would have failed again with the same message.
  assert.equal(STATUS.SENT, 'SENT');
  // Still not LIVE: approve, edit and skip stay closed on a sent package.
  assert.equal(LIVE.has(STATUS.SENT), false);
});

test('the route lets a sequence in flight send, and nothing else', () => {
  const route = readFileSync(new URL('../app/api/outreach/route.js', import.meta.url), 'utf8');
  // Both route gates now ask sequence-state rather than comparing statuses.
  assert.match(route, /!LIVE\.has\(pkg\.status\) && !mayActOnSent\(pkg, action, \{ sent: prospectSends \}\)/);
  assert.match(route, /!mayOfferSend\(pkg, \{ sent: prospectSends \}\)/);
  // And the count they judge completeness by comes from real sends.
  assert.match(route, /const prospectSends = Number\(prospect\.emails_sent\) \|\| 0/);
});

test('a sent package still cannot be approved, edited or skipped', () => {
  const route = readFileSync(new URL('../app/api/outreach/route.js', import.meta.url), 'utf8');
  // The exception is scoped to action === 'send'. If that ever loosens to any
  // action, a sent package becomes editable and the approval record stops
  // meaning what it says.
  // mayActOnSent is the only door, and it hard-codes the send action.
  const seq = readFileSync(new URL('../lib/sequence-state.mjs', import.meta.url), 'utf8');
  assert.match(seq, /export const SEND_ACTION = 'send'/);
  assert.match(seq, /action === SEND_ACTION && isSequenceInFlight/);
});

test('a send-only card offers no review or skip', () => {
  // The comment above that block already said there is nothing left to review
  // on a card whose only remaining act is the send, but the condition only
  // covered APPROVED. A sequence in flight is SENT, so Review email and Skip
  // rendered underneath Send now — which is what Ary's screenshot showed.
  const card = readFileSync(new URL('../components/ApprovalQueue.jsx', import.meta.url), 'utf8');
  assert.match(card, /item\.status !== 'APPROVED' && !item\.sequenceInFlight &&/);
});
