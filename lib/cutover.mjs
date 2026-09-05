// What should happen next to somebody the old sequence was halfway through.
//
// V1 ran a five-email template. V2 says three touches for P1, two for P2, one
// for P3, and those ceilings already live in lib/priority.mjs. So most of the
// contacted list is not "mid-sequence" any more — it is finished, and the
// question is which of them are finished, which have one touch left, and which
// were never automation's business in the first place.
//
// One decision per prospect, computed from facts, so the answer is the same
// wherever it is asked. Nothing here writes, sends, enqueues, or spends.
//
// The rule that outranks all the others: a human reply ends cold outreach. That
// is not re-derived here — it is read from the relationship model, which is
// already the authority on it.

import { TOUCHES, effectiveBand, HARD_TOUCH_CEILING } from './priority.mjs';
import { sequenceCeilingFor, packageRecordsCeiling } from './sequence-ceiling.mjs';
import { REL, CLOSED_TO_OUTREACH, WANTS_A_PERSON } from './relationship.mjs';

export const NEXT = {
  // The ceiling is reached. Not a failure: the sequence did its job.
  NO_ACTION_COMPLETE: 'NO_ACTION_COMPLETE',
  // A person replied, or the state says a person should look. Automation is
  // finished with them either way.
  NEEDS_HUMAN: 'NEEDS_HUMAN',
  // Closed for good reasons: they said no to us, they are a client, they asked
  // not to be contacted.
  CLOSED: 'CLOSED',
  HOLD_STALE_EVIDENCE: 'HOLD_STALE_EVIDENCE',
  HOLD_CONTACT_RECOVERY: 'HOLD_CONTACT_RECOVERY',
  // Waiting for a date they gave.
  HOLD_DEFERRED: 'HOLD_DEFERRED',
  ELIGIBLE_EMAIL_1: 'ELIGIBLE_EMAIL_1',
  ELIGIBLE_EMAIL_2: 'ELIGIBLE_EMAIL_2',
  ELIGIBLE_EMAIL_3: 'ELIGIBLE_EMAIL_3',
  ELIGIBLE_EMAIL_4: 'ELIGIBLE_EMAIL_4',
  // Past the ceiling under the old template. Never automated again; a person
  // may still choose to write.
  MANUAL_OVERRIDE_ONLY: 'MANUAL_OVERRIDE_ONLY',
  // The record disagrees with itself. Held rather than guessed.
  UNCLEAR: 'UNCLEAR',
};

// How long a gap makes restarting a cold sequence rude rather than helpful.
//
// Somebody last emailed months ago has forgotten the thread entirely, and a
// "following up" note on a conversation they do not remember reads as a
// stranger being odd. Grounded in the real backlog: the contacted list runs
// from days to many weeks old, so this is a real boundary rather than a
// theoretical one.
export const STALE_CUTOVER_DAYS = 45;

