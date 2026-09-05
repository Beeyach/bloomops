// What happens next with this person, in words Ary can read.
//
// The old interface answered "which stage are they at" — Email 1 through
// Email 5. Those numbers are history now, and history is the wrong thing to
// lead with: 652 prospects sit at "Email 5" and none of them are waiting for
// anything. The useful question is what happens next, and the app already
// knows.
//
// This file decides nothing. Every rule it reports comes from a helper that
// already owns it: the schedule from nextFollowupSchedule, the relationship
// from currentState, the ceiling from effectiveCeiling. It turns those answers
// into a label, a sentence, and which pile the person belongs in. A second
// send-policy brain is exactly what this must not become.

import { nextFollowupSchedule, DUE } from './followup-schedule.mjs';
import { effectiveBand } from './priority.mjs';
import { prospectPreparationCeiling } from './sequence-ceiling.mjs';
import { REL, LABEL as REL_LABEL, currentState, explain as explainRelationship } from './relationship.mjs';

// The piles. Ordered by how much they want a person's attention.
export const PILE = {
  NEEDS_YOU: 'needs-you',
  READY: 'ready-for-approval',
  FOLLOWUP: 'followup',
  ATTENTION: 'needs-attention',
  WAITING: 'waiting',
  FINISHED: 'finished',
  NOT_CONTACTED: 'not-contacted',
};

// How loudly each pile should read. Deliberately not one colour per state:
// most of these are not problems, and a wall of red teaches people to ignore
// red.
export const TONE = {
  [PILE.NEEDS_YOU]: 'high',
  [PILE.READY]: 'action',
  [PILE.FOLLOWUP]: 'calm',
  [PILE.ATTENTION]: 'notice',
  [PILE.WAITING]: 'muted',
  [PILE.FINISHED]: 'quiet',
  [PILE.NOT_CONTACTED]: 'muted',
};

const nice = (iso) => {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
};

const sentPhrase = (n) => (n === 1 ? '1 email sent' : `${n} emails sent`);

