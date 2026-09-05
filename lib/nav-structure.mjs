// The rail's contents, as plain data.
//
// UI Chapter 8: the rail is four places and a drawer. Chapter 1 cut ten
// destinations down to four groups, which was the right direction and not
// far enough — four section headers over ten rows is still ten rows, and
// the verdict on the real screens was "the sidebar is cramped and small".
//
// So: Today, Prospects, Clients and System are the rail. Everything else
// lives behind one collapsed More. Nothing was deleted here either — every
// view still has a rail entry, it is just one disclosure further away, and
// the views that left the rail entirely in Chapter 1 still resolve from
// their old hashes (see OFF_RAIL_VIEWS).
//
// Kept out on purpose: a Conversations entry. It becomes first-class only
// when the conversation-turn branch is deployed and there is a real surface
// behind it. No dead navigation.

export const SECTIONS = ['Work', 'More'];

export const NAV = [
  // ── Work: the four places a day actually happens. ──
  { key: 'journey', label: 'Journey', icon: 'flower', section: 'Work' },
  { key: 'today', label: 'Today', icon: 'sun', section: 'Work' },
  { key: 'prospects', label: 'Prospects', icon: 'flower', section: 'Work', desc: 'The whole pipeline in one place, from raw new finds to finished sequences.' },
  { key: 'clients', label: 'Clients', icon: 'briefcase', section: 'Work' },
  // Chapter 6 turned this page into a control room — health, sending,
  // shadow and held — so it is no longer only health. It is System.
  { key: 'health', label: 'System', icon: 'activity', section: 'Work', desc: 'Is the background work running, waiting, or stuck.' },

  // ── More: real destinations, one disclosure away. Opened when wondering,
  //    not when working.
  //
  //    Chapter 11 gave them sub-groups. Six unlabelled rows behind a
  //    disclosure is a drawer you have to read; four short groups is a
  //    drawer you can scan. `group` is presentation only — every one of
  //    these is still a plain destination. ──
  { key: 'army', label: 'AI helpers', icon: 'hexagon', section: 'More', group: 'Tools', desc: 'One-click AI helpers: find phrases, score leads, draft DMs, weekly report.' },
  { key: 'workspace', label: 'Templates', icon: 'book', section: 'More', group: 'Tools' },
  { key: 'settings', label: 'Settings', icon: 'sliders', section: 'More', group: 'Account' },
  // Help is the one door to all the guides; the Start-here page links the rest.
  { key: 'start', label: 'Help', icon: 'compass', section: 'More', group: 'Help', desc: 'How a morning goes, plus the automation, sourcing, and AI setup guides.' },
  { key: 'stats', label: 'Stats', icon: 'bar-chart', section: 'More', group: 'Admin' },
  { key: 'trash', label: 'Trash', icon: 'trash', section: 'More', group: 'Admin' },
];

// The order the sub-groups appear in inside More. Library holds the custom
// pages ("New page" and "New folder" live there) and sits right after Tools:
// pages are Ary's own content and get opened daily, while Account, Help and
// Admin are housekeeping. Settings above the Library read as exactly that —
// housekeeping shoved above her notebook.
export const MORE_GROUPS = ['Tools', 'Library', 'Account', 'Help', 'Admin'];

// The rail's first group, by key. Exported so a test can assert the shape of
// the rail without re-deriving it from section strings.
export const RAIL_PRIMARY = NAV.filter((t) => t.section === 'Work').map((t) => t.key);

// Views with no rail entry that must still resolve from a hash or saved link.
// (prompts and handsoff already lived off-rail before this chapter; the three
// guides join them, reachable through Help.)
// 'inbox' joined this list in Chapter 2: New finds now lives inside
// Prospects, so Leads has no rail entry of its own, but #leads and the view
// key keep resolving to the same triage screen.
export const OFF_RAIL_VIEWS = ['inbox', 'guide-automation', 'guide-agents', 'guide-sourcing', 'prompts', 'handsoff'];

// Every view key the shell must keep resolving. Chapters 1 and 8 reorganize
// navigation; they do not migrate or delete routes.
export const ALL_VIEWS = [
  ...NAV.map((t) => t.key),
  ...OFF_RAIL_VIEWS,
  'page', // Notion-style pages, addressed as #page:<id>
];