// What actually counts as a cold touch.
//
// Real sends only. Not drafts, not cancelled jobs, not failed attempts, and
// never a legacy step-number field on its own: V1 ended up sending six emails
// from a five-email template precisely because a counter disagreed with what
// had really gone out.
export function coldTouches({ sentCount = 0, sendEvents = null }) {
  if (Array.isArray(sendEvents)) return sendEvents.length;
  const n = Number(sentCount);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// The one decision.
//
// `relationship` is the output of currentState(); it is passed in rather than
// recomputed so there is exactly one place that knows the precedence.
export function nextStepFor({
  prospect = {},
  relationship = null,
  strong = null,
  evidenceFresh = true,
  contactOk = true,
  now = new Date(),
  // The package, when the caller has one. A prepared and approved package is a
  // decision somebody recorded; the prospect-level cap is only a default
  // waiting to be narrowed, and letting it speak over a real approval is what
  // produced "P2 allows 3" about a two-email sequence.
  pkg = null,
} = {}) {
  const state = relationship?.state || null;

  // 1. Boundaries and business facts. Nothing below this matters if they apply.
  if (prospect.do_not_contact || prospect.unsubscribed || (state && CLOSED_TO_OUTREACH.has(state))) {
    return { next: NEXT.CLOSED, why: 'They are closed to outreach.', band: null };
  }

  // 2. A person is owed a reply. This is the rule that must never bend: a
  //    human reply stops the cold sequence, whatever the classifier made of it.
  if (prospect.replied || (state && WANTS_A_PERSON.has(state))) {
    return { next: NEXT.NEEDS_HUMAN, why: 'They replied. This is a conversation now, not a sequence.', band: null };
  }

  // 3. Waiting for a date they actually gave.
  if (state === REL.DEFERRED) {
    const until = relationship?.deferredUntil;
    const due = until ? Date.parse(String(until).replace(' ', 'T')) <= now.getTime() : false;
    return due
      ? { next: NEXT.NEEDS_HUMAN, why: 'The date they asked for has come round.', band: null }
      : { next: NEXT.HOLD_DEFERRED, why: `Waiting until ${String(until || 'a date they did not give').slice(0, 10)}.`, band: null };
  }

  // 4. Can we even reach them?
  if (!contactOk) {
    return { next: NEXT.HOLD_CONTACT_RECOVERY, why: 'No usable address. That is a contact problem, not a no.', band: null };
  }

  const touches = coldTouches({ sentCount: prospect.emails_sent });
  // The same helper the live cadence uses, so the two cannot answer differently
  // about the same person. Everything about which band governs, and what a
  // provisional one means, lives there.
  const { band } = effectiveBand(prospect, { strong });
  const ceiling = sequenceCeilingFor(prospect, pkg, { strong });
  // A package is a decision; a bare prospect is only a plan. Saying "this
  // sequence allows 3" about somebody who has no sequence yet is the same
  // mistake in a different sentence.
  const allows = packageRecordsCeiling(pkg) ? 'This sequence allows' : 'The plan allows up to';

  // 5. Past what V2 would ever send. The old template's fault, not theirs.
  if (touches > HARD_TOUCH_CEILING) {
    return { next: NEXT.MANUAL_OVERRIDE_ONLY, touches, band, why: `${touches} already sent under the old sequence. Never automated again.` };
  }

  if (!touches && !band) {
    return { next: NEXT.UNCLEAR, touches, band: null, why: 'No band and nothing sent, so there is nothing to carry over.' };
  }

  if (touches >= ceiling) {
    return { next: NEXT.NO_ACTION_COMPLETE, touches, band, why: `${allows} ${ceiling}, and ${touches} have gone.` };
  }

  // 7. Too long since the last one to pick the thread back up.
  const days = daysSince(prospect.last_contact_date || prospect.last_contact_at, now);
  if (touches > 0 && days != null && days > STALE_CUTOVER_DAYS) {
    return {
      next: NEXT.HOLD_STALE_EVIDENCE, touches, band,
      why: `Last contacted ${Math.round(days)} days ago. Too long to carry on as though the thread were live.`,
    };
  }

  if (!evidenceFresh) {
    return { next: NEXT.HOLD_STALE_EVIDENCE, touches, band, why: 'What we noticed about their site is too old to repeat.' };
  }

  // 8. One next touch. Never two: a prospect who missed three scheduled emails
  //    gets the next one, not all three at once.
  const step = touches + 1;
  return {
    next: step === 1 ? NEXT.ELIGIBLE_EMAIL_1 : step === 2 ? NEXT.ELIGIBLE_EMAIL_2 : step === 3 ? NEXT.ELIGIBLE_EMAIL_3 : NEXT.ELIGIBLE_EMAIL_4,
    touches, band, step,
    why: `${allows} ${ceiling}; ${touches} sent, so email ${step} is the next and only one.`,
  };
}

// What should happen to old future work attached to this prospect.
//
// Classification only. Nothing here retires anything; the decision and the
// doing are kept apart so the plan can be read before it is run.
export const DISPOSITION = {
  KEEP_AS_HISTORY: 'KEEP_AS_HISTORY',
  RETIRE_OBSOLETE: 'RETIRE_OBSOLETE',
  REPLACE_WITH_V2: 'REPLACE_WITH_V2',
  HOLD: 'HOLD',
  COMPLETE: 'COMPLETE',
};

export function dispositionFor(decision, { hasPendingDraft = false, hasFutureDate = false } = {}) {
  const future = hasPendingDraft || hasFutureDate;
  if (!future) return DISPOSITION.KEEP_AS_HISTORY;

  switch (decision.next) {
    // Future work on somebody who replied is the clearest thing to retire: the
    // sequence should have stopped when they wrote.
    case NEXT.NEEDS_HUMAN:
    case NEXT.CLOSED:
    case NEXT.MANUAL_OVERRIDE_ONLY:
    case NEXT.NO_ACTION_COMPLETE:
      return DISPOSITION.RETIRE_OBSOLETE;
    case NEXT.ELIGIBLE_EMAIL_1:
    case NEXT.ELIGIBLE_EMAIL_2:
    case NEXT.ELIGIBLE_EMAIL_3:
    case NEXT.ELIGIBLE_EMAIL_4:
      return DISPOSITION.REPLACE_WITH_V2;
    default:
      return DISPOSITION.HOLD;
  }
}

function daysSince(ts, now) {
  if (!ts) return null;
  const t = Date.parse(String(ts).replace(' ', 'T'));
  if (!Number.isFinite(t)) return null;
  return (now.getTime() - t) / 86400000;
}
