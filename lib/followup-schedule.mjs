// When the next cold email is due, and whether it is due yet.
//
// One question, answered in one place, so Today cannot form its own opinion.
// The eligibility half is not re-derived here at all: it comes from
// `nextStepFor`, which already owns closed, replied, deferred, contactable,
// the ceiling and the stale rule. This file adds only the clock.
//
// The clock turned out to be the hard part, and not for the reason expected.
// The V2 schedule is Day 0, 4 and 10 measured from the FIRST email. Production
// has five send events in total, so for almost everybody that first timestamp
// was never recorded. Where it cannot be known, this says so rather than
// picking a plausible date, because a date invented here becomes an email
// somebody actually receives.

import { SPACING, dueDateFor, effectiveBand } from './priority.mjs';
import { sequenceCeilingFor } from './sequence-ceiling.mjs';
import { nextStepFor, NEXT, STALE_CUTOVER_DAYS } from './cutover.mjs';
import { tzToday, tzDaysBetween } from './tz.mjs';

export const DUE = {
  NOT_DUE_YET: 'NOT_DUE_YET',
  DUE_NOW: 'DUE_NOW',
  OVERDUE: 'OVERDUE',
  COMPLETE: 'COMPLETE',
  MANUAL_ONLY: 'MANUAL_ONLY',
  NEEDS_HUMAN: 'NEEDS_HUMAN',
  HOLD_EVIDENCE: 'HOLD_EVIDENCE',
  HOLD_CONTACT: 'HOLD_CONTACT',
  HOLD_DEFERRED: 'HOLD_DEFERRED',
  CLOSED: 'CLOSED',
  UNCLEAR: 'UNCLEAR',
};

// What a person should read. The enum never reaches the screen.
export const DUE_LABEL = {
  [DUE.NOT_DUE_YET]: 'Coming up',
  [DUE.DUE_NOW]: 'Due today',
  [DUE.OVERDUE]: 'Overdue',
  [DUE.COMPLETE]: 'Finished',
  [DUE.MANUAL_ONLY]: 'Manual only',
  [DUE.NEEDS_HUMAN]: 'Needs you',
  [DUE.HOLD_EVIDENCE]: 'On hold',
  [DUE.HOLD_CONTACT]: 'No address',
  [DUE.HOLD_DEFERRED]: 'Waiting',
  [DUE.CLOSED]: 'Closed',
  [DUE.UNCLEAR]: 'Cannot tell',
};

// How far ahead Today looks. Bounded so the page stays a day's work rather
// than a database dump.
export const UPCOMING_DAYS = 7;

const SHADOW = new Set([DUE.DUE_NOW, DUE.OVERDUE, DUE.NOT_DUE_YET]);
export const isShadowRow = (status) => SHADOW.has(status);

// When Email 1 actually went out.
//
// A recorded send event is the only authority. Failing that, a prospect with
// exactly one send has a last-contact date that IS that send, which is a fact
// rather than an inference. With two or more sends, last contact is the LATEST
// email, so Email 1's date is genuinely unknown and no arithmetic recovers it.
export function firstSendAnchor(prospect = {}, { sendEvents = null } = {}) {
  if (Array.isArray(sendEvents) && sendEvents.length) {
    const first = sendEvents
      .filter((e) => e?.sent_at && (Number(e.sequence_step) === 1 || sendEvents.length === 1))
      .sort((a, b) => String(a.sent_at).localeCompare(String(b.sent_at)))[0];
    if (first?.sent_at) return { at: String(first.sent_at).slice(0, 10), source: 'send event', exact: true };
  }

  const sent = Math.max(0, Number(prospect.emails_sent) || 0);
  const last = prospect.last_contact_date || prospect.last_contact_at || null;
  if (!last) return { at: null, source: null, exact: false };

  if (sent === 1) {
    return { at: String(last).slice(0, 10), source: 'the only email sent', exact: true };
  }
  return { at: null, source: null, exact: false, why: `${sent} emails were sent and only the last one has a date, so nobody knows when the first went.` };
}

const FROM_STEP = {
  [NEXT.ELIGIBLE_EMAIL_1]: 1,
  [NEXT.ELIGIBLE_EMAIL_2]: 2,
  [NEXT.ELIGIBLE_EMAIL_3]: 3,
  [NEXT.ELIGIBLE_EMAIL_4]: 4,
};

const NOT_TIMING = {
  [NEXT.CLOSED]: DUE.CLOSED,
  [NEXT.NEEDS_HUMAN]: DUE.NEEDS_HUMAN,
  [NEXT.HOLD_CONTACT_RECOVERY]: DUE.HOLD_CONTACT,
  [NEXT.HOLD_STALE_EVIDENCE]: DUE.HOLD_EVIDENCE,
  [NEXT.HOLD_DEFERRED]: DUE.HOLD_DEFERRED,
  [NEXT.NO_ACTION_COMPLETE]: DUE.COMPLETE,
  [NEXT.MANUAL_OVERRIDE_ONLY]: DUE.MANUAL_ONLY,
  [NEXT.UNCLEAR]: DUE.UNCLEAR,
};

