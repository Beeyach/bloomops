# Liquid Glass Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved liquid-glass redesign (spec: `docs/superpowers/specs/2026-07-16-liquid-glass-redesign-design.md`) to the whole app: self-hosted fonts, new palette + glass tokens, aurora backdrop, sidebar-rail shell, and reskinned Prospects / Inbox / Stats / Settings views, with an Add-prospect drawer and Filters popover.

**Architecture:** Reskin + shell only. All data flow, API calls, `window.bloom`, due-date logic, and component contracts are UNCHANGED. Old Tailwind token names stay as transitional aliases mapped to the new palette so untouched classes keep compiling and immediately render in the new scheme; reskin tasks then swap structure/classes view by view.

**Tech Stack:** Next.js 15 plain JS, Tailwind, self-hosted TTF/woff2 fonts, CSS-only glass/aurora (no new dependencies at runtime).

## Global Constraints

- The spec `docs/superpowers/specs/2026-07-16-liquid-glass-redesign-design.md` is binding: exact token values, both glass recipes, radii (panel 13 / search & chips 12 / nav 9 / controls 8 / badges 7 / count 6 — NO pill shapes; dots stay circles), the `@supports` no-blur fallback, and the rose `:focus-visible` ring app-wide.
- Text ≤13px never lighter than `#7A6470` (ink-2). `#8A7280` (ink-3) is decorative/placeholder only. Green text uses `#3E7554` (leaf-text); `#4E8A63` (leaf) is for dots/fills only.
- NO changes to: API routes, lib/db.js, lib/engine-prompts.mjs, fetch calls, state logic, `window.bloom`, stage/due logic, table column behavior (sort/resize/StagePicker/PortalMenu), or copy/text content unless a task says so.
- No flag emoji; verdicts stay CSS dots; product name "Leads That Bloom"; no "Bloomtrack"/"Bloomwired" strings.
- Every API route already exports `runtime='edge'` + `dynamic='force-dynamic'` — do not touch routes at all.
- Do NOT run `npm run build` during tasks (it corrupts the running dev server). The controller runs builds at gates. Dev server is managed by the controller at http://localhost:3000 — never start/stop it.
- Decorative SVGs get `aria-hidden="true"`. Aurora animates `transform` only; `prefers-reduced-motion: reduce` disables it. Drawer/popover close on Esc and return focus to their trigger.
- Work on branch `feature/liquid-glass`. Commit per task with the exact message given.

---

### Task 1: Fonts, tokens, glass utilities, backdrop component

**Files:**
- Create: `public/fonts/instrument-serif.ttf`, `public/fonts/instrument-serif-italic.ttf`, `public/fonts/instrument-sans-var.ttf` (copied from `C:\Users\User\Downloads\InstrumentSerif-Regular.ttf`, `...\InstrumentSerif-Italic.ttf`, `...\InstrumentSans-VariableFont_wdth,wght.ttf`)
- Create: `public/fonts/ibm-plex-mono-400.woff2`, `-500.woff2`, `-600.woff2` (via `npm i -D @ibm/plex@latest`, copy from `node_modules/@ibm/plex/IBM-Plex-Mono/fonts/complete/woff2/IBMPlexMono-{Regular,Medium,SemiBold}.woff2`, then `npm uninstall @ibm/plex`)
- Create: `components/GlassBackdrop.jsx`
- Modify: `tailwind.config.js` (colors + fontFamily + boxShadow), `app/globals.css` (append font-faces + glass utilities), `app/layout.jsx` (remove Google Fonts links, mount nothing new — backdrop mounts in Task 2)

**Interfaces:**
- Produces: Tailwind tokens `ink, ink-2, ink-3, rose, rose-deep, leaf, leaf-text, poppy, gold, wash, hairline` plus transitional aliases (below); CSS classes `.glass-panel`, `.glass-control`; component `<GlassBackdrop />` (no props). Every later task depends on these exact names.

- [ ] **Step 1: Copy the six font files into `public/fonts/`** (commands above; quote the comma filename).

- [ ] **Step 2: Replace the `colors` and `fontFamily` blocks in tailwind.config.js**

