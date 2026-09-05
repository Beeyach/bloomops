# Lead Engine · Phase A — Settings + Lead Inbox + Filter

**Date:** 2026-07-16
**Status:** Approved
**Product:** Leads That Bloom (leadsthatbloom.com)

## Context

Leads That Bloom currently covers the "track" stage of a lead engine. This
feature set adds the first two of the remaining three stages, modeled on the
find → filter → write → track loop:

- **Find** — the user hunts for buyer posts on social platforms (manual; no
  scraping — it violates platform ToS and gets accounts banned).
- **Filter** — found posts land in a Lead Inbox and are scored green/red
  against the user's own rules before they may become prospects.
- **Write** (Phase B) and the search-phrase generator (Phase C) come later.

### Decisions already made

1. **AI execution model: hybrid.** Phase A ships a copy-paste workflow — the
   app generates prompts the user pastes into their own free ChatGPT/Claude,
   and parses the pasted JSON result back in. Built-in AI (app calls the
   Anthropic API server-side) comes later, after auth and subscription
   pricing exist. All prompt assembly is isolated so the built-in version
   reuses it unchanged.
2. **Triage before pipeline.** Leads are a separate entity from prospects.
   Only qualified leads get promoted into the Prospects pipeline, so junk
   never pollutes stage stats or due-date logic.
3. **Staged delivery.** Phase A = settings profile + Lead Inbox + scoring.
   Phase B = outreach drafting in the user's voice. Phase C = search-phrase
   generator + platform map.
4. **Architecture: Approach A.** New `leads` and `settings` tables, new API
   routes, new view components in separate files (the single-file tradition
   of ProspectsApp.jsx stops at the view boundary).

## Data model

Two new tables in `schema.sql` (TEXT-stored JSON, parsed in JS, matching the
existing style; migration commands documented in the schema header):

```sql
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT,              -- 'Facebook' | 'Threads' | 'Instagram' | 'LinkedIn' | 'Upwork' | 'Reddit' | 'X' | 'Other'
  post_url TEXT,
  post_text TEXT,             -- pasted post/comment, verbatim
  author_name TEXT,
  author_handle TEXT,         -- profile URL or @handle
  verdict TEXT,               -- 'green' | 'red' | NULL (= unscored)
  verdict_reasons TEXT,       -- JSON array of strings: which rules fired
  notes TEXT,                 -- free text; also receives suggested_first_line from scoring
  status TEXT DEFAULT 'new',  -- 'new' | 'qualified' | 'skipped' | 'promoted'
  promoted_prospect_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,       -- 'engine' for now
  value TEXT,                 -- JSON blob
  updated_at TEXT DEFAULT (datetime('now'))
);
```

The `engine` settings value:

```json
{
  "offer": "what the user sells (free text)",
  "audience": "who they sell to (free text)",
  "greenRules": ["asking for help", "describing a problem I solve", "hiring now", "asking for rates"],
  "redRules": ["another provider advertising", "scam", "clout bait", "post older than 3 days"],
  "platforms": ["Facebook", "Threads", "Instagram", "LinkedIn"]
}
```

The listed rules are the seed defaults, written into the settings row the
first time the user saves (or shown as placeholders until then).

**`verdict` vs `status`:** the verdict is what the AI (or the user manually)
concluded; the status is what the user decided to do. A red-verdict lead can
still be qualified manually — the override stays visible.

## API routes

All routes follow `app/api/prospects/route.js` patterns exactly: explicit
SELECT column lists, `export const runtime = 'edge'`, `export const dynamic =
'force-dynamic'`, positional `?` binds, input validation at the boundary
(platform/status/verdict enums, `post_text` size limit ≤ 10 000 chars), 400
with a message on bad input.

| Route | Methods | Purpose |
|---|---|---|
| `app/api/leads/route.js` | GET, POST | List (filter by status/verdict/platform), create |
| `app/api/leads/[id]/route.js` | PUT, DELETE | Patch fields, delete |
| `app/api/leads/[id]/promote/route.js` | POST | Promote to prospect (below) |
| `app/api/settings/route.js` | GET, PUT | Read/upsert the `engine` settings JSON |

