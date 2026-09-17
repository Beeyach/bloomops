# Lead Engine Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Lead Inbox (triage before prospects), an engine Settings view, and a copy-paste AI scoring loop to Leads That Bloom, per the approved spec `docs/superpowers/specs/2026-07-16-lead-engine-phase-a-design.md`.

**Architecture:** Two new D1 tables (`leads`, `settings`) behind new edge API routes that mirror `app/api/prospects/route.js` patterns. Two new view components (`LeadInbox.jsx`, `SettingsView.jsx`) wired into the existing view switcher in `ProspectsApp.jsx`. All prompt assembly/parsing lives in one pure module `lib/engine-prompts.mjs` so a future built-in-AI route can reuse it.

**Tech Stack:** Next.js 15 (plain JS, no TS), Tailwind, Cloudflare Pages + D1 via `@cloudflare/next-on-pages`, Node built-in test runner (`node --test`) for the pure module.

## Global Constraints

- Every API route MUST export both `export const runtime = 'edge'` and `export const dynamic = 'force-dynamic'`. Without force-dynamic, POST/PUT/DELETE return bare 405s in production.
- Routes SELECT explicit column lists (never `*`), and use positional `?` binds (D1 style).
- Schema changes are applied to the **remote** D1 before any deploy that reads them (gotcha #2). This repo's D1 is `bloomtrack-pro` (id `412a33ad-860f-45f3-8bb4-3d6749e0d7bf`). **Never** run wrangler against id `ab941724-dbee-4420-bfe4-d7fa5a27d3ea` (the owner's personal DB).
- No flag emoji anywhere (they don't render on Windows/Chrome). Verdict indicators use CSS dots, not emoji.
- Match the existing visual style: warm paper bg, serif headings, mono uppercase labels, mauve accents. Reuse tailwind tokens: `bg-paper`, `bg-surface`, `border-line`, `text-charcoal`, `text-charcoal-2`, `text-muted`, `text-mauve-deep`, `bg-blush-soft`, `rounded-2xl`, `shadow-card`.
- `post_text` is capped at 10 000 chars, validated server-side.
- Product name is "Leads That Bloom"; the automation API is `window.bloom`. Do not reintroduce "Bloomtrack"/"Bloomwired" strings.
- Local dev: `npm run dev` (Windows-safe). `npm run pages:build` does NOT work on Windows — deploys happen on Cloudflare's builders on git push to `main`.
- Commit after every task with a conventional-commit message. Pushing to `main` deploys production — push only in Task 10.

---

### Task 1: Schema — `leads` and `settings` tables

**Files:**
- Modify: `schema.sql` (append after the prospects indexes, line 75)

**Interfaces:**
- Produces: D1 tables `leads` and `settings` with exactly the columns below. Every later task depends on these column names.

- [ ] **Step 1: Append the new tables to schema.sql**

Append to the end of `schema.sql`:

```sql

-- ─────────────────────────────────────────────────────────────────────────
-- Lead Engine Phase A (2026-07-16)
-- Migration for existing databases (schema.sql is idempotent, so running the
-- whole file with --remote also works):
-- npx wrangler d1 execute bloomtrack-pro --file=schema.sql --remote
-- ─────────────────────────────────────────────────────────────────────────

-- Candidate leads found on social platforms. Triage happens here; only
-- qualified leads get promoted into `prospects`.
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  platform TEXT,              -- 'Facebook' | 'Threads' | 'Instagram' | 'LinkedIn' | 'Upwork' | 'Reddit' | 'X' | 'Other'
  post_url TEXT,
  post_text TEXT,             -- the pasted post/comment, verbatim
  author_name TEXT,
  author_handle TEXT,         -- profile URL or @handle
  verdict TEXT,               -- 'green' | 'red' | NULL (= unscored)
  verdict_reasons TEXT,       -- JSON array of strings: which rules fired
  notes TEXT,                 -- free text; scoring appends suggested_first_line here
  status TEXT DEFAULT 'new',  -- 'new' | 'qualified' | 'skipped' | 'promoted'
  promoted_prospect_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);

-- Single-row-per-key JSON settings store. Key 'engine' holds the lead-engine
-- profile: {offer, audience, greenRules, redRules, platforms}.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,                 -- JSON blob, parsed in JS
  updated_at TEXT DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Apply to local D1 (used by `npm run dev`)**

Run: `npx wrangler d1 execute bloomtrack-pro --file=schema.sql`
Expected: success output, no errors (CREATE IF NOT EXISTS is idempotent).

- [ ] **Step 3: Apply to remote D1 (schema-before-code)**

Run: `npx wrangler d1 execute bloomtrack-pro --file=schema.sql --remote`
Then verify: `npx wrangler d1 execute bloomtrack-pro --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name" --json`
Expected: table list includes `leads`, `settings`, `prospects`.

- [ ] **Step 4: Commit**

```bash
git add schema.sql
git commit -m "feat: add leads and settings tables for lead engine phase A"
```

---

### Task 2: Pure module `lib/engine-prompts.mjs` (TDD)

**Files:**
- Create: `lib/engine-prompts.mjs`
- Create: `tests/engine-prompts.test.mjs`
- Modify: `package.json` (add `"test"` script)

**Interfaces:**
- Produces (exact exports, used by Tasks 3, 4, 6, 7, 8):
  - `LEAD_PLATFORMS: string[]` — `['Facebook','Threads','Instagram','LinkedIn','Upwork','Reddit','X','Other']`
  - `LEAD_STATUSES: string[]` — `['new','qualified','skipped','promoted']`
  - `LEAD_VERDICTS: string[]` — `['green','red']`
  - `DEFAULT_ENGINE_SETTINGS: {offer, audience, greenRules, redRules, platforms}`
  - `buildScoringPrompt(settings, lead) → string`
  - `parseScoringResult(text) → {ok: true, data: {verdict, reasons, confidence, suggestedFirstLine}} | {ok: false, error: string}`

The file extension is `.mjs` (not `.js`) so `node --test` can run it as ESM without touching package.json's module type. Webpack/Next imports `.mjs` fine; always import it with the extension: `from '@/lib/engine-prompts.mjs'`.

- [ ] **Step 1: Write the failing tests**

Create `tests/engine-prompts.test.mjs`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScoringPrompt,
  parseScoringResult,
  DEFAULT_ENGINE_SETTINGS,
  LEAD_PLATFORMS,
  LEAD_STATUSES,
} from '../lib/engine-prompts.mjs';

test('constants have the expected shape', () => {
  assert.ok(LEAD_PLATFORMS.includes('Facebook'));
  assert.ok(LEAD_STATUSES.includes('promoted'));
  assert.ok(Array.isArray(DEFAULT_ENGINE_SETTINGS.greenRules));
  assert.ok(DEFAULT_ENGINE_SETTINGS.greenRules.length >= 3);
});

test('buildScoringPrompt includes offer, rules, post text, and the JSON instruction', () => {
  const settings = {
    ...DEFAULT_ENGINE_SETTINGS,
    offer: 'social media management',
    greenRules: ['asking for help'],
    redRules: ['scam'],
  };
  const lead = { platform: 'Facebook', post_url: 'https://fb.com/p/1', post_text: 'Need someone to run my IG' };
  const prompt = buildScoringPrompt(settings, lead);
  assert.match(prompt, /social media management/);
  assert.match(prompt, /- asking for help/);
  assert.match(prompt, /- scam/);
  assert.match(prompt, /Need someone to run my IG/);
  assert.match(prompt, /"verdict"/);
  assert.match(prompt, /suggested_first_line/);
});

test('buildScoringPrompt tolerates missing settings fields', () => {
  const prompt = buildScoringPrompt({}, { post_text: 'hello' });
  assert.match(prompt, /hello/);
  assert.match(prompt, /GREEN signals/);
});

test('parseScoringResult: clean JSON', () => {
  const res = parseScoringResult(
    '{"verdict":"green","reasons":["hiring now"],"confidence":"high","suggested_first_line":"Saw your post about IG"}'
  );
  assert.equal(res.ok, true);
  assert.equal(res.data.verdict, 'green');
  assert.deepEqual(res.data.reasons, ['hiring now']);
  assert.equal(res.data.confidence, 'high');
  assert.equal(res.data.suggestedFirstLine, 'Saw your post about IG');
});

test('parseScoringResult: markdown-fenced JSON', () => {
  const res = parseScoringResult('```json\n{"verdict":"red","reasons":["another provider advertising"]}\n```');
  assert.equal(res.ok, true);
  assert.equal(res.data.verdict, 'red');
});

test('parseScoringResult: chatty preamble before JSON', () => {
  const res = parseScoringResult(
    'Sure! Based on your rules, here is my assessment:\n{"verdict":"green","reasons":["asking for rates"],"confidence":"low"}'
  );
  assert.equal(res.ok, true);
  assert.equal(res.data.verdict, 'green');
  assert.equal(res.data.confidence, 'low');
});

test('parseScoringResult: garbage input fails cleanly', () => {
  const res = parseScoringResult('I think this lead looks pretty good overall, go for it!');
  assert.equal(res.ok, false);
  assert.ok(res.error.length > 0);
});

test('parseScoringResult: JSON with invalid verdict fails cleanly', () => {
  const res = parseScoringResult('{"verdict":"maybe","reasons":[]}');
  assert.equal(res.ok, false);
});

test('parseScoringResult: empty input fails cleanly', () => {
  const res = parseScoringResult('');
  assert.equal(res.ok, false);
});
```

- [ ] **Step 2: Add the test script and run to verify failure**

In `package.json` scripts, add:

```json
"test": "node --test tests/"
```

Run: `npm test`
Expected: FAIL — `Cannot find module ... lib/engine-prompts.mjs`.

- [ ] **Step 3: Write the implementation**

Create `lib/engine-prompts.mjs`:

```js
// Leads That Bloom · lead-engine prompt assembly + result parsing.
// Pure module (no React, no DB) shared by the API routes and the UI.
// The copy-paste workflow builds prompts here; a future built-in AI route
// imports the same builder and changes only the transport.

export const LEAD_PLATFORMS = [
  'Facebook',
  'Threads',
  'Instagram',
  'LinkedIn',
  'Upwork',
  'Reddit',
  'X',
  'Other',
];

export const LEAD_STATUSES = ['new', 'qualified', 'skipped', 'promoted'];
export const LEAD_VERDICTS = ['green', 'red'];

export const DEFAULT_ENGINE_SETTINGS = {
  offer: '',
  audience: '',
  greenRules: [
    'asking for help or recommendations',
    'describing a problem I solve',
    'hiring now',
    'asking for rates',
  ],
  redRules: [
    'another provider advertising their services',
    'looks like a scam or clout bait',
    'a job-seeker, not a buyer',
    'post is older than 3 days',
  ],
  platforms: ['Facebook', 'Threads', 'Instagram', 'LinkedIn'],
};

// Assemble the qualifier prompt from the user's engine settings + one lead.
export function buildScoringPrompt(settings, lead) {
  const s = { ...DEFAULT_ENGINE_SETTINGS, ...(settings || {}) };
  const l = lead || {};
  const lines = [
    'You are a lead qualifier for a service provider. Decide whether this social media post is from a real potential buyer (green) or should be skipped (red).',
    '',
    `What I sell: ${s.offer || '(not specified)'}`,
    `Who I sell to: ${s.audience || '(not specified)'}`,
    '',
    'GREEN signals (any of these suggests a real buyer):',
    ...(s.greenRules || []).map((r) => `- ${r}`),
    '',
    'RED flags (any of these means skip):',
    ...(s.redRules || []).map((r) => `- ${r}`),
    '',
    `Platform: ${l.platform || 'Unknown'}`,
    l.post_url ? `Post link: ${l.post_url}` : null,
    'The post:',
    '"""',
    l.post_text || '(no text provided — judge from the link context above)',
    '"""',
    '',
    'Reply with ONLY this JSON, nothing else — no markdown, no commentary:',
    '{"verdict":"green"|"red","reasons":["which of my rules matched"],"confidence":"high"|"low","suggested_first_line":"a warm, human opening line that references their exact words"}',
  ].filter((line) => line !== null);
  return lines.join('\n');
}

// Parse whatever the user pasted back from their AI. Tolerates markdown
// fences and chatty preamble by extracting the first {...} span.
export function parseScoringResult(text) {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, error: 'Nothing pasted yet.' };

  let obj = null;
  try {
    obj = JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        obj = JSON.parse(raw.slice(start, end + 1));
      } catch {
        obj = null;
      }
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, error: 'No JSON found in that reply. Paste the AI’s full answer, including the {...} part.' };
  }

  const verdict = String(obj.verdict || '').toLowerCase();
  if (!LEAD_VERDICTS.includes(verdict)) {
    return { ok: false, error: 'The JSON is missing a "verdict" of "green" or "red".' };
  }
  const reasons = Array.isArray(obj.reasons) ? obj.reasons.map((r) => String(r)).slice(0, 10) : [];
  const confidence = obj.confidence === 'low' ? 'low' : 'high';
  const suggestedFirstLine =
    typeof obj.suggested_first_line === 'string' ? obj.suggested_first_line.trim() : '';

  return { ok: true, data: { verdict, reasons, confidence, suggestedFirstLine } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/engine-prompts.mjs tests/engine-prompts.test.mjs package.json
git commit -m "feat: engine prompt builder and scoring-result parser with tests"
```

---

### Task 3: Settings API route

**Files:**
- Create: `app/api/settings/route.js`

**Interfaces:**
- Consumes: `DEFAULT_ENGINE_SETTINGS`, `LEAD_PLATFORMS` from `@/lib/engine-prompts.mjs`
- Produces: `GET /api/settings` → `{settings: {...}}` (defaults merged); `PUT /api/settings` body `{settings: {...}}` → `{settings: {...}}` (the saved value). Used by Tasks 6 and 7.

- [ ] **Step 1: Write the route**

Create `app/api/settings/route.js`:

```js
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { DEFAULT_ENGINE_SETTINGS, LEAD_PLATFORMS } from '@/lib/engine-prompts.mjs';

// D1 is only available in the edge runtime on Cloudflare Pages.
export const runtime = 'edge';
// Force-dynamic so next-on-pages keeps this a real Function for ALL methods.
export const dynamic = 'force-dynamic';

export async function GET() {
  const db = getDb();
  const row = await db
    .prepare(`SELECT value FROM settings WHERE key = ?`)
    .bind('engine')
    .first();
  let stored = {};
  if (row && row.value) {
    try {
      stored = JSON.parse(row.value);
    } catch {
      stored = {};
    }
  }
  return NextResponse.json({ settings: { ...DEFAULT_ENGINE_SETTINGS, ...stored } });
}

function asStringList(value, maxItems, maxLen) {
  if (!Array.isArray(value)) return null;
  const out = value
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0)
    .slice(0, maxItems);
  if (out.some((v) => v.length > maxLen)) return null;
  return out;
}

