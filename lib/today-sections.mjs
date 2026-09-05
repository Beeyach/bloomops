// What Today actually shows, and how much of it.
//
// Today held 332 relevant rows and rendered most of them. A day's work is not
// 332 rows: sixty-eight people wrote back and they were somewhere below two
// hundred rows about missing addresses. So this file does two things and only
// two — it sorts everyone into the four sections Today has, and it decides how
// many of each get drawn before the rest becomes a number.
//
// Every state comes from prospectActionState. Nothing here re-decides what a
// person's situation is; a second opinion about that is exactly the bug the
// router was written to end.

import { PILE } from './prospect-action.mjs';
import { cachedActionState } from './prospect-state-cache.mjs';
import { DUE, UPCOMING_DAYS } from './followup-schedule.mjs';
import { isInternalTest } from './canary.mjs';

// How many rows each section draws before it starts counting instead.
//
// Small on purpose. The question Today answers is "what do I do now", and the
// honest answer is never "read sixty-eight rows". The count and View all keep
// the rest one click away, which is where a long list belongs.
export const NEEDS_YOU_LIMIT = 6;
export const DUE_LIMIT = 8;
export const UPCOMING_PREVIEW = 3;

// The exception kinds, in the order they are worth acting on. The labels are
// the router's own, so a heading here can never drift from what a row says.
const ATTENTION_KINDS = [
  { label: 'Needs email address', hint: 'We contacted them before, but the current record has no usable address.' },
  { label: 'Timing unknown', hint: 'Two emails went out and the first one’s date was never recorded.' },
  { label: 'Needs a fresh check', hint: 'Their last contact is too old for LTB to carry on automatically.' },
  { label: 'Needs a look', hint: 'The record does not say enough to work out what happens next.' },
];

// Somebody whose conversation is settled, whatever an older list thinks.
//
// Today has three doors: this file, the server's exception queue, and the warm
// list that predates both and still reasons from "they replied once and have
// gone quiet". That last one put a deferral twenty-one days out back on the
// page as "11 days waiting".
//
// One question, asked at every door: does the relationship want a person? The
// answer is the relationship model's and this only reads it.
export function isSettled(prospect, { now = new Date() } = {}) {
  const state = cachedActionState(prospect, { now });
  return state.pile === PILE.NEEDS_YOU && !state.relationship?.needsPerson;
}

const capped = (rows, limit) => ({
  rows: rows.slice(0, limit),
  total: rows.length,
  hidden: Math.max(0, rows.length - limit),
});

// Everyone, sorted into the four piles Today draws.
//
// `skip` is the set of ids another surface has already claimed — the server's
// exception queue knows about replies and stuck jobs that the browser cannot
// see, and somebody it is already showing must not appear again below it.
export function todaySections(prospects = [], {
  now = new Date(),
  skip = null,
  upcomingDays = UPCOMING_DAYS,
} = {}) {
  const needsYou = [];
  const due = [];
  const upcoming = [];
  const attention = new Map();

  for (const prospect of prospects) {
    // The canary is a test of the send path, not a person waiting on Ary.
    if (isInternalTest(prospect)) continue;
    if (skip && skip.has(prospect.id)) continue;

    const state = cachedActionState(prospect, { now });
    const row = { prospect, state };

    // Replied is not the same question as Needs you.
    //
    // The cold sequence stops the moment anybody writes back, which is right —
    // and it put all sixty-eight of those conversations on Today, including
    // thirty-six people who had already said no to this offer, six waits that
    // are not over, two lost and one client. None of them are waiting on Ary.
    //
    // Whether a person is actually wanted is the relationship model's question
    // and it already answers it. This asks; it does not decide. The row stays
    // in the Replied tab either way, because that tab is the history.
    if (state.pile === PILE.NEEDS_YOU) {
      if (state.relationship?.needsPerson) needsYou.push(row);
      continue;
    }

    if (state.pile === PILE.ATTENTION) {
      const list = attention.get(state.label) || [];
      list.push(row);
      attention.set(state.label, list);
      continue;
    }

    if (state.pile !== PILE.FOLLOWUP) continue;

    const s = state.schedule || {};
    if (s.status === DUE.DUE_NOW || s.status === DUE.OVERDUE) { due.push(row); continue; }
    // A follow-up eleven weeks out is not today's business. Only the next
    // week's worth is worth a line on this page.
    if (s.status === DUE.NOT_DUE_YET && (s.daysUntilDue ?? Infinity) <= upcomingDays) upcoming.push(row);
  }

  // Longest waiting first in both directions: if only some get attention it
  // should be the ones that have waited most, and the nearest due dates are
  // the ones worth previewing.
  needsYou.sort((a, b) => String(b.prospect.reply_date || b.prospect.updated_at || '')
    .localeCompare(String(a.prospect.reply_date || a.prospect.updated_at || '')));
  due.sort((a, b) => (b.state.schedule?.overdueDays || 0) - (a.state.schedule?.overdueDays || 0));
  upcoming.sort((a, b) => (a.state.schedule?.daysUntilDue || 0) - (b.state.schedule?.daysUntilDue || 0));

  const kinds = ATTENTION_KINDS
    .filter((k) => attention.has(k.label))
    .map((k) => ({ ...k, count: attention.get(k.label).length }));

  return {
    needsYou: capped(needsYou, NEEDS_YOU_LIMIT),
    followups: {
      due: capped(due, DUE_LIMIT),
      upcoming: { ...capped(upcoming, UPCOMING_PREVIEW), withinDays: upcomingDays },
    },
    attention: { kinds, total: kinds.reduce((n, k) => n + k.count, 0) },
  };
}
