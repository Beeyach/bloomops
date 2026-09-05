# Liquid Glass Redesign — Full-App Reskin + Layout

**Date:** 2026-07-16
**Status:** Approved direction (mockup v2 + critique fixes signed off in session)
**Reference mockup:** session scratchpad `ltb-glass-mockup.html` (authoritative for
tokens and component treatments; values are duplicated below so this spec stands alone)

## Intent

Full redesign of Leads That Bloom: baby-pink "liquid glass" look over an artsy
aurora backdrop, with a new sidebar-rail layout. Brand identity is KEPT: Instrument
Serif wordmark ("Leads *that* Bloom" with true italic), IBM Plex Mono uppercase
labels, the five-petal flower mark, garden vocabulary. Anti-slop rules: exactly one
accent family (raspberry-rose), no purple, no neon glow, no gradient text, film
grain over the backdrop so nothing reads airbrushed.

## Design tokens (Tailwind config + globals.css)

Colors (replace the warm-paper palette):

```
ink        #3A2A32   body text (11.3:1 on effective bg)
ink-2      #7A6470   secondary text — the FLOOR for any text ≤ 13px (4.5:1)
ink-3      #8A7280   decorative/placeholder ONLY, never small text
rose       #B84C72   the accent: primary buttons, active nav, count pills, due badges
rose-deep  #9C3D60   hover/emphasis, wordmark "that"
leaf       #4E8A63   green DOTS/backgrounds only
leaf-text  #3E7554   green TEXT (4.5:1)
poppy      #C24B5C   red dots; darken similarly if used as text
gold       #C9973F   "New" stage dot
hairline   rgba(184,76,114,.16)
```

Background wash: `linear-gradient(170deg, #FFF6F9 0%, #FAE3EB 42%, #F4D3DF 100%)`.

Glass recipes — exactly two, tokenized (CSS utility classes in globals.css, since
Tailwind arbitrary values would be unreadable):

- `.glass-panel`: bg `linear-gradient(135deg, rgba(255,255,255,.34), rgba(255,255,255,.14))`;
  border 1px `rgba(255,255,255,.55)`; shadow `0 18px 50px rgba(156,61,96,.13),
  inset 0 1px 0 rgba(255,255,255,.75), inset 0 -1px 0 rgba(255,255,255,.18)`;
  `backdrop-filter: blur(26px) saturate(1.6)` (+ -webkit-); radius 13px; plus the
  `::before` prismatic top sheen from the mockup.
- `.glass-control`: bg `rgba(255,255,255,.30)`; border 1px `rgba(255,255,255,.55)`;
  `backdrop-filter: blur(8px)`; radius 8px.

Radii (tightened per session feedback — NO pill shapes anywhere): panel 13 /
search 12 / stat chips 12 / nav item 9 / buttons & controls 8 / stage & due
badges 7 / count badge 6. Status dots remain circles.

**Mandatory fallback:**
```css
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass-panel { background: rgba(255,255,255,.84); }
  .glass-control { background: rgba(255,255,255,.88); }
}
```

**Focus:** `:focus-visible { outline: 2px solid rose; outline-offset: 2px; }` on all
interactive elements, app-wide.

## Fonts — self-hosted, replacing Google Fonts