export async function PUT(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const s = body && body.settings;
  if (!s || typeof s !== 'object') {
    return NextResponse.json({ error: 'Missing "settings" object' }, { status: 400 });
  }

  const offer = String(s.offer || '').slice(0, 2000);
  const audience = String(s.audience || '').slice(0, 2000);
  const greenRules = asStringList(s.greenRules, 50, 200);
  const redRules = asStringList(s.redRules, 50, 200);
  if (greenRules === null || redRules === null) {
    return NextResponse.json(
      { error: 'greenRules and redRules must be arrays of strings (max 200 chars each)' },
      { status: 400 }
    );
  }
  const platforms = Array.isArray(s.platforms)
    ? s.platforms.filter((p) => LEAD_PLATFORMS.includes(p))
    : DEFAULT_ENGINE_SETTINGS.platforms;

  const value = JSON.stringify({ offer, audience, greenRules, redRules, platforms });
  const db = getDb();
  await db
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .bind('engine', value)
    .run();

  return NextResponse.json({ settings: JSON.parse(value) });
}
```

- [ ] **Step 2: Verify against the dev server**

Start the dev server in the background: `npm run dev` (leave running; it serves local D1 via `setupDevPlatform()`).

Run:

```bash
curl -s http://localhost:3000/api/settings
```

Expected: `{"settings":{"offer":"","audience":"","greenRules":[...4 defaults...],"redRules":[...4 defaults...],"platforms":["Facebook","Threads","Instagram","LinkedIn"]}}`

```bash
curl -s -X PUT http://localhost:3000/api/settings -H "Content-Type: application/json" \
  -d '{"settings":{"offer":"web design","audience":"local trades","greenRules":["hiring now"],"redRules":["scam"],"platforms":["Facebook"]}}'
