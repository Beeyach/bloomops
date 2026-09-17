# Phase 2: Light + Dark Theme System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a light theme and a user toggle, by moving every color the app renders behind CSS variables scoped to `html[data-theme]`, so the theme flips in pure CSS with zero re-render logic.

**Architecture:** Three layers move to variables: (1) Tailwind tokens become `var(--x)` references (two tokens that take `/opacity` modifiers use the RGB-triplet `<alpha-value>` form), (2) globals.css defines the full variable set twice — `html[data-theme="light"]` and `html[data-theme="dark"]` — with dark values byte-identical to what Phase 1 shipped, (3) the inline JS color maps (STAGE_META, RATING_META, REPLY_TYPE_META, daysAgoColor) return `var(--…)` strings instead of hexes. A tiny `useTheme` hook + a no-FOUC inline script handle state; a sun/moon button in the sidebar and an Appearance row in Settings expose it.

**Tech Stack:** Next.js 15 (plain JS), Tailwind 3, no new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-bloomboard-consolidation-design.md`, Amendment A1.
- **Dark mode must render byte-identical to Phase 1** (commit c7c28de): same computed colors everywhere. The refactor only indirects values, never changes them.
- Light values are the pre-reskin originals (recoverable at commit `d995628`) plus the light palette in Amendment A1.
- ZERO behavior changes beyond the theme toggle itself. No API, DB, or handler changes.
- Semantic colors stay semantic in both themes.
- Default theme: dark. Preference key: `localStorage['ltb_theme']`.
- Do NOT push to GitHub. Commit locally on branch `feature/liquid-glass`.
- Do NOT run `npm run build` or a dev server in implementer subagents (controller verifies visually at gates). `npm test` is allowed and required where stated.
- Generated artifacts for this phase live in `.superpowers/sdd/phase2/`:
  `theme-vars-light.css`, `theme-vars-dark.css` (stage/rating/age/misc variable blocks), `meta-maps.js.txt` (replacement STAGE_META / RATING_META / daysAgoColor code). Treat their contents as spec — paste verbatim where a step says INSERT.

---

### Task 1: Variable plumbing — tailwind.config.js + globals.css

**Files:**
- Modify: `tailwind.config.js` (colors block only; fonts/shadows stay)
- Modify: `app/globals.css` (full replacement, content specified below)

**Interfaces:**
- Produces: every Tailwind color class the app already uses, now theme-driven; CSS variables consumed by Tasks 2-4 (`--bg`, `--panel`, `--surface`, `--card-hover`, `--ink`, `--ink-2`, `--ink-3`, `--bright`, `--line`, `--line-strong`, `--rose`, `--rose-hover`, `--rose-deep`, `--rose-text`, `--rose-tint`, `--hairline`, `--rose-line`, `--leaf`, `--leaf-text`, `--gold`, `--gold-text`, `--poppy`, `--poppy-text`, `--input-bg`, `--control-bg`, `--rose-active`, `--hover-wash`, `--hover-wash-soft`, `--backdrop-stroke`, `--bloom-op1`, `--bloom-op2`, `--positive-text`, `--faint` alias via `--ink-3`, plus the generated `--stg-*`, `--rt-*`, `--age-*` sets).
- New Tailwind tokens: `hover-wash`, `hover-wash-soft` (consumed by Task 2).

- [ ] **Step 1: Replace the `colors` object in `tailwind.config.js` with:**

```js
      colors: {
        // Theme-driven tokens (Amendment A1). Values live in globals.css
        // under html[data-theme="light"] / html[data-theme="dark"].
        // `muted` and `mauve-deep` take /opacity modifiers in JSX, so they
        // use the RGB-triplet alpha-capable form.
        bg: 'var(--bg)',
        wash: 'var(--bg)',
        panel: 'var(--panel)',
        surface: 'var(--surface)',
        'card-hover': 'var(--card-hover)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        'ink-3': 'var(--ink-3)',
        bright: 'var(--bright)',
        rose: 'var(--rose)',
        'rose-hover': 'var(--rose-hover)',
        'rose-deep': 'var(--rose-deep)',
        'rose-text': 'var(--rose-text)',
        'rose-tint': 'var(--rose-tint)',
        leaf: 'var(--leaf)',
        'leaf-text': 'var(--leaf-text)',
        gold: 'var(--gold)',
        'gold-text': 'var(--gold-text)',
        poppy: 'var(--poppy)',
        'poppy-text': 'var(--poppy-text)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        hairline: 'var(--hairline)',
        'rose-line': 'var(--rose-line)',
        'hover-wash': 'var(--hover-wash)',
        'hover-wash-soft': 'var(--hover-wash-soft)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        'mauve-deep': 'rgb(var(--mauve-deep-rgb) / <alpha-value>)',
        // Transitional aliases (kept so existing JSX compiles).
        charcoal: 'var(--ink)',
        'charcoal-2': 'var(--ink-2)',
        mauve: 'var(--rose)',
        blush: 'var(--rose-tint)',
        'blush-soft': 'var(--card-hover)',
        paper: 'var(--bg)',
      },
