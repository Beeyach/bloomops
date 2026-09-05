// Bringing a due, explicitly armed follow-up to a worker — a P2 Email 2 or a
// P1 final close, the two shapes automation covers.
//
// The missing half. `SEND_APPROVED` existed and the runner enforced every
// permission, but the only thing that ever created one of those jobs was the
// approval route, gated on the FIRST-email switch. So a follow-up could be
// written, approved, armed and due, and nothing would ever pick it up.
//
// This is a selector, not an authority. It answers "is this worth bringing to a
// worker" cheaply, and the worker asks the real question in the last instant.
// The two are deliberately different jobs: minutes or hours pass between them,
// and in that gap somebody can reply, revoke permission, edit the copy or turn
// the whole thing off.
//
// So nothing here is a second opinion. Every condition is delegated to the
// helper that already owns it — the schedule, the outbound gate, the approval
// coverage, the fingerprint, the permission gate. A cheap selector that
// reimplemented any of them would be a second definition of "safe to send",
// and the two would drift.

import { mayAutoFollowUp, armShapeFor } from './auto-followup.mjs';
import { nextFollowupSchedule, DUE } from './followup-schedule.mjs';
import { canProgressOutbound, STOP } from './outbound.mjs';
import { stepCoveredByApproval, approvalFingerprint } from './send-guard.mjs';
import { insideSendWindow, nextWindowOpen } from './send-policy.mjs';
import { approvedSequenceCeiling } from './sequence-ceiling.mjs';

// Why a package was not selected. Operator-readable, and never a send block:
// these are reasons work was not queued, not reasons a message was refused.
export const SKIP = {
  AUTOMATION_OFF: 'automation-off',
  NOT_ARMED: 'automation-not-approved',
  NOT_PILOT_SHAPE: 'not-pilot-shape',
  NO_COPY: 'no-approved-copy',
  STALE_APPROVAL: 'stale-approval',
  BLOCKED_OUTBOUND: 'blocked-outbound',
  NOT_DUE: 'not-due',
  COMPLETE: 'sequence-complete',
  NO_THREAD: 'no-thread',
  MAILBOX: 'mailbox-unhealthy',
};

