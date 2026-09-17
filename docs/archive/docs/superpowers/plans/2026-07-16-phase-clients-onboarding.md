# Clients + Onboarding — Implementation Plan (spec phase 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port BloomBoard's Clients tab: a D1-backed clients table with the 12-step onboarding checklist (toggle, add, remove, reorder), progress bars, and a one-click path from Client-stage prospects — plus the migration runner the spec's §4 mandates before any schema change.

**Architecture:** A tested migration runner (`scripts/migrate.mjs`) applies ordered idempotent files from `migrations/`; `001_clients.sql` creates the table. Two edge API routes expose CRUD. `components/ClientsView.jsx` is self-contained (own fetch/state, like LeadInbox), receives Client-stage prospects from ProspectsApp for the "start onboarding" banner. Checklist lives as a JSON column (never queried per-step).

**Tech Stack:** Next.js 15 (plain JS), Cloudflare D1 via wrangler, `node --test`.

## Global Constraints

- Spec §3b + §4 in `docs/superpowers/specs/2026-07-16-bloomboard-consolidation-design.md`, with one owner-safe scope adjustment: the "Start onboarding?" prompt on stage change becomes a banner in the Clients tab listing Client-stage prospects without a linked client (the core prospect write path stays untouched, per HANDOFF rules).
- **NEVER run wrangler against DB id `ab941724-dbee-4420-bfe4-d7fa5a27d3ea`** (personal DB). This repo's binding (wrangler.toml → `bloomtrack-pro`, id `412a33ad-...`) is correct. Migration application in this phase is **`--local` ONLY** (the dev D1). The `--remote` run happens at push time with the owner.
- Every new API route exports BOTH `runtime = 'edge'` and `dynamic = 'force-dynamic'` (HANDOFF gotcha #1).
- `schema.sql` stays the canonical fresh-DB schema: the same CREATE TABLE is appended there in the same commit as the migration file (HANDOFF gotcha #2).
- Both themes must work; no raw hex colors in new UI code.
- Do NOT push to GitHub. Commit locally on `feature/liquid-glass`.
- Implementers do NOT run a dev server or build; `npm test` where stated; controller verifies live at the gate.

---

### Task 1: Migration runner (TDD) + 001_clients.sql

**Files:**
- Create: `scripts/migrate.mjs`
- Create: `tests/migrate.test.mjs`
- Create: `migrations/001_clients.sql`
- Modify: `schema.sql` (append the clients table at the end)

**Interfaces:**
- Produces: `pendingMigrations(allFiles, appliedNames)` (pure, tested) and `runMigrations({ files, exec })` (orchestrator with injectable exec, tested); CLI `node scripts/migrate.mjs --local` / `--remote`. Later phases add `002_*.sql` etc. and rerun the same CLI.

- [ ] **Step 1: Write the failing tests** — `tests/migrate.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingMigrations, runMigrations, ENSURE_TABLE_SQL } from '../scripts/migrate.mjs';

test('pendingMigrations returns unapplied files in name order', () => {
  const files = ['002_library.sql', '001_clients.sql', '003_rubric.sql'];
  const applied = ['001_clients.sql'];
  assert.deepEqual(pendingMigrations(files, applied), ['002_library.sql', '003_rubric.sql']);
});

test('pendingMigrations with nothing applied returns everything sorted', () => {
  assert.deepEqual(
    pendingMigrations(['002_b.sql', '001_a.sql'], []),
    ['001_a.sql', '002_b.sql']
  );
});

test('pendingMigrations with everything applied returns empty', () => {
  assert.deepEqual(pendingMigrations(['001_a.sql'], ['001_a.sql']), []);
});

test('runMigrations ensures bookkeeping table, applies pending files, records each', async () => {
  const calls = [];
  const exec = async (args) => {
    calls.push(args);
    if (args.command && args.command.startsWith('SELECT name')) {
      return [{ name: '001_clients.sql' }];
    }
    return [];
  };
  const result = await runMigrations({
    files: ['001_clients.sql', '002_library.sql'],
    exec,
  });
  assert.deepEqual(result.applied, ['002_library.sql']);
  assert.deepEqual(result.skipped, ['001_clients.sql']);
  // call order: ensure table, select applied, apply file, record it
  assert.equal(calls[0].command, ENSURE_TABLE_SQL);
  assert.ok(calls[1].command.startsWith('SELECT name'));
  assert.equal(calls[2].file, 'migrations/002_library.sql');
  assert.ok(calls[3].command.includes("INSERT INTO _migrations"));
  assert.ok(calls[3].command.includes('002_library.sql'));
});

test('runMigrations with nothing pending applies nothing', async () => {
  const calls = [];
  const exec = async (args) => {
    calls.push(args);
    if (args.command && args.command.startsWith('SELECT name')) {
      return [{ name: '001_clients.sql' }];
    }
    return [];
  };
  const result = await runMigrations({ files: ['001_clients.sql'], exec });
  assert.deepEqual(result.applied, []);
  assert.equal(calls.length, 2); // ensure + select only
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test` — the new tests FAIL (module not found), existing 14 pass.

- [ ] **Step 3: Implement `scripts/migrate.mjs`:**

```js
// Idempotent D1 migration runner (spec §4). Ordered files in migrations/
// apply once each; bookkeeping lives in a _migrations table on the target
// database. Usage:
//   node scripts/migrate.mjs --local    (dev D1 — safe anytime)
//   node scripts/migrate.mjs --remote   (production — owner runs at deploy time)
// Deploy rule: migrate the live DB BEFORE pushing code that reads new
// columns (HANDOFF gotcha #2).
import { readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DB_NAME = 'bloomtrack-pro';

export const ENSURE_TABLE_SQL =
  "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')))";

export function pendingMigrations(allFiles, appliedNames) {
  const applied = new Set(appliedNames);
  return [...allFiles].sort().filter((f) => !applied.has(f));
}

// exec({ command }) or exec({ file }) → parsed result rows (array).
// Injectable so the orchestration is testable without wrangler.
export async function runMigrations({ files, exec }) {
  await exec({ command: ENSURE_TABLE_SQL });
  const rows = await exec({ command: 'SELECT name FROM _migrations' });
  const appliedNames = (rows || []).map((r) => r.name);
  const pending = pendingMigrations(files, appliedNames);
  const applied = [];
  for (const name of pending) {
    await exec({ file: `migrations/${name}` });
    await exec({ command: `INSERT INTO _migrations (name) VALUES ('${name}')` });
    applied.push(name);
  }
  return { applied, skipped: files.filter((f) => !applied.includes(f)) };
}

// SQL always travels via --file: passing multi-word SQL through --command
// with shell:true gets word-split by cmd.exe on Windows. A temp file
// sidesteps SQL quoting; the file PATH itself still needs quoting under
// shell:true (cmd.exe joins args with spaces and does not quote them), so
// any arg containing whitespace is wrapped explicitly.
const winShell = process.platform === 'win32';
const q = (s) => (winShell && /\s/.test(s) ? `"${s}"` : s);

function wranglerExec(target) {
  return async ({ command, file }) => {
    let tmp = null;
    try {
      let sqlFile = file;
      if (command) {
        tmp = mkdtempSync(join(tmpdir(), 'ltb-mig-'));
        sqlFile = join(tmp, 'cmd.sql');
        writeFileSync(sqlFile, command);
      }
      const args = ['wrangler', 'd1', 'execute', DB_NAME, target, '--json', '--file', sqlFile].map(q);
      const out = execFileSync('npx', args, { encoding: 'utf8', shell: winShell });
      try {
        const parsed = JSON.parse(out);
        return parsed?.[0]?.results ?? [];
      } catch {
        return [];
      }
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    }
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith('migrate.mjs');
if (isMain) {
  const target = process.argv.includes('--remote') ? '--remote' : '--local';
  if (target === '--remote' && !process.argv.includes('--remote')) process.exit(1);
  const files = readdirSync('migrations').filter((f) => f.endsWith('.sql'));
  runMigrations({ files, exec: wranglerExec(target) })
    .then(({ applied, skipped }) => {
      console.log(`applied: ${applied.length ? applied.join(', ') : '(none)'}`);
      console.log(`already applied: ${skipped.length ? skipped.join(', ') : '(none)'}`);
    })
    .catch((err) => {
      console.error('migration failed:', err.message);
      process.exit(1);
    });
}
```

- [ ] **Step 4: Create `migrations/001_clients.sql`:**

```sql
-- Clients + onboarding checklists (spec §3b). Checklist is a JSON column:
-- [{id, label, done, doneDate}] — never queried per-step.
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  prospect_id INTEGER,
  name TEXT NOT NULL,
  handle TEXT DEFAULT '',
  platforms TEXT DEFAULT '[]',
  monthly_rate TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  onboarding TEXT DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_prospect ON clients(prospect_id);
```

- [ ] **Step 5: Append the same block (comment included) to the END of `schema.sql`.**

- [ ] **Step 6: Run tests green, apply locally, commit**

Run: `npm test` → all pass (14 + 5 new).
Run: `node scripts/migrate.mjs --local` → `applied: 001_clients.sql`.
Run it AGAIN → `applied: (none)` / `already applied: 001_clients.sql` (idempotence proof — paste both outputs in your report).

```bash
git add scripts/migrate.mjs tests/migrate.test.mjs migrations/001_clients.sql schema.sql
git commit -m "feat: D1 migration runner + clients table migration"
```

---

### Task 2: Clients API routes

**Files:**
- Create: `app/api/clients/route.js`
- Create: `app/api/clients/[id]/route.js`
- Create: `lib/onboarding.mjs`

**Interfaces:**
- Produces: `GET /api/clients` → `{ clients: [...] }` (onboarding/platforms parsed to arrays); `POST /api/clients` `{ name, prospect_id?, handle?, platforms?, start_date? }` → `{ client }` seeded with `DEFAULT_ONBOARDING` labels; `PUT /api/clients/[id]` (partial patch of name/handle/platforms/monthly_rate/start_date/notes/onboarding) → `{ client }`; `DELETE /api/clients/[id]` → `{ ok: true }`.
- `lib/onboarding.mjs` exports `DEFAULT_ONBOARDING` (12 labels) — also used by ClientsView for display fallbacks.

- [ ] **Step 1: Create `lib/onboarding.mjs`:**

```js
// BloomBoard's default client onboarding checklist. Seeded into every new
// client; each client's copy is independently editable afterward.
export const DEFAULT_ONBOARDING = [
  'Contract signed',
  'First invoice sent and paid',
  'Onboarding questionnaire sent',
  'Questionnaire answers received',
  'Account access received and tested',
  'Brand assets collected (logo, fonts, colors, photos)',
  'Content preferences confirmed (topics, tone, what to never post)',
  'Posting schedule agreed',
  'First content batch drafted',
  'First content batch approved',
  'First posts live',
  'First check-in call or report scheduled',
];
```

- [ ] **Step 2: Create `app/api/clients/route.js`:**

```js
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { DEFAULT_ONBOARDING } from '@/lib/onboarding.mjs';

// D1 is only available in the edge runtime on Cloudflare Pages.
export const runtime = 'edge';
// Force-dynamic so next-on-pages keeps this a real Function for ALL methods.
export const dynamic = 'force-dynamic';

const COLUMNS =
  'id, prospect_id, name, handle, platforms, monthly_rate, start_date, notes, onboarding, created_at';

function parseClient(row) {
  const parse = (v, fallback) => {
    try { return JSON.parse(v); } catch { return fallback; }
  };
  return {
    ...row,
    platforms: parse(row.platforms, []),
    onboarding: parse(row.onboarding, []),
  };
}

export async function GET() {
  const db = getDb();
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM clients ORDER BY created_at DESC`)
    .all();
  return NextResponse.json({ clients: (results || []).map(parseClient) });
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const name = String(body?.name || '').trim().slice(0, 200);
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }
  const id = crypto.randomUUID();
  const prospectId = Number.isInteger(body?.prospect_id) ? body.prospect_id : null;
  const handle = String(body?.handle || '').slice(0, 300);
  const platforms = Array.isArray(body?.platforms)
    ? body.platforms.map((p) => String(p).slice(0, 40)).slice(0, 10)
    : [];
  const startDate = String(body?.start_date || '').slice(0, 10);
  const onboarding = DEFAULT_ONBOARDING.map((label, i) => ({
    id: `ob-${i + 1}`,
    label,
    done: false,
    doneDate: null,
  }));
  const createdAt = new Date().toISOString();

  const db = getDb();
  await db
    .prepare(
      `INSERT INTO clients (id, prospect_id, name, handle, platforms, monthly_rate, start_date, notes, onboarding, created_at)
       VALUES (?, ?, ?, ?, ?, '', ?, '', ?, ?)`
    )
    .bind(id, prospectId, name, handle, JSON.stringify(platforms), startDate, JSON.stringify(onboarding), createdAt)
    .run();
  const row = await db.prepare(`SELECT ${COLUMNS} FROM clients WHERE id = ?`).bind(id).first();
  return NextResponse.json({ client: parseClient(row) }, { status: 201 });
}
```

- [ ] **Step 3: Create `app/api/clients/[id]/route.js`:**

```js
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