```

- [ ] **Step 2: Replace `app/globals.css` entirely with the content below.** At the two INSERT markers, paste the entire contents of the named artifact file.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ─────────────────────────────────────────────────────────────────────────
   Theme system (Amendment A1). Every color in the app resolves through
   these variables. html[data-theme] is set pre-paint by an inline script
   in app/layout.jsx (default: dark). :root carries dark as a fallback so
   the first paint is never unstyled.
   ─────────────────────────────────────────────────────────────────────── */

:root, html[data-theme="dark"] {
  --bg: #191817;
  --panel: #201F1D;
  --surface: #1E1D1B;
  --card-hover: #242220;
  --ink: #D6D2CC;
  --ink-2: #9B9691;
  --ink-3: #736E67;
  --bright: #F1EEE9;
  --line: #2E2C29;
  --line-strong: #3B3833;
  --rose: #B84C72;
  --rose-hover: #C75E84;
  --rose-deep: #9C3D60;
  --rose-text: #E08BA6;
  --rose-tint: rgba(224, 139, 166, 0.14);
  --hairline: rgba(224, 139, 166, 0.20);
  --rose-line: rgba(184, 76, 114, 0.30);
  --leaf: #34936B;
  --leaf-text: #6BC79A;
  --gold: #C9973F;
  --gold-text: #DCAE5E;
  --poppy: #C7513A;
  --poppy-text: #E58A74;
  --input-bg: #242320;
  --control-bg: #242320;
  --rose-active: #E08BA6;
  --hover-wash: rgba(255, 255, 255, 0.07);
  --hover-wash-soft: rgba(255, 255, 255, 0.045);
  --backdrop-stroke: #E08BA6;
  --bloom-op1: 0.05;
  --bloom-op2: 0.04;
  --scroll-thumb: rgba(224, 139, 166, 0.25);
  --scroll-thumb-hover: rgba(224, 139, 166, 0.45);
  --selection: rgba(224, 139, 166, 0.28);
  --focus-ring: rgba(224, 139, 166, 0.30);
  --edit-glow: rgba(224, 139, 166, 0.18);
  --muted-rgb: 155 150 145;
  --mauve-deep-rgb: 224 139 166;
  color-scheme: dark;
/* INSERT HERE: full contents of .superpowers/sdd/phase2/theme-vars-dark.css */
}

html[data-theme="light"] {
  --bg: #FBEDF2;
  --panel: #FFFFFF;
  --surface: #FFFFFF;
  --card-hover: #FAF3F6;
  --ink: #3A2A32;
  --ink-2: #7A6470;
  --ink-3: #8A7280;
  --bright: #2A1E24;
  --line: rgba(184, 76, 114, 0.16);
  --line-strong: rgba(184, 76, 114, 0.30);
  --rose: #B84C72;
  --rose-hover: #A84368;
  --rose-deep: #9C3D60;
  --rose-text: #9C3D60;
  --rose-tint: rgba(184, 76, 114, 0.10);
  --hairline: rgba(184, 76, 114, 0.16);
  --rose-line: rgba(184, 76, 114, 0.30);
  --leaf: #4E8A63;
  --leaf-text: #3E7554;
  --gold: #C9973F;
  --gold-text: #8A6D1F;
  --poppy: #C24B5C;
  --poppy-text: #A33B4B;
  --input-bg: #FFFFFF;
  --control-bg: #FAF3F6;
  --rose-active: #B84C72;
  --hover-wash: rgba(58, 42, 50, 0.05);
  --hover-wash-soft: rgba(58, 42, 50, 0.035);
  --backdrop-stroke: #B84C72;
  --bloom-op1: 0.10;
  --bloom-op2: 0.08;
  --scroll-thumb: rgba(184, 76, 114, 0.35);
  --scroll-thumb-hover: rgba(156, 61, 96, 0.6);
  --selection: rgba(184, 76, 114, 0.22);
  --focus-ring: rgba(184, 76, 114, 0.30);
  --edit-glow: rgba(184, 76, 114, 0.18);
  --muted-rgb: 122 100 112;
  --mauve-deep-rgb: 156 61 96;
  color-scheme: light;
/* INSERT HERE: full contents of .superpowers/sdd/phase2/theme-vars-light.css */
}

html, body {
  height: 100%;
  background: var(--bg);
  color: var(--ink);
  font-feature-settings: 'ss01', 'ss02';
}

::selection { background: var(--selection); }

/* ─────────────────────────────────────────────────────────────────────────
   Editable cell styling.
   ─────────────────────────────────────────────────────────────────────── */
.cell-input {
  background: var(--input-bg);
  outline: none;
  width: 100%;
  border: 1px solid var(--rose);
  border-radius: 6px;
  padding: 5px 8px;
  font: inherit;
  color: var(--ink);
  box-shadow: 0 0 0 3px var(--edit-glow);
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
html[data-theme="dark"] .bw-chip:hover { filter: brightness(1.15); }
html[data-theme="light"] .bw-chip:hover { filter: brightness(0.97); }
.bw-chip:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--focus-ring);
}
.bw-chip svg { flex-shrink: 0; }

/* Stage <select>. Chevron color is theme-scoped below. */
select.status-select {
  border: 1px solid transparent;
  border-radius: 999px;
  padding: 3px 22px 3px 10px;
  font-weight: 500;
  font-size: 13px;
  appearance: none;
  -webkit-appearance: none;
  background-repeat: no-repeat;
  background-position: right 6px center;
  background-size: 10px 7px;
}
html[data-theme="dark"] select.status-select {
  background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23D6D2CC' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}
html[data-theme="light"] select.status-select {
  background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%233A2A32' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}
html[data-theme="dark"] select.status-select:hover { filter: brightness(1.15); }
html[data-theme="light"] select.status-select:hover { filter: brightness(0.97); }
select.status-select:focus {
  outline: none;
  box-shadow: 0 0 0 3px var(--focus-ring);
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
  background: var(--scroll-thumb);
  border-radius: 999px;
}
.bw-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--scroll-thumb-hover);
}

/* ── Fonts (self-hosted) ─────────────────────────────────────────────── */

@font-face{font-family:'Instrument Serif';src:url('/fonts/instrument-serif.ttf') format('truetype');font-style:normal;font-display:swap}
@font-face{font-family:'Instrument Serif';src:url('/fonts/instrument-serif-italic.ttf') format('truetype');font-style:italic;font-display:swap}
@font-face{font-family:'Instrument Sans';src:url('/fonts/instrument-sans-var.ttf') format('truetype-variations');font-weight:100 900;font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url('/fonts/ibm-plex-mono-400.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url('/fonts/ibm-plex-mono-500.woff2') format('woff2');font-weight:500;font-display:swap}
@font-face{font-family:'IBM Plex Mono';src:url('/fonts/ibm-plex-mono-600.woff2') format('woff2');font-weight:600;font-display:swap}

/* ── Flat surfaces (theme-driven; class names kept for 30+ call sites) ── */

.glass-panel{
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
}
.glass-control{
  background: var(--control-bg);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
}

:where(a,button,input,select,textarea,[tabindex]):focus-visible{outline:2px solid var(--rose-active);outline-offset:2px}
```

