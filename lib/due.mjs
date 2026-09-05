// The cadence engine: when each prospect is due for its next touch, and
// what date a stage transition leaves behind. Extracted verbatim from
// ProspectsApp.jsx (Aug 2026 split) so the app's most consequential logic
// is importable, unit-testable, and not welded to a 6,800-line component.
// Every date reads Pacific via lib/tz.mjs — see that file for why.

import { tzToday, tzShift, tzDaysBetween } from './tz.mjs';
// Sequence length is the app's, and it lives in one place.
import { HARD_TOUCH_CEILING } from './priority.mjs';
import { coldSequenceExhausted } from './sequence-ceiling.mjs';
// The stages the relationship is closed to. today.mjs owns the list and
// imports nothing from here, so there is no cycle.
import { CLOSED_STAGES } from './today.mjs';

export { HARD_TOUCH_CEILING };

// "Today" and every date the app computes are read in Pacific, not the
// device's timezone, so the same workspace shows the same day whether it's
// opened from a Manila MacBook or a Pacific Windows box.
export function todayIso() {
  return tzToday();
}
// ISO date `days` from today (negative = past). isoShift(0) === todayIso().
export function isoShift(days) {
  return tzShift(days);
}
export function daysBetween(dateStr) {
  return tzDaysBetween(dateStr);
}

// Stages that imply an email just went out — bumps emails_sent + last_contact_date.
export const AUTO_EMAIL_STAGES = new Set([
  'Email 1', 'Email 2', 'Email 3', 'Email 4', 'Email 5',
  'Rekindled',
  // Social sends count as touches too — a DM you wrote is the same work as
  // an email you wrote, and the touch count is what tells you when you've
  // chased someone enough.
  'Story Reply', 'DM 1', 'DM 2', 'DM 3', 'Voice Note',
]);

// Stages that (re)anchor the last_contact_date to today WITHOUT bumping
// emails_sent. Snoozing / re-warming isn't an email — but we stamp today
// so the come-back countdown starts from when you parked it, not from an
// old date.
// Following, liking and connecting are real actions but they aren't
// messages, so they stamp the date without inflating the touch count.
export const STAMP_ONLY_STAGES = new Set(['Snoozed', 'Followed', 'Engaged', 'Connected']);

// The send schedule you actually run: Email N goes out on this day of the
// sequence (day 1 = the very first email). This is the single source of
// truth for both the Due cadence and the "Email N — Day X" labels, so they
// can never drift apart. Cadence: 1 · 3 · 7 · 14 · 21.
export const EMAIL_SEND_DAYS = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 21 };

// Per-stage "due" cadence — days of silence before the row surfaces as
// "time to send the next email", i.e. the gap between consecutive send
// days (2, 4, 7, 7). Email 5 is NOT here: after it, the row auto-transitions
// to 'Finished' instead of resurfacing as due (see FINISHED_AFTER_DAYS).
export const DUE_DAYS_BY_STAGE = {
  'Email 1': EMAIL_SEND_DAYS[2] - EMAIL_SEND_DAYS[1], // 2 → Email 2 on day 3
  'Email 2': EMAIL_SEND_DAYS[3] - EMAIL_SEND_DAYS[2], // 4 → Email 3 on day 7
  'Email 3': EMAIL_SEND_DAYS[4] - EMAIL_SEND_DAYS[3], // 7 → Email 4 on day 14
  'Email 4': EMAIL_SEND_DAYS[5] - EMAIL_SEND_DAYS[4], // 7 → Email 5 on day 21
  'Snoozed': 30, // → "come back later" leads resurface ~1 month after snoozing
  'Rekindled': 4, // re-contacted after going cold → follow up in 4 days
  // The social track moves faster than email — a DM sits in a list the
  // person actually opens, so waiting a week reads as gone rather than
  // patient. DM 3 is deliberately absent: like Email 5 it's the last one,
  // so it stops resurfacing instead of nagging forever.
  'Story Reply': 2,
  'DM 1': 3,
  'DM 2': 5,
  'Voice Note': 4,
};
export const DEFAULT_DUE_STAGES = Object.keys(DUE_DAYS_BY_STAGE);

// Auto-transition to 'Finished'. Ary asked for "7 days quiet → Finished the
// next day", so the threshold is 8.
export const FINISHED_AFTER_DAYS = 8;

// What used to trigger it, kept only because window.bloom still reports it.
//
// The rule was "stage is Email 5 and it has been quiet 8 days". Under Strategy
// V2 nobody reaches Email 5: P1 stops at 3. So the only trigger the app had
// could never fire again, and finished sequences piled up wearing an active
// stage for ever. 111 AU rows and 14 more workspace-wide had to be cleared by
// hand on 2026-08-21 because of it.
export const FINISHED_FROM_STAGE = 'Email 5';

// The cold stages a sequence can end from. A spent prospect sitting at
// 'Interested' or 'Replied' is a live conversation and must never be swept.
const FINISHABLE_STAGES = new Set(['Email 1', 'Email 2', 'Email 3', 'Email 4', 'Email 5']);

