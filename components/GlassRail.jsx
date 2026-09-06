'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VERSION, versionLine } from '@/lib/version.mjs';
import useTheme from './useTheme';
import EmojiPicker from './EmojiPicker';
import { buildPageTree, ancestorsOf } from '../lib/page-tree.mjs';
import { promptDialog } from '../lib/dialog.mjs';
import { NAV, SECTIONS, MORE_GROUPS } from '../lib/nav-structure.mjs';
import {
  LAYOUT_KEY,
  buildDefaultLayout,
  reconcile,
  moveTab,
  toggleCollapsed,
  renameSection,
  addSection,
  deleteSection,
} from '../lib/nav-layout.mjs';

// Nav shell. Desktop: sticky sidebar with Notion-style sections (Chapter 8:
// Work / More — the table itself lives in lib/nav-structure.mjs), emoji
// icons, custom pages, collapsible to an icons-only rail. Mobile: fixed
// bottom tab bar (first four views + More).
// Pure presentation — navigation state lives in ProspectsApp.
export { NAV, SECTIONS } from '../lib/nav-structure.mjs';

// Line icons (lucide-style, stroke = currentColor) — the emoji rail read
// as a toy next to tools like Apify; SVG strokes read as a product. User
// pages keep their chosen emoji (that's their data, Notion-style).
const NAV_ICON_PATHS = {
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>,
  flower: <><circle cx="12" cy="12" r="2.6" /><circle cx="12" cy="6.2" r="2.8" /><circle cx="12" cy="17.8" r="2.8" /><circle cx="6.2" cy="12" r="2.8" /><circle cx="17.8" cy="12" r="2.8" /></>,
  inbox: <><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></>,
  briefcase: <><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></>,
  'bar-chart': <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
  hexagon: <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>,
  sparkle: <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" />,
  bot: <><rect x="3" y="11" width="18" height="10" rx="2" /><circle cx="12" cy="5" r="2" /><path d="M12 7v4" /><line x1="8" y1="16" x2="8" y2="16" /><line x1="16" y1="16" x2="16" y2="16" /></>,
  book: <><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></>,
  plug: <><path d="M12 22v-4" /><path d="M9 8V2M15 8V2" /><path d="M18 8H6v5a6 6 0 0 0 12 0z" /></>,
  globe: <><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></>,
  compass: <><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></>,
  activity: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />,
  sliders: <><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></>,
  trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  search: <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>,
  file: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z" /><path d="M14 2v5h5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>,
  moon: <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  pencil: <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
};

// A page's sidebar glyph: the user's chosen emoji (their data), or the
// neutral file stroke when they haven't picked one.
function PageGlyph({ emoji, className = '' }) {
  if (emoji) {
    return <span className={`ui-heading leading-none ${className}`} aria-hidden="true">{emoji}</span>;
  }
  return (
    <span className={`inline-flex ${className}`} aria-hidden="true">
      <NavIcon name="file" className="w-[15px] h-[15px]" />
    </span>
  );
}