- [ ] **Step 3: Verify**

Run: `node -e "console.log(Object.keys(require('./tailwind.config.js').theme.extend.colors).length)"` → prints a number ≥ 32.
Run: `grep -c "INSERT HERE" app/globals.css` → 0 (both markers replaced with artifact contents).
Run: `grep -c "stg-new-bg" app/globals.css` → 2 (one per theme block).
Run: `grep -n "#242320\|#E08BA6\|#D6D2CC" app/globals.css | grep -v "data-theme\|--" ` → only the two chevron data-URI lines and variable definitions may contain hexes; no component rule outside the theme blocks may.

- [ ] **Step 4: Commit**

```bash
git add tailwind.config.js app/globals.css
git commit -m "feat: theme-driven CSS variables, light + dark value sets"
```

---

### Task 2: White-alpha sweep + backdrop variables

**Files:**
- Modify: `components/GlassRail.jsx`, `components/ProspectsApp.jsx`, `components/LeadInbox.jsx`, `components/SettingsView.jsx`, `components/AddProspectDrawer.jsx` (class strings only)
- Modify: `components/GlassBackdrop.jsx`

**Interfaces:**
- Consumes: `hover-wash`, `hover-wash-soft`, `line-strong` tokens and `--backdrop-stroke`, `--bloom-op1`, `--bloom-op2` variables from Task 1.