// Is this package worth queueing right now?
//
// Pure. Everything it needs is passed in, so the same inputs always give the
// same answer and a test can ask it without a database.
export function autoFollowupCandidate({
  pkg = null,
  prospect = null,
  sends = [],
  events = null,
  policy = {},
  threadId = null,
  mailboxOk = true,
  now = new Date(),
} = {}) {
  const no = (skip, detail = null) => ({ ok: false, skip, detail });
  if (!pkg || !prospect) return no(SKIP.NOT_PILOT_SHAPE, 'no package or prospect');

  // 1. The shape, decided before the permissions. Re-derived here rather than
  // trusted from arming time: a package can be armed and then edited. The
  // shape's STEP is the ceiling permission reaches, not the only step it
  // covers — a P1 sequence armed to 3 sends its Email 2 on day 4 and its
  // Email 3 on day 10 through the same grant.
  const shape = armShapeFor(pkg);
  if (!shape) {
    return no(SKIP.NOT_PILOT_SHAPE, `band ${pkg.priority_band}, length ${pkg.allowed_length}, max step ${pkg.sequence_max_step}`);
  }

  // 2. The workspace switch, before any per-step question. The step asked
  // about below comes from the schedule, so the ceiling probe here uses the
  // shape's top step only to distinguish "automation off" from "not armed".
  const armed = mayAutoFollowUp({ pkg, policy, step: shape.STEP });
  if (!armed.ok) {
    return no(armed.block === 'automation-off' ? SKIP.AUTOMATION_OFF : SKIP.NOT_ARMED, armed.reason);
  }

  // 3. The rest of the shape: approved as one sequence, and internally agreed.
  if (Number(pkg.sequence_approved) !== 1) return no(SKIP.NOT_PILOT_SHAPE, 'the sequence is not approved');
  if (approvedSequenceCeiling(pkg) !== shape.STEP) return no(SKIP.NOT_PILOT_SHAPE, 'the package fields disagree');

  // 3. Mailbox. A mailbox that has been broken since Tuesday means the reply
  // state cleared below is Tuesday's, so queueing on it is queueing on a guess.
  if (!mailboxOk) return no(SKIP.MAILBOX);

  // 4. Replies, declines, unsubscribes, do-not-contact, deferrals, terminal
  // stages. The same gate the sweep already applies to everything else.
  //
  // With one stop deliberately not honoured here: `not-due`. That branch of the
  // gate answers from `next_action_date`, the legacy hand-written due date, and
  // due-ness for a cold sequence comes from the real send history below. A
  // prospect with no `next_action_date` set is not "not due" — she is a
  // prospect nobody wrote a date on, and reading that as a stop would mean the
  // scheduler never selected anybody.
  //
  // This is the only stop skipped, and it is a cadence answer rather than a
  // safety one. Every stop that protects a person still applies.
  const gate = canProgressOutbound(prospect, { now, events });
  if (!gate.ok && gate.stop !== STOP.NOT_DUE) return no(SKIP.BLOCKED_OUTBOUND, gate.stop);

  // 5. Due, from the real send history. Never a written date, never the
  // package's creation or approval time.
  const schedule = nextFollowupSchedule(prospect, { sendEvents: sends, pkg, events, now });
  if (schedule.status === DUE.COMPLETE) return no(SKIP.COMPLETE);
  if (Number(schedule.step) < 2 || Number(schedule.step) > shape.STEP) {
    return no(SKIP.NOT_PILOT_SHAPE, `next step is ${schedule.step}`);
  }
  // The step the schedule actually asks for, against the grant's own ceiling,
  // so a max_step narrowed after arming narrows the selection in real time.
  const stepArmed = mayAutoFollowUp({ pkg, policy, step: schedule.step });
  if (!stepArmed.ok) return no(SKIP.NOT_ARMED, stepArmed.reason);
  if (schedule.status !== DUE.DUE_NOW && schedule.status !== DUE.OVERDUE) {
    return no(SKIP.NOT_DUE, schedule.status);
  }

  // 6. The email this shape sends exists and was in the package when somebody
  // read it.
  const covered = stepCoveredByApproval(pkg, schedule.step);
  if (!covered.ok) return no(SKIP.NO_COPY, covered.reason);

  // 7. The words are still the ones that were approved. Cheap, pure, and worth
  // doing here so an edited package is not carried all the way to a worker
  // only to be refused — the runner checks it again regardless.
  const stored = String(pkg.approved_fingerprint || '');
  if (!stored || stored !== approvalFingerprint(pkg)) return no(SKIP.STALE_APPROVAL);

  // 8. A real thread to reply into. Without it a follow-up starts a second
  // conversation in their inbox, which is worse than not sending one.
  if (!threadId) return no(SKIP.NO_THREAD);

  // When may it actually go? Inside the window, now; otherwise the next time
  // the window opens. The queue holds it until then and the runner asks again.
  //
  // The prospect is passed so the window is theirs, not ours. An AU follow-up
  // scheduled against Pacific hours lands at 1am in Sydney.
  const open = insideSendWindow(policy, now, prospect).ok;
  const runAfter = open ? now : nextWindowOpen(policy, now, prospect);
  if (!runAfter) return no(SKIP.NOT_DUE, 'no send window ahead');

  return {
    ok: true,
    step: schedule.step,
    dueAt: schedule.dueAt || null,
    runAfter: new Date(runAfter).toISOString(),
    insideWindowNow: open,
  };
}

// The job one candidate becomes.
//
// Identifiers only. The copy is reloaded from the package at execution, because
// the words in a queue payload are a snapshot of what was approved an hour ago
// and the whole point of the last-instant recheck is that they might not be.
export function sendJobFor(pkg, candidate) {
  return {
    kind: 'send-approved',
    prospectId: pkg.prospect_id,
    // The dedupe key already covers workspace and prospect. This makes it
    // per-step, so Email 2 and a future Email 3 are different work while both
    // are in flight, and two sweeps in the same window are the same work.
    extra: `followup:${candidate.step}`,
    runAfter: candidate.runAfter,
    payload: {
      packageId: pkg.id,
      prospectId: pkg.prospect_id,
      step: candidate.step,
      isFollowup: true,
    },
  };
}