```js
      colors: {
        // Liquid-glass palette (spec 2026-07-16). ink-3 is decorative only.
        ink: '#3A2A32',
        'ink-2': '#7A6470',
        'ink-3': '#8A7280',
        rose: '#B84C72',
        'rose-deep': '#9C3D60',
        leaf: '#4E8A63',
        'leaf-text': '#3E7554',
        poppy: '#C24B5C',
        gold: '#C9973F',
        wash: '#FBEDF2',
        hairline: 'rgba(184,76,114,0.16)',
        // Transitional aliases — old token names keep compiling, remapped to
        // the new palette. Remove once no JSX references them.
        charcoal: '#3A2A32',
        'charcoal-2': '#7A6470',
        mauve: '#B84C72',
        'mauve-deep': '#9C3D60',
        blush: '#F3CBD8',
        'blush-soft': '#FAE3EB',
        paper: '#FBEDF2',
        surface: '#FFFFFF',
        line: 'rgba(184,76,114,0.16)',
        muted: '#7A6470',
        bg: '#FBEDF2',
      },
      fontFamily: {
        serif: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Instrument Sans"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        card: '0 18px 50px rgba(156,61,96,0.13)',
        pill: '0 8px 24px rgba(156,61,96,0.20)',
      },
```

(`muted` deliberately maps to ink-2, not ink-3 — the app uses `text-muted` on small text, and ink-2 is the contrast floor.)

- [ ] **Step 3: Append to `app/globals.css`**

```css
/* ── Liquid glass redesign (spec 2026-07-16) ─────────────────────────── */

@font-face{font-family:'Instrument Serif';src:url('/fonts/instrument-serif.ttf') format('truetype');font-style:normal;font-display:swap}
@font-face{font-family:'Instrument Serif';src:url('/fonts/instrument-serif-italic.ttf') format('truetype');font-style:italic;font-display:swap}
@font-face{font-family:'Instrument Sans';src:url('/fonts/instrument-sans-var.ttf') format('truetype-variations');font-weight:100 900;font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url('/fonts/ibm-plex-mono-400.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url('/fonts/ibm-plex-mono-500.woff2') format('woff2');font-weight:500;font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url('/fonts/ibm-plex-mono-600.woff2') format('woff2');font-weight:600;font-display:swap}

.glass-panel{
  background:linear-gradient(135deg,rgba(255,255,255,.34),rgba(255,255,255,.14));
  border:1px solid rgba(255,255,255,.55);
  box-shadow:0 18px 50px rgba(156,61,96,.13),inset 0 1px 0 rgba(255,255,255,.75),inset 0 -1px 0 rgba(255,255,255,.18);
  backdrop-filter:blur(26px) saturate(1.6);
  -webkit-backdrop-filter:blur(26px) saturate(1.6);
  border-radius:13px;
  position:relative;
}
.glass-panel::before{
  content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(100deg,rgba(255,255,255,.35) 0%,transparent 18%,transparent 82%,rgba(255,214,201,.25) 100%);
  opacity:.5;
}
.glass-control{
  background:rgba(255,255,255,.30);
  border:1px solid rgba(255,255,255,.55);
  backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
  border-radius:8px;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))){
  .glass-panel{background:rgba(255,255,255,.84)}
  .glass-control{background:rgba(255,255,255,.88)}
}
:where(a,button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid #B84C72;outline-offset:2px}
```

Also update the body background in globals.css if set there (search for the old paper values `#F5EFE6`/design-token block) to `linear-gradient(170deg,#FFF6F9 0%,#FAE3EB 42%,#F4D3DF 100%)` fixed height 100%, but do NOT remove existing CSS the app still depends on.

- [ ] **Step 4: Create `components/GlassBackdrop.jsx`** — full code:

