# BloomBoard Consolidation — Design

Date: 2026-07-16
Status: Approved pending user review
Repo: `F:\bloomtrack-pro` (product: Leads That Bloom, leadsthatbloom.com)

## Goal

Consolidate BloomBoard (single-file lead tracker at bloomnotes.me) and
BloomTrack Pro into one product on leadsthatbloom.com. BloomTrack Pro is the
foundation (Next.js 15 + Cloudflare Pages + D1). BloomBoard contributes its
UI (dark Notion look, now with the rose palette) and four features: the Today
tab, Clients + onboarding checklists, the editable Library, and the
5-question scoring rubric.

## Non-goals

- No billing, no Stripe. Deferred by owner ("maybe later").
- No auth or multi-tenancy in this project. The app stays single-tenant.
- BloomBoard itself is untouched. bloomnotes.me keeps serving the one-file
  app as-is. Nothing in `F:\bloomnotion` changes.
- No changes to the Lead Engine scoring loop, stages, cadence, or due logic.
  New features build on top of them, never fork them.

## Follow-up (out of scope, noted for later)

- **Ellen's instance:** once phases 1-5 ship, deploy a dedicated instance for
  Ellen: separate Cloudflare Pages project + separate D1 database, same repo.
  No code changes required. Pricing discussed separately (founding rate).

## 1. Theme — "dark blush"