`public/fonts/`: `instrument-serif.ttf`, `instrument-serif-italic.ttf`,
`instrument-sans-var.ttf` (already staged in session scratchpad; copy from
`C:\Users\User\Downloads\` originals), plus IBM Plex Mono (400/500/600 —
download woff2 from the plex GitHub release or keep Google Fonts for mono only if
download is blocked; prefer self-host). `@font-face` in globals.css
(`font-display: swap`; sans is a variable font, `font-weight: 100 900`). Remove the
Google Fonts `<link>`s from `app/layout.jsx`.

## Backdrop (rendered once in layout or ProspectsApp root)

Fixed full-viewport layer, z-index below content:
1. Wash gradient (above).
2. Two `conic-gradient` aurora layers (exact stops in mockup), `blur(60px)`/`blur(80px)`,
   rotating via `transform` animation, 90s and 130s reverse. `prefers-reduced-motion:
   reduce` → animation off.
3. Two oversized hand-drawn five-petal SVG outlines (`aria-hidden="true"`), rose at
   8–10% opacity, positioned off-canvas corners (paths in mockup).
4. Film grain: fixed overlay, SVG feTurbulence data-URI, `opacity .32`,
   `mix-blend-mode: soft-light`, `pointer-events: none`.

## Layout — sidebar rail + workspace

Desktop (≥900px): flex row, 22px gap/padding, max-width 1440 centered.
- **Rail** (230px, sticky, glass-panel): flower mark + wordmark; mono tagline;
  nav (Prospects / Inbox [count pill] / Stats / Settings) — active item gets a
  raised glass treatment; world clocks at the foot (hide below 700px viewport
  height). Replaces the centered masthead AND the tab switcher.
- **Workspace** (flex-1): topbar = glass search bar (12px radius, existing search state) +
  "Due today" / "Sent today" chips (serif numerals, from existing computed stats) +
  primary "Add prospect" button. Below: the active view as floating glass panels.

Mobile (<900px): rail becomes a top bar (mark + wordmark; nav wraps to a second
row below 480px); clocks and tagline hidden; panels stack. Buttons get taller
(≥44px targets) under 900px.

## View-by-view

- **Prospects:** table inside a glass-panel with a panel-head ("Prospects" serif +
  mono count + Filters button). Table: mono uppercase 10px headers on
  `rgba(255,255,255,.18)`; rows hover `rgba(255,255,255,.35)`; name cell = ink
  name + ink-2 business line; stage chips = glass pill + colored dot (rose=email
  stages, gold=New, leaf=Client, neutral otherwise — mapping in mockup); due badge =
  rose gradient pill white text; quiet cells mono ink-2. Column set/behavior
  (sort, resize, StagePicker, portal menus, editing) is UNCHANGED — reskin only.
- **Add prospect:** the inline form row is replaced by a **right-side glass drawer**
  (slides over the workspace, backdrop click / Esc to close, focus trapped) holding
  the existing add-form fields and submit logic unchanged.
- **Filters:** the filter row moves into a **glass popover** anchored to the
  Filters button (reuse the existing PortalMenu machinery); contents unchanged
  (due-only, stage/rating checklists, read state).
- **Inbox:** LeadInbox cards become glass panels; verdict = colored dot + leaf-text/
  poppy-text label; post excerpt gets the serif-italic treatment; Score/Qualify =
  glass-control buttons; Promote = primary rose. Add-lead card is a glass panel
  (structure unchanged).
- **Stats:** stat cards → glass chips/panels with serif numerals; computeStats logic
  untouched.
- **Settings:** cards → glass panels; RuleList inputs → glass-control styling;
  behavior untouched.

## Hard rules for the build

1. Reskin + shell only: NO changes to data flow, API calls, `window.bloom`,
   due-date logic, or component contracts. `view` state and its four values stay.
2. Text ≤13px never lighter than ink-2; ink-3 is decorative/placeholder only;
   leaf/poppy as text use their -text variants.
3. Both glass recipes come from the two utility classes — no ad-hoc rgba soup.
4. No flag emoji; CSS dots for verdicts (unchanged rule).
5. Every interactive element keyboard-reachable with the rose focus ring; drawer
   and popover close on Esc and return focus to their trigger.
6. Decorative SVGs `aria-hidden="true"`.
7. Performance: aurora animates `transform` only; grain is a static tile; test on
   a mid-tier machine — if panels jank while scrolling the table, reduce panel
   blur to 18px before shipping.
8. Favicon/flower and product name unchanged.

## Out of scope

Dark mode; new features; table column changes; auth; mobile-specific navigation
beyond the responsive collapse described above.

## Verification plan

`npm test` unchanged (no module changes). `npm run build` clean. Browser pass on
the dev server: all four views in the new skin at 1280px and 375px; keyboard-only
walk (tab through rail → search → table → drawer); reduced-motion check
(devtools emulation); no-blur fallback check (devtools rendering emulation or
Firefox ESR if available); the Phase A live E2E re-run after deploy to confirm
nothing functional regressed.