**Promote** (server-side, so it cannot half-complete from the client's view):
INSERT into `prospects` with `name` = author_name, `source` = platform,
`info` = post text + post URL + verdict reasons, `stage` = 'New'; then UPDATE
the lead to `status='promoted'`, `promoted_prospect_id` = new id. Returns
both records. Re-promoting an already-promoted lead returns 409.

## UI

The view switcher in ProspectsApp.jsx grows from Prospects | Stats to
**Prospects | Inbox | Stats | Settings**. Inbox shows a count badge when
leads with `status='new'` exist. New views are separate components that reuse
the existing design tokens (warm paper, serif headings, mono labels, mauve
accents) and the `PortalMenu` dropdown pattern.

### `components/LeadInbox.jsx`

- **Add-lead card:** platform picker, post URL, paste box for post text,
  author name/handle. Only `post_text` or `post_url` required.
- **Triage list:** one card per lead — post snippet, platform chip, verdict
  chip (🟢 / 🔴 / – as text-safe glyphs), status, and actions: **Score**,
  **Qualify**, **Promote**, **Skip**, delete.
- **Filters:** by status and platform along the top.
- Data flow mirrors the prospects architecture: fetch once into a canonical
  store, `useMemo` projection for filters, optimistic patch → server confirm
  → rollback + alert on failure, one write path.

### `components/SettingsView.jsx`

Offer (textarea), audience (textarea), green-light rules and red-flag rules
(editable string lists with add/remove), platform checklist. Saves the whole
JSON via PUT. Unsaved-changes indicator; no autosave.

## Scoring loop (copy-paste AI)

Clicking **Score** opens a two-step panel on the lead card:

1. **Copy prompt.** The app assembles a prompt from settings (offer,
   audience, green rules, red rules) + the lead's post text, ending with an
   instruction to reply with ONLY this JSON:

   ```json
   {
     "verdict": "green" | "red",
     "reasons": ["which rules matched"],
     "confidence": "high" | "low",
     "suggested_first_line": "an opening line referencing their exact words"
   }
   ```

   One button copies it to the clipboard. Works in any chat AI.

2. **Paste result.** A textarea parses the reply: extract the first `{...}`
   JSON object found (tolerating markdown fences and chatty preamble),
   validate the shape, then fill `verdict` + `verdict_reasons` and append
   `suggested_first_line` to `notes`. Unparseable input → clear error,
   nothing saved. Manual 🟢/🔴 verdict buttons always available as fallback.

**Prompt assembly lives in `lib/engine-prompts.js`** — a pure function
`buildScoringPrompt(settings, lead) → string` plus the parser
`parseScoringResult(text) → {verdict, reasons, confidence, suggestedFirstLine} | Error`.
The future built-in AI route imports the same builder; only the transport
(clipboard vs API call) changes.

## Error handling

- Route-level validation as above; UI surfaces server errors via the
  existing rollback+alert pattern.
- Parser failures are non-destructive and explained to the user.
- Promote conflicts (already promoted) surface as a visible message, not a
  silent no-op.

## Verification plan

1. `npm run build` compiles locally (Windows: `next build` works; the
   next-on-pages step runs on Cloudflare's builders).
2. Apply the two new CREATE TABLEs to remote D1 **before** the deploy lands
   (schema-before-code, gotcha #2).
3. Fixture-driven checks for `parseScoringResult` (clean JSON, fenced JSON,
   preamble+JSON, garbage).
4. Live end-to-end on the deployed app: create lead → paste fixture scoring
   result → verdict lands → promote → prospect appears in Prospects with
   source/info filled → lead shows `promoted` → skip and delete another lead
   → settings round-trip.

## Out of scope (explicitly)

- Phase B (message drafting, voice samples in settings), Phase C
  (search-phrase generator, platform map).
- Built-in AI, BYO keys, billing.
- Auth and multi-tenancy (Phase 2 backlog). Until auth ships, the app —
  including these new endpoints — is writable by anyone with the URL.
- Scraping or automated posting of any kind.
