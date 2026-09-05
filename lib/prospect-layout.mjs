// Which view a Prospects tab opens in.
//
// Chapter 11: "Prospects still feels spreadsheet-first". It was, in a
// specific way — one saved preference covered all seven tabs, so opening the
// spreadsheet once to edit forty cells meant Needs attention opened as a
// spreadsheet too, for ever. The two tabs answer different questions and they
// should not share an answer.
//
// So the default is per tab: the urgency tabs open as a list, because their
// question is "what is happening with these people"; All opens as a table,
// because its question is "let me look at everything". A deliberate choice is
// remembered PER TAB, so choosing the spreadsheet inside All never changes
// what Needs attention does.

import { VIEW } from './prospect-action.mjs';

export const LAYOUT = { LIST: 'list', TABLE: 'table' };

// The tabs whose job is acting rather than browsing. Kept as vocabulary;
// they no longer change the default.
export const URGENCY_TABS = [VIEW.ATTENTION, VIEW.REPLIED, VIEW.IN_OUTREACH];

// Every tab opens as the table. Chapter 11 made the urgency tabs open as a
// list and Ary overruled it on the real screens: "Table is the default
// instead of List in Prospects." A deliberate List choice is still
// remembered per tab below.
export const defaultLayoutFor = () => LAYOUT.TABLE;

// v3: table became the default for every tab (Ary's call). Bumped so list
// choices accumulated under the old list-first defaults start clean; a
// deliberate choice made from here on persists per tab as before.
export const LAYOUT_KEY = 'ltb_prospect_layout_v3';

const VALID = new Set([LAYOUT.LIST, LAYOUT.TABLE]);

// The stored shape is { [tab]: 'list' | 'table' } and anything else is
// ignored — a corrupted or older blob falls back to the defaults rather than
// leaving the screen in a mode nobody picked.
export function readLayouts(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw || '{}');
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out = {};
  for (const [tab, value] of Object.entries(parsed)) {
    if (VALID.has(value)) out[tab] = value;
  }
  return out;
}

export function layoutFor(tab, remembered = {}) {
  const saved = remembered && remembered[tab];
  return VALID.has(saved) ? saved : defaultLayoutFor(tab);
}