export function prospectActionState(prospect = {}, {
  relationship = null, sendEvents = null, now = new Date(),
  readyPackages = 0, approvedPackages = 0,
} = {}) {
  const sent = Math.max(0, Number(prospect.emails_sent) || 0);
  const band = effectiveBand(prospect);
  const ceiling = prospectPreparationCeiling(prospect);
  const schedule = nextFollowupSchedule(prospect, { relationship, sendEvents, now });

  // Context reads the same everywhere: what has gone out, and when anybody last
  // spoke to them.
  //
  // Two things are deliberately absent. The priority band ("P1") is a ceiling
  // on how many cold emails this person may ever get — real, and jargon on a
  // scan line; it is spelled out in words on the prospect's own page instead.
  // And "Never contacted" is gone: some records carry a last-contact date with
  // zero emails sent, which put "Never contacted · last contact Aug 3" on one
  // line. A manual touch is not an email, so the phrase now says which it is.
  const context = [
    sent ? sentPhrase(sent) : 'No emails sent yet',
    prospect.last_contact_date ? `last contact ${nice(prospect.last_contact_date)}` : null,
  ].filter(Boolean).join(' · ');

  // `lead` is the one fact that outranks the send count on a row. A deferral
  // is the case it exists for: "2 emails sent · last contact Jul 31" is true
  // and useless next to "Waiting until Sep 1", which is the whole reason that
  // row is not on Today.
  const out = (pile, label, detail, relationship = null, lead = null) => ({
    pile, label, detail, context: [lead, context].filter(Boolean).join(' · '), tone: TONE[pile],
    sent, band: band.provisional ? null : band.band, ceiling,
    schedule,
    // Where this person and Ary stand, as the relationship model reports it.
    //
    // Carried rather than re-derived, because whether somebody needs a human
    // TODAY is a question only that model may answer. Today reads
    // `relationship.needsPerson`; the tab a row lives in does not, which is the
    // whole point — Replied is a history and Today is a queue.
    relationship,
    // The codes stay available for the collapsed technical section. They are
    // never the label.
    code: schedule.status,
  });

  // Nobody has been written to yet.
  //
  // Answered before the follow-up schedule is consulted, because that schedule
  // is about continuing a sequence and there is nothing to continue. Running it
  // anyway filed 4,451 never-contacted rows as "needs email address" — true of
  // the record, but phrased as though we had emailed them and lost the address,
  // and enough rows to bury the forty that actually need something.
  //
  // Not contacted is also not an invitation. Only a prospect with a package a
  // person can approve is work; the rest are inventory.
  if (!sent && !prospect.replied) {
    if (schedule.status === DUE.CLOSED) {
      return out(PILE.FINISHED, 'Closed', 'Closed to outreach before anything went out.');
    }
    if (approvedPackages > 0) return out(PILE.READY, 'Approved, not sent yet', 'The first email is approved and waiting to go.');
    if (readyPackages > 0) return out(PILE.READY, 'Ready for approval', 'A first email is written and needs your eye before it goes.');
    if (!prospect.email) return out(PILE.NOT_CONTACTED, 'No address yet', 'Nothing can be prepared until there is somewhere to send it.');
    return out(PILE.NOT_CONTACTED, 'Not contacted yet', 'Nothing has been prepared for them.');
  }

  switch (schedule.status) {
    case DUE.NEEDS_HUMAN: {
      // What the relationship actually is, said in the relationship's own
      // words. Where nobody passed one in — every browser call, because the
      // events table is a server read — it is recovered from the stage the
      // prospect was parked at before conversations were tracked.
      const known = relationship || currentState({
        events: [],
        legacyStage: prospect.stage,
        // The old model recorded a wait as a date on the row rather than as an
        // event, so this is where "come back on the 24th" actually lives.
        legacyDeferUntil: prospect.deferred_until || prospect.next_action_date || null,
        now,
      });

      // A reply with nothing to say about it is not "nothing happened".
      //
      // The prospect row says a human wrote; no event says what they meant.
      // That is precisely what AMBIGUOUS is for, and calling it that is what
      // keeps these seventeen people on Today — they are the ones whose
      // messages nobody has read yet.
      const rel = known?.state
        ? known
        : { state: REL.AMBIGUOUS, source: known?.source || null, needsPerson: true, closed: false };

      // A wait says when it ends, or says that nobody wrote one down.
      const lead = rel.state !== REL.DEFERRED ? null
        : !rel.deferredUntil ? 'No date was given'
          : rel.needsPerson ? `The date they asked for has passed (${nice(rel.deferredUntil)})`
            : `Waiting until ${nice(rel.deferredUntil)}`;

      return out(PILE.NEEDS_YOU, REL_LABEL[rel.state] || 'Needs your reply',
        explainRelationship(rel) || 'They wrote back. The cold sequence stopped here.',
        rel, lead);
    }

    case DUE.CLOSED:
      return out(PILE.FINISHED, 'Closed',
        prospect.first_client_at ? 'They are a client.' : 'Closed to further outreach.');

    case DUE.HOLD_DEFERRED:
      return out(PILE.WAITING, 'Waiting until they said',
        `They asked to be contacted later${prospect.deferred_until ? `, around ${nice(prospect.deferred_until)}` : ''}.`);

    case DUE.HOLD_CONTACT:
      return out(PILE.ATTENTION, 'Needs email address',
        'We contacted them before, but the record no longer has a usable email.');

    case DUE.HOLD_EVIDENCE:
      return out(PILE.ATTENTION, 'Needs a fresh check',
        'The last contact is too old for LTB to carry on automatically.');

    case DUE.UNCLEAR: {
      // The honest one. Two emails went out and nobody wrote down when the
      // first did, so there is no truthful day to count ten from.
      if (sent >= 2) {
        return out(PILE.ATTENTION, 'Timing unknown',
          `LTB knows ${sentPhrase(sent)}, but the first email's date was never recorded, so it will not guess when the next one is due.`);
      }
      return out(PILE.ATTENTION, 'Needs a look',
        'The record does not say enough to work out what happens next.');
    }

    case DUE.MANUAL_ONLY:
      return out(PILE.FINISHED, 'Old sequence finished',
        `They already had ${sentPhrase(sent)} under the old sequence, which is more than the current one allows. Nothing goes out automatically.`);

    case DUE.COMPLETE:
      return out(PILE.FINISHED, 'Sequence finished',
        sent ? `${sentPhrase(sent)}. No more cold follow-up.` : 'No cold sequence applies.');

    case DUE.DUE_NOW:
    case DUE.OVERDUE: {
      const when = schedule.status === DUE.OVERDUE
        ? `Email ${schedule.step} became due ${nice(schedule.dueAt)}`
        : `Email ${schedule.step} is due today`;
      // Chapter 9: the second sentence used to be here too. On the Follow-ups
      // tab that printed "Nothing sends on its own while follow-up automation
      // is off" once per row, under a tab whose own blurb already says it.
      // The row says when it came due; the tab says what does not happen.
      return out(PILE.FOLLOWUP, `Email ${schedule.step} due`, `${when}.`);
    }

    case DUE.NOT_DUE_YET:
      return out(PILE.FOLLOWUP, `Email ${schedule.step} coming up`,
        `Due ${nice(schedule.dueAt)}.`);

    default:
      break;
  }

  // Nothing sent yet. Not contacted is a state, not an invitation: only a
  // prospect with a package a person can actually approve belongs in the
  // day's work.
  if (!sent) {
    if (approvedPackages > 0) return out(PILE.READY, 'Approved, not sent yet', 'The first email is approved and waiting to go.');
    if (readyPackages > 0) return out(PILE.READY, 'Ready for approval', 'A first email is written and needs your eye before it goes.');
    return out(PILE.NOT_CONTACTED, 'Not contacted yet', 'Nothing has been prepared for them.');
  }

  return out(PILE.ATTENTION, 'Needs a look', 'The record does not say enough to work out what happens next.');
}

