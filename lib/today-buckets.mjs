// What Today shows, and where the rest of it lives.
//
// Today grew into a scroll. With a few hundred prospects in play, "Ready for
// approval" ended up below a wall of cards, and the worst part was not the
// scrolling: it was that an empty section rendered as nothing at all, so
// "there is none" and "you have not scrolled far enough" looked identical.
//
// So Today becomes a dashboard. Every bucket shows its real total and the first
// few rows; the full list lives on its own page. The sections that Ary acts on
// render even at zero, because an empty section that says it is empty is
// information and a missing one is a worry.
//
// This module is the single description of that. The components read it; they
// do not each carry their own idea of the order or the limits.

import { BUCKET } from './exceptions.mjs';

// How many rows a section shows before it hands off to its own page.
export const PREVIEW = 5;

// How many approval cards Today draws before counting instead. Three, not
// five: an approval is a reading job, and Today is an inbox, not a queue.
export const TODAY_APPROVALS_LIMIT = 3;

// Ordered. Replies first because a person is waiting; approvals second because
// that is the work; held and old drafts last because neither is today's job.
//
// `alwaysShow` marks the sections Ary acts on. Those render at zero with a line
// saying so, which is the whole point: she should never have to wonder whether
// a feature disappeared.
export const BUCKETS = [
  {
    id: 'replies',
    bucket: BUCKET.NEEDS_REPLY,
    title: 'Needs your reply',
    blurb: 'Somebody wrote to you.',
    empty: 'Nobody is waiting on an answer. New replies land here on their own.',
    view: 'today/replies',
    alwaysShow: true,
  },
  {
    id: 'approvals',
    bucket: null, // its own source: outreach packages, never the exception queue
    title: 'Ready for approval',
    blurb: 'New outreach prepared under the current rules. Nothing sends until you approve it.',
    empty: 'No new outreach is ready right now. People arrive here once the checks pass and a draft is written.',
    view: 'today/approvals',
    alwaysShow: true,
  },
  {
    id: 'decisions',
    bucket: BUCKET.NEEDS_DECISION,
    title: 'Needs your decision',
    blurb: 'These need a call from you before anything moves.',
    empty: 'Nothing is waiting on a decision. You only see this when the app would rather ask than guess.',
    view: 'today/decisions',
    alwaysShow: true,
  },
  {
    id: 'deferrals',
    bucket: BUCKET.RESURFACED,
    title: 'Ready to reconsider',
    blurb: 'They asked for later, and later has arrived.',
    empty: 'Nothing is due to come back today. Anyone you deferred reappears on the date you picked.',
    view: 'today/deferrals',
    alwaysShow: true,
  },
  {
    id: 'blocked',
    bucket: BUCKET.BLOCKED,
    title: 'Automation stopped',
    blurb: 'The background work stopped and said why.',
    empty: 'Nothing is stuck. Background checks that fail show up here with the reason.',
    view: 'today/blocked',
    alwaysShow: false,
  },
  {
    id: 'held',
    bucket: null, // its own source: contact state
    title: 'Waiting on a way to reach them',
    blurb: 'Still worth it. We just do not have a safe address yet.',
    empty: 'Everyone active has a way in. Nothing to do.',
    view: 'today/held',
    alwaysShow: false,
  },
  {
    id: 'legacy',
    bucket: BUCKET.LEGACY_DRAFT,
    title: 'Old drafts',
    blurb: 'Written before the new outreach flow. Redo one to use the new approval.',
    empty: 'No old drafts left.',
    view: 'today/legacy-drafts',
    alwaysShow: false,
  },
];

export const BUCKET_BY_ID = Object.fromEntries(BUCKETS.map((b) => [b.id, b]));
export const BUCKET_VIEWS = BUCKETS.map((b) => b.view);
export const bucketForView = (view) => BUCKETS.find((b) => b.view === view) || null;

// The order Today renders in, as ids. Asserted in a test, because "ready for
// approval slid below the held pile" is exactly the regression this prevents.
export const ORDER = BUCKETS.map((b) => b.id);

export function rankOf(id) {
  const i = ORDER.indexOf(id);
  return i < 0 ? ORDER.length : i;
}

// What one section shows.
//
// `total` is the REAL total and never the number of rows that happen to be
// loaded. A section that says 702 while holding 25 is telling the truth; one
// that says 25 is lying about the size of the job.
export function sectionView(def, { items = [], total = null, limit = PREVIEW } = {}) {
  const rows = Array.isArray(items) ? items : [];
  const n = Number.isFinite(Number(total)) ? Number(total) : rows.length;
  const preview = rows.slice(0, limit);
  return {
    id: def.id,
    title: def.title,
    blurb: def.blurb,
    view: def.view,
    total: n,
    preview,
    shown: preview.length,
    // Only when there is genuinely more than the preview holds.
    hasMore: n > preview.length,
    remaining: Math.max(0, n - preview.length),
    isEmpty: n === 0,
    // Empty and important: render the section anyway, with a line saying so.
    showWhenEmpty: Boolean(def.alwaysShow),
    emptyText: def.empty,
  };
}

// Should this section be on the screen at all?
export const shouldRender = (s) => !s.isEmpty || s.showWhenEmpty;

// "View all 26". Absent when everything already fits.
export function viewAllLabel(s) {
  return s.hasMore ? `View all ${s.total}` : null;
}

// "Showing 25 of 702", for a bucket page part-way through loading.
//
// Never "all 200" when production holds 702: a page that overstates what it is
// showing turns a partial list into a wrong answer.
export function loadedLabel({ returned = 0, total = 0 } = {}) {
  const t = Number(total) || 0;
  const r = Number(returned) || 0;
  if (!t) return 'Nothing here.';
  if (r >= t) return `${t} in total.`;
  return `Showing ${r} of ${t}.`;
}
