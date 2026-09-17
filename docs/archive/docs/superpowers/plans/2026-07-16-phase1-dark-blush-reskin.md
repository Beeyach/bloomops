# Phase 1: Dark Blush Reskin + Nav Shell — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reskin Leads That Bloom from the light liquid-glass theme to the dark blush theme (BloomBoard's dark surfaces + the rose palette) and restyle the nav rail, with zero behavior changes.

**Architecture:** The liquid-glass branch centralized surfaces into `glass-panel`/`glass-control` CSS classes and Tailwind color tokens, so this reskin is mostly value swaps: retoken `tailwind.config.js`, re-theme `globals.css`, rewrite the two decoration components (`GlassBackdrop`, `GlassRail`), recolor the two inline color maps (`STAGE_META`, `RATING_META`), then sweep the few literal light-theme classes left in JSX.

**Tech Stack:** Next.js 15 (plain JS), Tailwind 3, Cloudflare Pages. Dev server: `npm run dev` (Windows-safe). Tests: `npm test` (node --test).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-bloomboard-consolidation-design.md` (see section 1 for the full token table).
- ZERO behavior changes in this phase. No state, handler, API, or data changes. Only classNames, CSS, color values, and the two decoration components.
- Never run wrangler against DB id `ab941724-dbee-4420-bfe4-d7fa5a27d3ea` (personal DB). No DB work exists in this phase at all.
- Semantic colors stay semantic: green = positive/Client, gold = waiting, red = overdue/rejected. Pink is the brand/action color only.
- Fonts unchanged (self-hosted Instrument Serif/Sans + IBM Plex Mono in `public/fonts/`).
- Do NOT push to GitHub (pushing deploys to production). Commit locally; the owner confirms the push at the end.
- Work on the current branch `feature/liquid-glass`.

---

### Task 1: Dark blush design tokens

**Files:**
- Modify: `tailwind.config.js` (full replacement of `theme.extend`)

**Interfaces:**
- Produces: Tailwind classes used by every later task: `bg-wash`, `bg-panel`, `bg-surface`, `text-ink`, `text-ink-2`, `text-bright`, `text-rose-text`, `bg-rose`, `hover:bg-rose-hover`, `border-line`, `border-hairline`, `bg-blush-soft`, `text-leaf-text`, `text-gold-text`, `text-poppy-text`.
- The alias tokens (`charcoal`, `paper`, `surface`, `blush-soft`, `mauve`, `line`, `muted`) keep their NAMES so 200+ existing JSX usages recolor without edits. `text-charcoal` (62 uses) becomes light text; `bg-charcoal text-paper` pairs (16 each) become inverted light-on-dark chips, which is intended.

- [ ] **Step 1: Replace the theme block in `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Dark blush palette (spec 2026-07-16, consolidation design §1).
        // Dark surfaces from BloomBoard, rose accents from BloomTrack.
        bg: '#191817',
        wash: '#191817',
        panel: '#201F1D',
        surface: '#1E1D1B',
        'card-hover': '#242220',
        ink: '#D6D2CC',
        'ink-2': '#9B9691',
        'ink-3': '#736E67',
        bright: '#F1EEE9',
        rose: '#B84C72',
        'rose-hover': '#C75E84',
        'rose-deep': '#9C3D60',
        'rose-text': '#E08BA6',
        'rose-tint': 'rgba(224,139,166,0.14)',
        leaf: '#34936B',
        'leaf-text': '#6BC79A',
        gold: '#C9973F',
        'gold-text': '#DCAE5E',
        poppy: '#C7513A',
        'poppy-text': '#E58A74',
        line: '#2E2C29',
        'line-strong': '#3B3833',
        hairline: 'rgba(224,139,166,0.20)',
        // Transitional aliases — old token names keep compiling, remapped
        // to dark values. text-charcoal = light text on dark. bg-charcoal
        // + text-paper = intentionally inverted chips (light on dark UI).
        charcoal: '#D6D2CC',
        'charcoal-2': '#9B9691',
        mauve: '#B84C72',
        'mauve-deep': '#9C3D60',
        blush: 'rgba(224,139,166,0.14)',
        'blush-soft': '#242220',
        paper: '#191817',
        muted: '#9B9691',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Instrument Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        // Dark theme carries structure with hairline borders, not shadows.
        card: 'none',
        pill: 'none',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 2: Verify the build compiles**