// The whole answer for one prospect.
export function nextFollowupSchedule(prospect = {}, {
  relationship = null, sendEvents = null, strong = null,
  evidenceFresh = true, contactOk = undefined, now = new Date(),
  // Passed on so the ceiling comes from the approved package rather than the
  // prospect's provisional cap.
  pkg = null,
} = {}) {
  const decision = nextStepFor({
    prospect, relationship, strong, evidenceFresh, now, pkg,
    contactOk: contactOk === undefined ? Boolean(prospect.email) : contactOk,
  });

  const { band, provisional } = effectiveBand(prospect, { strong });
  const ceiling = sequenceCeilingFor(prospect, pkg, { strong });
  const sent = Math.max(0, Number(prospect.emails_sent) || 0);
  const common = {
    // Provisional travels with the band because the label alone misleads: an
    // unrated prospect reads as P2 and P2 means two emails, while their real
    // ceiling is three. The screen must be able to say "not rated yet".
    band, bandProvisional: Boolean(provisional), ceiling, sent, step: null, dueAt: null, anchor: null,
    lastContact: prospect.last_contact_date || null,
    reason: decision.why, decision: decision.next,
  };

  const step = FROM_STEP[decision.next] || null;
  if (!step) return { ...common, status: NOT_TIMING[decision.next] || DUE.UNCLEAR };

  // Email 3 may not be scheduled off an assumption that Email 2 happened. The
  // step comes from the count of real sends, so this is belt and braces, but
  // the failure it guards against is silently skipping a touch.
  if (step > sent + 1) {
    return { ...common, step, status: DUE.UNCLEAR, reason: `Email ${step} cannot be next when ${sent} have been sent.` };
  }

  const anchor = firstSendAnchor(prospect, { sendEvents });
  if (!anchor.at) {
    return {
      ...common, step, status: DUE.UNCLEAR, anchor: null,
      reason: anchor.why || 'There is no record of when the first email went out.',
    };
  }

  const dueAt = dueDateFor(band, step, anchor.at);
  if (!dueAt) {
    return { ...common, step, status: DUE.UNCLEAR, anchor: anchor.at, reason: `${band} has no day ${step} in its schedule.` };
  }

  // Whole days, in the workspace's own timezone, so "today" means the same
  // thing to the page and to the person reading it.
  //
  // tzDaysBetween counts days SINCE the date, so a due date still in the future
  // comes back negative. Naming it for what it returns rather than what was
  // wanted: the first version of this called it daysAway and reported every
  // overdue prospect as upcoming and every upcoming one as overdue.
  const daysSinceDue = tzDaysBetween(dueAt, now);
  const status = daysSinceDue < 0 ? DUE.NOT_DUE_YET : daysSinceDue === 0 ? DUE.DUE_NOW : DUE.OVERDUE;

  return {
    ...common,
    step, status, dueAt,
    daysSinceDue,
    daysUntilDue: -daysSinceDue,
    anchor: anchor.at,
    anchorSource: anchor.source,
    overdueDays: daysSinceDue > 0 ? daysSinceDue : 0,
    isFinalStep: step >= ceiling,
    reason: decision.why,
  };
}

// One line a person can read, built from facts rather than written by a model.
export function explainSchedule(s = {}) {
  if (!s.band) return s.reason || '';
  const bits = [
    s.bandProvisional ? 'Not rated yet' : `${s.band}`,
    `${s.sent} of ${s.ceiling} cold emails sent`,
  ];
  if (s.dueAt) {
    bits.push(s.status === DUE.NOT_DUE_YET
      ? `email ${s.step} due ${s.dueAt}`
      : s.status === DUE.DUE_NOW
        ? `email ${s.step} due today`
        : `email ${s.step} became due ${s.dueAt}`);
  }
  if (s.anchorSource) bits.push(`counted from ${s.anchorSource}`);
  return bits.join(' · ');
}

// The shadow queue, derived rather than stored. A second table of would-send
// rows is a second thing to keep true.
export function shadowQueue(rows = [], { now = new Date(), upcomingDays = UPCOMING_DAYS } = {}) {
  const due = [];
  const upcoming = [];
  const held = [];
  const counts = {};

  for (const { prospect, relationship = null, sendEvents = null } of rows) {
    const s = nextFollowupSchedule(prospect, { relationship, sendEvents, now });
    counts[s.status] = (counts[s.status] || 0) + 1;
    const row = { prospect, schedule: s };

    if (s.status === DUE.DUE_NOW || s.status === DUE.OVERDUE) due.push(row);
    else if (s.status === DUE.NOT_DUE_YET && s.daysUntilDue <= upcomingDays) upcoming.push(row);
    else if (s.status !== DUE.COMPLETE && s.status !== DUE.MANUAL_ONLY && s.status !== DUE.CLOSED) held.push(row);
  }

  // Longest overdue first: if only some get attention, it should be the ones
  // that have waited most.
  due.sort((a, b) => (b.schedule.overdueDays || 0) - (a.schedule.overdueDays || 0));
  upcoming.sort((a, b) => (a.schedule.daysUntilDue || 0) - (b.schedule.daysUntilDue || 0));

  return { due, upcoming, held, counts, today: tzToday(now), staleDays: STALE_CUTOVER_DAYS, spacing: SPACING };
}