function NavIcon({ name, className = 'w-[17px] h-[17px]' }) {
  const paths = NAV_ICON_PATHS[name];
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${className} shrink-0`}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

// Fast lookup from a tab key back to its {emoji, label} for rendering a
// layout that stores only keys.
const NAV_BY_KEY = Object.fromEntries(NAV.map((t) => [t.key, t]));

// Inside More, rows are grouped, so they are drawn in group order rather than
// in whatever order a stored layout happens to hold. Sorting at render rather
// than rewriting the saved layout: dragging still works, and nobody's custom
// folders are thrown away to get a tidy drawer. Every other section keeps its
// own order exactly.
const MORE_RANK = Object.fromEntries(MORE_GROUPS.map((g, i) => [g, i]));
function orderedTabs(sec) {
  if (sec.id !== 'More') return sec.tabs;
  return [...sec.tabs].sort((a, b) => {
    const ra = MORE_RANK[NAV_BY_KEY[a]?.group] ?? 99;
    const rb = MORE_RANK[NAV_BY_KEY[b]?.group] ?? 99;
    return ra - rb;
  });
}

// The mobile bottom bar: the Work views plus More, which opens a sheet with
// the rest. Chapter 8's Work group is Today / Prospects / Clients / System.
const MOBILE_PRIMARY_COUNT = 4;

function Badge({ count }) {
  if (!count) return null;
  return (
    <span className="bg-rose-btn text-white r-sm px-2 py-px ui-meta">{count}</span>
  );
}

function RowButton({ active, collapsed, onClick, icon, emoji, label, badge, badgeCount, title }) {
  return (
    <button
      onClick={onClick}
      title={title || label}
      className={`flex items-center r-md transition relative w-full ${
        collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-3 py-2'
      } ${active ? 'text-rose-text bg-rose-tint font-semibold' : 'hover:bg-hover-wash-soft'}`}
      style={active ? undefined : { color: 'var(--nav-ink)' }}
    >
      {icon ? (
        <NavIcon name={icon} className={'w-[19px] h-[19px] ' + (active ? '' : 'opacity-80')} />
      ) : (
        <span className="ui-heading leading-none w-[18px] text-center shrink-0" aria-hidden="true">{emoji}</span>
      )}
      {!collapsed && <span className="flex-1 text-left truncate ui-body font-semibold">{label}</span>}
      {!collapsed && badge}
      {/* badge is a <Badge> ELEMENT, so the old `typeof badge === 'object'
          ? '' : badge` always rendered an empty dot — the count vanished the
          moment the rail collapsed. The raw number rides in badgeCount. */}
      {collapsed && badge ? (
        <span className="absolute top-0 right-1 bg-rose-btn text-white rounded-full min-w-[14px] h-[14px] px-0.5 ui-meta leading-[14px]">{badgeCount || ''}</span>
      ) : null}
    </button>
  );
}

// A page in the sidebar. Same look as a nav row, but on hover it reveals a
// "⋯" button that opens Change icon / Rename / Delete. Rename happens inline.
// The sidebar page tree. Rendered from the flat list by buildPageTree, which
// guarantees a page always appears somewhere even if its parent was trashed
// or the parent chain loops.
function PageTree({ nodes, depth, activePageId, view, expanded, onToggle, onSelectPage, setPageEmoji, renamePage, onDeletePage, onNewPage }) {
  return nodes.map((n) => {
    const hasKids = n.children.length > 0;
    const open = expanded.has(n.id);
    return (
      <div key={n.id}>
        <PageRow
          page={n}
          depth={depth}
          hasKids={hasKids}
          open={open}
          onToggle={() => onToggle(n.id)}
          active={view === 'page' && activePageId === n.id}
          collapsed={false}
          onSelect={() => onSelectPage && onSelectPage(n.id)}
          onSetEmoji={setPageEmoji}
          onRename={renamePage}
          onDelete={(pg) => onDeletePage && onDeletePage(pg)}
          onAddSub={(parentId) => onNewPage && onNewPage(parentId)}
          onDuplicate={(pg) => onDuplicatePage && onDuplicatePage(pg)}
        />
        {hasKids && open && (
          <PageTree
            nodes={n.children}
            depth={depth + 1}
            activePageId={activePageId}
            view={view}
            expanded={expanded}
            onToggle={onToggle}
            onSelectPage={onSelectPage}
            setPageEmoji={setPageEmoji}
            renamePage={renamePage}
            onDeletePage={onDeletePage}
            onNewPage={onNewPage}
          />
        )}
      </div>
    );
  });
}

function PageRow({ page, active, collapsed, onSelect, onSetEmoji, onRename, onDelete, onAddSub, onDuplicate, depth = 0, hasKids = false, open = false, onToggle }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(page.title);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  function commitRename() {
    const t = draft.trim();
    setRenaming(false);
    if (t && t !== page.title) onRename(page.id, t);
    else setDraft(page.title);
  }

  if (collapsed) {
    return (
      <button
        onClick={onSelect}
        title={page.title}
        className={`flex items-center justify-center r-md px-0 py-2 w-full transition ${
          active ? 'text-rose-text bg-rose-tint' : 'text-ink-2 hover:bg-hover-wash-soft'
        }`}
      >
        <PageGlyph emoji={page.emoji} />
      </button>
    );
  }

  return (
    <div className={`group/pg relative flex items-center r-md transition ${
      active ? 'bg-rose-tint' : 'hover:bg-hover-wash-soft'
    }`}>
      {/* Depth shows as indentation, and the chevron only exists when there
          is something underneath. An arrow that does nothing reads broken. */}
      <span style={{ width: depth * 12 }} className="shrink-0" aria-hidden="true" />
      <button
        onClick={(e) => { e.stopPropagation(); if (hasKids && onToggle) onToggle(); }}
        aria-label={hasKids ? (open ? 'Collapse subpages' : 'Expand subpages') : undefined}
        aria-expanded={hasKids ? open : undefined}
        className={'w-4 shrink-0 text-ink-3 hover:text-ink transition ' + (hasKids ? '' : 'pointer-events-none opacity-0')}
      >
        <span className="ui-meta leading-none inline-block">{open ? '▾' : '▸'}</span>
      </button>
      <div className="relative shrink-0">
        <button
          onClick={() => setEmojiOpen((v) => !v)}
          title="Change icon"
          className="pl-1 pr-1 py-2 ui-heading leading-none inline-flex items-center"
          aria-label="Change page icon"
        >
          <PageGlyph emoji={page.emoji} />
        </button>
        {emojiOpen && (
          <EmojiPicker
            value={page.emoji}
            onPick={(e) => { setEmojiOpen(false); onSetEmoji(page.id, e); }}
            onClose={() => setEmojiOpen(false)}
          />
        )}
      </div>
      {renaming ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') { setDraft(page.title); setRenaming(false); } }}
          className="flex-1 min-w-0 bg-input border border-line r-sm px-1.5 py-0.5 mr-1 ui-body text-ink focus:outline-none focus:border-rose"
        />
      ) : (
        <button
          onClick={onSelect}
          className={`flex-1 min-w-0 text-left truncate py-2 pr-1 font-sans ui-body ${active ? 'text-rose-text' : 'text-ink-2'}`}
        >
          {page.title}
        </button>
      )}
      <div ref={menuRef} className="relative shrink-0">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className={`w-6 h-7 mr-1 r-sm flex items-center justify-center text-ink-3 hover:text-ink hover:bg-hover-wash transition ${
            menuOpen ? 'opacity-100' : 'opacity-0 group-hover/pg:opacity-100 focus:opacity-100'
          }`}
          aria-label="Page options"
        >
          <span className="ui-heading leading-none">⋯</span>
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-50 mt-0.5 w-[150px] r-lg border border-line bg-panel shadow-card py-1">
            <button
              onClick={() => { setMenuOpen(false); if (onAddSub) onAddSub(page.id); }}
              className="w-full text-left px-3 py-1.5 ui-body text-ink-2 hover:bg-hover-wash-soft transition"
            >
              Add subpage
            </button>
            <button
              onClick={() => { setMenuOpen(false); if (onDuplicate) onDuplicate(page); }}
              className="w-full text-left px-3 py-1.5 ui-body text-ink-2 hover:bg-hover-wash-soft transition"
            >
              Duplicate
            </button>
            <button
              onClick={() => { setMenuOpen(false); setEmojiOpen(true); }}
              className="w-full text-left px-3 py-1.5 ui-body text-ink-2 hover:bg-hover-wash-soft transition"
            >
              Change icon
            </button>
            <button
              onClick={() => { setMenuOpen(false); setDraft(page.title); setRenaming(true); }}
              className="w-full text-left px-3 py-1.5 ui-body text-ink-2 hover:bg-hover-wash-soft transition"
            >
              Rename
            </button>
            <button
              onClick={() => { setMenuOpen(false); onDelete(page); }}
              className="w-full text-left px-3 py-1.5 ui-body text-poppy-text hover:bg-hover-wash-soft transition"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function GlassRail({
  view, setView, newLeadCount, clocks,
  pages = [], activePageId = null, onSelectPage, onNewPage, onPatchPage, onDeletePage, onDuplicatePage,
  prospects = [], onOpenProspect,
}) {
  const [moreOpen, setMoreOpen] = useState(false);
  // Which branches are open in the sidebar tree.
  const [expandedPages, setExpandedPages] = useState(() => new Set());
  const pageTree = useMemo(() => buildPageTree(pages), [pages]);
  const togglePageOpen = useCallback((id) => {
    setExpandedPages((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  // Opening a page opens the branches above it. Otherwise selecting a
  // subpage leaves the sidebar showing no sign of where you are.
  useEffect(() => {
    if (!activePageId) return;
    const chain = ancestorsOf(activePageId, pages);
    if (!chain.length) return;
    setExpandedPages((prev) => {
      const next = new Set(prev);
      let added = false;
      for (const a of chain) if (!next.has(a.id)) { next.add(a.id); added = true; }
      return added ? next : prev;
    });
  }, [activePageId, pages]);
  // Admin-only tabs disappear entirely for regular workspaces.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch('/api/limits')
      .then((r) => r.json())
      .then((d) => { if (alive) setIsAdmin(Boolean(d?.isAdmin)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const navHidden = (t) => t.adminOnly && !isAdmin;
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    if (searchOpen && searchRef.current) searchRef.current.focus();
  }, [searchOpen]);

  // Search across nav tabs, page titles, AND prospects. This is a CRM —
  // "Search" that can't find a person is a broken promise. Empty query =
  // show everything in its normal sections; a query flattens to matches.
  const q = query.trim().toLowerCase();
  const searchHits = useMemo(() => {
    if (!q) return null;
    const navHits = NAV.filter((t) => !navHidden(t) && t.label.toLowerCase().includes(q))
      .map((t) => ({ kind: 'nav', key: t.key, icon: t.icon, label: t.label }));
    const pageHits = pages.filter((p) => (p.title || '').toLowerCase().includes(q))
      .map((p) => ({ kind: 'page', page: p, emoji: p.emoji || null, icon: p.emoji ? null : 'file', label: p.title }));
    const prospectHits = q.length < 2 ? [] : prospects
      .filter((p) =>
        [p.name, p.business_name, p.email]
          .some((f) => (f || '').toLowerCase().includes(q))
      )
      .slice(0, 8)
      .map((p) => ({
        kind: 'prospect',
        prospect: p,
        icon: 'user',
        label: [p.name, p.business_name].filter(Boolean).join(' · ') || p.email || 'Unnamed',
      }));
    return [...navHits, ...pageHits, ...prospectHits];
  }, [q, pages, prospects]);

  function setPageEmoji(id, emoji) { if (onPatchPage) onPatchPage(id, { emoji }); }
  function renamePage(id, title) { if (onPatchPage) onPatchPage(id, { title }); }

  // Customizable folder layout. Server + first client render use the code
  // default (so hydration matches); the stored layout is revealed on mount.
  const [sections, setSections] = useState(() => buildDefaultLayout(NAV, SECTIONS));
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      const stored = raw ? JSON.parse(raw) : null;
      setSections(reconcile(stored, NAV, SECTIONS).sections);
    } catch {
      setSections(buildDefaultLayout(NAV, SECTIONS));
    }
  }, []);
  function commitLayout(next) {
    setSections(next);
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify({ sections: next })); } catch {}
  }

  // Drag state for reordering / moving tabs between folders. Refs hold the
  // source of truth (read synchronously during drag events, which can fire
  // faster than React re-renders); state mirrors them only for the visuals.
  const dragKeyRef = useRef(null);
  const dropHintRef = useRef(null);
  const [dragKey, setDragKey] = useState(null);
  const [dropHint, setDropHint] = useState(null); // { sectionId, beforeKey|null }
  function beginDrag(key) { dragKeyRef.current = key; setDragKey(key); }
  function setHint(h) { dropHintRef.current = h; setDropHint(h); }
  function clearDrag() { dragKeyRef.current = null; dropHintRef.current = null; setDragKey(null); setDropHint(null); }
  function onTabDrop() {
    const k = dragKeyRef.current;
    const h = dropHintRef.current;
    if (k && h) commitLayout(moveTab(sections, k, h.sectionId, h.beforeKey));
    clearDrag();
  }
  async function addFolder() {
    const title = await promptDialog({ title: 'New folder', placeholder: 'Folder name', confirmLabel: 'Create' });
    if (title && title.trim()) commitLayout(addSection(sections, title, () => `custom-${Date.now().toString(36)}`));
  }
  // Collapsed = icons-only rail with just the flower mark. Default expanded
  // so hydration matches the server; the stored preference is revealed on
  // mount (same pattern as useTheme).
  const [collapsed, setCollapsed] = useState(false);
  // Expanded-mode width, drag-resizable. Default 230 so hydration matches;
  // the stored value is revealed on mount.
  const SIDEBAR_MIN = 190;
  const SIDEBAR_MAX = 420;
  const [sidebarWidth, setSidebarWidth] = useState(230);
  useEffect(() => {
    try {
      if (localStorage.getItem('ltb_sidebar') === 'collapsed') setCollapsed(true);
      const w = parseInt(localStorage.getItem('ltb_sidebar_w') || '', 10);
      if (w >= SIDEBAR_MIN && w <= SIDEBAR_MAX) setSidebarWidth(w);
    } catch (e) {}
  }, []);
  function startSidebarResize(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    let latest = startW; // closure holds the final width, render-timing-proof
    function onMove(ev) {
      latest = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, startW + (ev.clientX - startX)));
      setSidebarWidth(latest);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try { localStorage.setItem('ltb_sidebar_w', String(latest)); } catch (e) {}
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }
  function toggleRail() {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('ltb_sidebar', next ? 'collapsed' : 'expanded'); } catch (e) {}
      return next;
    });
  }
  const { theme, toggle } = useTheme();

  // The Library: the page tree and New page, rendered inside More at the
  // MORE_GROUPS position rather than hardcoded last — Settings sitting above
  // Ary's own pages was the bug this fixes.
  const libraryBlock = (
    <>
      <div className="mt-2 first:mt-0 mb-1 px-3 ui-meta font-bold uppercase tracking-[0.08em] text-ink-3">Library</div>
      <PageTree
        nodes={pageTree}
        depth={0}
        activePageId={activePageId}
        view={view}
        expanded={expandedPages}
        onToggle={togglePageOpen}
        onSelectPage={onSelectPage}
        setPageEmoji={setPageEmoji}
        renamePage={renamePage}
        onDeletePage={onDeletePage}
        onNewPage={onNewPage}
      />
      <button
        onClick={() => onNewPage && onNewPage()}
        className="flex items-center r-md text-ink-3 hover:bg-hover-wash-soft hover:text-ink-2 transition w-full gap-2.5 px-3 py-1.5"
      >
        <span className="w-[18px] inline-flex justify-center shrink-0" aria-hidden="true"><NavIcon name="plus" className="w-[14px] h-[14px]" /></span>
        <span className="font-sans ui-body">New page</span>
      </button>
    </>
  );

  return (
    <>
      {/* Desktop sidebar */}
      {/* Flat, flush sidebar (Editorial Botanical shell): solid panel, full
          height, a hairline right border — not the old floating glass rail. */}
      <aside
        style={{ width: collapsed ? 68 : sidebarWidth }}
        className={`relative hidden md:flex shrink-0 md:flex-col md:sticky md:top-0 md:h-screen overflow-y-auto slim-scroll bg-panel border-r border-line ${
          collapsed ? 'p-3 items-center' : 'px-4 pt-[22px] pb-4'
        }`}
      >
        {!collapsed && (
          // Fixed, not absolute: the rail scrolls, and an absolute strip
          // scrolled away with it — grab the edge below the fold and there
          // was nothing to grab. Fixed to the viewport it spans the whole
          // visible edge whatever the rail's scroll position.
          <div
            onMouseDown={startSidebarResize}
            title="Drag to resize the sidebar"
            style={{ left: sidebarWidth - 8 }}
            className="group/sb hidden md:flex justify-end fixed top-0 h-screen w-2 cursor-col-resize z-20 select-none"
          >
            <div className="w-px h-full bg-line-strong group-hover/sb:bg-rose group-hover/sb:w-[2px] transition-[width,background-color] duration-150 ease-[cubic-bezier(0.22,0.61,0.36,1)]" />
          </div>
        )}
        <div className={`flex items-center mb-1 shrink-0 ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
          <svg viewBox="0 0 32 32" aria-hidden="true" className="w-[30px] h-[30px] shrink-0">
            <g fill="var(--rose)">
              <circle cx="16" cy="8.5" r="6" /><circle cx="23.5" cy="13.5" r="6" />
              <circle cx="20.5" cy="22" r="6" /><circle cx="11.5" cy="22" r="6" />
              <circle cx="8.5" cy="13.5" r="6" />
            </g>
            <circle cx="16" cy="15.5" r="4.4" fill="var(--surface)" />
          </svg>
          {!collapsed && (
            <div className="font-logo ui-display leading-none text-bright">
              Leads <em className="italic text-rose-text">that</em> Bloom
            </div>
          )}
        </div>
        <div className={collapsed ? 'mb-2' : 'mb-3'} />

        {/* Collapsible search: an icon when closed, an input when open. */}
        <div className="shrink-0 mb-2">
          {collapsed ? (
            <button
              onClick={() => { setCollapsed(false); setSearchOpen(true); }}
              title="Search"
              className="w-full flex items-center justify-center py-2 r-md text-ink-3 hover:bg-hover-wash-soft hover:text-ink-2 transition"
            >
              <NavIcon name="search" className="w-[16px] h-[16px]" />
            </button>
          ) : searchOpen || q ? (
            <div className="flex items-center gap-1.5 bg-input border border-line r-md px-2.5 py-1.5">
              <span className="text-ink-3"><NavIcon name="search" className="w-[14px] h-[14px]" /></span>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); setSearchOpen(false); } }}
                placeholder="Search prospects, tabs, pages"
                className="flex-1 min-w-0 bg-transparent ui-body text-ink placeholder:text-ink-3 focus:outline-none"
              />
              <button
                onClick={() => { setQuery(''); setSearchOpen(false); }}
                aria-label="Close search"
                className="text-ink-3 hover:text-ink inline-flex items-center"
              >
                <NavIcon name="x" className="w-[13px] h-[13px]" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 r-md text-ink-3 hover:bg-hover-wash-soft hover:text-ink-2 transition"
            >
              <NavIcon name="search" className="w-[16px] h-[16px]" />
              <span className="ui-body font-medium">Search</span>
            </button>
          )}
        </div>

        {searchHits ? (
          <div className="flex flex-col gap-0.5">
            {searchHits.length === 0 ? (
              <div className="px-3 py-2 ui-small text-ink-3">Nothing matches "{query}".</div>
            ) : (
              searchHits.map((h) =>
                h.kind === 'nav' ? (
                  <RowButton
                    key={'nav-' + h.key}
                    active={view === h.key}
                    collapsed={false}
                    onClick={() => { setView(h.key); setQuery(''); setSearchOpen(false); }}
                    icon={h.icon}
                    emoji={h.emoji}
                    label={h.label}
                  />
                ) : h.kind === 'page' ? (
                  <RowButton
                    key={'page-' + h.page.id}
                    active={view === 'page' && activePageId === h.page.id}
                    collapsed={false}
                    onClick={() => { onSelectPage && onSelectPage(h.page.id); setQuery(''); setSearchOpen(false); }}
                    icon={h.icon}
                    emoji={h.emoji}
                    label={h.label}
                    title={h.label}
                  />
                ) : (
                  <RowButton
                    key={'prospect-' + h.prospect.id}
                    active={false}
                    collapsed={false}
                    onClick={() => { onOpenProspect && onOpenProspect(h.prospect); setQuery(''); setSearchOpen(false); }}
                    icon={h.icon}
                    label={h.label}
                    title={h.label}
                  />
                )
              )
            )}
          </div>
        ) : (
        collapsed ? (
          // Icons-only rail: flatten folders, no headers/drag/collapse.
          <div className="flex flex-col w-full items-stretch gap-0.5">
            {sections.flatMap((sec) => [
              ...sec.tabs.map((key) => {
                const t = NAV_BY_KEY[key];
                if (!t || navHidden(t)) return null;
                return (
                  <RowButton
                    key={key}
                    active={view === key}
                    collapsed
                    onClick={() => setView(key)}
                    icon={t.icon}
                    label={t.label}
                    title={t.desc}
                    badge={key === 'inbox' && newLeadCount > 0 ? <Badge count={newLeadCount} /> : null}
                    badgeCount={key === 'inbox' ? newLeadCount : 0}
                  />
                );
              }),
              // Same dead branch as below: Library became More in
              // Chapter 8, so the icons-only rail stopped showing pages too.
              ...(sec.id === 'More'
                ? pages.map((p) => (
                    <PageRow
                      key={p.id}
                      page={p}
                      active={view === 'page' && activePageId === p.id}
                      collapsed
                      onSelect={() => onSelectPage && onSelectPage(p.id)}
                      onSetEmoji={setPageEmoji}
                      onRename={renamePage}
                      onDelete={(pg) => onDeletePage && onDeletePage(pg)}
                    />
                  ))
                : []),
            ])}
          </div>
        ) : (
        <div className="flex flex-col gap-0.5">
          {sections.map((sec) => (
            <div key={sec.id} className="mb-2">
              <div className="group/hd flex items-center gap-1 px-1.5 mb-1 mt-1">
                <button
                  onClick={() => commitLayout(toggleCollapsed(sections, sec.id))}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left ui-small font-semibold text-ink-2 hover:text-ink transition py-1.5"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-[10px] h-[10px] shrink-0 transition-transform ${sec.collapsed ? '-rotate-90' : ''}`} aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                  <span className="truncate">{sec.title}</span>
                </button>
                {!sec.builtin && (
                  <>
                    <button
                      onClick={async () => { const t = await promptDialog({ title: 'Rename folder', defaultValue: sec.title, confirmLabel: 'Rename' }); if (t && t.trim()) commitLayout(renameSection(sections, sec.id, t)); }}
                      aria-label="Rename folder"
                      className="opacity-0 group-hover/hd:opacity-100 text-ink-3 hover:text-ink transition px-0.5 inline-flex items-center"
                    ><NavIcon name="pencil" className="w-[11px] h-[11px]" /></button>
                    <button
                      onClick={() => commitLayout(deleteSection(sections, sec.id))}
                      aria-label="Delete folder"
                      className="opacity-0 group-hover/hd:opacity-100 text-ink-3 hover:text-poppy-text transition px-0.5 inline-flex items-center"
                    ><NavIcon name="x" className="w-[11px] h-[11px]" /></button>
                  </>
                )}
              </div>
              {!sec.collapsed && (
                <div
                  onDragOver={(e) => { if (dragKeyRef.current) { e.preventDefault(); setHint({ sectionId: sec.id, beforeKey: null }); } }}
                  onDrop={(e) => { e.preventDefault(); onTabDrop(); }}
                  className="flex flex-col gap-0.5 min-h-[4px]"
                >
                  {orderedTabs(sec).map((key, i, ordered) => {
                    const t = NAV_BY_KEY[key];
                    // Chapter 11: inside More, a small label whenever the
                    // group changes. Six unlabelled rows behind a disclosure
                    // is a drawer you have to read; four short groups is one
                    // you can scan. Ordering comes from the NAV table, so a
                    // group's label appears exactly once, above its first row.
                    const prev = i > 0 ? NAV_BY_KEY[ordered[i - 1]] : null;
                    const groupLabel = sec.id === 'More' && t?.group && t.group !== prev?.group
                      ? t.group : null;
                    if (!t || navHidden(t)) return null;
                    // The Library slots in at its MORE_GROUPS rank: right
                    // before the first visible row of the first group ranked
                    // after it.
                    const libraryHere = sec.id === 'More'
                      && key === ordered.find((k) => (MORE_RANK[NAV_BY_KEY[k]?.group] ?? 99) > MORE_RANK.Library && !navHidden(NAV_BY_KEY[k]));
                    const hinted = dragKey && dropHint && dropHint.sectionId === sec.id && dropHint.beforeKey === key;
                    return (
                      <div key={`g:${key}`}>
                      {libraryHere && libraryBlock}
                      {groupLabel && (
                        <div className="mt-2 first:mt-0 mb-1 px-3 ui-meta font-bold uppercase tracking-[0.08em] text-ink-3">
                          {groupLabel}
                        </div>
                      )}
                      <div
                        key={key}
                        draggable
                        onDragStart={() => beginDrag(key)}
                        onDragOver={(e) => { if (dragKeyRef.current) { e.preventDefault(); e.stopPropagation(); setHint({ sectionId: sec.id, beforeKey: key }); } }}
                        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onTabDrop(); }}
                        onDragEnd={clearDrag}
                        className={`r-md ${hinted ? 'ltb-drop-before' : ''} ${dragKey === key ? 'opacity-40' : ''}`}
                      >
                        <div className={t.child ? 'pl-5' : ''}>
                        <RowButton
                          active={view === key}
                          collapsed={false}
                          onClick={() => setView(key)}
                          icon={t.icon}
                          label={t.label}
                          badge={key === 'inbox' && newLeadCount > 0 ? <Badge count={newLeadCount} /> : null}
                    badgeCount={key === 'inbox' ? newLeadCount : 0}
                        />
                        </div>
                      </div>
                      </div>
                    );
                  })}
                  {/* Fallback only: when every group ranked after Library is
                      hidden (a non-admin with Help collapsed away), the pages
                      still render at the end rather than nowhere. */}
                  {sec.id === 'More'
                    && !orderedTabs(sec).some((k) => (MORE_RANK[NAV_BY_KEY[k]?.group] ?? 99) > MORE_RANK.Library && !navHidden(NAV_BY_KEY[k]))
                    && libraryBlock}
                </div>
              )}
            </div>
          ))}
          {/* New folder is a Library control, so it only appears when the
              drawer holding the Library is open. It sat permanently at the
              bottom of the rail offering to organise pages that were not
              being shown. */}
          {sections.some((sec) => sec.id === 'More' && !sec.collapsed) && (
            <button
              onClick={addFolder}
              className="flex items-center gap-2.5 px-3 py-1.5 mt-1 r-md text-ink-3 hover:bg-hover-wash-soft hover:text-ink-2 transition w-full"
            >
              <span className="w-[18px] inline-flex justify-center" aria-hidden="true"><NavIcon name="plus" className="w-[13px] h-[13px]" /></span>
              <span className="font-sans ui-small">New folder</span>
            </button>
          )}
        </div>
        )
        )}

        {/* Utilities are icons, not menu rows. They don't compete with nav. */}
        <div className={`mt-auto pb-2 shrink-0 flex items-center gap-1 ${collapsed ? 'w-full flex-col' : ''}`}>
          <button
            onClick={toggle}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-8 h-8 r-md flex items-center justify-center text-ink-3 hover:text-ink-2 hover:bg-hover-wash-soft transition"
          >
            <NavIcon name={theme === 'dark' ? 'sun' : 'moon'} className="w-[15px] h-[15px]" />
          </button>
          <button
            onClick={toggleRail}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className="w-8 h-8 r-md flex items-center justify-center text-ink-3 hover:text-ink-2 hover:bg-hover-wash-soft transition"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[15px] h-[15px]" aria-hidden="true">
              {collapsed ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}
            </svg>
          </button>
        </div>
        {!collapsed && (
          <div className="border-t border-line pt-3 min-h-0 shrink-0">
            {clocks}
            {/* Two calm lines instead of three things fighting for one. The
                nowraps matter: without them the row used to fold and strand
                the flower icon next to the version number. */}
            <div className="flex items-center justify-between gap-3 mt-2">
              <a
                href="https://bloomwired.io"
                target="_blank"
                rel="noreferrer"
                className="ui-meta text-ink-3 hover:text-rose-text transition whitespace-nowrap"
              >
                <span className="inline-flex items-center gap-1">
                  Powered by Bloomwired
                  <NavIcon name="flower" className="w-[11px] h-[11px]" />
                </span>
              </a>
              <button
                onClick={async () => {
                  try {
                    await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
                  } catch {}
                  window.location.href = '/sign-in';
                }}
                className="ui-meta text-ink-3 hover:text-rose-text transition whitespace-nowrap"
              >
                Log out
              </button>
            </div>
            <VersionBadge />
          </div>
        )}
      </aside>

      {/* Mobile bottom tab bar: first four views + More */}
      {moreOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setMoreOpen(false)}
          aria-hidden="true"
        />
      )}
      {moreOpen && (
        <div className="md:hidden fixed bottom-[calc(54px+env(safe-area-inset-bottom))] left-0 right-0 z-40 bg-panel border-t border-line p-2 max-h-[50vh] overflow-y-auto">
          {NAV.slice(MOBILE_PRIMARY_COUNT).filter((t) => !navHidden(t)).map((t) => (
            <button
              key={t.key}
              onClick={() => { setView(t.key); setMoreOpen(false); }}
              className={`flex items-center gap-2.5 px-3 py-2.5 w-full r-md ui-body font-medium min-h-[48px] transition ${
                view === t.key ? 'text-rose-text bg-rose-tint' : 'text-ink'
              }`}
            >
              <NavIcon name={t.icon} className="w-[18px] h-[18px]" />
              {t.label}
            </button>
          ))}
          {pages.map((p) => (
            <button
              key={p.id}
              onClick={() => { if (onSelectPage) onSelectPage(p.id); setMoreOpen(false); }}
              className={`flex items-center gap-2.5 px-3 py-2.5 w-full r-md font-sans ui-body min-h-[48px] transition ${
                view === 'page' && activePageId === p.id ? 'text-rose-text bg-rose-tint' : 'text-ink-2'
              }`}
            >
              <span className="w-[20px] inline-flex justify-center" aria-hidden="true"><PageGlyph emoji={p.emoji} /></span>
              {p.title}
            </button>
          ))}
          <button
            onClick={() => { if (onNewPage) onNewPage(); setMoreOpen(false); }}
            className="flex items-center gap-2.5 px-3 py-2.5 w-full r-md font-sans ui-body min-h-[48px] text-ink-3"
          >
            <span className="w-[20px] inline-flex justify-center" aria-hidden="true"><NavIcon name="plus" className="w-[15px] h-[15px]" /></span>
            New page
          </button>
        </div>
      )}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-panel border-t border-line flex pb-[env(safe-area-inset-bottom)]">
        {NAV.slice(0, MOBILE_PRIMARY_COUNT).map((t) => (
          <button
            key={t.key}
            onClick={() => { setView(t.key); setMoreOpen(false); }}
            className={`flex-1 flex flex-col items-center gap-1 pt-2 pb-1.5 min-h-[54px] ui-meta font-medium relative ${
              view === t.key ? 'text-rose-text' : 'text-ink-2'
            }`}
          >
            <NavIcon name={t.icon} className="w-[19px] h-[19px]" />
            {t.label}
            {t.key === 'inbox' && newLeadCount > 0 && (
              <span className="absolute top-1 right-1/2 translate-x-4 bg-rose-btn text-white rounded-full min-w-[15px] h-[15px] px-1 ui-meta leading-[15px]">{newLeadCount}</span>
            )}
          </button>
        ))}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex-1 flex flex-col items-center gap-1 pt-2 pb-1.5 min-h-[54px] ui-meta font-medium ${
            moreOpen || view === 'page' || NAV.slice(MOBILE_PRIMARY_COUNT).some((t) => t.key === view) ? 'text-rose-text' : 'text-ink-3'
          }`}
          aria-expanded={moreOpen}
        >
          <span className="ui-display leading-none" aria-hidden="true">⋯</span>
          More
        </button>
      </nav>
    </>
  );
}

// Which build this tab is running, and whether a newer one is live.
//
// This exists because of a real morning: Ary drove an old bundle for a day —
// the app is hash-routed, so nothing ever forces a reload — and the pixels
// she saw contradicted every report about what had shipped. The badge makes
// the running version a fact on screen, and the check makes a stale tab say
// so itself instead of quietly misbehaving.
function VersionBadge() {
  const [newer, setNewer] = useState(false);
  useEffect(() => {
    let alive = true;
    async function check() {
      try {
        const v = await fetch('/api/version', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null));
        // The server's sha is the build that is live; VERSION.sha is the one
        // baked into THIS bundle. Different means this tab is old.
        if (alive && v?.sha && VERSION.sha !== 'dev' && v.sha !== VERSION.sha) setNewer(true);
      } catch {}
    }
    check();
    const t = setInterval(check, 15 * 60 * 1000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Worn as a small "v1.0" on its own line under the footer row; the full
  // identity (release date, sha, environment, build time) lives in the
  // tooltip and at /api/version for when a conversation needs it exactly.
  return (
    <div className="mt-1">
      <span
        className="ui-meta text-ink-3 tabular-nums"
        title={`${versionLine()}${VERSION.builtAt ? ` · built ${VERSION.builtAt.slice(0, 10)}` : ''}`}
      >
        v{VERSION.version}
        {VERSION.environment !== 'Production' ? ` · ${VERSION.environment}` : ''}
      </span>
      {newer && (
        <button
          onClick={() => window.location.reload()}
          className="block ui-meta font-medium text-rose-text underline decoration-dotted hover:text-ink transition"
        >
          A newer LTB version is available. Refresh.
        </button>
      )}
    </div>
  );
}