curl -s http://localhost:3000/api/settings
```

Expected: both return the saved values (offer "web design"). Also verify a bad body 400s:

```bash
curl -s -o /dev/null -w "%{http_code}" -X PUT http://localhost:3000/api/settings -H "Content-Type: application/json" -d '{"settings":{"greenRules":"nope"}}'
```

Expected: `400`

- [ ] **Step 3: Commit**

```bash
git add app/api/settings/route.js
git commit -m "feat: engine settings API (GET/PUT, JSON row upsert)"
```

---

### Task 4: Leads API routes (list/create, patch/delete)

**Files:**
- Create: `app/api/leads/route.js`
- Create: `app/api/leads/[id]/route.js`

**Interfaces:**
- Consumes: `LEAD_PLATFORMS`, `LEAD_STATUSES`, `LEAD_VERDICTS` from `@/lib/engine-prompts.mjs`
- Produces (used by Tasks 5, 7, 8, 9):
  - `GET /api/leads?status=&verdict=&platform=` → `{leads: [...]}` (newest first; repeatable query params)
  - `POST /api/leads` body `{platform, post_url, post_text, author_name, author_handle, notes}` → 201 `{lead}`
  - `PUT /api/leads/:id` body = partial patch; `verdict_reasons` may be an array (stringified server-side); → `{lead}`
  - `DELETE /api/leads/:id` → `{ok: true}`

- [ ] **Step 1: Write the collection route**

Create `app/api/leads/route.js`:

```js
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { LEAD_PLATFORMS, LEAD_STATUSES, LEAD_VERDICTS } from '@/lib/engine-prompts.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SELECT_COLS =
  'id, platform, post_url, post_text, author_name, author_handle, verdict, verdict_reasons, notes, status, promoted_prospect_id, created_at, updated_at';

const MAX_POST_TEXT = 10000;