```jsx
'use client';

// Fixed full-viewport artsy backdrop: aurora conic washes, oversized
// hand-drawn bloom outlines, film grain. Pure decoration — aria-hidden,
// pointer-events none, transform-only animation (disabled by
// prefers-reduced-motion in globals via the inline <style> below).
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

export default function GlassBackdrop() {
  return (
    <div aria-hidden="true">
      <style>{`
        .ltb-liquid{position:fixed;inset:0;z-index:-2;overflow:hidden;background:linear-gradient(170deg,#FFF6F9 0%,#FAE3EB 42%,#F4D3DF 100%)}
        .ltb-aurora{position:absolute;inset:-25%;filter:blur(60px);opacity:.75;background:conic-gradient(from 210deg at 28% 30%, #FFD9C9 0deg, #F7C7D8 70deg, transparent 160deg, #FBE3D2 240deg, #F3BFD3 320deg, #FFD9C9 360deg);animation:ltb-swirl 90s linear infinite}
        .ltb-aurora.two{inset:-35%;opacity:.5;filter:blur(80px);background:conic-gradient(from 40deg at 70% 72%, #F6C6D9 0deg, transparent 120deg, #FFE4D6 200deg, #EFB7CE 290deg, #F6C6D9 360deg);animation-duration:130s;animation-direction:reverse}
        @keyframes ltb-swirl{to{transform:rotate(1turn)}}
        @media (prefers-reduced-motion: reduce){.ltb-aurora{animation:none}}
        .ltb-strokes{position:absolute;inset:0;color:#B84C72}
        .ltb-strokes svg{position:absolute;overflow:visible}
        .ltb-strokes .s1{width:860px;height:860px;top:-260px;right:-220px;opacity:.10}
        .ltb-strokes .s2{width:520px;height:520px;bottom:-180px;left:-140px;opacity:.08;transform:rotate(38deg)}
        .ltb-grain{position:fixed;inset:0;z-index:-1;pointer-events:none;opacity:.32;mix-blend-mode:soft-light;background-image:${GRAIN}}
      `}</style>
      <div className="ltb-liquid">
        <div className="ltb-aurora" />
        <div className="ltb-aurora two" />
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
      <div className="ltb-grain" />
    </div>
  );
}
```

- [ ] **Step 5: `app/layout.jsx`** — delete the three Google Fonts `<link>` tags and the preconnects plus their comment (fonts are self-hosted now). Change body class `bg-paper` → `bg-wash` (alias renders the same). Nothing else.

- [ ] **Step 6: Verify** — `npm test` (9/9); dev-server homepage curl 200; `curl -s http://localhost:3000/ | grep -c 'fonts.googleapis'` → 0. Controller does the visual pass.

- [ ] **Step 7: Commit** — `feat: liquid glass foundation — self-hosted fonts, palette, glass utilities, backdrop`

---

### Task 2: Shell — GlassRail + workspace layout

**Files:**
- Create: `components/GlassRail.jsx`
- Modify: `components/ProspectsApp.jsx` (mount `<GlassBackdrop />`; replace the centered `<header>` masthead AND the view-switcher tab row with the rail + workspace flex layout; add a `compact` variant to `WorldClockBar`)

**Interfaces:**
- Consumes: `view`, `setView`, `newLeadCount` state (existing); `WorldClockBar` (existing internal component).
- Produces: `<GlassRail view setView newLeadCount clocks={<WorldClockBar compact />} />`; ProspectsApp top-level render becomes: `<GlassBackdrop />` + `<div className="flex flex-col md:flex-row gap-5 p-5 max-w-[1440px] mx-auto min-h-screen">` containing the rail and `<main className="flex-1 min-w-0 flex flex-col gap-4">…views…</main>`. The old toolbar card (search/import/export/filters/stats strip) REMAINS inside main untouched for now — Tasks 3–5 rework it.

- [ ] **Step 1: Create `components/GlassRail.jsx`** — full code:

```jsx
'use client';

// Sidebar rail: brand mark, nav, world clocks. Pure presentation —
// navigation state lives in ProspectsApp.
const NAV = [
  { key: 'prospects', label: 'Prospects' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'stats', label: 'Stats' },
  { key: 'settings', label: 'Settings' },
];

export default function GlassRail({ view, setView, newLeadCount, clocks }) {
  return (
    <aside className="glass-panel md:w-[230px] shrink-0 flex md:flex-col flex-row flex-wrap items-center md:items-stretch gap-2 md:gap-0 p-4 md:p-5 md:sticky md:top-5 md:h-[calc(100vh-40px)]">
      <div className="flex items-center gap-2.5 md:mb-1">
        <svg viewBox="0 0 32 32" aria-hidden="true" className="w-[30px] h-[30px]">
          <g fill="#B84C72">
            <circle cx="16" cy="8.5" r="6" /><circle cx="23.5" cy="13.5" r="6" />
            <circle cx="20.5" cy="22" r="6" /><circle cx="11.5" cy="22" r="6" />
            <circle cx="8.5" cy="13.5" r="6" />
          </g>
          <circle cx="16" cy="15.5" r="4.4" fill="#FDF3F6" />
        </svg>
        <div className="font-serif text-[23px] leading-none text-ink">
          Leads <em className="italic text-rose-deep">that</em> Bloom
        </div>
      </div>
      <div className="hidden md:block font-mono text-[10px] uppercase tracking-[0.16em] text-ink-2 mt-1.5 mb-6">
        Plant a lead · watch it bloom
      </div>
      <nav className="flex md:flex-col gap-1 md:gap-1 ml-auto md:ml-0">
        {NAV.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-[9px] font-mono text-[11px] uppercase tracking-[0.13em] transition border ${
              view === t.key
                ? 'text-rose-deep bg-white/45 border-white/60 shadow-[0_4px_14px_rgba(156,61,96,0.12),inset_0_1px_0_rgba(255,255,255,0.8)]'
                : 'text-ink-2 border-transparent hover:bg-white/35'
            }`}
          >
            {t.label}
            {t.key === 'inbox' && newLeadCount > 0 && (
              <span className="bg-rose text-white rounded-[6px] px-2 py-px text-[10px]">{newLeadCount}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="hidden md:block mt-auto border-t border-hairline pt-3 min-h-0 max-[700px]:hidden">
        {clocks}
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: `WorldClockBar` compact variant.** Locate `WorldClockBar` in ProspectsApp.jsx. Add a `compact` prop: when true, render each city as a row `<div className="flex justify-between font-mono text-[10.5px] tracking-[0.1em] text-ink-2 py-0.5"><span>{label}</span><b className="font-medium">{time}</b></div>` inside a plain wrapper (no card chrome); when false, existing rendering unchanged.

- [ ] **Step 3: Restructure ProspectsApp's top-level return.** Read the current return JSX first. Replace the outer `<div className="min-h-screen px-6 py-10 …">` + `<header>` masthead + the tab-switcher block with: `<GlassBackdrop />`, the flex row wrapper, `<GlassRail view={view} setView={setView} newLeadCount={newLeadCount} clocks={<WorldClockBar compact />} />`, and `<main className="flex-1 min-w-0 flex flex-col gap-4">` around everything that used to render below the tabs (toolbar card, view bodies). Delete the old header/masthead JSX and the tabs array/map (the rail replaces them). Keep the original `<WorldClockBar />` (non-compact) OUT of the page — it only lives in the rail now. Imports: `GlassBackdrop`, `GlassRail`.

- [ ] **Step 4: Verify** — `npm test`; homepage 200; curl HTML contains "Plant a lead" once and all four nav labels; controller does the interactive pass (nav switching, badge, clocks, mobile wrap).

- [ ] **Step 5: Commit** — `feat: glass shell — sidebar rail replaces masthead and tab switcher`

---

### Task 3: Topbar + Add-prospect drawer

**Files:**
- Create: `components/AddProspectDrawer.jsx`
- Modify: `components/ProspectsApp.jsx` (topbar row; move the existing add-prospect form into the drawer)

**Interfaces:**
- Consumes: the existing add-prospect form state + submit handler in ProspectsApp (find the "ADD A PROSPECT" form row; keep its state/handler intact, relocate the fields).
- Produces: topbar = glass search bar (existing `search` state) + `Due today` / `Sent today` chips (reuse the existing computed counts that power the current stats strip — find `DUE TODAY` / `SENT TODAY` in the toolbar) + `Add prospect` primary button toggling `addOpen` state; `<AddProspectDrawer open onClose>{form fields}</AddProspectDrawer>`.

- [ ] **Step 1: Create `components/AddProspectDrawer.jsx`** — full code:

```jsx
'use client';

import { useEffect, useRef } from 'react';

// Right-side glass drawer. Children = the form. Esc / backdrop click close;
// focus moves in on open and returns to the trigger on close.
export default function AddProspectDrawer({ open, onClose, title = 'Add a prospect', children }) {
  const panelRef = useRef(null);
  const lastActive = useRef(null);

  useEffect(() => {
    if (!open) return;
    lastActive.current = document.activeElement;
    const panel = panelRef.current;
    const focusable = panel?.querySelector('input, select, textarea, button');
    focusable?.focus();
    function onKey(e) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel) {
        const items = panel.querySelectorAll('a, button, input, select, textarea, [tabindex]');
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      lastActive.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass-panel absolute right-4 top-4 bottom-4 w-full max-w-md overflow-y-auto p-6 !bg-white/70"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-2xl text-ink">{title}</h2>
          <button onClick={onClose} className="font-mono text-xs text-ink-2 hover:text-ink px-1" aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

(The `!bg-white/70` raises opacity — form fields need a calmer surface than 24% glass.)

- [ ] **Step 2: Topbar in ProspectsApp.** Above the view bodies (inside `<main>`), when `view === 'prospects'`, render: search input restyled as `glass-control flex-1 min-w-[240px] rounded-[12px] px-4 py-3` (bind to the EXISTING search state — relocate the existing input, don't duplicate state); the two chips `glass-control rounded-[12px] px-4 py-2.5` with `font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2` label + `font-serif text-[19px] text-rose-deep` number (Due today; leaf-text color for Sent today) bound to the existing computed counts; and `<button className="font-mono text-[11px] uppercase tracking-[0.13em] px-4 py-2.5 rounded-[8px] bg-rose text-white shadow-pill hover:bg-rose-deep" onClick={() => setAddOpen(true)}>Add prospect</button>`. Add `const [addOpen, setAddOpen] = useState(false);`.

- [ ] **Step 3: Move the add form.** Relocate the existing "ADD A PROSPECT" form JSX (fields + Add button + its handler wiring) from the toolbar area into `<AddProspectDrawer open={addOpen} onClose={() => setAddOpen(false)}>…</AddProspectDrawer>`, stacking fields vertically (`flex flex-col gap-3`, inputs styled `glass-control w-full px-3 py-2 text-sm bg-white/60`). On successful submit, also call `setAddOpen(false)` (find the existing success path). Remove the old inline form row and the old stats strip / search location from the toolbar card; delete the toolbar card wrapper if now empty except the filters trigger — Task 4 owns filters, so if the filter UI still lives there, leave the remaining bar as-is for Task 4.

- [ ] **Step 4: Verify** — `npm test`; homepage 200; API-level: POST via the UI is manual — controller does the interactive add-through-drawer test. Sanity: curl HTML contains "Add prospect".

- [ ] **Step 5: Commit** — `feat: glass topbar with search, due chips, add-prospect drawer`

---

### Task 4: Filters popover

**Files:**
- Modify: `components/ProspectsApp.jsx`

**Interfaces:**
- Consumes: existing filter state + the filter row UI (due-only toggle, stage/rating checklists, read filter) and the existing `PortalMenu` component.
- Produces: a `Filters ▾` glass-control button in the topbar (right of the chips) opening a `PortalMenu`-anchored glass popover (`glass-panel !bg-white/70 p-4 w-[320px]`) containing the SAME filter controls, restyled with glass-control inputs. A rose count dot on the button when `hiddenCount > 0` (existing value).

- [ ] **Step 1:** Read how the current filter row renders and how `PortalMenu` is invoked elsewhere (StagePicker). Move the filter controls into a popover following that exact pattern; keep every piece of filter state and logic untouched. Remove the old filter row; if the old toolbar card is now empty, delete its wrapper.
- [ ] **Step 2: Verify** — `npm test`; homepage 200. Controller: filters open/close (click-out + Esc), due-only toggle works, table narrows, count dot shows.
- [ ] **Step 3: Commit** — `feat: filters move into glass popover`

---

### Task 5: Prospects table reskin

**Files:**
- Modify: `components/ProspectsApp.jsx` (table + its container only)

**Interfaces:** none new. Class mapping (structure/behavior untouched):

| Element | New classes |
|---|---|
| Table wrapper | `glass-panel overflow-hidden` + panel-head row: `font-serif text-[26px] text-ink` title "Prospects", `font-mono text-[10px] uppercase tracking-[0.13em] text-ink-2` count (`{total} on file · {due} due` from existing values) |
| `thead th` | `font-mono text-[10px] uppercase tracking-[0.13em] text-ink-2 font-medium bg-white/20 border-y border-hairline` |
| `tbody td` | `border-b border-rose/10 text-ink-2` (names `text-ink font-medium`, business line `text-[12px] text-ink-2`) |
| Row hover | `hover:bg-white/35` |
| Stage chip (StagePicker trigger) | `glass-control rounded-[7px] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2 inline-flex items-center gap-1.5` + dot `w-[7px] h-[7px] rounded-full` colored: Email 1–5 `bg-rose`, New `bg-gold`, Client `bg-leaf` (chip text `text-leaf-text`), Finished/Rejected/Invalid `bg-ink-3`, others `bg-rose/50`. KEEP the existing per-stage bg/border config object — change its VALUES to these glass equivalents rather than restructuring. |
| Due indicator | `rounded-[7px] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-white bg-gradient-to-br from-rose to-rose-deep shadow-pill` |
| Faded rows (dead-end stages) | keep the existing `faded` mechanism, opacity on the row |

- [ ] **Step 1:** Apply the mapping. Do NOT touch sorting, column resize, portal menus, editing, or row logic.
- [ ] **Step 2: Verify** — `npm test`; homepage 200. Controller: visual pass + sort/resize/stage-picker still work.
- [ ] **Step 3: Commit** — `feat: prospects table in glass skin`

---

### Task 6: Inbox reskin

**Files:**
- Modify: `components/LeadInbox.jsx` (classes only — zero logic changes)

Class mapping: add-lead card & lead cards `bg-surface border border-line rounded-2xl shadow-card` → `glass-panel`; ScorePanel inner box `border border-line rounded-xl bg-paper` → `glass-control !rounded-[10px] bg-white/40`; all inputs/selects/textareas `bg-paper border border-line rounded-lg` → `glass-control bg-white/55`; secondary buttons (`border border-line bg-paper …`) → `glass-control text-ink-2 hover:bg-white/60 rounded-[8px]`; primary buttons (`bg-charcoal text-paper` / `bg-mauve-deep text-paper`) → `bg-rose text-white rounded-[8px] shadow-pill hover:bg-rose-deep`; filter buttons active state `bg-charcoal text-paper border-charcoal` → `bg-rose text-white border-rose`; post excerpt gets `font-serif italic text-[15px]`; verdict text colors `text-emerald-700`→`text-leaf-text`, `text-red-600` stays acceptable or `text-poppy` with dot `bg-poppy`; keep dots as-is otherwise. All `rounded-2xl`→`rounded-[13px]`, `rounded-lg/rounded-xl` on controls → `rounded-[8px]`.

- [ ] **Step 1:** Apply mapping (classes only). **Step 2: Verify** — `npm test`; homepage 200; controller interactive pass (add, score, promote flows unchanged). **Step 3: Commit** — `feat: inbox in glass skin`

---

### Task 7: Settings + Stats reskin

**Files:**
- Modify: `components/SettingsView.jsx`, `components/ProspectsApp.jsx` (Stats view section only)

SettingsView mapping: cards `bg-surface border border-line rounded-2xl shadow-card` → `glass-panel`; inputs `bg-paper border border-line` → `glass-control bg-white/55`; rule rows `bg-surface border border-line` → `glass-control bg-white/45`; primary buttons → `bg-rose text-white rounded-[8px] shadow-pill hover:bg-rose-deep`; platform toggles active `bg-charcoal text-paper border-charcoal` → `bg-rose text-white border-rose`.
Stats view: stat cards/tiles → `glass-panel` with `font-serif` numerals `text-rose-deep` (green metrics `text-leaf-text`); labels `font-mono text-[11px] uppercase tracking-[0.14em] text-ink-2`. `computeStats` untouched.

- [ ] **Step 1:** Apply both mappings. **Step 2: Verify** — `npm test`; homepage 200; controller pass (settings save round-trip; stats numbers render). **Step 3: Commit** — `feat: settings and stats in glass skin`

---

### Task 8: Sweep + responsive + a11y polish

**Files:**
- Modify: `components/ProspectsApp.jsx`, `components/LeadInbox.jsx`, `components/SettingsView.jsx` (residue only)

- [ ] **Step 1:** Grep for leftover old-token classes (`bg-paper`, `bg-surface`, `border-line`, `text-charcoal`, `bg-blush`, `text-mauve`, `rounded-2xl` on cards) in all three files and convert stragglers per the mappings above (aliases render fine, but the sweep keeps one vocabulary). Import/export buttons, empty states, import modal if any — same treatment.
- [ ] **Step 2:** Mobile (<900px): buttons min-height 44px (`py-3` under `max-md:`), rail wraps correctly, panels stack, no horizontal scroll at 375px.
- [ ] **Step 3:** Confirm: every interactive element shows the rose focus ring (spot-check tab order), drawer/popover Esc + focus-return work, decorative SVGs aria-hidden.
- [ ] **Step 4: Verify** — `npm test`; homepage 200; `grep -c 'fonts.googleapis' app/layout.jsx` → 0. **Step 5: Commit** — `chore: glass sweep, responsive and a11y polish`

---

### Task 9: Build gate, deploy, live verification (controller)

- [ ] **Step 1:** Stop dev server; `npm test` + `npm run build` (all routes ƒ).
- [ ] **Step 2:** Final whole-branch review (subagent), fix findings, re-review.
- [ ] **Step 3:** Merge `feature/liquid-glass` → main, push, watch deploy.
- [ ] **Step 4:** Live: browser pass on leadsthatbloom.com (four views, fonts loading from /fonts/, aurora, drawer, popover); re-run the Phase A API E2E (create lead → score → promote → 409 → cleanup) to prove no functional regression.
- [ ] **Step 5:** Update HANDOFF.md ("visual style" paragraph → liquid glass, tokens in spec) and commit.
