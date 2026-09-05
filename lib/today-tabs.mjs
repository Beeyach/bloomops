// Today, as five places instead of one scroll.
//
// Chapter 8 turned Today's four groups into cards, which made the page legible
// but not shorter — every category was still on screen at once, stacked, and
// the verdict was that it is "in one place too much". A morning is one job at
// a time: answer the people who wrote, or read the drafts, or clear the
// follow-ups. Not all three simultaneously.
//
// So Today is a tab strip. This module is the whole description of it — the
// order, the counts, which tab opens, and where a manual choice is kept. The
// component reads it; it does not carry its own idea of any of that.

// The tabs, in reading order. `priority` is a separate list below, because
// the order you read them in is not the order they matter in: Approvals sits
// second because it is the most common work, but a person who wrote to you
// outranks a draft, and so does a decision the app refused to guess.
export const TODAY_TABS = [
  {
    id: 'replies',
    label: 'Replies',
    // Said once, here, instead of on every row. The rows say who and what.
    blurb: 'People who wrote back and are waiting on you.',
    empty: 'Nobody is waiting on an answer.',
  },
  {
    id: 'approvals',
    label: 'Approvals',
    blurb: 'Written and recorded work waiting on your eye. Nothing sends until you say so.',
    empty: 'Nothing is waiting for approval.',
  },
  {
    id: 'followups',
    label: 'Follow-ups',
    blurb: 'Due, gone quiet, and dates that came round. Nothing sends on its own.',
    empty: 'Nothing is due right now.',
  },
  {
    id: 'decisions',
    label: 'Decisions',
    blurb: 'The app would rather ask than guess.',
    empty: 'Nothing needs a decision right now.',
  },
  {
    id: 'exceptions',
    label: 'Exceptions',
    blurb: 'Work that stopped, and records too thin to act on.',
    empty: 'Nothing is stuck.',
  },
];

// Which tab opens when nobody has chosen one. A person waiting on an answer
// beats everything; a decision the app refused to make beats work it prepared
// happily; tidying comes last.
export const TODAY_PRIORITY = ['replies', 'decisions', 'approvals', 'followups', 'exceptions'];

// ── Ownership ─────────────────────────────────────────────────────────────
//
// Chapter 11's finding: the tabs were the right five names over the wrong
// contents. Replies held people who had gone quiet, a video sitting
// recorded, and somebody who watched one — none of which is a reply.
// Decisions held deferrals that had come round, which is a follow-up date
// arriving, not a decision the app refused to make.
//
// So ownership is declared here, once, as the whole answer to "which tab
// does this belong to". Every count and every panel reads it, and a test
// walks it to prove nothing can appear in two places.
//
// Nothing about the backend changed to do this. These are presentation
// routes over facts the router and the exception queue already produce.

// The exception-queue buckets each tab owns.
export const TAB_BUCKETS = {
  // Somebody wrote to you. Nothing else.
  replies: ['replies'],
  // A date arrived: a deferral that has come round is a follow-up, not a
  // decision — the decision was made when it was deferred.
  followups: ['deferrals'],
  // Review-before-send. An old draft waiting is work to read and approve.
  approvals: ['legacy'],
  // Only what the app genuinely would not decide.
  decisions: ['decisions'],
  // Broken, and recoverable.
  exceptions: ['blocked', 'held'],
};

// The browser-side piles each tab owns. These come from todaySections and
// the older warm list; the names are the ones TodayView computes.
//
//   needsYou    they replied and are waiting on an answer
//   hotViewers  they opened the audit video
//   warm        gone quiet, needs a nudge
//   videoReady  a video is recorded and has not gone out
//   due         a follow-up is due now
//   upcoming    one is due this week
//   attention   records too thin to act on
// THE INVARIANT
//
// A tab must not combine an evidence-backed semantic queue with an
// independently computed prospect-column pile that can disagree with it.
//
// Replies and Follow-ups both broke it, and it is why five passes of fixing
// reply semantics kept half-working. The `replies` BUCKET knows about Gmail
// messages, answered state, terminal classes, newsletters, thank-yous and
// client standing. The `needsYou` PILE knows only `prospects.replied`, a flag
// some of these rows have carried since May with no message behind it
// anywhere. Both fed the same tab, the pile fed the count, and so the tab
// said 17 while one row could be proven.
//
// `due` and `upcoming` are the same mistake in Follow-ups: a past
// next_action_date is not evidence that a follow-up is owed. Every prospect
// with real send history has replied, declined, bounced or become a client,
// so the honest cold-due number is 0 and the tab was showing 29.
//
// The piles are not deleted — the sections still compute them, and Prospects
// still uses them. They simply no longer get to speak for a tab whose
// meaning is defined by evidence.
export const TAB_PILES = {
  // Owned entirely by the `replies` bucket. See lib/exceptions.mjs.
  replies: [],
  // Watching a video is engagement, not an answer: what it earns is a nudge.
  // Gone quiet is the same job. Both are follow-up work, and both are real
  // observations rather than a date that has drifted past.
  followups: ['hotViewers', 'warm'],
  // A recorded video waiting to go out is a thing to review and send.
  approvals: ['videoReady'],
  decisions: [],
  exceptions: ['attention'],
};

// Every pile, and the one tab that owns it. Built from the map above so it
// cannot drift, and exported so a test can prove the partition.
export const PILE_OWNER = Object.fromEntries(
  Object.entries(TAB_PILES).flatMap(([tab, piles]) => piles.map((pile) => [pile, tab]))
);
export const BUCKET_OWNER = Object.fromEntries(
  Object.entries(TAB_BUCKETS).flatMap(([tab, buckets]) => buckets.map((b) => [b, tab]))
);

// A manual choice survives a refresh but not a new session: the list you want
// is the one you want right now, and tomorrow morning should open on whatever
// is actually waiting.
export const TODAY_TAB_KEY = 'ltb_today_tab_v1';

const ID = new Set(TODAY_TABS.map((t) => t.id));
export const isTodayTab = (id) => ID.has(id);

// The tab to open, given today's counts and whatever was chosen before.
//
// A remembered choice wins even when its tab is empty — being sent somewhere
// else because the thing you were working on is now finished is worse than an
// empty panel that says so.
export function openingTodayTab(counts = {}, remembered = null) {
  if (remembered && ID.has(remembered)) return remembered;
  for (const id of TODAY_PRIORITY) {
    if ((counts[id] || 0) > 0) return id;
  }
  return TODAY_PRIORITY[0];
}

// The one line above the tabs. Only the tabs that have something are named,
// so it never reads "0 replies · 0 approvals".
export function todaySummary(counts = {}) {
  const say = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
  const parts = [];
  if (counts.replies) parts.push(say(counts.replies, 'reply', 'replies'));
  if (counts.decisions) parts.push(say(counts.decisions, 'decision', 'decisions'));
  if (counts.approvals) parts.push(say(counts.approvals, 'approval', 'approvals'));
  if (counts.followups) parts.push(say(counts.followups, 'follow-up', 'follow-ups'));
  if (counts.exceptions) parts.push(say(counts.exceptions, 'exception', 'exceptions'));
  return parts.join(' · ');
}

export const isTodayClear = (counts = {}) =>
  TODAY_TABS.every((t) => !(counts[t.id] > 0));