Run: `npm run dev` (leave running for later tasks), open http://localhost:3000
Expected: page renders (it will look half-broken — light glass panels over remapped text colors — that's expected until Tasks 2-3).

- [ ] **Step 3: Commit**

```bash
git add tailwind.config.js
git commit -m "feat: dark blush color tokens (phase 1)"
```

---

### Task 2: globals.css dark pass

**Files:**
- Modify: `app/globals.css` (full replacement — content below)

**Interfaces:**
- Consumes: token values from Task 1 (kept in sync as CSS vars).
- Produces: `.glass-panel` and `.glass-control` become flat dark surfaces — every JSX usage of those classes (30+) recolors without edits. `.cell-input`, `.cell-display`, `.bw-chip`, `select.status-select`, `.bw-scroll`, active-row styles all re-themed.

- [ ] **Step 1: Replace `app/globals.css` entirely with:**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ─────────────────────────────────────────────────────────────────────────
   Design tokens · Leads That Bloom dark blush palette (spec 2026-07-16).
   These mirror tailwind.config.js so non-Tailwind CSS rules can use them.
   ─────────────────────────────────────────────────────────────────────── */
:root {
  --bg: #191817;
  --panel: #201F1D;
  --surface: #1E1D1B;
  --card-hover: #242220;
  --ink: #D6D2CC;
  --ink-2: #9B9691;
  --bright: #F1EEE9;
  --line: #2E2C29;
  --line-strong: #3B3833;
  --rose: #B84C72;
  --rose-text: #E08BA6;
  --rose-tint: rgba(224, 139, 166, 0.14);
  --rose-active: #E08BA6;
  color-scheme: dark;
}

html, body {
  height: 100%;
  background: var(--bg);
  color: var(--ink);
  /* Avoid jarring jumps when font files swap in. */
  font-feature-settings: 'ss01', 'ss02';
}

::selection { background: rgba(224, 139, 166, 0.28); }

/* ─────────────────────────────────────────────────────────────────────────
   Editable cell styling.
   The base cell renders as plain text and only "lights up" on hover/edit.
   ─────────────────────────────────────────────────────────────────────── */
.cell-input {
  background: #242320;
  outline: none;
  width: 100%;
  border: 1px solid var(--rose);
  border-radius: 6px;
  padding: 5px 8px;
  font: inherit;
  color: var(--ink);
  box-shadow: 0 0 0 3px rgba(224, 139, 166, 0.18);
}

.cell-display {
  padding: 5px 8px;
  border-radius: 6px;
  cursor: text;
  min-height: 28px;
  display: block;
  transition: background-color 120ms ease;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-display:hover {
  background: var(--card-hover);
}

/* Generic chip used for the stage selector trigger + filter panel rows. */
.bw-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 3px 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 500;
  line-height: 1.1;
  white-space: nowrap;
  cursor: pointer;
  transition: filter 120ms ease, box-shadow 120ms ease;
}
.bw-chip:hover { filter: brightness(1.15); }
.bw-chip:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(224, 139, 166, 0.30);
}
.bw-chip svg { flex-shrink: 0; }

/* Stage <select>. Chevron recolored for dark chrome. */
select.status-select {
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 3px 22px 3px 10px;
  font-weight: 500;
  font-size: 13px;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23D6D2CC' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 6px center;
  background-size: 10px 7px;
}
select.status-select:hover { filter: brightness(1.15); }
select.status-select:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(224, 139, 166, 0.30);
}

/* ─────────────────────────────────────────────────────────────────────────
   Stage stripe + active row indicator.
   ─────────────────────────────────────────────────────────────────────── */
tbody tr > td:first-child {
  box-shadow: inset 6px 0 0 0 var(--stage-stripe, transparent);
}