export async function GET(req) {
  const db = getDb();
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.getAll('status').filter((s) => LEAD_STATUSES.includes(s));
  const verdictFilter = searchParams.getAll('verdict').filter((v) => LEAD_VERDICTS.includes(v));
  const platformFilter = searchParams.getAll('platform').filter((p) => LEAD_PLATFORMS.includes(p));

  const where = [];
  const values = [];
  if (statusFilter.length > 0) {
    where.push(`status IN (${statusFilter.map(() => '?').join(',')})`);
    statusFilter.forEach((s) => values.push(s));
  }
  if (verdictFilter.length > 0) {
    where.push(`verdict IN (${verdictFilter.map(() => '?').join(',')})`);
    verdictFilter.forEach((v) => values.push(v));
  }
  if (platformFilter.length > 0) {
    where.push(`platform IN (${platformFilter.map(() => '?').join(',')})`);
    platformFilter.forEach((p) => values.push(p));
  }

  const sql = `SELECT ${SELECT_COLS} FROM leads${
    where.length ? ` WHERE ${where.join(' AND ')}` : ''
  } ORDER BY created_at DESC, id DESC`;
  const { results } = await db.prepare(sql).bind(...values).all();
  return NextResponse.json({ leads: results || [] });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const platform = LEAD_PLATFORMS.includes(body.platform) ? body.platform : 'Other';
  const post_url = String(body.post_url || '').trim().slice(0, 2000);
  const post_text = String(body.post_text || '').trim();
  const author_name = String(body.author_name || '').trim().slice(0, 200);
  const author_handle = String(body.author_handle || '').trim().slice(0, 500);
  const notes = String(body.notes || '').trim().slice(0, 5000);

  if (!post_text && !post_url) {
    return NextResponse.json({ error: 'Provide the post text or a post link' }, { status: 400 });
  }
  if (post_text.length > MAX_POST_TEXT) {
    return NextResponse.json({ error: `post_text too long (max ${MAX_POST_TEXT} chars)` }, { status: 400 });
  }

  const db = getDb();
  const res = await db
    .prepare(
      `INSERT INTO leads (platform, post_url, post_text, author_name, author_handle, notes)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(platform, post_url || null, post_text || null, author_name || null, author_handle || null, notes || null)
    .run();

  const lead = await db
    .prepare(`SELECT ${SELECT_COLS} FROM leads WHERE id = ?`)
    .bind(res.meta.last_row_id)
    .first();
  return NextResponse.json({ lead }, { status: 201 });
}
```

- [ ] **Step 2: Write the item route**

Create `app/api/leads/[id]/route.js`:

```js
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { LEAD_PLATFORMS, LEAD_STATUSES, LEAD_VERDICTS } from '@/lib/engine-prompts.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const SELECT_COLS =
  'id, platform, post_url, post_text, author_name, author_handle, verdict, verdict_reasons, notes, status, promoted_prospect_id, created_at, updated_at';

const MAX_POST_TEXT = 10000;

export async function PUT(req, { params }) {
  const { id } = await params;
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sets = [];
  const values = [];

  if ('platform' in body) {
    if (!LEAD_PLATFORMS.includes(body.platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }
    sets.push('platform = ?');
    values.push(body.platform);
  }
  if ('post_url' in body) {
    sets.push('post_url = ?');
    values.push(String(body.post_url || '').trim().slice(0, 2000) || null);
  }
  if ('post_text' in body) {
    const t = String(body.post_text || '').trim();
    if (t.length > MAX_POST_TEXT) {
      return NextResponse.json({ error: `post_text too long (max ${MAX_POST_TEXT} chars)` }, { status: 400 });
    }
    sets.push('post_text = ?');
    values.push(t || null);
  }
  if ('author_name' in body) {
    sets.push('author_name = ?');
    values.push(String(body.author_name || '').trim().slice(0, 200) || null);
  }
  if ('author_handle' in body) {
    sets.push('author_handle = ?');
    values.push(String(body.author_handle || '').trim().slice(0, 500) || null);
  }
  if ('verdict' in body) {
    if (body.verdict !== null && !LEAD_VERDICTS.includes(body.verdict)) {
      return NextResponse.json({ error: 'Invalid verdict' }, { status: 400 });
    }
    sets.push('verdict = ?');
    values.push(body.verdict);
  }
  if ('verdict_reasons' in body) {
    const reasons = Array.isArray(body.verdict_reasons)
      ? body.verdict_reasons.map((r) => String(r)).slice(0, 10)
      : [];
    sets.push('verdict_reasons = ?');
    values.push(JSON.stringify(reasons));
  }
  if ('notes' in body) {
    sets.push('notes = ?');
    values.push(String(body.notes || '').trim().slice(0, 5000) || null);
  }
  if ('status' in body) {
    if (!LEAD_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    sets.push('status = ?');
    values.push(body.status);
  }

  if (sets.length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const db = getDb();
  sets.push(`updated_at = datetime('now')`);
  values.push(id);
  await db.prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`).bind(...values).run();

  const lead = await db.prepare(`SELECT ${SELECT_COLS} FROM leads WHERE id = ?`).bind(id).first();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  return NextResponse.json({ lead });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const db = getDb();
  await db.prepare(`DELETE FROM leads WHERE id = ?`).bind(id).run();
  return NextResponse.json({ ok: true });
}
```

Note: check how `app/api/prospects/[id]/route.js` reads `params` (Next 15 may or may not await it in this codebase) and match that exact pattern — if the existing route uses `const { id } = params;` without `await`, do the same here.

- [ ] **Step 3: Verify against the dev server**

With `npm run dev` running:

```bash
curl -s -X POST http://localhost:3000/api/leads -H "Content-Type: application/json" \
  -d '{"platform":"Facebook","post_text":"Looking for someone to manage my socials","author_name":"Test Person"}'
```

Expected: 201, `{"lead":{"id":1,...,"status":"new","verdict":null,...}}`

```bash
curl -s http://localhost:3000/api/leads
curl -s "http://localhost:3000/api/leads?status=new"
curl -s -X PUT http://localhost:3000/api/leads/1 -H "Content-Type: application/json" -d '{"verdict":"green","verdict_reasons":["hiring now"],"status":"qualified"}'
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/leads -H "Content-Type: application/json" -d '{"platform":"Facebook"}'
```

Expected in order: list with the lead; same list; updated lead with `verdict:"green"`, `verdict_reasons:"[\"hiring now\"]"`, `status:"qualified"`; `400` (no text or URL).

```bash
curl -s -X DELETE http://localhost:3000/api/leads/1
```

Expected: `{"ok":true}`

- [ ] **Step 4: Commit**

```bash
git add app/api/leads/route.js "app/api/leads/[id]/route.js"
git commit -m "feat: leads API (list/create/patch/delete) with validation"
```

---

### Task 5: Promote route

**Files:**
- Create: `app/api/leads/[id]/promote/route.js`

**Interfaces:**
- Consumes: `leads` and `prospects` tables.
- Produces (used by Task 9): `POST /api/leads/:id/promote` → 200 `{prospect, lead}`; 404 unknown lead; 409 `{error}` if already promoted.

- [ ] **Step 1: Write the route**

Create `app/api/leads/[id]/promote/route.js`:

```js
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

const LEAD_COLS =
  'id, platform, post_url, post_text, author_name, author_handle, verdict, verdict_reasons, notes, status, promoted_prospect_id, created_at, updated_at';
const PROSPECT_COLS =
  'id, name, business_name, email, domain, rating, stage, emails_sent, last_contact_date, claude_chat_link, gmail_labels, is_read, country, email_sequence, audit_notes, pdf_filename, info, review_url, replied, reply_date, reply_type, replied_at_email, next_action_date, source, created_at, updated_at';

export async function POST(req, { params }) {
  const { id } = await params;
  const db = getDb();

  const lead = await db.prepare(`SELECT ${LEAD_COLS} FROM leads WHERE id = ?`).bind(id).first();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (lead.status === 'promoted') {
    return NextResponse.json({ error: 'Lead already promoted' }, { status: 409 });
  }

  let reasons = [];
  try {
    reasons = JSON.parse(lead.verdict_reasons || '[]');
  } catch {
    reasons = [];
  }
  const infoParts = [
    lead.post_text ? `Post (${lead.platform || 'unknown platform'}):\n${lead.post_text}` : null,
    lead.post_url ? `Link: ${lead.post_url}` : null,
    lead.author_handle ? `Profile: ${lead.author_handle}` : null,
    lead.verdict ? `Verdict: ${lead.verdict}${reasons.length ? ` — ${reasons.join('; ')}` : ''}` : null,
    lead.notes ? `Notes: ${lead.notes}` : null,
  ].filter(Boolean);

  const insert = await db
    .prepare(`INSERT INTO prospects (name, stage, source, info) VALUES (?, 'New', ?, ?)`)
    .bind(lead.author_name || 'Unknown', lead.platform || 'Other', infoParts.join('\n\n') || null)
    .run();
  const prospectId = insert.meta.last_row_id;

  await db
    .prepare(
      `UPDATE leads SET status = 'promoted', promoted_prospect_id = ?, updated_at = datetime('now') WHERE id = ?`
    )
    .bind(prospectId, id)
    .run();

  const prospect = await db
    .prepare(`SELECT ${PROSPECT_COLS} FROM prospects WHERE id = ?`)
    .bind(prospectId)
    .first();
  const updatedLead = await db.prepare(`SELECT ${LEAD_COLS} FROM leads WHERE id = ?`).bind(id).first();
  return NextResponse.json({ prospect, lead: updatedLead });
}
```

(Same `params` note as Task 4: match the existing `[id]` route's pattern exactly.)

- [ ] **Step 2: Verify against the dev server**

```bash
curl -s -X POST http://localhost:3000/api/leads -H "Content-Type: application/json" \
  -d '{"platform":"LinkedIn","post_text":"Need a VA for inbox management","author_name":"Promo Test","post_url":"https://linkedin.com/p/2"}'
