// Is a package the shape the pilot allows somebody to arm?
//
// Split from lib/auto-followup.mjs because it needs the send guard's own
// helpers, and the guard now asks the leaf whether a package is armed. Keeping
// the answer here leaves that a straight line rather than a cycle:
//
//   auto-followup.mjs  (leaf, asked by the guard)
//   send-guard.mjs     (asks the leaf)
//   this file          (asks both, and only the route asks this)

import { preparedFollowups, approvalFingerprint } from './send-guard.mjs';
import { approvedSequenceCeiling } from './sequence-ceiling.mjs';
import { armShapeFor } from './auto-followup.mjs';

// Is this package a shape somebody may arm?
//
// Checked when permission is granted, not only when it is used, so an operator
// cannot arm something automation was never meant to cover and discover at
// send time that it does nothing. On success the fitted shape rides back, so
// the route records how far the permission reaches without a second opinion.
export function pilotEligible(pkg = {}, prospect = {}, { threadId = undefined } = {}) {
  const no = (reason) => ({ ok: false, reason });

  const shape = armShapeFor(pkg);
  if (!shape) {
    return no(`Automatic sending covers P2 Email 2 and P1 final-close sequences. This package is a ${pkg?.priority_band || 'unbanded'} sequence of ${pkg?.allowed_length ?? '?'} stopping at step ${pkg?.sequence_max_step ?? '?'}, which is neither.`);
  }
  if (Number(pkg.sequence_approved) !== 1) {
    return no('The sequence has not been approved, so there is nothing to automate.');
  }
  if (approvedSequenceCeiling(pkg) !== shape.STEP) {
    return no('The package fields disagree about how long this sequence is.');
  }

  const due = preparedFollowups(pkg).find((f) => f.step === shape.STEP);
  if (!due || !String(due.body || '').trim()) {
    return no(`Email ${shape.STEP} is not in this package, so there is nothing approved to send.`);
  }

  // The words must still be the ones somebody read.
  const stored = String(pkg.approved_fingerprint || '');
  if (!stored) return no('This package has no approval fingerprint, so the copy cannot be pinned.');
  if (stored !== approvalFingerprint(pkg)) {
    return no('The package has changed since it was approved. Re-approve it first.');
  }

  // Email 1 has to have really gone, or there is no conversation to continue
  // and no thread to continue it in.
  if (!(Number(prospect?.emails_sent) >= 1)) {
    return no('The first email has not gone yet.');
  }
  // Only checked when the caller resolved it. Undefined means "not asked".
  if (threadId !== undefined && !threadId) {
    return no('There is no Gmail thread to reply into, so a follow-up would start a second conversation.');
  }

  return { ok: true, shape };
}

