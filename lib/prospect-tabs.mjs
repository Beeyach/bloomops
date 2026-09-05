// The six lists a person can hold in their head.
//
// Prospects used to be filtered by stage, and stage is the database's word for
// where a row sits: Email 1 through Email 5, plus a dozen social ones. Six
// hundred rows sat at "Email 5" and none of them were waiting for anything, so
// the filter that looked most like progress was the one that told you least.
//
// These six are the questions instead. Which pile a person lands in comes from
// viewFor, which reads the canonical action state — so a tab can never disagree
// with the label printed on the row inside it.

import { viewFor, VIEW } from './prospect-action.mjs';
import { cachedActionState } from './prospect-state-cache.mjs';
import { isInternalTest } from './canary.mjs';

// Chapter 8 reordered these by how much they want from you, because "All"
// sitting first and selected meant the page opened on 5,800 rows in no
// particular order — Ary's words were "Prospects page feels random. All by
// default? Where's the urgency?". All is still here; it is just last, where
// a browse-everything list belongs.
export const TABS = [
  {
    id: VIEW.ATTENTION,
    label: 'Needs attention',
    blurb: 'Recoverable problems. None of them are urgent and none of them are broken.',
  },
  {
    id: VIEW.REPLIED,
    label: 'Replied',
    blurb: 'They wrote back. Cold outreach stopped the moment they did.',
  },
  {
    id: VIEW.IN_OUTREACH,
    label: 'In outreach',
    blurb: 'Mid-sequence: a cold email has gone out and another one is scheduled.',
  },
  {
    id: VIEW.NOT_CONTACTED,
    label: 'Not contacted',
    blurb: 'Nothing has gone out to these yet. Most are inventory, not work.',
  },
  {
    id: VIEW.FINISHED,
    label: 'Finished',
    blurb: 'No more automatic cold follow-up. History, not a failure.',
  },
  {
    id: VIEW.ALL,
    label: 'All',
    blurb: 'Everyone, except the internal test row.',
  },
];

// The order the opening list is chosen in: the first of these with anything
// in it is where Prospects lands. Deliberately not the same as TABS order —
// landing on an empty "Needs attention" would be worse than landing on All,
// so this is a preference list and openingTab falls through it.
export const URGENCY_ORDER = [VIEW.ATTENTION, VIEW.REPLIED, VIEW.IN_OUTREACH, VIEW.NOT_CONTACTED, VIEW.ALL];

// Which list to open, given today's counts. Falls all the way through to All,
// which is never empty unless the workspace is.
export function openingTab(counts = {}) {
  for (const id of URGENCY_ORDER) {
    if ((counts[id] || 0) > 0) return id;
  }
  return VIEW.ALL;
}

// One pass over the list: the state for every prospect, and which tab it is in.
//
// Computed once and handed around, because prospectActionState runs the whole
// schedule and doing that four times per row on a 5,800-row list is how a
// filter click starts costing a second.
export function classify(prospects = [], { now = new Date() } = {}) {
  const byId = new Map();
  for (const p of prospects) {
    const state = cachedActionState(p, { now });
    byId.set(p.id, { state, view: viewFor(state), internal: isInternalTest(p) });
  }
  return byId;
}

// `includeInternal` is on only while somebody is searching, which is the one
// case where the test row is allowed on screen. Without it the tabs read "All
// 0" above a visible row, which is the same lie in the other direction.
export function tabCounts(prospects = [], classified, { includeInternal = false } = {}) {
  const counts = Object.fromEntries(TABS.map((t) => [t.id, 0]));
  for (const p of prospects) {
    const c = classified.get(p.id);
    if (!c) continue;
    if (c.internal && !includeInternal) continue;
    counts[VIEW.ALL] += 1;
    if (!c.internal && counts[c.view] !== undefined) counts[c.view] += 1;
  }
  return counts;
}

export function inTab(prospect, classified, tab) {
  const c = classified.get(prospect?.id);
  if (!c) return false;
  // The test row is in no list, including All, so no count on the screen is one
  // higher than the work actually is. It is not deleted and it is not hidden:
  // searching for it finds it (see ProspectsApp), and opening it says on its
  // face that it is internal.
  if (c.internal) return false;
  if (tab === VIEW.ALL) return true;
  return c.view === tab;
}

// The action states actually present in a set of rows, largest first.
//
// Secondary UI on purpose. These are the useful filters — "Email 2 due",
// "Needs email address" — and they are built from the rows rather than from a
// hardcoded list, so a state that stops existing stops being offered.
export function actionFilters(prospects = [], classified) {
  const counts = new Map();
  for (const p of prospects) {
    const c = classified.get(p.id);
    if (!c || c.internal) continue;
    counts.set(c.state.label, (counts.get(c.state.label) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