```

Note the returned lead id (call it N), then:

```bash
curl -s -X POST http://localhost:3000/api/leads/N/promote
```

Expected: `{"prospect":{...,"name":"Promo Test","stage":"New","source":"LinkedIn","info":"Post (LinkedIn):..."},"lead":{...,"status":"promoted","promoted_prospect_id":<id>}}`

```bash
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/leads/N/promote
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/leads/99999/promote
curl -s http://localhost:3000/api/prospects | head -c 400
```

Expected: `409`, then `404`, then the prospects list contains "Promo Test". Clean up: delete the test prospect and lead via their DELETE endpoints.

- [ ] **Step 3: Commit**

```bash
git add "app/api/leads/[id]/promote/route.js"
git commit -m "feat: promote lead to prospect (server-side, 409 on repeat)"
```

---

### Task 6: SettingsView component + view switcher wiring

**Files:**
- Create: `components/SettingsView.jsx`
- Modify: `components/ProspectsApp.jsx` (view switcher tabs array — search for `{ key: 'prospects', label: 'Prospects' }` — and the view-body conditional — search for where `view === 'stats'` selects the Stats content)

**Interfaces:**
- Consumes: `GET/PUT /api/settings` (Task 3); `DEFAULT_ENGINE_SETTINGS` from `@/lib/engine-prompts.mjs`
- Produces: `<SettingsView />` (no props); `view` state in ProspectsApp gains values `'inbox'` and `'settings'`. Task 7 plugs `<LeadInbox />` into the `'inbox'` branch (this task renders a placeholder there).

- [ ] **Step 1: Create SettingsView**

Create `components/SettingsView.jsx`:

```jsx
'use client';

import { useEffect, useState } from 'react';
import { DEFAULT_ENGINE_SETTINGS, LEAD_PLATFORMS } from '@/lib/engine-prompts.mjs';

// Section label in the app's mono-uppercase style.
function Label({ children }) {
  return (
    <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted mb-1.5">
      {children}
    </div>
  );
}