- [ ] **Step 1: Apply this exact class mapping across the five components (longest-first, `hover:` prefixes survive automatically):**

| Find | Replace |
|---|---|
| `bg-white/[0.07]` | `bg-hover-wash` |
| `bg-white/[0.08]` | `bg-hover-wash` |
| `bg-white/[0.06]` | `bg-hover-wash` |
| `bg-white/[0.05]` | `bg-hover-wash-soft` |
| `bg-white/[0.045]` | `bg-hover-wash-soft` |
| `bg-white/[0.04]` | `bg-hover-wash-soft` |
| `border-white/10` | `border-line-strong` |

- [ ] **Step 2: In `components/GlassBackdrop.jsx`, replace the inline `<style>` block's rules with theme-driven values (structure unchanged):**

```
.ltb-dark{position:fixed;inset:0;z-index:-2;overflow:hidden;background:var(--bg)}
.ltb-strokes{position:absolute;inset:0;color:var(--backdrop-stroke);pointer-events:none}
.ltb-strokes svg{position:absolute;overflow:visible}
.ltb-strokes .s1{width:860px;height:860px;top:-260px;right:-220px;opacity:var(--bloom-op1)}
.ltb-strokes .s2{width:520px;height:520px;bottom:-180px;left:-140px;opacity:var(--bloom-op2);transform:rotate(38deg)}
```

Also update the component's comment: it is now the theme-aware backdrop, not "dark edition".

- [ ] **Step 3: Verify**

Run: `grep -rn "bg-white/\[0\|border-white/10" components/ --include="*.jsx"` → zero hits.
Run: `grep -c "var(--backdrop-stroke)" components/GlassBackdrop.jsx` → 1.
Run: `grep -n "#191817\|#E08BA6" components/GlassBackdrop.jsx` → zero hits.

- [ ] **Step 4: Commit**

```bash
git add components/
git commit -m "feat: hover-wash tokens + theme-aware backdrop"
```

---

### Task 3: Inline color maps → CSS variables

**Files:**
- Modify: `components/ProspectsApp.jsx` (STAGE_META, RATING_META, REPLY_TYPE_META, daysAgoColor, and enumerated inline literals)
- Modify: `app/globals.css` (append REPLY_TYPE variables to both theme blocks)

**Interfaces:**
- Consumes: the `--stg-*`, `--rt-*`, `--age-*`, `--positive-text` variables from Task 1's artifact inserts.
- Produces: STAGE_META/RATING_META keep their exact shapes (`{icon,bg,border,faded?}` / `{icon,filled,color,bg,label}`) — all values are now `'var(--…)'` strings. Consumers are unchanged.

- [ ] **Step 1: Replace STAGE_META, RATING_META, and `daysAgoColor` with the code in `.superpowers/sdd/phase2/meta-maps.js.txt`.** (STAGE_META and RATING_META live near lines 70-115; `daysAgoColor` near line 194.) STAGE_META and RATING_META: verbatim from the artifact. For `daysAgoColor`: keep the EXISTING function's exact signature, parameter name, comments, and threshold logic — only swap each returned hex for the artifact's corresponding `var(--age-…)` string. If the existing thresholds differ from the artifact's (null / ≤2 / ≤5 / ≤10 / else), the existing thresholds win; map by position (null→age-none, smallest→age-fresh, then age-warm, age-stale, largest→age-cold) and note it in your report.

- [ ] **Step 2: REPLY_TYPE_META → variables.** First recover the original light values: `git show d995628:components/ProspectsApp.jsx | grep -n "REPLY_TYPE_META" -A 8`. Then:
  1. Append to the DARK theme block in globals.css (before its closing brace):
