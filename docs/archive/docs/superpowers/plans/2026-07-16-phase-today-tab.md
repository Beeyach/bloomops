# Today Tab — Implementation Plan (spec phase 4, executed early by owner request)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add BloomBoard's Today view as the app's default tab: a greeting, a summary line, and Overdue / Due today / Coming up sections built on BloomTrack's existing `daysUntilDue()` logic.

**Architecture:** A pure grouping function in `lib/today.mjs` (unit-tested) feeds a new `components/TodayView.jsx`, which receives the prospect store, the existing due function, and the existing stage-meta helper as props from ProspectsApp. Navigation gains a Today entry; the app boots into it. No new due system, no API changes, no DB changes.

**Tech Stack:** Next.js 15 (plain JS), existing `node --test` harness.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-bloomboard-consolidation-design.md` §3a, with two owner-approved scope trims for v1:
  1. Quick action is **Open** only (jumps to the prospect table with the row highlighted). The stage-advance quick action is deferred to the polish backlog.
  2. The greeting name comes from `localStorage['ltb_name']` (same per-device pattern as the theme), NOT a settings-table key — avoids touching the engine settings API in this phase. Revisit when a fuller settings UI lands.
- The single source of due truth stays `daysUntilDue(p)` in ProspectsApp (0 = due today, negative = overdue, positive = in N days, null = not scheduled). The new code receives it as a prop and never re-implements it.
- Both themes must work (all colors via existing tokens/variables — no raw hexes anywhere in new code).
- No changes to API routes, lib/db.js, or the DB.
- Do NOT push to GitHub. Commit locally on branch `feature/liquid-glass`.
- Implementers do NOT run a dev server or build. `npm test` is required where stated. Controller verifies visually at the gate.

---

### Task 1: Due grouping logic (TDD)

**Files:**
- Create: `lib/today.mjs`
- Create: `tests/today.test.mjs`

**Interfaces:**
- Produces: `groupByDue(prospects, dueFn)` → `{ overdue: [{prospect, overdueBy}], dueToday: [prospect], upcomingByDay: [{inDays, items: [prospect]}] }`, and `UPCOMING_WINDOW_DAYS = 7`. Task 2's TodayView consumes exactly this shape.

- [ ] **Step 1: Write the failing tests** — `tests/today.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByDue, UPCOMING_WINDOW_DAYS } from '../lib/today.mjs';

// dueFn stub: each fake prospect carries its own due value.
const dueFn = (p) => p.due;
const P = (name, due) => ({ name, due });

test('splits prospects into overdue, due today, and upcoming', () => {
  const groups = groupByDue(
    [P('over', -3), P('now', 0), P('soon', 2), P('off', null)],
    dueFn
  );
  assert.equal(groups.overdue.length, 1);
  assert.equal(groups.overdue[0].prospect.name, 'over');
  assert.equal(groups.overdue[0].overdueBy, 3);
  assert.deepEqual(groups.dueToday.map((p) => p.name), ['now']);
  assert.equal(groups.upcomingByDay.length, 1);
  assert.equal(groups.upcomingByDay[0].inDays, 2);
});

test('sorts overdue most-overdue-first', () => {
  const groups = groupByDue([P('a', -1), P('b', -9), P('c', -4)], dueFn);
  assert.deepEqual(groups.overdue.map((x) => x.prospect.name), ['b', 'c', 'a']);
  assert.deepEqual(groups.overdue.map((x) => x.overdueBy), [9, 4, 1]);
});

test('groups upcoming by day in ascending order', () => {
  const groups = groupByDue([P('d3a', 3), P('d1', 1), P('d3b', 3)], dueFn);
  assert.deepEqual(groups.upcomingByDay.map((g) => g.inDays), [1, 3]);
  assert.deepEqual(groups.upcomingByDay[1].items.map((p) => p.name), ['d3a', 'd3b']);
});