// D1 is only available in the edge runtime on Cloudflare Pages.
export const runtime = 'edge';
// Force-dynamic so next-on-pages keeps this a real Function for ALL methods.
export const dynamic = 'force-dynamic';

const COLUMNS =
  'id, prospect_id, name, handle, platforms, monthly_rate, start_date, notes, onboarding, created_at';

function parseClient(row) {
  const parse = (v, fallback) => {
    try { return JSON.parse(v); } catch { return fallback; }
  };
  return {
    ...row,
    platforms: parse(row.platforms, []),
    onboarding: parse(row.onboarding, []),
  };
}

// Whitelisted patchable fields → SQL value serializers.
const FIELDS = {
  name: (v) => String(v).trim().slice(0, 200),
  handle: (v) => String(v).slice(0, 300),
  monthly_rate: (v) => String(v).slice(0, 100),
  start_date: (v) => String(v).slice(0, 10),
  notes: (v) => String(v).slice(0, 5000),
  platforms: (v) => JSON.stringify(Array.isArray(v) ? v.map((p) => String(p).slice(0, 40)).slice(0, 10) : []),
  onboarding: (v) =>
    JSON.stringify(
      Array.isArray(v)
        ? v.slice(0, 100).map((s, i) => ({
            id: String(s?.id || `ob-${i + 1}`).slice(0, 40),
            label: String(s?.label || '').slice(0, 300),
            done: !!s?.done,
            doneDate: s?.doneDate ? String(s.doneDate).slice(0, 30) : null,
          }))
        : []
    ),
};

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
  for (const [field, serialize] of Object.entries(FIELDS)) {
    if (body[field] !== undefined) {
      if (field === 'name' && !String(body.name).trim()) {
        return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
      }
      sets.push(`${field} = ?`);
      values.push(serialize(body[field]));
    }
  }
  if (!sets.length) {
    return NextResponse.json({ error: 'No patchable fields in body' }, { status: 400 });
  }
  const db = getDb();
  const result = await db
    .prepare(`UPDATE clients SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values, id)
    .run();
  if (!result.meta || result.meta.changes === 0) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }
  const row = await db.prepare(`SELECT ${COLUMNS} FROM clients WHERE id = ?`).bind(id).first();
  return NextResponse.json({ client: parseClient(row) });
}

export async function DELETE(req, { params }) {
  const { id } = await params;
  const db = getDb();
  const result = await db.prepare('DELETE FROM clients WHERE id = ?').bind(id).run();
  if (!result.meta || result.meta.changes === 0) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

NOTE: check how `app/api/prospects/[id]/route.js` reads its `params` (awaited or not, Next 15 differs by minor version) and match that file's exact pattern — if it uses `params` without await, do the same here and say so in your report.

- [ ] **Step 4: Verify**

Run: `npm test` → all pass. `grep -c "force-dynamic" app/api/clients/route.js app/api/clients/[id]/route.js` → 1 each.

- [ ] **Step 5: Commit**

```bash
git add app/api/clients lib/onboarding.mjs
git commit -m "feat: clients API — list, create with seeded checklist, patch, delete"
```

---

### Task 3: ClientsView UI + wiring

**Files:**
- Create: `components/ClientsView.jsx`
- Modify: `components/GlassRail.jsx` (NAV entry + icon)
- Modify: `components/ProspectsApp.jsx` (import, render branch, valid-view comment)

**Interfaces:**
- Consumes: the clients API (Task 2). Props from ProspectsApp: `prospects` (for the Client-stage banner) and `onOpenProspect(p)` (same jump-and-highlight handler shape as TodayView's onOpen).
- Produces: `<ClientsView prospects onOpenProspect />` — self-contained data (fetches `/api/clients` itself, LeadInbox pattern).

- [ ] **Step 1: Create `components/ClientsView.jsx`:**

```jsx
'use client';

import { useEffect, useMemo, useState } from 'react';

// Clients + onboarding checklists (spec §3b). Self-contained data view,
// LeadInbox-style: fetches its own list, updates via PUT with
// update-on-confirm (await server, then set state, alert on failure).
export default function ClientsView({ prospects, onOpenProspect }) {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [newStep, setNewStep] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/clients');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (alive) setClients(data.clients || []);
      } catch (e) {
        if (alive) setError(`Couldn't load clients. ${e.message}`);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const linkedProspectIds = useMemo(
    () => new Set(clients.map((c) => c.prospect_id).filter(Boolean)),
    [clients]
  );
  const unlinkedClientStage = useMemo(
    () => (prospects || []).filter((p) => p.stage === 'Client' && !linkedProspectIds.has(p.id)),
    [prospects, linkedProspectIds]
  );

  async function patchClient(id, patch) {
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setClients((prev) => prev.map((c) => (c.id === id ? data.client : c)));
      return data.client;
    } catch (e) {
      alert(`Couldn't save. ${e.message}`);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function createClient(fields) {
    setBusy(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setClients((prev) => [data.client, ...prev]);
      setOpenId(data.client.id);
    } catch (e) {
      alert(`Couldn't create the client. ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function removeClient(client) {
    if (!window.confirm(`Delete ${client.name} and their checklist? This can't be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setClients((prev) => prev.filter((c) => c.id !== client.id));
      setOpenId(null);
    } catch (e) {
      alert(`Couldn't delete. ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  const open = clients.find((c) => c.id === openId) || null;

  if (loading) return <div className="text-ink-2 mt-4">Loading clients…</div>;
  if (error) return <div className="text-poppy-text mt-4">{error}</div>;

  if (open) {
    return (
      <ClientDetail
        client={open}
        busy={busy}
        newStep={newStep}
        setNewStep={setNewStep}
        onBack={() => setOpenId(null)}
        onPatch={(patch) => patchClient(open.id, patch)}
        onDelete={() => removeClient(open)}
      />
    );
  }

  return (
    <div className="max-w-[860px]">
      <h1 className="font-serif text-[34px] text-bright leading-tight mb-1">Clients</h1>
      <p className="text-ink-2 mb-4">Onboarding checklists for everyone who signed.</p>

      {unlinkedClientStage.length > 0 && (
        <div className="glass-panel px-4 py-3 mb-4 flex flex-col gap-2">
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-rose-text">
            In Client stage, not set up yet
          </div>
          {unlinkedClientStage.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <span className="flex-1 min-w-0 truncate text-ink">
                {p.business_name || p.name || p.email}
              </span>
              <button
                onClick={() => onOpenProspect(p)}
                className="font-mono text-[11px] uppercase tracking-[0.13em] px-3 py-1.5 rounded-[8px] border border-line-strong text-ink-2 hover:bg-hover-wash-soft transition"
              >
                View
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  createClient({
                    name: p.business_name || p.name || p.email,
                    prospect_id: p.id,
                    handle: p.email || '',
                    start_date: new Date().toISOString().slice(0, 10),
                  })
                }
                className="font-mono text-[11px] uppercase tracking-[0.13em] px-3 py-1.5 rounded-[8px] bg-rose text-white hover:bg-rose-hover transition disabled:opacity-50"
              >
                Start onboarding
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4">
        <button
          disabled={busy}
          onClick={() => {
            const name = window.prompt('Client name?');
            if (name && name.trim()) createClient({ name: name.trim(), start_date: new Date().toISOString().slice(0, 10) });
          }}
          className="font-mono text-[11px] uppercase tracking-[0.13em] px-4 py-2.5 rounded-[8px] bg-rose text-white hover:bg-rose-hover transition disabled:opacity-50"
        >
          Add client
        </button>
      </div>

      {clients.length === 0 ? (
        <div className="glass-panel border-dashed p-10 text-center">
          <p className="text-ink-2">No clients yet. When a prospect reaches the Client stage, start their onboarding here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {clients.map((c) => {
            const total = c.onboarding.length;
            const done = c.onboarding.filter((s) => s.done).length;
            const next = c.onboarding.find((s) => !s.done);
            const pct = total ? Math.round((done / total) * 100) : 0;
            return (
              <button
                key={c.id}
                onClick={() => setOpenId(c.id)}
                className="glass-panel px-4 py-3 text-left hover:bg-card-hover transition"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-bright flex-1 min-w-0 truncate">{c.name}</span>
                  <span className="font-mono text-[11px] text-ink-3 num-tabular shrink-0">{done} / {total}</span>
                </div>
                <div className="h-[7px] rounded-full bg-hover-wash mt-2 overflow-hidden">
                  <div className="h-full rounded-full bg-leaf" style={{ width: `${pct}%` }} />
                </div>
                <div className="text-sm text-ink-2 mt-1.5 truncate">
                  {next ? `Next: ${next.label}` : 'All steps done'}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onCommit, placeholder, type = 'text' }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  return (
    <div>
      <label className="block font-mono text-[11px] uppercase tracking-[0.13em] text-ink-2 mb-1.5">{label}</label>
      <input
        type={type}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft !== (value || '')) onCommit(draft); }}
        className="cell-input"
      />
    </div>
  );
}

function ClientDetail({ client, busy, newStep, setNewStep, onBack, onPatch, onDelete }) {
  const total = client.onboarding.length;
  const done = client.onboarding.filter((s) => s.done).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  function toggleStep(stepId) {
    const onboarding = client.onboarding.map((s) =>
      s.id === stepId
        ? { ...s, done: !s.done, doneDate: !s.done ? new Date().toISOString().slice(0, 10) : null }
        : s
    );
    onPatch({ onboarding });
  }

  function moveStep(stepId, dir) {
    const idx = client.onboarding.findIndex((s) => s.id === stepId);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= client.onboarding.length) return;
    const onboarding = [...client.onboarding];
    [onboarding[idx], onboarding[swap]] = [onboarding[swap], onboarding[idx]];
    onPatch({ onboarding });
  }

  function removeStep(step) {
    if (!window.confirm(`Remove "${step.label}" from this checklist?`)) return;
    onPatch({ onboarding: client.onboarding.filter((s) => s.id !== step.id) });
  }

  function addStep() {
    const label = newStep.trim();
    if (!label) return;
    const onboarding = [
      ...client.onboarding,
      { id: `ob-${Date.now()}`, label, done: false, doneDate: null },
    ];
    setNewStep('');
    onPatch({ onboarding });
  }

  return (
    <div className="max-w-[860px]">
      <button onClick={onBack} className="font-mono text-[11px] uppercase tracking-[0.13em] text-ink-2 hover:text-ink mb-3">
        ← Clients
      </button>
      <h1 className="font-serif text-[34px] text-bright leading-tight mb-1">{client.name}</h1>
      <p className="text-ink-2">{done} of {total} onboarding steps done</p>
      <div className="h-[7px] rounded-full bg-hover-wash mt-2 mb-6 overflow-hidden max-w-[420px]">
        <div className="h-full rounded-full bg-leaf" style={{ width: `${pct}%` }} />
      </div>

      <div className="glass-panel p-4 mb-5">
        {client.onboarding.map((step, i) => (
          <div key={step.id} className="flex items-center gap-1.5 border-b border-line last:border-b-0 py-1">
            <button
              disabled={busy}
              onClick={() => toggleStep(step.id)}
              className="flex items-center gap-3 flex-1 min-w-0 text-left py-2 disabled:opacity-60"
            >
              <span
                className={`w-[22px] h-[22px] shrink-0 rounded-full border-2 flex items-center justify-center text-white text-[12px] font-bold ${
                  step.done ? 'bg-leaf border-leaf' : 'border-line-strong'
                }`}
              >
                {step.done ? '✓' : ''}
              </span>
              <span className={`min-w-0 truncate ${step.done ? 'text-ink-3' : 'text-ink'}`}>{step.label}</span>
              {step.done && step.doneDate ? (
                <span className="font-mono text-[10px] text-ink-3 shrink-0">{step.doneDate}</span>
              ) : null}
            </button>
            <button disabled={busy || i === 0} onClick={() => moveStep(step.id, -1)} aria-label="Move up"
              className="w-9 h-9 shrink-0 rounded-[8px] text-ink-3 hover:bg-hover-wash-soft disabled:opacity-25">↑</button>
            <button disabled={busy || i === client.onboarding.length - 1} onClick={() => moveStep(step.id, 1)} aria-label="Move down"
              className="w-9 h-9 shrink-0 rounded-[8px] text-ink-3 hover:bg-hover-wash-soft disabled:opacity-25">↓</button>
            <button disabled={busy} onClick={() => removeStep(step)} aria-label="Remove step"
              className="w-9 h-9 shrink-0 rounded-[8px] text-ink-3 hover:bg-hover-wash-soft disabled:opacity-25">✕</button>
          </div>
        ))}
        <div className="flex gap-2 mt-3">
          <input
            value={newStep}
            onChange={(e) => setNewStep(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addStep(); }}
            placeholder="Add a step"
            className="cell-input flex-1"
          />
          <button disabled={busy} onClick={addStep}
            className="font-mono text-[11px] uppercase tracking-[0.13em] px-4 rounded-[8px] border border-line-strong text-ink-2 hover:bg-hover-wash-soft transition disabled:opacity-50">
            Add
          </button>
        </div>
      </div>

      <div className="glass-panel p-4 mb-5 grid gap-4 sm:grid-cols-2">
        <Field label="Client name" value={client.name} onCommit={(v) => { if (v.trim()) onPatch({ name: v.trim() }); }} />
        <Field label="Handle / email" value={client.handle} onCommit={(v) => onPatch({ handle: v })} />
        <Field label="Monthly rate" value={client.monthly_rate} placeholder="$450 per month" onCommit={(v) => onPatch({ monthly_rate: v })} />
        <Field label="Start date" value={client.start_date} type="date" onCommit={(v) => onPatch({ start_date: v })} />
        <div className="sm:col-span-2">
          <label className="block font-mono text-[11px] uppercase tracking-[0.13em] text-ink-2 mb-1.5">Notes</label>
          <NotesArea value={client.notes} onCommit={(v) => onPatch({ notes: v })} />
        </div>
      </div>

      <button onClick={onDelete} disabled={busy}
        className="font-mono text-[11px] uppercase tracking-[0.13em] px-4 py-2.5 rounded-[8px] border border-line-strong text-poppy-text hover:bg-hover-wash-soft transition disabled:opacity-50">
        Delete client
      </button>
    </div>
  );
}

function NotesArea({ value, onCommit }) {
  const [draft, setDraft] = useState(value || '');
  useEffect(() => { setDraft(value || ''); }, [value]);
  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== (value || '')) onCommit(draft); }}
      rows={4}
      className="cell-input !whitespace-pre-wrap"
      style={{ minHeight: 96, whiteSpace: 'pre-wrap' }}
    />
  );
}
```

- [ ] **Step 2: NAV in `components/GlassRail.jsx`.** Add a briefcase icon to ICONS:

```jsx
  clients: <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16M2 9a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />,
```

Add `{ key: 'clients', label: 'Clients', icon: 'clients' }` to NAV directly AFTER the `inbox` entry.

- [ ] **Step 3: Wire in `components/ProspectsApp.jsx`:**
  1. `import ClientsView from './ClientsView';` with the other imports.
  2. Add `'clients'` to the valid-view comment on the view useState.
  3. In the view ternary chain, add a `view === 'clients'` branch (mirror the 'today' branch structure):

```jsx
      ) : view === 'clients' ? (
        <ClientsView
          prospects={allProspects}
          onOpenProspect={(p) => {
            setView('prospects');
            setHighlightId(p.id);
            setTimeout(() => setHighlightId(null), 1800);
          }}
        />
```

Note: `allProspects` is only loaded when view is 'prospects' or 'today'; that is acceptable for the banner (it populates after any visit to those views — the default view is 'today', so it is warm in practice). Do not add loadAll for 'clients' (keeps this task minimal); mention in your report.

- [ ] **Step 4: Verify**

Run: `npm test` → all pass. `grep -n "#[0-9A-Fa-f]\{6\}" components/ClientsView.jsx` → zero hits. `grep -c "key: 'clients'" components/GlassRail.jsx` → 1.

- [ ] **Step 5: Commit**

```bash
git add components/ClientsView.jsx components/GlassRail.jsx components/ProspectsApp.jsx
git commit -m "feat: Clients view — onboarding checklists with progress"
```

---

### Task 4: Controller gate (controller runs this, not a subagent)

- [ ] Local migration applied; `/api/clients` GET/POST/PUT/DELETE round-trip works against local D1.
- [ ] Clients tab in sidebar + mobile bar; list, create (Add client + Start-onboarding banner path with a Client-stage prospect), detail: toggle steps (progress bar + doneDate), add/remove/reorder steps, edit rate/start/notes (persists after reload), delete with confirm.
- [ ] Both themes; console clean; `npm test` green.
- [ ] Reviews per task (defer any that hit persistent 529s, per owner directive).
