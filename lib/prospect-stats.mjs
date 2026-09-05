// Pure rollup over the canonical prospect list — the numbers behind the
// Stats tab and window.bloom.getStats(). No React. Extracted verbatim from
// ProspectsApp.jsx (split step 4).

import { vidtestStats } from './vidtest.mjs';
import { warmWaiting, dueAuto } from './today.mjs';
import {
  daysBetween, daysUntilDue, isDueProspect, daysSinceContact, pastDueDays,
} from './due.mjs';

// ── Stats categories ───────────────────────────────────────────────────
// "Responded" = the prospect actually replied in some form: said yes
// (Interested/Booked/Client/Payment Awaiting), said no (Rejected), or asked
// to come back later (Snoozed). Lost = no reply after the sequence, so it
// does NOT count. Re-warm (was interested, then went quiet) doesn't count —
// no confirmed current reply. Nudge/Potential are our own assessments.
//
// These stages are not the whole answer though. A reply is its own field
// because it can happen at any stage, so someone can be marked replied while
// sitting on the social track (Engaged, DM 2) and none of those stages appear
// here. Counting stages alone made "Responded" disagree with "replies logged":
// the reply was recorded and the response rate ignored it. computeStats now
// counts a prospect as responded if EITHER is true, which is why this set is
// no longer the sole test.
export const RESPONDED_STAGES = new Set([
  'Setup Check', 'Interested', 'Client', 'Rejected', 'Snoozed',
]);
// Pure, synchronous rollup over the canonical prospect list. Used by both
// the Stats tab and window.bloom.getStats(). Every count maps to
// exactly one stage — nothing is summed across stages, so the numbers
// match what you see in the pipeline.
export function computeStats(prospects) {
  const byStage = {};
  const replyByType = { interested: 0, defer: 0, decline: 0 };
  const repliesByEmail = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  // Which send day earns replies. Attribution is by each lead's LAST send
  // day (that's the date the row carries), so it's directional rather than
  // per-send truth — the card says so, and hides rates under the floor.
  const byWeekday = Array.from({ length: 7 }, () => ({ sent: 0, replies: 0 }));
  let responded = 0, callsBooked = 0, interested = 0, newCount = 0,
    rejected = 0, lost = 0, clients = 0, paymentAwaiting = 0,
    missingCountry = 0, snoozed = 0, snoozedDueThisWeek = 0,
    repliedCount = 0, emailsAtReplySum = 0, emailsAtReplyN = 0;
  for (const p of prospects) {
    const s = p.stage || 'New';
    byStage[s] = (byStage[s] || 0) + 1;
    // New, Prescreen, and Validated are all pre-contact, so they do not count
    // as reached out and the rates only divide by people actually touched.
    //
    // The stage alone was not enough. A prospect can be marked replied while
    // the stage has not moved: the reply-sync skill stamps replied and
    // reply_type, and a scan-imported row sits on New until somebody advances
    // it. Those rows were counted as "not contacted" (shrinking the divisor)
    // AND as "responded" (growing the numerator), so three prospects, two of
    // them replied on New, reported a 200% response rate. Two replies on New
    // and nothing else reported 0%, which is the same bug pointing the other
    // way. Evidence of contact overrules the stage: a reply, a send date, or
    // a send count all mean this person was reached.
    const untouched = !p.replied
      && !p.last_contact_date
      && !(Number(p.emails_sent) > 0);
    if ((s === 'New' || s === 'Prescreen' || s === 'Validated') && untouched) newCount++;
    // Either the stage says they answered, or the reply field does. Counted
    // once per prospect, so someone Interested AND marked replied is one.
    if (RESPONDED_STAGES.has(s) || p.replied) responded++;
    if (s === 'Client') clients++;
    if (s === 'Payment Awaiting') paymentAwaiting++;
    // The real "calls booked" signal: the call_booked field, set from the
    // drawer. The 'Booked' STAGE was removed from the pipeline long ago, so
    // counting it alone showed a permanent 0.
    if (p.call_booked === 1) callsBooked++;
    if (s === 'Interested') interested++;
    if (s === 'Rejected') rejected++;
    if (s === 'Lost') lost++;

    if (p.last_contact_date) {
      // Noon-UTC pin so a date-only value never rolls into the wrong day.
      const wd = new Date(`${String(p.last_contact_date).slice(0, 10)}T12:00:00Z`).getUTCDay();
      if (!Number.isNaN(wd)) {
        byWeekday[wd].sent++;
        if (p.replied) byWeekday[wd].replies++;
      }
    }

    if (!p.country) missingCountry++;
    if (s === 'Snoozed') {
      snoozed++;
      const nd = p.next_action_date ? daysBetween(p.next_action_date) : null;
      // Due (≥0) or coming due within 7 days (nd >= -7).
      if (nd != null && nd >= -7) snoozedDueThisWeek++;
      else if (nd == null && isDueProspect(p)) snoozedDueThisWeek++;
    }

    if (p.replied) {
      repliedCount++;
      if (p.reply_type && replyByType[p.reply_type] != null) replyByType[p.reply_type]++;
      const n = p.replied_at_email;
      if (n != null && repliesByEmail[n] != null) repliesByEmail[n]++;
      const es = Number(p.emails_sent);
      if (Number.isFinite(es) && es > 0) { emailsAtReplySum += es; emailsAtReplyN++; }
    }
  }
  const total = prospects.length;
  const reachedOut = total - newCount;
  const pct = (n, d) => (d > 0 ? Math.round((n / d) * 1000) / 10 : 0);
  // The same two rollups the split lists and window.bloom.getDueAuto/
  // getWarmWaiting use, so the cards can never disagree with the lists.
  // The honest 50/50 video test, read from VIDTEST:A/B info markers rather
  // than all-time video vs no-video (which compared incomparable cohorts).
  const vidtest = vidtestStats(prospects, (p) => !!p.replied);
  const dueAutoCount = dueAuto(prospects, daysUntilDue).length;
  const warmWaitingCount = warmWaiting(prospects, {
    daysSince: daysSinceContact,
    pastDue: pastDueDays,
    dueFn: daysUntilDue,
  }).length;
  return {
    total, newCount, reachedOut,
    dueAuto: dueAutoCount,
    warmWaiting: warmWaitingCount,
    vidtest,
    responded, responseRate: pct(responded, reachedOut),
    interested, callsBooked,
    clients, paymentAwaiting, conversionRate: pct(clients, reachedOut),
    rejected, lost,
    missingCountry, snoozed, snoozedDueThisWeek,
    replyByType, repliesByEmail, repliedCount, byWeekday,
    avgEmailsBeforeReply: emailsAtReplyN > 0
      ? Math.round((emailsAtReplySum / emailsAtReplyN) * 10) / 10
      : null,
    byStage,
  };
}