test('window includes day 7 and excludes day 8', () => {
  const groups = groupByDue([P('in', UPCOMING_WINDOW_DAYS), P('out', UPCOMING_WINDOW_DAYS + 1)], dueFn);
  assert.deepEqual(groups.upcomingByDay.flatMap((g) => g.items.map((p) => p.name)), ['in']);
});

test('handles empty and null input', () => {
  assert.deepEqual(groupByDue([], dueFn).dueToday, []);
  assert.deepEqual(groupByDue(null, dueFn).overdue, []);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test`
Expected: the new tests FAIL (module not found), the existing 9 still pass.

- [ ] **Step 3: Implement `lib/today.mjs`:**

```js
// Pure grouping for the Today view. dueFn(p) follows daysUntilDue's
// contract: 0 = due today, negative = overdue, positive = due in N days,
// null = not on a due schedule.
export const UPCOMING_WINDOW_DAYS = 7;

export function groupByDue(prospects, dueFn) {
  const overdue = [];
  const dueToday = [];
  const upcoming = [];
  for (const p of prospects || []) {
    const d = dueFn(p);
    if (d == null) continue;
    if (d < 0) overdue.push({ p, d });
    else if (d === 0) dueToday.push(p);
    else if (d <= UPCOMING_WINDOW_DAYS) upcoming.push({ p, d });
  }
  overdue.sort((a, b) => a.d - b.d);
  upcoming.sort((a, b) => a.d - b.d);

  const upcomingByDay = [];
  for (const item of upcoming) {
    const last = upcomingByDay[upcomingByDay.length - 1];
    if (last && last.inDays === item.d) last.items.push(item.p);
    else upcomingByDay.push({ inDays: item.d, items: [item.p] });
  }

  return {
    overdue: overdue.map((x) => ({ prospect: x.p, overdueBy: -x.d })),
    dueToday,
    upcomingByDay,
  };
}
```

- [ ] **Step 4: Run tests to verify green**

Run: `npm test`
Expected: all tests pass (9 existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add lib/today.mjs tests/today.test.mjs
git commit -m "feat: due grouping logic for the Today view"
```

---

### Task 2: TodayView component + wiring

**Files:**
- Create: `components/TodayView.jsx`
- Modify: `components/GlassRail.jsx` (NAV entry + icon)
- Modify: `components/ProspectsApp.jsx` (3 small edits, listed below)

**Interfaces:**
- Consumes: `groupByDue` from Task 1; ProspectsApp's existing `daysUntilDue` and its stage-meta helper (the function near line 149 whose body is `return STAGE_META[s] || STAGE_META.New;` — pass it by its actual name).
- Produces: `<TodayView prospects dueFn stageMeta onOpen />`.

- [ ] **Step 1: Create `components/TodayView.jsx`:**

```jsx
'use client';

import { groupByDue } from '@/lib/today.mjs';

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

function readName() {
  try { return localStorage.getItem('ltb_name') || ''; } catch (e) { return ''; }
}

function dayLabel(inDays) {
  if (inDays === 1) return 'Tomorrow';
  const d = new Date();
  d.setDate(d.getDate() + inDays);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function StageChip({ meta, stage }) {
  return (
    <span
      className="bw-chip font-mono text-[11px] uppercase tracking-[0.08em] shrink-0"
      style={{ backgroundColor: meta.bg, borderColor: meta.border, color: meta.border }}
    >
      {stage}
    </span>
  );
}

function Row({ prospect, stageMeta, note, noteClass, overdueStripe, onOpen }) {
  const meta = stageMeta(prospect.stage);
  return (
    <div
      className="glass-panel flex items-center gap-3 px-4 py-3"
      style={overdueStripe ? { boxShadow: 'inset 3px 0 0 0 var(--rose-line)' } : undefined}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="font-medium text-bright truncate">{prospect.name || prospect.business_name || prospect.email || 'Unnamed'}</span>
          <StageChip meta={meta} stage={prospect.stage} />
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-sm text-ink-2 min-w-0">
          {prospect.business_name && prospect.name ? <span className="truncate">{prospect.business_name}</span> : null}
          {prospect.country ? <span className="font-mono text-[11px] uppercase shrink-0">{prospect.country}</span> : null}
          <span className={`shrink-0 ${noteClass}`}>{note}</span>
        </div>
      </div>
      <button
        onClick={() => onOpen(prospect)}
        className="shrink-0 font-mono text-[11px] uppercase tracking-[0.13em] px-4 py-2 rounded-[8px] border border-line-strong text-ink-2 hover:bg-hover-wash-soft transition"
      >
        Open
      </button>
    </div>
  );
}

function SectionLabel({ children, tone }) {
  return (
    <div className={`font-mono text-[11px] uppercase tracking-[0.16em] mt-6 mb-2 ${tone === 'red' ? 'text-poppy-text' : 'text-ink-3'}`}>
      {children}
    </div>
  );
}

// The app's opening screen: what needs a touch today, before anything else.
// Due logic is passed in from ProspectsApp — this component never computes
// due-ness itself.
export default function TodayView({ prospects, dueFn, stageMeta, onOpen }) {
  const { overdue, dueToday, upcomingByDay } = groupByDue(prospects, dueFn);
  const name = readName();
  const upcomingCount = upcomingByDay.reduce((n, g) => n + g.items.length, 0);

  let summary;
  if (overdue.length + dueToday.length > 0) {
    summary = `${overdue.length} overdue, ${dueToday.length} due today.`;
  } else if (upcomingCount > 0) {
    summary = `Nothing due today. ${upcomingCount} coming up this week.`;
  } else {
    summary = 'Nothing due today. Add prospects or get ahead on tomorrow.';
  }

  return (
    <div className="max-w-[860px]">
      <h1 className="font-serif text-[34px] text-bright leading-tight">
        {greetingWord()}{name ? `, ${name}` : ''}
      </h1>
      <p className="text-ink-2 mb-2">{summary}</p>

      {overdue.length > 0 && (
        <>
          <SectionLabel tone="red">Overdue</SectionLabel>
          <div className="flex flex-col gap-2">
            {overdue.map(({ prospect, overdueBy }) => (
              <Row
                key={prospect.id}
                prospect={prospect}
                stageMeta={stageMeta}
                note={overdueBy === 1 ? '1 day overdue' : `${overdueBy} days overdue`}
                noteClass="text-poppy-text font-medium"
                overdueStripe
                onOpen={onOpen}
              />
            ))}
          </div>
        </>
      )}

      {dueToday.length > 0 && (
        <>
          <SectionLabel>Due today</SectionLabel>
          <div className="flex flex-col gap-2">
            {dueToday.map((p) => (
              <Row key={p.id} prospect={p} stageMeta={stageMeta} note="Due today" noteClass="text-gold-text" onOpen={onOpen} />
            ))}
          </div>
        </>
      )}

      {upcomingByDay.length > 0 && (
        <>
          <SectionLabel>Coming up</SectionLabel>
          {upcomingByDay.map((g) => (
            <div key={g.inDays} className="mb-3">
              <div className="text-sm font-medium text-ink-2 mb-1.5">{dayLabel(g.inDays)}</div>
              <div className="flex flex-col gap-2">
                {g.items.map((p) => (
                  <Row key={p.id} prospect={p} stageMeta={stageMeta} note={dayLabel(g.inDays)} noteClass="text-ink-3" onOpen={onOpen} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {overdue.length === 0 && dueToday.length === 0 && upcomingByDay.length === 0 && (
        <div className="glass-panel border-dashed p-10 text-center mt-6">
          <p className="text-ink-2">Nothing due today. Add prospects or get ahead on tomorrow.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: NAV entry in `components/GlassRail.jsx`.** Add a sun icon to `ICONS`:

```jsx
  today: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />,
```

And add as the FIRST entry of `NAV`:

```jsx
  { key: 'today', label: 'Today', icon: 'today' },
```

- [ ] **Step 3: Three edits in `components/ProspectsApp.jsx`:**

1. Import at the top with the other component imports: `import TodayView from './TodayView';`
2. Initial view (~line 1449): `useState('prospects')` → `useState('today')` (keep the comment listing valid keys, add 'today' to it).
3. Data load (~line 1614): `if (view === 'prospects') loadAll();` → `if (view === 'prospects' || view === 'today') loadAll();`
4. Render branch (~line 2246-2260): in the view ternary chain, add a `view === 'today'` branch FIRST, rendering:

```jsx
      ) : view === 'today' ? (
        <TodayView
          prospects={allProspects}
          dueFn={daysUntilDue}
          stageMeta={/* the existing STAGE_META helper (≈line 149), by its real name */}
          onOpen={(p) => {
            setView('prospects');
            setHighlightId(p.id);
            setTimeout(() => setHighlightId(null), 1800);
          }}
        />
```

Match the surrounding ternary structure exactly (read it first). The stage-meta helper is the function whose body is `return STAGE_META[s] || STAGE_META.New;` — pass its actual name.

- [ ] **Step 4: Verify**

Run: `npm test` → all pass.
Run: `grep -c "'today'" components/ProspectsApp.jsx` → ≥3. `grep -c "key: 'today'" components/GlassRail.jsx` → 1.
Run: `grep -n "#[0-9A-Fa-f]\{6\}" components/TodayView.jsx` → zero hits (no raw hexes).

- [ ] **Step 5: Commit**

```bash
git add components/TodayView.jsx components/GlassRail.jsx components/ProspectsApp.jsx
git commit -m "feat: Today view — overdue, due today, coming up"
```

---

### Task 3: Greeting name in Settings

**Files:**
- Modify: `components/SettingsView.jsx` (inside the Appearance card from Phase 2)

**Interfaces:**
- Consumes/produces: `localStorage['ltb_name']` (read by TodayView's greeting).

- [ ] **Step 1:** In the Appearance card added in Phase 2, below the Light/Dark buttons, add a name field following the file's existing label/input styling patterns (read the file first):

```jsx
        <div className="mt-4">
          <label className="block font-mono text-[11px] uppercase tracking-[0.13em] text-ink-2 mb-1.5" htmlFor="ltb-name">
            Your name
          </label>
          <input
            id="ltb-name"
            defaultValue={typeof window !== 'undefined' ? (() => { try { return localStorage.getItem('ltb_name') || ''; } catch (e) { return ''; } })() : ''}
            onChange={(e) => { try { localStorage.setItem('ltb_name', e.target.value.trim()); } catch (err) {} }}
            placeholder="Used in the Today greeting"
            className="cell-input max-w-[280px]"
          />
        </div>
```

If the file's inputs use a different shared class than `cell-input`, use that instead and note it.

- [ ] **Step 2: Verify**

Run: `npm test` → all pass. `grep -c "ltb_name" components/SettingsView.jsx components/TodayView.jsx` → ≥2.

- [ ] **Step 3: Commit**

```bash
git add components/SettingsView.jsx
git commit -m "feat: greeting name setting for the Today view"
```

---

### Task 4: Controller gate (controller runs this, not a subagent)

- [ ] App boots into Today; nav highlights Today; both themes render it correctly.
- [ ] With seeded test prospects at various due states: overdue section sorted most-overdue-first with rose stripe, due-today section, coming-up grouped by day labels, correct counts in the summary line.
- [ ] Open jumps to the prospect table with the row highlighted.
- [ ] Name saved in Settings appears in the greeting after reload.
- [ ] Empty state renders when no prospects are due.
- [ ] Mobile: Today tab in the bottom bar, layout usable at ~380px.
- [ ] `npm test` green; console clean; task review + phase review (or defer review if servers are overloaded, per owner directive).