```
  /* reply types */
  --reply-interested-color: #7CC46B;
  --reply-interested-bg: rgba(124,196,107,0.14);
  --reply-defer-color: #D0BA55;
  --reply-defer-bg: rgba(208,186,85,0.14);
  --reply-decline-color: #DE7E68;
  --reply-decline-bg: rgba(222,126,104,0.14);
```
  2. Append the same six variable names to the LIGHT theme block, using the recovered original color/bg values from d995628 for the matching keys.
  3. Replace REPLY_TYPE_META's color/bg values with the corresponding `'var(--reply-…)'` strings, keys and labels unchanged. (If the recovered object's keys differ from interested/defer/decline, name the variables after the actual keys and report the mapping in your report.)

- [ ] **Step 3: Inline literals → variables in `components/ProspectsApp.jsx`:**

| Find (exact) | Replace | Sites |
|---|---|---|
| `'#6BC79A'` | `'var(--positive-text)'` | 2 (the two inline-STYLE sites only; the third `#6BC79A` site is Tailwind arbitrary-value classes and is handled in Step 3a) |
| `m.faded ? '#9B9691' : '#D6D2CC'` | `m.faded ? 'var(--ink-2)' : 'var(--ink)'` | 1 |
| `meta.faded ? '#9B9691' : '#D6D2CC'` | `meta.faded ? 'var(--ink-2)' : 'var(--ink)'` | 1 |
| `'#1E1D1B'` | `'var(--surface)'` | 2 (stage-chip transparent fallbacks) |
| `borderColor: '#3B3833'` | `borderColor: 'var(--line-strong)'` | 2 |
| `color: '#736E67'` | `color: 'var(--ink-3)'` | 1 |

- [ ] **Step 3a: The EmailCard saved-state Tailwind classes.** One `#6BC79A` site is Tailwind arbitrary-value classes (`border-[#6BC79A] ring-1 ring-[#6BC79A]/30` or similar, near line 3148). Tailwind cannot theme arbitrary hex classes. Replace with the token classes: `border-leaf-text ring-1 ring-leaf-text/30`. But note: `leaf-text` is a plain `var()` token and cannot take `/30` — so ALSO move `leaf-text` to the alpha-capable triplet form: in `tailwind.config.js` change `'leaf-text': 'var(--leaf-text)'` to `'leaf-text': 'rgb(var(--leaf-text-rgb) / <alpha-value>)'`, and add to globals.css theme blocks: dark `--leaf-text-rgb: 107 199 154;`, light `--leaf-text-rgb: 62 117 84;`. The other two `'#6BC79A'` inline-style sites use `'var(--positive-text)'` per the Step 3 table.

- [ ] **Step 4: Verify**

Run: `npm test` → all pass.
Run: `grep -n "#7CC46B\|#D0BA55\|#DFA05F\|#DE7E68\|#736E67\|#6BC79A\|#9B9691\|#D6D2CC\|#1E1D1B\|#3B3833\|#C99BC0\|rgba(201,155,192" components/ProspectsApp.jsx` → zero hits (all moved to variables).

- [ ] **Step 5: Commit**

```bash
git add components/ProspectsApp.jsx app/globals.css tailwind.config.js
git commit -m "feat: inline color maps resolve through theme variables"
```

---

### Task 4: Theme state, no-FOUC boot, and the toggle UI

**Files:**
- Modify: `app/layout.jsx` (full replacement below)
- Create: `components/useTheme.js`
- Modify: `components/GlassRail.jsx` (sun/moon button above the clocks block)
- Modify: `components/SettingsView.jsx` (Appearance row)

**Interfaces:**
- Consumes: `html[data-theme]` variable scoping from Task 1.
- Produces: `useTheme()` hook returning `{ theme, setTheme, toggle }`; `localStorage['ltb_theme']` ('light' | 'dark').

- [ ] **Step 1: Replace `app/layout.jsx` with:**

```jsx
import './globals.css';

export const metadata = {
  title: 'Leads That Bloom',
  description: 'A cozy prospecting tracker — plant a lead, watch it bloom.',
};

export const viewport = {
  themeColor: '#191817',
};

// The boot script is the SOLE owner of html[data-theme]: it always sets a
// value (stored preference, else dark) before first paint, so there is no
// flash. The attribute is deliberately NOT in the JSX — if it were, React
// hydration would re-apply the JSX value over the stored preference.
// globals.css keeps :root fallback = dark so a blocked script still paints.
const themeBoot = `(function(){var t;try{t=localStorage.getItem('ltb_theme')}catch(e){}document.documentElement.dataset.theme=t==='light'?'light':'dark'})()`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="bg-wash text-charcoal font-sans antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Create `components/useTheme.js`:**

```js
'use client';

