# BloomTrack Pro — Session Handoff

Read this first. It's the full context for working in this repo. When starting
a new Claude Code session here, the first message can simply be:
"Read HANDOFF.md, then <task>".

## What this is

A **sellable fork** of Bloomtrack, the owner's personal prospecting tracker.
- **This repo (`F:\bloomtrack-pro`)** = the product. Fresh git history (initial
  commit `c86c1b3`), no prospect data, its own D1 database.
- **`F:\bloomtrack`** = the owner's personal daily-driver tracker. **Never touch
  it from here.** Its production D1 id is `ab941724-dbee-4420-bfe4-d7fa5a27d3ea`
  — if you ever see that id in this repo, something is wrong; this repo's DB is
  the one in `wrangler.toml`.

Product name (confirmed 2026-07-16): **Leads That Bloom** — official domain
**leadsthatbloom.com** (registered in the same Cloudflare account, attached to
the Pages project). User-facing branding uses this name; the automation API is
`window.bloom`. Infra names (repo, Pages project, D1) remain `bloomtrack-pro`.

## Stack & layout

- Next.js 15, plain JS (no TypeScript), Tailwind. Deployed to **Cloudflare
  Pages** via `@cloudflare/next-on-pages`, DB is **Cloudflare D1** (SQLite).
- `components/ProspectsApp.jsx` — ~3.8k lines, the entire UI + a
  `window.bloomtrack` automation API. Single-file by design; follow its
  existing patterns.
- `lib/db.js` — D1 binding + constants: STAGES, RATINGS, COUNTRIES, SOURCES,
  REPLY_TYPES.
- `app/api/prospects/*` — REST routes (list/create, [id] update/delete,
  import, export).
- `schema.sql` — **complete** schema. On a fresh DB one command applies
  everything: `npx wrangler d1 execute bloomtrack-pro --file=schema.sql --remote`
- `workers/bloomwired-review/` — separate Worker serving review PDFs from R2
  (personal-branded; see de-brand list).
- Local dev on Windows: `npm run dev` (the `pages:build` script needs bash —
  deploys run on Cloudflare's builders on git push).

## Architecture (the parts that matter)

- **Client-side canonical store**: `allProspects` is the single source of
  truth, fetched once. `visibleProspects` is a pure `useMemo` projection
  (search/filters/sort). Writes go through `updateProspect(id, patch)` —
  optimistic patch, server confirm, rollback+alert on failure. Never add a
  second write path; reuse this one.
- **`window.bloomtrack` API**: synchronous reads over the store
  (getProspects/getDue/findByEmail/getStats/…), async writes (addProspect/
  setStage/setReplyType/…). Installed in a useEffect via refs so closures
  never go stale.
- **Due logic**: `EMAIL_SEND_DAYS = {1:1, 2:3, 3:7, 4:14, 5:21}` is the single
  source of truth (send days 1·3·7·14·21 → due gaps 2·4·7·7). `daysUntilDue()`
  → 0 = due today. An explicit `next_action_date` wins over the stage window.
  Email 5 auto-transitions to Finished after 8 silent days (on page load).
- **Stages** (linear pipeline): New, Social Media, Email 1-5, Snoozed,
  Interested, Setup Check, Client, Finished, Rejected, Invalid Email.
  Reply status is a **field** (`replied`, `reply_type`, `reply_date`,
  `replied_at_email`), not a stage. `RESPONDED_STAGES` drives the response
  rate; `computeStats()` powers the Stats tab.

## Hard-won gotchas (violating these broke prod repeatedly)

1. **Every API route must export BOTH** `runtime = 'edge'` **and**
   `dynamic = 'force-dynamic'`. Without force-dynamic, next-on-pages
   prerenders the route as a static asset → GET works, but POST/PUT return
   bare 405s and every write silently fails.
2. **Schema drift = empty table.** Routes SELECT every column explicitly; if
   the code reads a column the DB doesn't have, GET 500s and the UI looks like
   all records vanished (data is fine). If you add a column: update
   `schema.sql` AND run the ALTER against the live DB **before** the deploy
   lands. (Better: build idempotent auto-migration — it's a known TODO.)
3. **Favicon lives in `public/favicon.ico`.** Never `app/icon.ico` — Next
   generates a route for it that next-on-pages rejects and the build fails.
4. No flag emoji (they don't render on Windows/Chrome) — country codes as text.
5. Dropdowns in the table use portal + flip positioning (`StagePicker`,
   `PortalMenu`) so the table's overflow doesn't clip them; scroll events
   inside a menu must not close it.

## Setup status (updated 2026-07-16 — all done)

- [x] Cloned from personal repo, fresh git history, personal files excluded
- [x] `wrangler.toml` → name `bloomtrack-pro`, fresh D1 id filled in
- [x] D1 database created (`bloomtrack-pro`)
- [x] `schema.sql` applied to the new D1 (incl. `leads` + `settings` tables)
- [x] GitHub repo `Beeyach/bloomtrack-pro` pushed
- [x] Cloudflare Pages project created + bindings via wrangler.toml; custom
      domain leadsthatbloom.com attached and serving
- [x] `npm install` run locally

## Lead Engine (shipped 2026-07-16)

Phase A shipped: engine Settings view (offer/audience/green rules/red
rules/platforms in a `settings` D1 table), Lead Inbox (triage `leads` table
ahead of prospects), copy-paste AI scoring loop (`lib/engine-prompts.mjs`
builds the prompt, parses the pasted JSON verdict; `node --test tests/`),
and promote-to-prospect with 409-safe race handling. Spec + plan in
`docs/superpowers/`. Next: Phase B (outreach drafting in the user's voice),
Phase C (search-phrase generator + platform map). Known backlog minors are
triaged in the final review notes (`.superpowers/sdd/progress.md`, local).

## The mission: productization backlog

**Phase 1 — de-personalize (safe now):**
- Strip "Bloomtrack"/"Bloomwired" branding: page title/masthead, layout
  metadata, favicon, README-ish strings.
- Remove or genericize `workers/bloomwired-review/` (gobloomwired.com routes,
  `bloomwired-pdfs` bucket) and `scripts/upload-pdf.*` (gobloomwired URLs).
- Make hardcoded personal choices configurable (a settings module first, a
  settings UI later): `COUNTRY_META` list + timezones, `WORLD_CLOCKS` cities,
  `EMAIL_SEND_DAYS` cadence, `FINISHED_AFTER_DAYS`, stage list eventually.
- Rename `window.bloomtrack` → product name (safe here; the owner's
  automations only run against the personal version). Keep method signatures.

**Phase 2 — sellable minimum:**
- **Auth.** There is currently NONE — anyone with the URL has full read/write.
  Fine for a personal tool, disqualifying for a product. (Cloudflare Access as
  a stopgap; real auth for multi-tenant.)
- Multi-tenancy (per-user data) — biggest structural change; D1 row scoping.
- Onboarding/empty-state polish, settings UI, then billing (Stripe).

**Rules of engagement:**
- Never run wrangler against the personal DB id (see top).
- Deploys/domain purchases/Cloudflare dashboard changes: owner does those;
  prepare exact commands for them.
- Match the existing visual style (warm paper, serif headings, mono labels,
  mauve accents) — it's part of the product's appeal.
