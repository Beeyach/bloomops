// Customizable sidebar layout. The code defines the built-in tabs and their
// default folders; the user can then collapse folders, drag tabs between and
// within folders, and add their own folders. The result is stored in
// localStorage and reconciled against the code on every load, so new built-in
// tabs always appear and removed ones drop out without corrupting the layout.

// v4: More opens expanded and stays how Ary leaves it. Chapter 11 forced it
// closed on every fresh load; Ary reaches into it daily (the Library lives
// there) and asked for it open. Bumped so stored v3 collapsed states do not
// keep overriding the new default.
export const LAYOUT_KEY = 'ltb_nav_layout_v4';

// Build the default layout (one folder per section, in section order) from
// the NAV table and the ordered SECTIONS list. Work and More start open;
// legacy section names stay listed so an old custom folder still lands
// collapsed.
const START_COLLAPSED = new Set(['Library', 'System', 'Utilities']);

export function buildDefaultLayout(NAV, SECTIONS) {
  return SECTIONS.map((s) => ({
    id: s,
    title: s,
    collapsed: START_COLLAPSED.has(s),
    builtin: true,
    tabs: NAV.filter((t) => t.section === s).map((t) => t.key),
  }));
}

// Folders whose open/closed state is NOT remembered across sessions.
//
// Chapter 11 put More here so it started closed every load. Ary overruled
// that on the real screens — the drawer holds her pages and she opens it
// every session — so the set is empty and every folder remembers how she
// left it. The mechanism stays for any future folder that earns it.
const SESSION_ONLY_OPEN = new Set([]);

// Merge a stored layout with the code's truth. Drops unknown tabs, dedupes,
// re-homes any built-in tab the stored layout is missing, and guarantees
// every built-in folder still exists.
export function reconcile(stored, NAV, SECTIONS) {
  const def = buildDefaultLayout(NAV, SECTIONS);
  const validKeys = new Set(NAV.map((t) => t.key));
  const homeOf = Object.fromEntries(NAV.map((t) => [t.key, t.section]));

  if (!stored || !Array.isArray(stored.sections)) {
    return { sections: def };
  }

  const placed = new Set();
  const sections = stored.sections.map((s) => {
    const tabs = (Array.isArray(s.tabs) ? s.tabs : []).filter((k) => {
      if (!validKeys.has(k) || placed.has(k)) return false;
      placed.add(k);
      return true;
    });
    const id = String(s.id);
    return {
      id,
      title: String(s.title || id),
      // See SESSION_ONLY_OPEN: a stored "open" for More is ignored on load.
      collapsed: SESSION_ONLY_OPEN.has(id) ? true : !!s.collapsed,
      builtin: !!s.builtin,
      tabs,
    };
  });

  // Keep every built-in folder present (append any the user's layout lost).
  // Append EMPTY; the re-home loop below fills it, so tabs are never doubled.
  for (const d of def) {
    if (!sections.find((s) => s.id === d.id)) sections.push({ ...d, tabs: [] });
  }

  // Re-home any valid tab the stored layout never placed.
  for (const t of NAV) {
    if (placed.has(t.key)) continue;
    const home = sections.find((s) => s.id === homeOf[t.key]) || sections[0];
    home.tabs.push(t.key);
    placed.add(t.key);
  }

  return { sections };
}

// Move a tab to a folder, before `beforeKey` (or to the end when null).
// Pure: returns a new sections array.
export function moveTab(sections, key, toSectionId, beforeKey = null) {
  const next = sections.map((s) => ({ ...s, tabs: s.tabs.filter((k) => k !== key) }));
  const target = next.find((s) => s.id === toSectionId);
  if (!target) return sections;
  if (beforeKey == null || beforeKey === key) {
    target.tabs.push(key);
  } else {
    const idx = target.tabs.indexOf(beforeKey);
    if (idx === -1) target.tabs.push(key);
    else target.tabs.splice(idx, 0, key);
  }
  return next;
}

export function toggleCollapsed(sections, sectionId) {
  return sections.map((s) => (s.id === sectionId ? { ...s, collapsed: !s.collapsed } : s));
}

export function renameSection(sections, sectionId, title) {
  const t = String(title || '').trim().slice(0, 40);
  if (!t) return sections;
  return sections.map((s) => (s.id === sectionId ? { ...s, title: t } : s));
}

export function addSection(sections, title, idFactory) {
  const t = String(title || '').trim().slice(0, 40) || 'New folder';
  const id = idFactory ? idFactory() : `custom-${sections.length}-${t.replace(/\W+/g, '').slice(0, 8)}`;
  return [...sections, { id, title: t, collapsed: false, builtin: false, tabs: [] }];
}

// Delete a custom folder; its tabs fall back into the first folder so nothing
// disappears. Built-in folders can't be deleted.
export function deleteSection(sections, sectionId) {
  const target = sections.find((s) => s.id === sectionId);
  if (!target || target.builtin) return sections;
  const orphanTabs = target.tabs;
  const remaining = sections.filter((s) => s.id !== sectionId);
  if (orphanTabs.length && remaining[0]) {
    remaining[0] = { ...remaining[0], tabs: [...remaining[0].tabs, ...orphanTabs] };
  }
  return remaining;
}
