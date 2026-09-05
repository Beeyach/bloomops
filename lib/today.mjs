// Pure grouping for the Today view. dueFn(p) follows daysUntilDue's
// contract: 0 = due today, negative = overdue, positive = due in N days,
// null = not on a due schedule.
//
// Dates stay injected, which is what keeps this file free of date logic. The
// band ceiling is not date logic and is imported directly: a list of emails to
// send has to know how many the prospect may still receive.
import { coldSequenceExhausted } from './sequence-ceiling.mjs';

export const UPCOMING_WINDOW_DAYS = 7;

// Stages that are finished with, one way or another. A row parked here
// needs no next action, so it never counts as unscheduled work.
export const CLOSED_STAGES = new Set([
  'Client', 'Finished', 'Rejected', 'Not This Offer', 'Lost', 'Invalid Email',
]);

// Active prospects carrying no next_action_date. Today used to call a
// workspace "all caught up" while thousands of these sat untouched,
// because the day's list only ever looked at dated rows. Sorted by how
// far along they already are (emails_sent), so the warmest relationships
// surface first instead of an arbitrary slice of the alphabet.
export function unscheduledActive(prospects) {
  const out = [];
  for (const p of prospects || []) {
    const stage = p.stage || 'New';
    if (CLOSED_STAGES.has(stage)) continue;
    const d = p.next_action_date;
    if (d != null && String(d).trim() !== '') continue;
    out.push(p);
  }
  return out.sort((a, b) => (Number(b.emails_sent) || 0) - (Number(a.emails_sent) || 0));
}

// ── The split: "Due today (auto)" vs "Needs you" ───────────────────────
// One old "Due today" list mixed the automated sweep's sends with rows that
// only a human can move (Snoozed, Interested…). They're split here into two
// pure lists. p.due / getDue are deliberately left untouched (see the HARD
// CONSTRAINT): this is additive, exposed through getDueAuto/getWarmWaiting.

// What the automated sweep sends on its own: the email cadence, Email 1-5,
// plus any row still owed its one-off audit video (a video link exists and
// hasn't been sent). The sweep sends the video when it's due OR as soon as
// it's available, so an owed video counts as auto-due whatever its date.
export const AUTO_DUE_STAGES = new Set([
  'Email 1', 'Email 2', 'Email 3', 'Email 4', 'Email 5',
]);

export function videoOwed(p) {
  return !!(p.video_url && !p.video_sent_at);
}

// dueFn(p) follows daysUntilDue: <= 0 means due now. A row is the sweep's job
// if it's an Email stage that's come due, or it still owes a video.
export function isAutoDue(p, dueFn) {
  if (!p) return false;
  // An owed video still goes, whatever the band says. The cap counts cold
  // emails, and a recording that already exists was promised on a touch that
  // already happened.
  if (videoOwed(p)) return true;
  if (!AUTO_DUE_STAGES.has(p.stage || 'New')) return false;
  // The band decides how long a sequence runs, and this list is a list of
  // emails to send.
  //
  // Without this the two "due" answers disagreed: `isDueProspect` asked about
  // the band and this did not, so "Due today (auto)" and the stat tile above it
  // offered 340 rows where only 115 could actually be sent. 223 of the
  // difference were prospects whose allowance was spent, including a 💙 (two
  // touches) sitting at five sent and still being counted as owed an email.
  if (coldSequenceExhausted(p)) return false;
  const d = dueFn(p);
  return d != null && d <= 0;
}

export function dueAuto(prospects, dueFn) {
  const out = [];
  for (const p of prospects || []) {
    if (isAutoDue(p, dueFn)) out.push(p);
  }
  return out;
}

// "Needs you" — the human worklist. A prospect belongs here when:
//   • stage is Interested/Engaged/Replied and we've not touched them in
//     WARM_SILENCE_DAYS+ days (a warm lead cooling off), or
//   • stage is Setup Check (always a human's move), or
//   • stage is Snoozed, or the reply was a defer, and its next_action_date
//     has arrived (a come-back that's now due), or
//   • it's otherwise due right now but ISN'T the sweep's job (Rekindled, DM
//     1-3, Story Reply, Voice Note, a hand-set date on an odd stage) — caught
//     last so nothing that needs a human silently disappears.
// Closed-out rows never qualify, and anything the sweep owns is excluded so
// the two lists never double-count. Injected date helpers keep this file free
// of date logic. Sorted oldest-waiting first.
export const WARM_SILENCE_DAYS = 3;
// A proposal that's out is the hottest thing in the pipeline, and it used
// to be the only warm stage with NO follow-up machinery — five of them sat
// in silence while cold Email 2s got chased on schedule. Slightly longer
// than the warm threshold: a proposal deserves a beat of patience.
export const PROPOSAL_SILENCE_DAYS = 4;
const NEEDS_YOU_STAGES = new Set(['Interested', 'Engaged', 'Replied', 'Setup Check']);

export function warmWaiting(prospects, { daysSince, pastDue, dueFn, threshold = WARM_SILENCE_DAYS } = {}) {
  const ds = daysSince || (() => null);
  const pd = pastDue || (() => null);
  const out = [];
  for (const p of prospects || []) {
    const stage = p.stage || 'New';
    if (CLOSED_STAGES.has(stage)) continue;
    // The sweep owns this row — it belongs in Due today (auto), not here.
    if (dueFn && isAutoDue(p, dueFn)) continue;

    let waiting = null;
    if (stage === 'Setup Check') {
      const d = ds(p);
      waiting = d == null ? 0 : Math.max(0, d);
    } else if (stage === 'Proposal Sent') {
      const d = ds(p);
      if (d != null && d >= PROPOSAL_SILENCE_DAYS) waiting = d;
    } else if (NEEDS_YOU_STAGES.has(stage) || p.replied) {
      const d = ds(p);
      if (d != null && d >= threshold) waiting = d;
    }
    if (waiting == null && (stage === 'Snoozed' || p.reply_type === 'defer')) {
      const nd = pd(p);
      if (nd != null && nd >= 0) waiting = nd;
    }
    // Catch-all: due now, needs a human, not the sweep's job.
    if (waiting == null && dueFn) {
      const d = dueFn(p);
      if (d != null && d <= 0) {
        const nd = pd(p);
        waiting = nd != null && nd >= 0 ? nd : Math.max(0, ds(p) ?? 0);
      }
    }
    if (waiting == null) continue;
    out.push({ prospect: p, waiting: Math.max(0, waiting) });
  }
  return out.sort((a, b) => b.waiting - a.waiting);
}

export function groupByDue(prospects, dueFn) {
  const overdue = [];
  const dueToday = [];
  const upcoming = [];
  for (const p of prospects || []) {
    const d = dueFn(p);
    if (d == null) continue;
    if (d < 0) overdue.push({ p, d });
    else if (d === 0) dueToday.push(p);
    else if (d <= UPCOMING_WINDOW_DAYS) upcoming.push({ p, d });
  }
  overdue.sort((a, b) => a.d - b.d);
  upcoming.sort((a, b) => a.d - b.d);

  const upcomingByDay = [];
  for (const item of upcoming) {
    const last = upcomingByDay[upcomingByDay.length - 1];
    if (last && last.inDays === item.d) last.items.push(item.p);
    else upcomingByDay.push({ inDays: item.d, items: [item.p] });
  }

  return {
    overdue: overdue.map((x) => ({ prospect: x.p, overdueBy: -x.d })),
    dueToday,
    upcomingByDay,
  };
}