BloomBoard's dark base + BloomTrack's rose family. Both apps already use
Instrument Serif + Instrument Sans, so type converges for free. IBM Plex Mono
stays for stage pills, table labels, and dates (BloomTrack's signature).

Tailwind tokens (replace the current light "liquid-glass" palette):

| Token | Value | Role |
|---|---|---|
| `bg` | `#191817` | app canvas |
| `panel` | `#201F1D` | sidebar, sheets, modals |
| `card` | `#1E1D1B` | cards, table rows |
| `card-hover` | `#242220` | hover state |
| `ink` | `#D6D2CC` | body text |
| `bright` | `#F1EEE9` | headings, emphasized text |
| `muted` | `#9B9691` | secondary text |
| `faint` | `#736E67` | labels, placeholders |
| `line` | `#2E2C29` | hairline borders |
| `line-strong` | `#3B3833` | input borders |
| `rose` | `#B84C72` | primary buttons |
| `rose-hover` | `#C75E84` | button hover |
| `rose-text` | `#E08BA6` | links, active nav, accents on dark |
| `rose-tint` | `rgba(224,139,166,0.14)` | badges, selected states, hovers |
| `rose-line` | `rgba(184,76,114,0.30)` | accent hairlines |
| `leaf` / `leaf-text` | `#34936B` / `#6BC79A` | Client stage, GO, positive |
| `gold` / `gold-text` | `#C9973F` / `#DCAE5E` | waiting, MAYBE LATER |
| `poppy` / `poppy-text` | `#C7513A` / `#E58A74` | overdue, Rejected, destructive |

Rules: semantic colors stay semantic (not everything turns pink). No box
shadows on dark; hairline borders carry the structure. `color-scheme: dark`
so native controls render dark. Old token aliases (`mauve`, `blush`, `paper`,
`charcoal`) remap to the new values so existing JSX keeps compiling, then get
cleaned up as files are touched.

## 2. Navigation shell

BloomBoard's exact pattern, replacing the current masthead/tab layout:

- Desktop (≥768px): fixed left sidebar, product name in Instrument Serif,
  small "Workspace" label, nav rows with inline SVG icons, active row gets
  `rose-tint` background and `rose-text` icon.
- Mobile: fixed bottom tab bar, 5 primary tabs, 44px+ touch targets.
- Tabs: **Today · Prospects · Inbox · Clients · Library · Stats · Settings**.
  Desktop sidebar shows all seven. The mobile bottom bar shows five: Today,
  Prospects, Inbox, Clients, and More. More opens a small sheet with Library,
  Stats, and Settings.
- Today is the default view on load.

## 3. Feature ports

### 3a. Today tab

BloomBoard's opening screen over BloomTrack's existing due logic. No second
due system: `daysUntilDue()` and `next_action_date` stay the single source of
truth.

- Sections: **Overdue** (rose-line left border), **Today**, **Coming up**
  (next 7 days grouped by day).
- Each row: prospect name, stage pill (mono), country, due info, and quick
  actions: Open (jumps to the prospect in the table) and the stage-advance
  action already exposed by the store.
- Greeting header ("Morning, [name]") using a `user_name` key in the existing
  `settings` table.
- Summary line: "3 overdue, 2 due today." Empty state: "Nothing due today."

### 3b. Clients + onboarding

New `clients` D1 table. Onboarding checklist stored as a JSON column
(mirrors BloomBoard's shape; no queries ever need individual steps):

```sql
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  prospect_id INTEGER,          -- nullable link to prospects
  name TEXT NOT NULL,
  handle TEXT DEFAULT '',
  platforms TEXT DEFAULT '[]',  -- JSON array of strings
  monthly_rate TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  onboarding TEXT DEFAULT '[]', -- JSON: [{id,label,done,doneDate}]
  created_at TEXT NOT NULL
);
```

- Moving a prospect to the **Client** stage prompts "Start onboarding?" and
  creates the client with the default 12-step checklist (BloomBoard's list).
- Clients tab: list with progress bars and "Next: [step]", detail view with
  tap-to-toggle steps, add/remove/reorder, rate, start date, notes.
- API: `app/api/clients` (list/create) and `app/api/clients/[id]`
  (update/delete), both with `runtime='edge'` + `dynamic='force-dynamic'`.
- Writes flow through the same optimistic-update pattern as prospects
  (client-side store, patch, confirm, rollback on failure).

### 3c. Library

New `library_groups` D1 table, items as a JSON column (same reasoning):

```sql
CREATE TABLE IF NOT EXISTS library_groups (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  note TEXT DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  items TEXT DEFAULT '[]'      -- JSON: [{id,title,body}]
);
```

- Seeded on first load with BloomBoard's defaults: onboarding questionnaire,
  4 DM scripts, weekly rhythm (seed happens in the migration).
- Full editing as shipped in BloomBoard: add/rename/delete groups, add/edit/
  delete blocks, one-tap Copy with "Copied" feedback, "Restore default
  library" action.
- API: `app/api/library` + `app/api/library/[id]`, edge + force-dynamic.

### 3d. Scoring rubric

BloomBoard's 5 questions (posting gap, engagement, bio/link, ads-without-
organic, business type), each 0/1/2, total 0-10 → GO (7+) / MAYBE LATER
(4-6) / SKIP (0-3), with the same helper texts and next-touch suggestions.

- Columns added to BOTH `leads` (Inbox) and `prospects`:
  `rubric_score TEXT` (GO/MAYBE_LATER/SKIP/null),
  `rubric_answers TEXT` (JSON, 5 keys).
- UI: segmented buttons in the Inbox triage panel (manual alternative to the
  AI scoring loop, shown side by side with the AI verdict when both exist)
  and in the prospect detail (re-scorable any time).
- Promote-to-prospect copies both columns across.
- Rubric scoring logic lives in `lib/rubric.mjs` with `node --test` coverage
  (band boundaries: 3/4, 6/7).

## 4. Schema changes and migrations

This project adds 2 tables and 4 columns, which is exactly where HANDOFF
gotcha #2 (schema drift = vanished data) bites. So phase 3 starts with the
known-TODO migration mechanism:

- `migrations/` directory with ordered files (`001_clients.sql`,
  `002_library.sql`, `003_rubric.sql`), each idempotent
  (`CREATE TABLE IF NOT EXISTS`, additive `ALTER TABLE` guarded by a check).
- `scripts/migrate.mjs`: reads a `_migrations` table on the target DB,
  applies unapplied files in order via wrangler, records them.
- Deploy rule stays: **migrate the live DB before pushing code** that reads
  the new columns. The runner makes that one command.
- `schema.sql` stays the canonical full schema for fresh databases (Ellen's
  instance) and is updated in the same commit as each migration.

## 5. Phasing — shippable slices

Each phase is independently deployable (git push → Cloudflare Pages build):

1. **Reskin + nav shell.** Tailwind tokens, dark blush theme across all
   existing views, sidebar/bottom-tab navigation, no behavior changes. The
   riskiest visual change, isolated from all feature work.
   *(Shipped 2026-07-16, commits d995628..c7c28de, awaiting push approval.)*
2. **Theme system: light + dark modes.** (Amendment A1.) Done early so all
   later UI is theme-aware from birth.
3. **Shell UX.** (Amendments A2-A4.) Collapsible sidebar, resizable +
   pickable prospect columns, CSV sample download.
4. **Today tab.** Default view, built on existing due logic + store.
5. **Clients + onboarding.** Migration runner ships here, then the clients
   table, API, and UI.
6. **Workspace (Library).** Table, API, UI, rich seed. (Amendment A5.)
7. **Rubric.** Columns, lib + tests, Inbox and prospect-detail UI.
8. **Lead Engine B: outreach drafting.** From the HANDOFF backlog — drafts
   DMs/emails in the user's voice from engine settings. (Amendment A6.)
9. **Lead Engine C: platform map + search phrases.** From the HANDOFF
   backlog. (Amendment A6.)

## Amendments (2026-07-16, after owner + Ellen feedback)

Context: Ellen (first prospective customer, sells to PH SMM freelancers)
wants a Notion-like, SMM-niche workspace: templates, SOPs, onboarding docs,
and a lead gen tracker in one product, sold to beginners. The owner's Lead
Engine offer page (ayalavirtualassistance.site/lead-engine-qa-page) defines
the content banks and workflow the product should embody: find, filter,
write, track.

### A1. Light + dark themes with a toggle

- The token layer moves from fixed hexes to CSS variables:
  `:root[data-theme="dark"]` carries the shipped dark blush values,
  `:root[data-theme="light"]` carries the original warm blush palette
  (wash `#FBEDF2`, surface `#FFFFFF`, ink `#3A2A32`, ink-2 `#7A6470`,
  rose `#B84C72`, rose-deep `#9C3D60` as the accent-on-light text tier,
  line `rgba(184,76,114,0.16)`). Tailwind color tokens become
  `var(--tok)` references so every existing class works in both themes.
- The inline color maps (STAGE_META, RATING_META, REPLY_TYPE_META,
  `daysAgoColor`) get a light and a dark value set; the light set is the
  pre-reskin original (recoverable from git history). A `useTheme()` hook
  + `stageMeta(stage, theme)` style helper picks the set.
- Toggle lives in Settings plus a sun/moon quick toggle at the sidebar
  bottom. Preference persists in localStorage (`ltb_theme`), default dark.
- `viewport.themeColor` and `color-scheme` follow the active theme.

### A2. Collapsible sidebar

- Desktop sidebar collapses to an icons-only rail (~64px): flower logo
  only (no wordmark), nav icons with tooltips, Inbox badge still visible.
- Chevron toggle at the sidebar bottom; collapsed state persists in
  localStorage. Mobile bottom bar unaffected.

### A3. Prospect table: resizable columns + column picker

- Column headers get drag handles (pointer events, sensible min-widths).
  Widths persist in localStorage so users stop horizontal-scrolling.
- A "Columns" button beside Filters opens a checklist popover (existing
  PortalMenu machinery) to show/hide columns. Hidden-column choice
  persists. Name stays always-on so a row is never anonymous.

### A4. CSV import sample

- The import flow gains a "Download sample CSV" link: a generated file
  with the exact headers the import route expects plus two example rows.
  Prevents the format-guessing loop for new users.

### A5. Workspace framing for the Library

- The Library tab ships under the name **Workspace** and is seeded with
  the Lead Engine offer's content banks in addition to BloomBoard's:
  outreach bank (DMs, emails, proposals, follow-ups, objection replies),
  onboarding scripts, pricing guide, 3-tier proposal template
  (Foundation / Growth / Partner with scope-lock language), 7-day start
  plan, content engine prompts, niche keyword bank, platform map notes
  (Facebook/Groups, Threads, Instagram, LinkedIn, Upwork, OnlineJobs.ph,
  X, TikTok, Reddit).
- Structure stays groups + copyable, editable blocks. This is the
  "Notion-like for SMMs" answer: their SOPs and templates live beside
  their pipeline, editable, in one login.

### A6. Lead Engine B and C join this roadmap

- The offer's "it writes" = HANDOFF Phase B (outreach drafting in the
  user's voice). The offer's "it finds" = HANDOFF Phase C (search-phrase
  generator + platform map). Both are pulled into this roadmap as phases
  8-9 rather than a separate backlog, since the offer page treats them as
  core product promises.

### Amendment non-goals

- Still no auth/multi-tenancy/billing in these phases. Ellen's instance
  remains a separate deployment of the same repo.
- No freeform document editor (real Notion-style pages). Workspace blocks
  are titled text blocks — good enough for SOPs/scripts v1; revisit only
  if real usage demands it.

## 6. Testing and verification

- `node --test` (existing harness) for: rubric bands, due-section grouping
  (overdue/today/coming-up given fixed dates), migration runner dry-run.
- Each phase verified live in the browser before push: local `next dev`,
  key flows exercised (per-phase checklist in the implementation plan).
- After each production push: smoke-check leadsthatbloom.com (page loads,
  writes persist, no console errors).

## 7. Rules of engagement (inherited, non-negotiable)

- Never run wrangler against the personal DB id
  `ab941724-dbee-4420-bfe4-d7fa5a27d3ea`. This repo's DB is
  `412a33ad-860f-45f3-8bb4-3d6749e0d7bf` only.
- Every new API route exports `runtime='edge'` AND `dynamic='force-dynamic'`.
- Favicon stays in `public/favicon.ico`.
- No flag emoji; country codes as text.
- All writes go through the existing single write path
  (`updateProspect`-style optimistic updates); no second write path.
- Owner confirms before the first production push of each phase.
- `window.bloom` automation API keeps its method signatures; new features
  add methods, never change existing ones.