tr[data-active-row="true"] > td {
  box-shadow:
    inset 0 2px 0 0 var(--rose-active),
    inset 0 -2px 0 0 var(--rose-active);
  background-color: var(--rose-tint) !important;
}
tr[data-active-row="true"] > td:first-child {
  box-shadow:
    inset 0 2px 0 0 var(--rose-active),
    inset 0 -2px 0 0 var(--rose-active),
    inset 2px 0 0 0 var(--rose-active);
}
tr[data-active-row="true"] > td:last-child {
  box-shadow:
    inset 0 2px 0 0 var(--rose-active),
    inset 0 -2px 0 0 var(--rose-active),
    inset -2px 0 0 0 var(--rose-active);
}

.num-tabular {
  font-variant-numeric: tabular-nums;
}

/* ─────────────────────────────────────────────────────────────────────────
   Native form control polish.
   ─────────────────────────────────────────────────────────────────────── */
input[type="checkbox"] {
  accent-color: var(--rose);
  width: 14px;
  height: 14px;
  cursor: pointer;
}

input[type="date"] {
  font: inherit;
}

.bw-scroll::-webkit-scrollbar { height: 10px; width: 10px; }
.bw-scroll::-webkit-scrollbar-track { background: transparent; }
.bw-scroll::-webkit-scrollbar-thumb {
  background: rgba(224, 139, 166, 0.25);
  border-radius: 999px;
}
.bw-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(224, 139, 166, 0.45);
}

/* ── Fonts (self-hosted) ─────────────────────────────────────────────── */