// Which of the six list views a person belongs in.
export const VIEW = {
  ALL: 'all',
  NOT_CONTACTED: 'not-contacted',
  IN_OUTREACH: 'in-outreach',
  REPLIED: 'replied',
  ATTENTION: 'needs-attention',
  FINISHED: 'finished',
};

export function viewFor(state = {}) {
  switch (state.pile) {
    case PILE.NEEDS_YOU: return VIEW.REPLIED;
    case PILE.FOLLOWUP: return VIEW.IN_OUTREACH;
    // A written first email that nobody has approved yet is still somebody we
    // have never contacted. Filing it under In outreach made that tab a mix of
    // "we are mid-sequence with them" and "we have not said a word", which are
    // different jobs on different days.
    case PILE.READY: return VIEW.NOT_CONTACTED;
    case PILE.ATTENTION: return VIEW.ATTENTION;
    case PILE.WAITING: return VIEW.REPLIED;
    case PILE.FINISHED: return VIEW.FINISHED;
    default: return VIEW.NOT_CONTACTED;
  }
}

// What belongs on Today. Finished work and the never-contacted archive do not:
// Today is a day's work, not the database.
const ON_TODAY = new Set([PILE.NEEDS_YOU, PILE.READY, PILE.FOLLOWUP, PILE.ATTENTION]);
export const belongsOnToday = (state) => ON_TODAY.has(state?.pile);

// How many exceptions Today shows before it starts hiding them behind a count.
//
// There are 220 of them in production, mostly missing addresses. That is a real
// list worth working through, and it is not a day's work: shown in full it
// buries the sixty-eight people who actually wrote back. Today shows the first
// few and says how many more there are; the Prospects list holds all of them.
export const TODAY_EXCEPTION_LIMIT = 6;

export function todayExceptions(states = []) {
  const all = states.filter((s) => s.pile === PILE.ATTENTION);
  return { shown: all.slice(0, TODAY_EXCEPTION_LIMIT), hidden: Math.max(0, all.length - TODAY_EXCEPTION_LIMIT), total: all.length };
}