import { useCallback, useEffect, useState } from 'react';

const THEME_COLORS = { dark: '#191817', light: '#FBEDF2' };

function readTheme() {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

// Theme state backed by html[data-theme]. All colors resolve through CSS
// variables, so applying the attribute is the entire theme switch; React
// state exists only so toggle buttons re-render their own icon/label.
export default function useTheme() {
  const [theme, setThemeState] = useState(readTheme);

  useEffect(() => {
    setThemeState(readTheme());
  }, []);

  const setTheme = useCallback((next) => {
    const value = next === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = value;
    try { localStorage.setItem('ltb_theme', value); } catch (e) {}
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = THEME_COLORS[value];
    setThemeState(value);
  }, []);

  const toggle = useCallback(() => {
    setTheme(readTheme() === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, setTheme, toggle };
}
```

- [ ] **Step 3: Sun/moon toggle in `components/GlassRail.jsx`.** Import the hook (`import useTheme from './useTheme';`). Inside `GlassRail`, call `const { theme, toggle } = useTheme();`. Insert this block in the desktop `<aside>`, directly BEFORE the existing `<div className="mt-auto border-t border-line pt-3 min-h-0">` clocks wrapper (so the toggle sits above the clocks; move `mt-auto` onto the toggle's wrapper and remove it from the clocks div):

```jsx
      <div className="mt-auto pb-2">
        <button
          onClick={toggle}
          className="flex items-center gap-2.5 px-3 py-2.5 w-full rounded-[9px] font-mono text-[11px] uppercase tracking-[0.13em] text-ink-2 hover:bg-hover-wash-soft transition"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[17px] h-[17px]" aria-hidden="true">
            {theme === 'dark'
              ? <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>
              : <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>}
          </svg>
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </div>
      <div className="border-t border-line pt-3 min-h-0">
```

(The clocks `<div>`'s closing tag is unchanged; only its opening tag loses `mt-auto`.)

- [ ] **Step 4: Appearance row in `components/SettingsView.jsx`.** Read the file first. Add, as the FIRST section inside the view's main container, following the file's existing section/card markup patterns:

```jsx
      <section className="glass-panel p-5">
        <h2 className="font-serif text-xl text-ink mb-1">Appearance</h2>
        <p className="text-sm text-ink-2 mb-3">Theme for this browser. Saved on this device.</p>
        <div className="flex gap-2">
          {['light', 'dark'].map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`px-4 py-2 rounded-[8px] font-mono text-[11px] uppercase tracking-[0.13em] border transition ${
                theme === t
                  ? 'text-rose-text bg-rose-tint border-transparent'
                  : 'text-ink-2 border-line-strong hover:bg-hover-wash-soft'
              }`}
            >
              {t === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </section>
```

Import and call the hook at the top of the component: `import useTheme from './useTheme';` … `const { theme, setTheme } = useTheme();`. If SettingsView's existing structure makes "first section" awkward, place it where it reads naturally and say so in your report.

- [ ] **Step 5: Verify**

Run: `npm test` → all pass.
Run: `grep -c "suppressHydrationWarning" app/layout.jsx` → 1. `grep -c "ltb_theme" app/layout.jsx components/useTheme.js` → ≥2.

- [ ] **Step 6: Commit**

```bash
git add app/layout.jsx components/useTheme.js components/GlassRail.jsx components/SettingsView.jsx
git commit -m "feat: light/dark theme toggle with no-FOUC boot"
```

---

### Task 5: Controller gate — both themes (controller runs this, not a subagent)

- [ ] Dev server up; dark mode renders IDENTICAL to Phase 1 (spot-check: canvas #191817, sidebar active rgba(224,139,166,0.14), stage stripe #C99BC0 on a New prospect).
- [ ] Toggle from sidebar: instant flip to warm blush light theme, no reload; toggle from Settings works; choice survives reload (localStorage).
- [ ] Light mode: all four views readable, chips/table/drawer/popovers correct, no dark-on-dark or light-on-light.
- [ ] No hydration warnings or console errors in either theme.
- [ ] `npm test` green.
- [ ] Whole-phase review (subagent), fixes if needed, ledger updated.