// Editable list of one-line rule strings.
function RuleList({ rules, onChange, placeholder }) {
  const [draft, setDraft] = useState('');
  function add() {
    const t = draft.trim();
    if (!t) return;
    onChange([...rules, t]);
    setDraft('');
  }
  return (
    <div>
      <ul className="space-y-1.5 mb-2">
        {rules.map((rule, i) => (
          <li key={`${rule}-${i}`} className="flex items-center gap-2 text-sm text-charcoal">
            <span className="flex-1 bg-surface border border-line rounded-lg px-3 py-1.5">{rule}</span>
            <button
              onClick={() => onChange(rules.filter((_, j) => j !== i))}
              className="font-mono text-xs text-muted hover:text-charcoal px-1"
              title="Remove rule"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={placeholder}
          className="flex-1 bg-surface border border-line rounded-lg px-3 py-1.5 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
        />
        <button
          onClick={add}
          className="px-3 py-1.5 text-xs font-mono uppercase tracking-[0.14em] rounded-lg bg-charcoal text-paper hover:opacity-90"
        >
          Add
        </button>
      </div>
    </div>
  );
}

export default function SettingsView() {
  const [settings, setSettings] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        const s = { ...DEFAULT_ENGINE_SETTINGS, ...(d.settings || {}) };
        setSettings(s);
        setSavedSnapshot(JSON.stringify(s));
      })
      .catch(() => setError('Could not load settings.'));
  }, []);

  if (!settings) {
    return <div className="text-center text-muted font-mono text-sm py-16">{error || 'Loading…'}</div>;
  }

  const dirty = JSON.stringify(settings) !== savedSnapshot;
  const patch = (p) => setSettings((s) => ({ ...s, ...p }));

  async function save() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Save failed');
      const d = await res.json();
      setSettings(d.settings);
      setSavedSnapshot(JSON.stringify(d.settings));
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="bg-surface border border-line rounded-2xl shadow-card p-5">
        <h2 className="font-serif text-2xl text-charcoal mb-4">Your engine</h2>
        <div className="space-y-4">
          <div>
            <Label>What you sell</Label>
            <textarea
              value={settings.offer}
              onChange={(e) => patch({ offer: e.target.value })}
              rows={2}
              placeholder="e.g. Social media management and content for small service businesses"
              className="w-full bg-paper border border-line rounded-lg px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
            />
          </div>
          <div>
            <Label>Who you sell to</Label>
            <textarea
              value={settings.audience}
              onChange={(e) => patch({ audience: e.target.value })}
              rows={2}
              placeholder="e.g. Coaches, realtors and clinic owners who are too busy to post"
              className="w-full bg-paper border border-line rounded-lg px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
            />
          </div>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-2xl shadow-card p-5">
        <h2 className="font-serif text-2xl text-charcoal mb-1">Filter rules</h2>
        <p className="text-sm text-muted mb-4">
          These feed the scoring prompt. Green means reach out; red means skip.
        </p>
        <div className="space-y-5">
          <div>
            <Label>Green-light signals</Label>
            <RuleList
              rules={settings.greenRules}
              onChange={(greenRules) => patch({ greenRules })}
              placeholder="Add a green signal…"
            />
          </div>
          <div>
            <Label>Red flags</Label>
            <RuleList
              rules={settings.redRules}
              onChange={(redRules) => patch({ redRules })}
              placeholder="Add a red flag…"
            />
          </div>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-2xl shadow-card p-5">
        <Label>Platforms you hunt on</Label>
        <div className="flex flex-wrap gap-2">
          {LEAD_PLATFORMS.map((p) => {
            const on = settings.platforms.includes(p);
            return (
              <button
                key={p}
                onClick={() =>
                  patch({
                    platforms: on
                      ? settings.platforms.filter((x) => x !== p)
                      : [...settings.platforms, p],
                  })
                }
                className={`px-3 py-1 text-xs font-mono uppercase tracking-[0.14em] rounded-lg border transition ${
                  on
                    ? 'bg-charcoal text-paper border-charcoal'
                    : 'bg-paper text-charcoal-2 border-line hover:bg-blush-soft'
                }`}
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="px-4 py-2 text-xs font-mono uppercase tracking-[0.14em] rounded-lg bg-charcoal text-paper disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {dirty && !saving && <span className="text-xs font-mono text-mauve-deep">Unsaved changes</span>}
        {error && <span className="text-xs font-mono text-red-700">{error}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the view switcher in ProspectsApp.jsx**

At the top of `components/ProspectsApp.jsx`, add imports:

```jsx
import SettingsView from './SettingsView';
```

Find the tabs array (search for `{ key: 'prospects', label: 'Prospects' }`) and replace the array with:

```jsx
{[
  { key: 'prospects', label: 'Prospects' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'stats', label: 'Stats' },
  { key: 'settings', label: 'Settings' },
].map((t) => (
```

Find where the view body switches on `view` (search for `view === 'stats'`). Read the surrounding structure first, then add two analogous branches so that:

- `view === 'settings'` renders `<SettingsView />`
- `view === 'inbox'` renders a placeholder for now: `<div className="text-center text-muted font-mono text-sm py-16">Inbox coming in the next task.</div>`

following the exact same conditional pattern the file already uses for `'stats'`.

- [ ] **Step 3: Verify in the browser**

With `npm run dev` running, open http://localhost:3000 and check:

1. Four tabs render: Prospects | Inbox | Stats | Settings, styled like before.
2. Settings tab loads defaults, editing a rule shows "Unsaved changes", Save persists (reload the page — values stick).
3. Prospects and Stats tabs still work exactly as before.

- [ ] **Step 4: Run the build to catch compile errors**

Run: `npm run build`
Expected: compiles clean, all `/api/*` routes listed as dynamic (ƒ).

- [ ] **Step 5: Commit**

```bash
git add components/SettingsView.jsx components/ProspectsApp.jsx
git commit -m "feat: engine settings view and 4-tab view switcher"
```

---

### Task 7: LeadInbox core (add, list, filter, status actions)

**Files:**
- Create: `components/LeadInbox.jsx`
- Modify: `components/ProspectsApp.jsx` (replace the inbox placeholder with `<LeadInbox />` and add the import)

**Interfaces:**
- Consumes: leads API (Task 4), settings API (Task 3)
- Produces: `<LeadInbox />` (no props). Internal helpers Task 8 extends: `updateLead(id, patch)` (optimistic + rollback), `leads`/`setLeads` state, `settings` state loaded from the API.

- [ ] **Step 1: Create LeadInbox with add/list/filter/status**

Create `components/LeadInbox.jsx`:

```jsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_ENGINE_SETTINGS,
  LEAD_PLATFORMS,
  LEAD_STATUSES,
  buildScoringPrompt,
  parseScoringResult,
} from '@/lib/engine-prompts.mjs';

const EMPTY_FORM = { platform: 'Facebook', post_url: '', post_text: '', author_name: '', author_handle: '' };

function Label({ children }) {
  return (
    <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted mb-1.5">{children}</div>
  );
}

// Colored-dot verdict chip (CSS dots — no emoji, per the Windows rendering rule).
function VerdictChip({ verdict }) {
  if (!verdict) {
    return <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">unscored</span>;
  }
  const green = verdict === 'green';
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em]">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${green ? 'bg-emerald-600' : 'bg-red-500'}`}
      />
      <span className={green ? 'text-emerald-700' : 'text-red-600'}>{verdict}</span>
    </span>
  );
}

function parseReasons(lead) {
  try {
    const r = JSON.parse(lead.verdict_reasons || '[]');
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

export default function LeadInbox() {
  const [leads, setLeads] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_ENGINE_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all' | one of LEAD_STATUSES
  const [platformFilter, setPlatformFilter] = useState('all');
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  useEffect(() => {
    Promise.all([
      fetch('/api/leads').then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ])
      .then(([leadsData, settingsData]) => {
        setLeads(leadsData.leads || []);
        setSettings({ ...DEFAULT_ENGINE_SETTINGS, ...(settingsData.settings || {}) });
      })
      .catch(() => setError('Could not load the inbox.'))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    return leads.filter((l) => {
      if (statusFilter === 'active' && (l.status === 'promoted' || l.status === 'skipped')) return false;
      if (statusFilter !== 'all' && statusFilter !== 'active' && l.status !== statusFilter) return false;
      if (platformFilter !== 'all' && l.platform !== platformFilter) return false;
      return true;
    });
  }, [leads, statusFilter, platformFilter]);

  // Single write path: optimistic patch → server confirm → rollback + alert.
  async function updateLead(id, patch) {
    const before = leadsRef.current;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      const { lead } = await res.json();
      setLeads((ls) => ls.map((l) => (l.id === id ? lead : l)));
      return lead;
    } catch (e) {
      setLeads(before);
      alert(`Update failed: ${e.message || e}`);
      return null;
    }
  }

  async function addLead() {
    if (!form.post_text.trim() && !form.post_url.trim()) {
      setError('Paste the post text or a link first.');
      return;
    }
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
      const { lead } = await res.json();
      setLeads((ls) => [lead, ...ls]);
      setForm(EMPTY_FORM);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setAdding(false);
    }
  }

  async function deleteLead(id) {
    if (!confirm('Delete this lead?')) return;
    const before = leadsRef.current;
    setLeads((ls) => ls.filter((l) => l.id !== id));
    try {
      const res = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      setLeads(before);
      alert(`Delete failed: ${e.message || e}`);
    }
  }

  if (loading) {
    return <div className="text-center text-muted font-mono text-sm py-16">Loading inbox…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Add-lead card */}
      <div className="bg-surface border border-line rounded-2xl shadow-card p-5">
        <h2 className="font-serif text-2xl text-charcoal mb-4">Found a lead?</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <Label>Platform</Label>
            <select
              value={form.platform}
              onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
              className="w-full bg-paper border border-line rounded-lg px-3 py-2 text-sm text-charcoal focus:outline-none focus:border-mauve"
            >
              {LEAD_PLATFORMS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Post link</Label>
            <input
              value={form.post_url}
              onChange={(e) => setForm((f) => ({ ...f, post_url: e.target.value }))}
              placeholder="https://…"
              className="w-full bg-paper border border-line rounded-lg px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
            />
          </div>
          <div>
            <Label>Their name</Label>
            <input
              value={form.author_name}
              onChange={(e) => setForm((f) => ({ ...f, author_name: e.target.value }))}
              placeholder="Who posted it"
              className="w-full bg-paper border border-line rounded-lg px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
            />
          </div>
          <div>
            <Label>Profile / handle</Label>
            <input
              value={form.author_handle}
              onChange={(e) => setForm((f) => ({ ...f, author_handle: e.target.value }))}
              placeholder="@handle or profile URL"
              className="w-full bg-paper border border-line rounded-lg px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
            />
          </div>
        </div>
        <Label>The post</Label>
        <textarea
          value={form.post_text}
          onChange={(e) => setForm((f) => ({ ...f, post_text: e.target.value }))}
          rows={3}
          placeholder="Paste what they wrote, word for word…"
          className="w-full bg-paper border border-line rounded-lg px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve mb-3"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={addLead}
            disabled={adding}
            className="px-4 py-2 text-xs font-mono uppercase tracking-[0.14em] rounded-lg bg-charcoal text-paper disabled:opacity-40"
          >
            {adding ? 'Adding…' : 'Add to inbox'}
          </button>
          {error && <span className="text-xs font-mono text-red-700">{error}</span>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {['active', 'all', ...LEAD_STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 text-xs font-mono uppercase tracking-[0.14em] rounded-lg border transition ${
              statusFilter === s
                ? 'bg-charcoal text-paper border-charcoal'
                : 'bg-paper text-charcoal-2 border-line hover:bg-blush-soft'
            }`}
          >
            {s}
          </button>
        ))}
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="ml-auto bg-surface border border-line rounded-lg px-2 py-1 text-xs font-mono text-charcoal-2"
        >
          <option value="all">All platforms</option>
          {LEAD_PLATFORMS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Triage list */}
      {visible.length === 0 ? (
        <div className="text-center text-muted py-12">
          <p className="font-serif text-xl text-charcoal-2 mb-1">Nothing here yet.</p>
          <p className="text-sm">Paste the first post you find and let the filter do its job.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              settings={settings}
              updateLead={updateLead}
              deleteLead={deleteLead}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function LeadCard({ lead, settings, updateLead, deleteLead }) {
  const reasons = parseReasons(lead);
  return (
    <li className="bg-surface border border-line rounded-2xl shadow-card p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-serif text-lg text-charcoal">{lead.author_name || 'Unknown'}</span>
            <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.14em] rounded bg-blush-soft text-charcoal-2 border border-line">
              {lead.platform}
            </span>
            <VerdictChip verdict={lead.verdict} />
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-mauve-deep">
              {lead.status}
            </span>
          </div>
          {lead.author_handle && <div className="text-xs text-muted mt-0.5">{lead.author_handle}</div>}
        </div>
        <button
          onClick={() => deleteLead(lead.id)}
          className="font-mono text-xs text-muted hover:text-charcoal shrink-0"
          title="Delete lead"
        >
          ✕
        </button>
      </div>

      {lead.post_text && (
        <p className="text-sm text-charcoal-2 whitespace-pre-wrap border-l-2 border-blush pl-3 mb-2">
          {lead.post_text.length > 400 ? `${lead.post_text.slice(0, 400)}…` : lead.post_text}
        </p>
      )}
      {lead.post_url && (
        <a
          href={lead.post_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-mauve-deep underline break-all"
        >
          {lead.post_url}
        </a>
      )}
      {reasons.length > 0 && (
        <div className="text-xs text-muted mt-2">Reasons: {reasons.join(' · ')}</div>
      )}
      {lead.notes && <div className="text-xs text-charcoal-2 mt-1 whitespace-pre-wrap">{lead.notes}</div>}

      <div className="flex flex-wrap items-center gap-2 mt-3">
        {lead.status !== 'promoted' && (
          <>
            {lead.status !== 'qualified' && (
              <button
                onClick={() => updateLead(lead.id, { status: 'qualified' })}
                className="px-3 py-1 text-xs font-mono uppercase tracking-[0.14em] rounded-lg border border-line bg-paper text-charcoal-2 hover:bg-blush-soft"
              >
                Qualify
              </button>
            )}
            {lead.status !== 'skipped' && (
              <button
                onClick={() => updateLead(lead.id, { status: 'skipped' })}
                className="px-3 py-1 text-xs font-mono uppercase tracking-[0.14em] rounded-lg border border-line bg-paper text-charcoal-2 hover:bg-blush-soft"
              >
                Skip
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}
```

- [ ] **Step 2: Replace the placeholder in ProspectsApp.jsx**

Add the import next to the SettingsView import:

```jsx
import LeadInbox from './LeadInbox';
```

Replace the `view === 'inbox'` placeholder div from Task 6 with `<LeadInbox />`.

- [ ] **Step 3: Verify in the browser**

With `npm run dev` running, on the Inbox tab:

1. Add a lead with pasted text → appears at the top with status `new`, unscored chip.
2. Qualify → status flips instantly (optimistic) and survives a page reload.
3. Skip another → it disappears from the default "active" filter; the "all" and "skipped" filters show it.
4. Platform filter narrows the list.
5. Delete removes after confirm; reload confirms.
6. Kill the dev server and click Qualify → alert + state rolls back (rollback path works). Restart the server after.

- [ ] **Step 4: Commit**

```bash
git add components/LeadInbox.jsx components/ProspectsApp.jsx
git commit -m "feat: lead inbox view — add, triage, filters, optimistic updates"
```

---

### Task 8: Scoring panel (copy prompt → paste result)

**Files:**
- Modify: `components/LeadInbox.jsx` (add `ScorePanel`, wire into `LeadCard`)

**Interfaces:**
- Consumes: `buildScoringPrompt`, `parseScoringResult` (Task 2); `updateLead` (Task 7)
- Produces: per-card Score workflow that sets `verdict`, `verdict_reasons`, and appends the suggested first line to `notes`.

- [ ] **Step 1: Add the ScorePanel component**

Add to `components/LeadInbox.jsx` (below `LeadCard`):

```jsx
function ScorePanel({ lead, settings, updateLead, onClose }) {
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState('');
  const [parseError, setParseError] = useState('');

  async function copyPrompt() {
    await navigator.clipboard.writeText(buildScoringPrompt(settings, lead));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function applyPaste() {
    const res = parseScoringResult(pasted);
    if (!res.ok) {
      setParseError(res.error);
      return;
    }
    setParseError('');
    const { verdict, reasons, suggestedFirstLine } = res.data;
    const notes = suggestedFirstLine
      ? `${lead.notes ? `${lead.notes}\n` : ''}First line: ${suggestedFirstLine}`
      : lead.notes || '';
    const saved = await updateLead(lead.id, { verdict, verdict_reasons: reasons, notes });
    if (saved) onClose();
  }

  async function manualVerdict(verdict) {
    const saved = await updateLead(lead.id, { verdict, verdict_reasons: [] });
    if (saved) onClose();
  }

  return (
    <div className="mt-3 border border-line rounded-xl bg-paper p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          Score this lead
        </span>
        <button onClick={onClose} className="font-mono text-xs text-muted hover:text-charcoal">
          Close
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={copyPrompt}
          className="px-3 py-1.5 text-xs font-mono uppercase tracking-[0.14em] rounded-lg bg-charcoal text-paper"
        >
          {copied ? 'Copied ✓' : '1 · Copy prompt'}
        </button>
        <span className="text-xs text-muted">
          Paste it into ChatGPT or Claude (free is fine), then paste the reply below.
        </span>
      </div>

      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        rows={3}
        placeholder="2 · Paste the AI's reply here…"
        className="w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-charcoal placeholder:text-muted/60 focus:outline-none focus:border-mauve"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={applyPaste}
          disabled={!pasted.trim()}
          className="px-3 py-1.5 text-xs font-mono uppercase tracking-[0.14em] rounded-lg bg-charcoal text-paper disabled:opacity-40"
        >
          Apply result
        </button>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">or manually:</span>
        <button
          onClick={() => manualVerdict('green')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-[0.14em] rounded-lg border border-line bg-surface hover:bg-blush-soft"
        >
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-600" /> Green
        </button>
        <button
          onClick={() => manualVerdict('red')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono uppercase tracking-[0.14em] rounded-lg border border-line bg-surface hover:bg-blush-soft"
        >
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" /> Red
        </button>
      </div>
      {parseError && <div className="text-xs font-mono text-red-700">{parseError}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into LeadCard**

In `LeadCard`, add state and a Score button. At the top of `LeadCard`:

```jsx
const [scoring, setScoring] = useState(false);
```

In the actions row (the `div` with Qualify/Skip), add as the FIRST button (available for any non-promoted lead):

```jsx
<button
  onClick={() => setScoring((s) => !s)}
  className="px-3 py-1 text-xs font-mono uppercase tracking-[0.14em] rounded-lg border border-line bg-paper text-charcoal-2 hover:bg-blush-soft"
>
  Score
</button>
```

And render the panel after the actions row, at the end of the `<li>`:

```jsx
{scoring && (
  <ScorePanel
    lead={lead}
    settings={settings}
    updateLead={updateLead}
    onClose={() => setScoring(false)}
  />
)}
```

- [ ] **Step 3: Verify in the browser**

1. Score → Copy prompt → paste into a text editor: prompt contains your saved offer, rules, and the lead's post text, ending with the JSON instruction.
2. Paste this fixture into the panel and Apply:
   `Sure! {"verdict":"green","reasons":["hiring now"],"confidence":"high","suggested_first_line":"Saw you're drowning in DMs"}`
   → verdict chip turns green, reasons render, notes show "First line: Saw you're drowning in DMs".
3. Paste garbage ("looks good to me") → inline error, nothing saved.
4. Manual Red on another lead → red chip, no reasons.

- [ ] **Step 4: Run tests + build**

Run: `npm test` then `npm run build`
Expected: tests pass, build clean.

- [ ] **Step 5: Commit**

```bash
git add components/LeadInbox.jsx
git commit -m "feat: copy-paste scoring panel with JSON parse and manual fallback"
```

---

### Task 9: Promote flow + inbox count in the tab

**Files:**
- Modify: `components/LeadInbox.jsx` (Promote button on qualified/green leads)
- Modify: `components/ProspectsApp.jsx` (new-lead count in the Inbox tab label)

**Interfaces:**
- Consumes: `POST /api/leads/:id/promote` (Task 5)
- Produces: complete Phase A loop; Inbox tab shows `Inbox · N` when N leads have `status='new'`.

- [ ] **Step 1: Add Promote to LeadCard**

In `LeadCard` (LeadInbox.jsx), add next to Qualify/Skip — shown when the lead is not yet promoted:

```jsx
<button
  onClick={async () => {
    const res = await fetch(`/api/leads/${lead.id}/promote`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || `Promote failed (HTTP ${res.status})`);
      return;
    }
    updateLocal(data.lead);
  }}
  className="px-3 py-1 text-xs font-mono uppercase tracking-[0.14em] rounded-lg bg-mauve-deep text-paper hover:opacity-90"
>
  Promote →
</button>
```

`updateLocal` is a new prop: in `LeadInbox`, pass `updateLocal={(lead) => setLeads((ls) => ls.map((l) => (l.id === lead.id ? lead : l)))}` to `LeadCard`, and add `updateLocal` to `LeadCard`'s destructured props. (Promote already persisted server-side, so this is a local sync, not an optimistic write.)

For promoted leads, show a passive marker instead of action buttons (inside the actions row's `lead.status !== 'promoted'` else-branch):

```jsx
{lead.status === 'promoted' && (
  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
    In prospects (#{lead.promoted_prospect_id})
  </span>
)}
```

- [ ] **Step 2: Inbox count in the tab label**

In `ProspectsApp.jsx`, near the other top-level state hooks, add:

```jsx
const [newLeadCount, setNewLeadCount] = useState(0);
```

Add an effect that refreshes the count on mount and whenever the view changes (returning from the Inbox updates it):

```jsx
useEffect(() => {
  let cancelled = false;
  fetch('/api/leads?status=new')
    .then((r) => r.json())
    .then((d) => {
      if (!cancelled) setNewLeadCount((d.leads || []).length);
    })
    .catch(() => {});
  return () => {
    cancelled = true;
  };
}, [view]);
```

Change the tabs array entry to render the count:

```jsx
{ key: 'inbox', label: newLeadCount > 0 ? `Inbox · ${newLeadCount}` : 'Inbox' },
```

- [ ] **Step 3: Verify in the browser**

1. Add a lead, score it green, Qualify, then **Promote →**: card flips to `promoted` with "In prospects (#N)"; the Prospects tab shows the new prospect (stage New, source = platform, info contains the post + link + verdict).
2. Promote the same lead again via curl: `curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/leads/<id>/promote` → `409`.
3. Tab shows `Inbox · N` while unscored/new leads exist; drops when they're qualified/skipped/promoted (after switching views).

- [ ] **Step 4: Run tests + build**

Run: `npm test && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/LeadInbox.jsx components/ProspectsApp.jsx
git commit -m "feat: promote lead to prospect from inbox; new-lead count in tab"
```

---

### Task 10: Deploy + live end-to-end verification

**Files:** none (deploy + verification only)

- [ ] **Step 1: Confirm remote schema already has the new tables**

Run: `npx wrangler d1 execute bloomtrack-pro --remote --command "SELECT name FROM sqlite_master WHERE type='table'" --json`
Expected: includes `leads` and `settings` (applied in Task 1 — schema-before-code).

- [ ] **Step 2: Push to deploy**

```bash
git push
```

Watch the deploy: `npx wrangler pages deployment list --project-name=bloomtrack-pro` until the newest commit's deployment stops being the failing/building state (~3 minutes).

- [ ] **Step 3: Live API end-to-end**

```bash
curl -s https://leadsthatbloom.com/api/settings
curl -s -X POST https://leadsthatbloom.com/api/leads -H "Content-Type: application/json" -d '{"platform":"Facebook","post_text":"E2E test lead","author_name":"E2E"}'
# note the id N from the response:
curl -s -X PUT https://leadsthatbloom.com/api/leads/N -H "Content-Type: application/json" -d '{"verdict":"green","verdict_reasons":["hiring now"]}'
curl -s -X POST https://leadsthatbloom.com/api/leads/N/promote
# 409 on repeat:
curl -s -o /dev/null -w "%{http_code}" -X POST https://leadsthatbloom.com/api/leads/N/promote
```

Expected: settings defaults; 201 lead; verdict saved; promote returns prospect+lead; then `409`.

Clean up the test data (use the prospect id P from the promote response):

```bash
curl -s -X DELETE https://leadsthatbloom.com/api/leads/N
curl -s -X DELETE https://leadsthatbloom.com/api/prospects/P
```

- [ ] **Step 4: Live browser check**

On https://leadsthatbloom.com : four tabs render; Settings saves and persists; Inbox add → score (paste fixture) → promote → appears in Prospects; no console errors; masthead/styling intact.

- [ ] **Step 5: Update HANDOFF.md status**

Add one line to the productization backlog section of `HANDOFF.md` noting Phase A (settings + lead inbox + copy-paste scoring) shipped, with Phases B (writer) and C (finder) next. Commit:

```bash
git add HANDOFF.md
git commit -m "docs: note lead engine phase A shipped"
git push
```
