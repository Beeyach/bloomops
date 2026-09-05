// What a package's status actually means for a sequence.
//
// This exists because of one bug that appeared five times. A package becomes
// SENT when its FIRST email goes out, and five places written at different
// times each read SENT as "finished with". The send guard refused the step, the
// queue query dropped the row, the card sorted it into the problem pile, and
// the route rejected it twice. Together they meant no native follow-up could be
// sent by anyone through any screen — and every test passed, because the canary
// that was supposed to catch it had a synthetic first email and never entered
// the state that breaks.
//
// The fault was not any one of those checks. It was that each of them asked
// "what is the status string?" when the real question was one of these:
//
//   - was this package approved as a sequence?
//   - is this particular step covered by that approval?
//   - is there still an approved step owed?
//   - is the sequence finished?
//
// Those are the questions. Everything below is one of them, named, so the next
// place that needs to ask can ask rather than re-derive. A raw `status ===`
// comparison in a follow-up path is now a code smell with a specific history.
//
// Nothing here decides whether a send may happen. That stays in the send guard,
// which weighs replies, timing, contact state, caps and the mailbox. These are
// about the package alone.

import { STATUS } from './outreach.mjs';

// Deliberately not imported from send-guard: that module imports this one, and
// a cycle between "what does this status mean" and "may this send" is exactly
// the tangle this file exists to undo. Only the step numbers are needed here,
// and only the approved ones count — a package rated down at approval keeps its
// extra emails as drafts, and `approved: false` is how a draft says so.
function approvedFollowupSteps(pkg) {
  let raw = pkg?.followups;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f) => f && f.approved !== false)
    .map((f) => Number(f.step))
    .filter((n) => Number.isFinite(n) && n > 0);
}

// A package that has gone out at least once. SENT is written by the send runner
// the moment the first email is accepted by the provider.
export const hasSentSomething = (pkg) => pkg?.status === STATUS.SENT;

// One approval that authorised a whole sequence rather than a single email.
export const isSequenceApproved = (pkg) => Number(pkg?.sequence_approved) === 1;

// How many cold emails this approval permits, at most. The app owns this; the
// caller does not get to name a number.
export function approvedLength(pkg) {
  const explicit = Number(pkg?.allowed_length ?? pkg?.sequence_max_step);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  // No explicit cap. Defaulting to 1 here would have been stricter than the
  // rule it replaced and would have refused legitimate follow-ups on packages
  // that never set a length, so the honest fallback is what the approval
  // actually contains: its own email plus the follow-ups prepared with it.
  return 1 + approvedFollowupSteps(pkg).length;
}

// The steps whose exact copy was in the package when a person read it. Step 1 is
// the package's own email; the rest are the prepared follow-ups.
export function approvedSteps(pkg) {
  const steps = [1, ...approvedFollowupSteps(pkg)];
  const cap = approvedLength(pkg);
  return [...new Set(steps)].filter((s) => s >= 1 && s <= cap).sort((a, b) => a - b);
}

// Has every step this approval authorised actually gone out?
//
// Counted from real sends rather than from the status, because the status only
// ever says "at least one". A two-step approval with one send is not finished,
// and that difference is the entire bug this module exists for.
export function isSequenceComplete(pkg, { sent = null } = {}) {
  const done = Number(sent ?? pkg?.emails_sent ?? 0) || 0;
  return done >= approvedLength(pkg);
}

// The package is part way through a sequence a person approved: something has
// gone out, and an approved step is still owed.
//
// This is the state that used to be invisible. It is not "approved and waiting"
// and it is not "finished" — it is a conversation in progress.
export function isSequenceInFlight(pkg, { sent = null } = {}) {
  return hasSentSomething(pkg)
    && isSequenceApproved(pkg)
    && !isSequenceComplete(pkg, { sent });
}

// May this package still put a step in front of a person to send?
//
// The queue, the card sorting and the route all need this same answer, and when
// they each computed their own they disagreed.
export function mayOfferSend(pkg, { sent = null } = {}) {
  return pkg?.status === STATUS.APPROVED || isSequenceInFlight(pkg, { sent });
}

// May THIS step continue under THIS approval?
//
// The step must be one the approval covers, and either the package is still
// waiting to send its first email or the sequence is genuinely in flight. A
// first email is never reopened by a sequence being in flight — that direction
// is closed, and the test for it is explicit.
export function mayContinueToStep(pkg, step, { sent = null } = {}) {
  const n = Number(step);
  if (!Number.isFinite(n) || n < 1) return false;
  if (!approvedSteps(pkg).includes(n)) return false;
  if (n === 1) return pkg?.status === STATUS.APPROVED;
  return pkg?.status === STATUS.APPROVED || isSequenceInFlight(pkg, { sent });
}

// The one action a finished-looking package may still take. Approve, edit and
// skip are done with it; only an owed follow-up is outstanding.
export const SEND_ACTION = 'send';
export const mayActOnSent = (pkg, action, { sent = null } = {}) =>
  action === SEND_ACTION && isSequenceInFlight(pkg, { sent });

// May a screen draw a Send button for this package, for this prospect?
//
// mayOfferSend answers about the package alone. This adds the one thing a
// screen must not ignore: a person has replied, so the cold sequence is over
// and offering to continue it is wrong even though the guard would refuse.
//
// The shadow audit found exactly that — a replied prospect whose card would
// still have drawn Send now. The guard being right is not enough when the
// screen disagrees, and one predicate in one place is what stops the two
// drifting apart again.
export function mayOfferSendFor(pkg, prospect, { sent = null } = {}) {
  if (Number(prospect?.replied)) return false;
  if (Number(prospect?.do_not_contact) || Number(prospect?.unsubscribed)) return false;
  return mayOfferSend(pkg, { sent: sent ?? prospect?.emails_sent });
}