@font-face{font-family:'Instrument Serif';src:url('/fonts/instrument-serif.ttf') format('truetype');font-style:normal;font-display:swap}
@font-face{font-family:'Instrument Serif';src:url('/fonts/instrument-serif-italic.ttf') format('truetype');font-style:italic;font-display:swap}
@font-face{font-family:'Instrument Sans';src:url('/fonts/instrument-sans-var.ttf') format('truetype-variations');font-weight:100 900;font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url('/fonts/ibm-plex-mono-400.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url('/fonts/ibm-plex-mono-500.woff2') format('woff2');font-weight:500;font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url('/fonts/ibm-plex-mono-600.woff2') format('woff2');font-weight:600;font-display:swap}

/* ── Dark blush surfaces (replaces liquid glass, spec 2026-07-16) ─────
   The glass-* class NAMES are kept so 30+ JSX call sites need no edits.
   They now render flat dark cards: hairline borders carry the structure,
   no blur, no translucency, no shadows. ─────────────────────────────── */

.glass-panel{
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.glass-control{
  background: #242320;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
}

:where(a,button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid #E08BA6;outline-offset:2px}
```

- [ ] **Step 2: Visual check**

With `npm run dev` running, reload http://localhost:3000.
Expected: dark canvas, flat dark cards, readable light text everywhere except the backdrop (still light — Task 3) and stage chips (still light pastels — Task 5).

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: dark blush globals — flat dark surfaces replace liquid glass"
```

---

### Task 3: Dark backdrop

**Files:**
- Modify: `components/GlassBackdrop.jsx` (full replacement)

**Interfaces:**
- Consumes: nothing. Produces: same default export `GlassBackdrop()`, still purely decorative, aria-hidden. ProspectsApp's `<GlassBackdrop />` call site (line ~2050) is untouched.

- [ ] **Step 1: Replace `components/GlassBackdrop.jsx` entirely with:**

```jsx
'use client';

// Fixed full-viewport backdrop, dark blush edition: near-black warm canvas
// with the hand-drawn bloom outlines at whisper opacity. Pure decoration —
// aria-hidden, pointer-events none, no animation (nothing to reduce).
export default function GlassBackdrop() {
  return (
    <div aria-hidden="true">
      <style>{`
        .ltb-dark{position:fixed;inset:0;z-index:-2;overflow:hidden;background:#191817}
        .ltb-strokes{position:absolute;inset:0;color:#E08BA6;pointer-events:none}
        .ltb-strokes svg{position:absolute;overflow:visible}
        .ltb-strokes .s1{width:860px;height:860px;top:-260px;right:-220px;opacity:.05}
        .ltb-strokes .s2{width:520px;height:520px;bottom:-180px;left:-140px;opacity:.04;transform:rotate(38deg)}
      `}</style>
      <div className="ltb-dark">
        <div className="ltb-strokes">
          <svg className="s1" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth=".55">
            <path d="M50 18 C 61 4, 82 10, 80 26 C 96 24, 103 45, 89 53 C 100 64, 90 82, 74 78 C 74 94, 52 99, 46 84 C 32 96, 14 84, 20 69 C 5 65, 4 44, 19 40 C 12 24, 32 10, 43 21 C 45 19, 47 18, 50 18 Z" />
            <path d="M50 34 C 56 26, 68 30, 66 39 C 75 38, 79 50, 71 54 C 77 61, 71 71, 62 68 C 62 77, 50 80, 47 71 C 39 78, 29 71, 33 62 C 24 60, 24 48, 32 46 C 28 37, 39 29, 45 35" opacity=".7" />
            <circle cx="50" cy="52" r="6" opacity=".8" />
          </svg>
          <svg className="s2" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth=".7">
            <path d="M50 20 C 60 8, 78 14, 76 28 C 90 27, 95 45, 83 51 C 92 61, 83 76, 69 72 C 68 86, 49 89, 45 76 C 33 86, 18 76, 23 63 C 10 59, 11 41, 24 39 C 19 26, 36 15, 45 24" />
            <circle cx="50" cy="49" r="5" />
          </svg>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Visual check**

Reload http://localhost:3000.
Expected: solid dark canvas with two faint rose bloom outlines in the corners. No pink gradient, no grain, no animation.

- [ ] **Step 3: Commit**

```bash
git add components/GlassBackdrop.jsx
git commit -m "feat: dark backdrop — bloom outlines at whisper opacity"
```

---

### Task 4: Nav rail → BloomBoard-style sidebar + mobile bottom bar

**Files:**
- Modify: `components/GlassRail.jsx` (full replacement)
- Modify: `components/ProspectsApp.jsx:2051` (one className edit for bottom-bar clearance)

**Interfaces:**
- Consumes: same props as today — `{ view, setView, newLeadCount, clocks }`. No prop changes; ProspectsApp's call site stays untouched except the container padding.
- Produces: `NAV` array stays `[{key, label}]`-shaped plus an `icon` field. Later phases (Today, Clients, Library) add entries to this array — keep it top-of-file and exported: `export const NAV = [...]`.

- [ ] **Step 1: Replace `components/GlassRail.jsx` entirely with:**

```jsx
'use client';

// Nav shell, dark blush edition. Desktop: sticky sidebar panel (brand,
// "Workspace" label, icon nav rows, world clocks). Mobile: fixed bottom
// tab bar, BloomBoard-style. Pure presentation — navigation state lives
// in ProspectsApp.
const ICONS = {
  prospects: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  inbox: <path d="M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />,
  stats: <path d="M18 20V10M12 20V4M6 20v-6" />,
  settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />,
};

export const NAV = [
  { key: 'prospects', label: 'Prospects', icon: 'prospects' },
  { key: 'inbox', label: 'Inbox', icon: 'inbox' },
  { key: 'stats', label: 'Stats', icon: 'stats' },
  { key: 'settings', label: 'Settings', icon: 'settings' },
];

function NavIcon({ name, className }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

function Badge({ count }) {
  if (!count) return null;
  return (
    <span className="bg-rose text-white rounded-[6px] px-2 py-px text-[10px] font-mono">{count}</span>
  );
}

export default function GlassRail({ view, setView, newLeadCount, clocks }) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="glass-panel hidden md:flex md:w-[230px] shrink-0 md:flex-col p-5 md:sticky md:top-5 md:h-[calc(100vh-40px)]">
        <div className="flex items-center gap-2.5 mb-1">
          <svg viewBox="0 0 32 32" aria-hidden="true" className="w-[30px] h-[30px]">
            <g fill="#B84C72">
              <circle cx="16" cy="8.5" r="6" /><circle cx="23.5" cy="13.5" r="6" />
              <circle cx="20.5" cy="22" r="6" /><circle cx="11.5" cy="22" r="6" />
              <circle cx="8.5" cy="13.5" r="6" />
            </g>
            <circle cx="16" cy="15.5" r="4.4" fill="#191817" />
          </svg>
          <div className="font-serif text-[23px] leading-none text-bright">
            Leads <em className="italic text-rose-text">that</em> Bloom
          </div>
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-3 mt-1.5 mb-6">
          Workspace
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[9px] font-mono text-[11px] uppercase tracking-[0.13em] transition ${
                view === t.key
                  ? 'text-rose-text bg-rose-tint'
                  : 'text-ink-2 hover:bg-white/[0.045]'
              }`}
            >
              <NavIcon name={t.icon} className="w-[17px] h-[17px]" />
              <span className="flex-1 text-left">{t.label}</span>
              {t.key === 'inbox' && <Badge count={newLeadCount} />}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-line pt-3 min-h-0">
          {clocks}
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-panel border-t border-line flex pb-[env(safe-area-inset-bottom)]">
        {NAV.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`flex-1 flex flex-col items-center gap-0.5 pt-2 pb-1.5 min-h-[54px] text-[10px] font-mono uppercase tracking-[0.08em] relative ${
              view === t.key ? 'text-rose-text' : 'text-ink-3'
            }`}
          >
            <NavIcon name={t.icon} className="w-[21px] h-[21px]" />
            {t.label}
            {t.key === 'inbox' && newLeadCount > 0 && (
              <span className="absolute top-1 right-1/2 translate-x-4 bg-rose text-white rounded-full min-w-[15px] h-[15px] px-1 text-[9px] leading-[15px]">{newLeadCount}</span>
            )}
          </button>
        ))}
      </nav>
    </>
  );
}
```

- [ ] **Step 2: Add bottom-bar clearance in ProspectsApp**

In `components/ProspectsApp.jsx` line ~2051, change:

```jsx
<div className="flex flex-col md:flex-row gap-5 p-5 max-w-[1440px] mx-auto min-h-screen">
```

to:

```jsx
<div className="flex flex-col md:flex-row gap-5 p-5 pb-24 md:pb-5 max-w-[1440px] mx-auto min-h-screen">
```

- [ ] **Step 3: Visual check, both breakpoints**

Reload http://localhost:3000. Check desktop (sidebar: brand serif in near-white, "Workspace" label, icon rows, rose-tint active row) and a ~380px viewport (bottom tab bar fixed, 4 tabs, active tab rose, content not hidden behind the bar).

- [ ] **Step 4: Commit**

```bash
git add components/GlassRail.jsx components/ProspectsApp.jsx
git commit -m "feat: BloomBoard-style sidebar + mobile bottom tab bar"
```

---

### Task 5: Stage + rating colors for dark

**Files:**
- Modify: `components/ProspectsApp.jsx:70-97` (STAGE_META), `:106-114` (RATING_META), and the two `'#FBF7F0'` fallback literals (lines ~627 and ~3540).

**Interfaces:**
- Consumes: nothing new. Produces: same object shapes (`{icon, bg, border, faded?}` / `{icon, filled, color, bg, label}`). Chips render text with `color: meta.border` (stages) / `color: rm.color` (ratings), so `border`/`color` must be bright-on-dark; `bg` is a low-opacity tint of the same hue.

- [ ] **Step 1: Replace STAGE_META (lines 70-97) with:**

```js
const STAGE_META = {
  New:        { icon: 'sparkle',        bg: 'rgba(201,155,192,0.15)', border: '#C99BC0' },
  'Social Media': { icon: 'message',    bg: 'rgba(200,121,200,0.15)', border: '#C879C8' },
  'Email 1':  { icon: 'send',           bg: 'rgba(217,192,68,0.13)',  border: '#D9C044' },
  'Email 2':  { icon: 'send',           bg: 'rgba(227,154,85,0.14)',  border: '#E39A55' },
  'Email 3':  { icon: 'send',           bg: 'rgba(227,135,163,0.15)', border: '#E387A3' },
  'Email 4':  { icon: 'send',           bg: 'rgba(172,139,224,0.15)', border: '#AC8BE0' },
  'Email 5':  { icon: 'send',           bg: 'rgba(85,187,169,0.14)',  border: '#55BBA9' },
  Instagram:      { icon: 'instagram',  bg: 'rgba(216,131,188,0.15)', border: '#D883BC' },
  Facebook:       { icon: 'facebook',   bg: 'rgba(127,165,220,0.15)', border: '#7FA5DC' },
  LinkedIn:       { icon: 'linkedin',   bg: 'rgba(108,166,217,0.15)', border: '#6CA6D9' },
  'Contact Form': { icon: 'clipboard',  bg: 'rgba(111,188,172,0.14)', border: '#6FBCAC' },
  Rekindled:  { icon: 'flame',          bg: 'rgba(223,155,87,0.14)',  border: '#DF9B57' },
  Replied:    { icon: 'message',        bg: 'rgba(150,196,106,0.14)', border: '#96C46A' },
  'Setup Check': { icon: 'settings',    bg: 'rgba(99,190,146,0.14)',  border: '#63BE92' },
  Interested: { icon: 'heart',          bg: 'rgba(124,196,107,0.14)', border: '#7CC46B' },
  Potential:  { icon: 'trending-up',    bg: 'rgba(223,160,95,0.14)',  border: '#DFA05F' },
  Nudge:      { icon: 'bell',           bg: 'rgba(208,186,85,0.13)',  border: '#D0BA55' },
  Snoozed:    { icon: 'hourglass',      bg: 'rgba(151,162,214,0.15)', border: '#97A2D6' },
  'Re-warm':  { icon: 'rotate-ccw',     bg: 'rgba(220,160,124,0.14)', border: '#DCA07C' },
  Booked:     { icon: 'calendar-check', bg: 'rgba(111,196,111,0.14)', border: '#6FC46F' },
  Client:           { icon: 'briefcase', bg: 'rgba(95,189,95,0.16)',  border: '#5FBD5F' },
  'Payment Awaiting': { icon: 'clock',   bg: 'rgba(211,184,84,0.13)', border: '#D3B854' },
  Finished:   { icon: 'moon',           bg: 'rgba(167,157,167,0.12)', border: '#A79DA7', faded: true },
  Rejected:   { icon: 'ban',            bg: 'rgba(206,130,115,0.13)', border: '#CE8273', faded: true },
  'Invalid Email': { icon: 'mail-x',    bg: 'rgba(179,146,137,0.12)', border: '#B39289', faded: true },
  Lost:       { icon: 'x-circle',       bg: 'rgba(168,156,139,0.12)', border: '#A89C8B', faded: true },
};
```

- [ ] **Step 2: Replace RATING_META colors (lines ~106-114), keeping all keys/icons/labels:**

```js
const RATING_META = {
  '💚': { icon: 'heart',      filled: true,  color: '#7CC46B', bg: 'rgba(124,196,107,0.15)', label: 'Strong' },
  '💙': { icon: 'heart',      filled: true,  color: '#7FA8CC', bg: 'rgba(127,168,204,0.15)', label: 'Client' },
  '✖️': { icon: 'x-circle',   filled: false, color: '#A89C8B', bg: 'rgba(168,156,139,0.13)', label: 'Skip' },
  '🟠': { icon: 'circle-dot', filled: true,  color: '#DFA05F', bg: 'rgba(223,160,95,0.15)',  label: 'Orange' },
  '⭐':  { icon: 'star',       filled: true,  color: '#D0BA55', bg: 'rgba(208,186,85,0.14)',  label: 'Star' },
  '🔥': { icon: 'flame',      filled: true,  color: '#DE7E68', bg: 'rgba(222,126,104,0.15)', label: 'Hot' },
  '🟡': { icon: 'circle-dot', filled: true,  color: '#D3C063', bg: 'rgba(211,192,99,0.14)',  label: 'Yellow' },
};
```

- [ ] **Step 3: Fix the two light fallback literals**

Search `components/ProspectsApp.jsx` for `'#FBF7F0'` (2 hits, lines ~627 and ~3540). Replace both:

```js
backgroundColor: m.bg === 'transparent' ? '#1E1D1B' : m.bg,
```

- [ ] **Step 4: Verify no light pastels remain in the maps**

Run: `grep -n "#F[0-9A-F]\{5\}\|#FBF7F0" components/ProspectsApp.jsx | head`
Expected: no hits inside STAGE_META/RATING_META (lines 70-115) and no `#FBF7F0` anywhere.

- [ ] **Step 5: Visual check**

Reload. Stage chips and rating chips: dark tinted pills with bright readable label text, stage stripes visible on the table's left edge.

- [ ] **Step 6: Commit**

```bash
git add components/ProspectsApp.jsx
git commit -m "feat: dark-tinted stage and rating chip colors"
```

---

### Task 6: Sweep remaining light-theme literals in JSX

**Files:**
- Modify: `components/ProspectsApp.jsx`, `components/LeadInbox.jsx`, `components/SettingsView.jsx`, `components/AddProspectDrawer.jsx` (class strings only)

**Interfaces:** none — mechanical class replacements. `text-white` stays (it sits on solid rose/leaf fills, still correct on dark).

- [ ] **Step 1: Apply this exact mapping across all four components (plain find/replace, longest-first order):**

| Find | Replace | Expected count |
|---|---|---|
| `!bg-white/70` | `!bg-panel` | 2 |
| `bg-white/60` | `bg-white/[0.07]` | 7 |
| `bg-white/45` | `bg-white/[0.06]` | 1 |
| `bg-white/35` | `bg-white/[0.05]` | 2 |
| `bg-white/20` | `bg-white/[0.04]` | 3 |
| `border-white/60` | `border-white/10` | 1 |
| `text-rose-deep` | `text-rose-text` | 3 |
| `bg-rose-deep` | `bg-rose-hover` | 2 |

(Counts are pre-Task-4 numbers; GlassRail's own instances were already rewritten in Task 4, so real counts may be 1-2 lower. `hover:` prefixes survive these replacements automatically.)

- [ ] **Step 2: Verify the sweep is complete**

Run: `grep -rn "bg-white/[2-9]\|border-white/60\|rose-deep" components/ app/ --include="*.jsx"`
Expected: zero hits (rose-deep may legitimately remain only inside `tailwind.config.js`).

- [ ] **Step 3: Visual check every view**

Click through Prospects, Inbox, Stats, Settings. Open: the Filters popover, a stage picker dropdown, the Add Prospect drawer, an inline cell edit. All surfaces dark, no white flashes, dropdowns opaque and readable.

- [ ] **Step 4: Commit**

```bash
git add components/
git commit -m "feat: sweep light-theme class literals for dark blush"
```

---

### Task 7: Layout metadata + final verification

**Files:**
- Modify: `app/layout.jsx`

**Interfaces:** none.

- [ ] **Step 1: Add dark viewport theme color to `app/layout.jsx`:**

```jsx
import './globals.css';

export const metadata = {
  title: 'Leads That Bloom',
  description: 'A cozy prospecting tracker — plant a lead, watch it bloom.',
};

export const viewport = {
  themeColor: '#191817',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head></head>
      <body className="bg-wash text-charcoal font-sans antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Run the existing test suite**

Run: `npm test`
Expected: all existing tests pass (they cover engine prompts — nothing visual — so any failure means an accidental logic edit; investigate before proceeding).

- [ ] **Step 3: Full visual pass (the phase gate)**

Desktop AND ~380px mobile, checklist:
- [ ] All four views render dark with readable text
- [ ] Sidebar (desktop) / bottom bar (mobile) navigate correctly, Inbox badge shows
- [ ] Prospect table: stage stripes, chips, active-row highlight, inline edit, dropdowns
- [ ] Search, filter popover, Add Prospect drawer all dark and functional
- [ ] Stats view numbers readable, Settings view forms dark
- [ ] No console errors
- [ ] Add a test prospect, edit it, delete it — writes still work (behavior unchanged)

- [ ] **Step 4: Commit**

```bash
git add app/layout.jsx
git commit -m "feat: dark theme-color viewport metadata"
```

- [ ] **Step 5: STOP — owner confirms production push**

Do NOT `git push`. Report Phase 1 complete and ask the owner to approve pushing `feature/liquid-glass` (deploys to leadsthatbloom.com via Cloudflare Pages build).