/**
 * Is this prospect's cold sequence over, and quiet long enough to say so?
 *
 * Three conditions, and each one is a mistake this rule has to avoid making:
 *
 *   - the band is spent, which is the actual definition of finished now
 *   - they are still in a cold email stage, so a warm conversation is safe
 *   - the last email has had time to land, so nobody is marked done the
 *     morning their final email went out
 *
 * A prospect still owed a rendered video is never finished: the recording was
 * paid for and promised, and its one-off delivery is allowed past the band.
 */
export function shouldAutoFinish(p = {}, { now = null } = {}) {
  if (!p || !FINISHABLE_STAGES.has(String(p.stage || ''))) return false;
  if (!coldSequenceExhausted(p)) return false;
  if (p.video_url && !p.video_sent_at) return false;
  const quiet = now ? tzDaysBetween(p.last_contact_date, now) : daysBetween(p.last_contact_date);
  return quiet != null && quiet >= FINISHED_AFTER_DAYS;
}

// The email sequence is over and no stage cadence surfaces the row anymore
// (Email 5 has no due window; Finished is terminal). A video that lands after
// this has to be scheduled by hand to appear in Due today — see setVideoUrl.
export const POST_SEQUENCE_STAGES = new Set(['Email 5', 'Finished']);

// How far out to schedule that one-off video email.
export const VIDEO_FOLLOWUP_DAYS = 5;

// Where a video recorded right now would land for this prospect, as a sort
// key: 0 = still catches email 3, 1 = only email 4 left, 2 = the sequence has
// passed both and it has to go as a standalone email. Lower is more urgent,
// because the slot closes on its own as the sequence advances and nothing
// brings it back.
export function videoSlotRank(p) {
  const sent = Number(p.emails_sent);
  if (!Number.isFinite(sent) || sent < 3) return 0;
  if (sent === 3) return 1;
  return 2;
}

// Days until this lead is due for its next touch: 0 = due today, negative =
// overdue, positive = due in N days, null = not on a due schedule.
// An explicit next_action_date wins; otherwise the stage window applies.
export function daysUntilDue(p) {
  if (!p) return null;
  if (p.next_action_date) {
    const nd = daysBetween(p.next_action_date); // today − next_action_date
    return nd == null ? null : -nd;             // due when today ≥ that date
  }
  const threshold = DUE_DAYS_BY_STAGE[p.stage];
  if (threshold == null) return null;
  const age = daysBetween(p.last_contact_date);
  if (age == null) return null;
  return threshold - age;
}

// Has this prospect already had every cold email their band allows?
//
// Lives in sequence-ceiling.mjs now, because it is a ceiling question and not a
// date one, and because lib/today.mjs needs the same answer without taking on a
// dependency on date logic it deliberately does not have. Re-exported here so
// every existing caller keeps its import.
export { coldSequenceExhausted };

export function isDueProspect(p) {
  // The app owns how long a sequence runs, and nothing surfaces a row as
  // needing an email it is not allowed to receive.
  if (coldSequenceExhausted(p)) return false;

  // Nor one the relationship is closed to. This asked only about the band and
  // the date, so a stale next_action_date on a closed row was enough to make
  // it due: a Rejected prospect, three Invalid Email addresses that would
  // bounce, and a Client all sat in Due today. A date is not permission.
  //
  // Snoozed is deliberately NOT closed. Its whole purpose is to come back.
  if (CLOSED_STAGES.has(String(p?.stage || 'New'))) return false;

  const d = daysUntilDue(p);
  return d != null && d <= 0;
}

// The follow-up date a stage transition should leave behind. daysUntilDue
// trusts next_action_date over the stage cadence, so a stale date would sit
// overdue forever — every send in the cadence writes the next one forward.
// A terminal send (Email 5, DM 3) clears the date to null so the row leaves
// the list, UNLESS a video is still owed: its one-off send carries its own
// scheduled date (see setVideoUrl), and that is left untouched.
//
// Returns a date string to set forward, null to clear, or undefined to leave
// next_action_date exactly as it is (the video-owed case).
export function nextActionForStage(stage, prospect) {
  const gap = DUE_DAYS_BY_STAGE[stage];
  if (gap != null) return isoShift(gap);
  const videoOwed = !!(prospect && prospect.video_url && !prospect.video_sent_at);
  return videoOwed ? undefined : null;
}

// Applies nextActionForStage into a patch object, honouring "leave as-is".
export function applyNextAction(patch, stage, prospect) {
  const na = nextActionForStage(stage, prospect);
  if (na !== undefined) patch.next_action_date = na;
}

// Which email number was most recently SENT to this prospect.
// The stage is the source of truth while they're in the sequence
// ("Email 3" ⇒ emails 1-3 went out). Once they leave it (Replied,
// Interested, …) the stage no longer encodes a number, so fall back to the
// emails_sent counter, capped at 5.
export function getLastSentNumber(prospect) {
  const stage = prospect?.stage || '';
  const match = stage.match(/^Email (\d)$/);
  if (match) return parseInt(match[1], 10);
  return Math.min(prospect?.emails_sent || 0, 5);
}

// Whole days since we last reached out, or null if never. The warm timer
// (see warmWaiting) counts from here, and setLastContact resets it.
export function daysSinceContact(p) {
  return daysBetween(p.last_contact_date);
}
// Whole days since a row's next_action_date (>= 0 once it has arrived), or
// null if unset. Drives the Snoozed/deferred "come-back is due" check.
export function pastDueDays(p) {
  return daysBetween(p.next_action_date);
}
