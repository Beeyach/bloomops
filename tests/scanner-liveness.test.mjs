// Waiting your turn is not the same as being dead.
//
// A run that is perfectly healthy but cannot start its next site check, because
// both scanner slots are busy, finishes nothing. `heartbeat_at` only moves when
// an item finishes. The abandonment rule only looked at `heartbeat_at`. So
// fifteen minutes of patience read exactly like fifteen minutes of being dead,
// and a production run was closed for it during the concurrency acceptance test.
//
// The tempting fix is to touch the heartbeat while waiting, which would make
// genuinely dead runs immortal. The whole reason abandonment exists is that a
// run once sat claiming to be RUNNING for nine hours.
//
// So these tests are mostly about the seam: a waiting run must survive, and a
// dead one must still die, and nothing may be able to hold the first excuse
// open longer than the thing doing the waiting actually lives.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1 } from './_d1.mjs';

import {
  LIVENESS, ABANDONABLE, scannerRunLiveness, livenessSummary,
} from '../lib/scanner-liveness.mjs';
import { RUN, HEARTBEAT_STALE_MINUTES, reconcileStaleScannerRuns } from '../lib/scanner-run.mjs';
import {
  SCANNER_CONCURRENCY, snapshotMembership, feedRun, livenessOf, protectedRunIds,
  reconcileScannerRuns, scannerInFlight,
} from '../lib/scanner-items.mjs';
import { KIND, claimNext, CLAIM_TTL_MINUTES } from '../lib/queue.mjs';
import { scannerSummary } from '../lib/system-health.mjs';

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SCHEMA = `
CREATE TABLE scanner_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL, scanner TEXT NOT NULL, label TEXT,
  state TEXT NOT NULL DEFAULT 'RUNNING', stop_reason TEXT,
  total INTEGER DEFAULT 0, processed INTEGER DEFAULT 0,
  succeeded INTEGER DEFAULT 0, failed INTEGER DEFAULT 0, current_item TEXT,
  started_at TEXT, heartbeat_at TEXT, last_scheduler_seen_at TEXT, stopped_at TEXT, finished_at TEXT
);
CREATE TABLE scanner_run_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL, scanner_run_id INTEGER NOT NULL, prospect_id INTEGER NOT NULL,
  position INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  queued_at TEXT, started_at TEXT, finished_at TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX scanner_run_items_unique ON scanner_run_items (workspace, scanner_run_id, prospect_id);
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL, kind TEXT NOT NULL, prospect_id INTEGER,
  payload TEXT, priority INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER DEFAULT 0, max_attempts INTEGER DEFAULT 3,
  last_error TEXT, error_kind TEXT, run_after TEXT, dedupe_key TEXT,
  scanner_run_id INTEGER, claimed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_jobs_dedupe_active ON jobs(dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued','running','waiting');`;

const db = () => d1([SCHEMA]);
const sqlAgo = (mins) => new Date(Date.now() - mins * 60_000).toISOString().replace('T', ' ').slice(0, 19);
const LONG_AGO = HEARTBEAT_STALE_MINUTES + 45;

// A run that has been quiet for far longer than the threshold.
async function quietRun(conn, { ws = 'ary', state = RUN.RUNNING, quietMins = LONG_AGO, items = 4 } = {}) {
  await conn.prepare(
    `INSERT INTO scanner_runs (workspace, scanner, state, started_at, heartbeat_at)
     VALUES (?, 'precheck', ?, ?, ?)`
  ).bind(ws, state, sqlAgo(quietMins + 5), sqlAgo(quietMins)).run();
  const row = await conn.prepare(`SELECT MAX(id) id FROM scanner_runs WHERE workspace = ?`).bind(ws).first();
  const runId = row.id;
  if (items) {
    const ids = Array.from({ length: items }, (_, i) => runId * 1000 + i + 1);
    await snapshotMembership(conn, { workspace: ws, runId, prospectIds: ids });
    await feedRun(conn, { workspace: ws, runId, batch: items });
  }
  return runId;
}

const runRow = (conn, id) => conn.prepare(`SELECT * FROM scanner_runs WHERE id = ?`).bind(id).first();

// Fill every scanner slot with work claimed just now, the way a worker does.
async function fillSlots(conn, n = SCANNER_CONCURRENCY) {
  const taken = [];
  for (let i = 0; i < n; i += 1) {
    const job = await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] });
    if (job) taken.push(job);
  }
  return taken;
}

// ── 1-6. Waiting for capacity ────────────────────────────────────────────

test('a run with work and no free checker is waiting, not dead', () => {
  const live = scannerRunLiveness({
    run: { state: RUN.RUNNING, heartbeat_at: sqlAgo(LONG_AGO) },
    running: 0, unfinished: 40,
    globalInFlight: SCANNER_CONCURRENCY, concurrency: SCANNER_CONCURRENCY,
  });
  assert.equal(live.mode, LIVENESS.WAITING_CAPACITY);
  assert.equal(ABANDONABLE.has(live.mode), false, 'and it can never be closed for it');
});

test('an hour of waiting is still waiting', () => {
  for (const mins of [HEARTBEAT_STALE_MINUTES + 1, 30, 60, 240]) {
    const live = scannerRunLiveness({
      run: { state: RUN.RUNNING, heartbeat_at: sqlAgo(mins) },
      running: 0, unfinished: 5,
      globalInFlight: SCANNER_CONCURRENCY, concurrency: SCANNER_CONCURRENCY,
    });
    assert.equal(live.mode, LIVENESS.WAITING_CAPACITY, `${mins} minutes must not change the answer`);
  }
});

test('the reconciler leaves a capacity-starved run alone', async () => {
  const conn = db();
  const busy = await quietRun(conn, { items: 4 });          // run 1 holds the slots
  const waiting = await quietRun(conn, { items: 4 });        // run 2 is queuing
  await fillSlots(conn);                                     // both slots taken by run 1

  const out = await reconcileScannerRuns(conn);

  assert.equal(out.closed, 0, 'nothing was closed');
  assert.equal((await runRow(conn, waiting)).state, RUN.RUNNING);
  assert.equal(out.modes[waiting], LIVENESS.WAITING_CAPACITY);
  assert.ok(out.protected.includes(waiting));
});

test('waiting costs nothing, because waiting does nothing', () => {
  const items = code('../lib/scanner-items.mjs');
  const liveness = code('../lib/scanner-liveness.mjs');
  // The liveness gathering only. Bounded by function names rather than the
  // section headings, because the headings are comments and code() strips them.
  // The feeder below legitimately enqueues and writes heartbeats.
  const gather = items.slice(items.indexOf('export const scannerInFlight'), items.indexOf('export async function feedRun'));
  assert.ok(gather.length > 200, 'the slice must actually contain the liveness code');
  for (const forbidden of ['spendCredits', 'refundCredits', 'recordAutoSpend', 'enqueue(', 'INSERT INTO', 'UPDATE ']) {
    assert.ok(!gather.includes(forbidden), `deciding whether a run is waiting must never ${forbidden}`);
    assert.ok(!liveness.includes(forbidden), `the rule itself must never ${forbidden}`);
  }
});

test('when a checker frees up the run simply carries on', async () => {
  const conn = db();
  const busy = await quietRun(conn, { items: 2 });
  const waiting = await quietRun(conn, { items: 2 });
  const taken = await fillSlots(conn);

  assert.equal((await livenessOf(conn, await runRow(conn, waiting))).mode, LIVENESS.WAITING_CAPACITY);

  // One finishes. Nothing else happens, and no heartbeat is touched by hand.
  await conn.prepare(`UPDATE jobs SET status='done' WHERE id = ?`).bind(taken[0].id).run();

  const after = await livenessOf(conn, await runRow(conn, waiting));
  assert.notEqual(after.mode, LIVENESS.WAITING_CAPACITY, 'there is room now');
  assert.equal(await scannerInFlight(conn), SCANNER_CONCURRENCY - 1);
});

test('nothing has to be reset by hand for it to resume', () => {
  // The fix must not work by refreshing heartbeats, or a dead run would live
  // for ever. The waiting decision reads state; it never writes it.
  const items = code('../lib/scanner-items.mjs');
  const gather = items.slice(items.indexOf('export const scannerInFlight'), items.indexOf('export async function feedRun'));
  assert.ok(gather.length > 200, 'the slice must actually contain the liveness code');
  assert.ok(!/heartbeat_at\s*=/.test(gather), 'a waiting run is never given a fake heartbeat');
});

// ── 7-10. Two workspaces ─────────────────────────────────────────────────

test('one workspace filling both slots does not get the other one closed', async () => {
  const conn = db();
  await quietRun(conn, { ws: 'ary', items: 4 });
  const ellen = await quietRun(conn, { ws: 'ellen', items: 4 });
  // Ary's work takes both slots.
  await fillSlots(conn);

  const out = await reconcileScannerRuns(conn);
  assert.equal(out.closed, 0);
  assert.equal(out.modes[ellen], LIVENESS.WAITING_CAPACITY);
  assert.equal((await runRow(conn, ellen)).state, RUN.RUNNING, "Ellen's run is untouched");
});

test('capacity is global, so a workspace scoped reconcile sees it too', async () => {
  const conn = db();
  await quietRun(conn, { ws: 'ary', items: 4 });
  const ellen = await quietRun(conn, { ws: 'ellen', items: 4 });
  await fillSlots(conn);   // taken by ary

  // Reconciling only Ellen's workspace still notices that the checkers are busy
  // with somebody else's work.
  const out = await reconcileScannerRuns(conn, { workspace: 'ellen' });
  assert.equal(out.closed, 0);
  assert.equal((await runRow(conn, ellen)).state, RUN.RUNNING);
});

// ── 11-13. Waiting for budget ────────────────────────────────────────────

test('a run parked on budget is not dead either', () => {
  const live = scannerRunLiveness({
    run: { state: RUN.RUNNING, heartbeat_at: sqlAgo(LONG_AGO) },
    running: 0, unfinished: 10, budgetWaiting: 3,
    globalInFlight: 0, concurrency: SCANNER_CONCURRENCY,
  });
  assert.equal(live.mode, LIVENESS.WAITING_BUDGET);
  assert.equal(ABANDONABLE.has(live.mode), false);
});

test('budget outranks capacity, because it is the more specific reason', () => {
  const live = scannerRunLiveness({
    run: { state: RUN.RUNNING, heartbeat_at: sqlAgo(LONG_AGO) },
    running: 0, unfinished: 10, budgetWaiting: 1,
    globalInFlight: SCANNER_CONCURRENCY, concurrency: SCANNER_CONCURRENCY,
  });
  assert.equal(live.mode, LIVENESS.WAITING_BUDGET);
});

test('the reconciler leaves a budget-parked run alone', async () => {
  const conn = db();
  const run = await quietRun(conn, { items: 3 });
  await conn.prepare(`UPDATE jobs SET status='waiting', error_kind='budget' WHERE scanner_run_id = ?`).bind(run).run();

  const out = await reconcileScannerRuns(conn);
  assert.equal(out.closed, 0);
  assert.equal(out.modes[run], LIVENESS.WAITING_BUDGET);
  assert.equal((await runRow(conn, run)).state, RUN.RUNNING);
});

// ── 14-17. A genuinely dead run still dies ───────────────────────────────

test('work to do, a free checker, money available, and still nothing: dead', async () => {
  const conn = db();
  const run = await quietRun(conn, { items: 4 });   // jobs queued, nothing claimed

  assert.equal(await scannerInFlight(conn), 0, 'nothing is in flight');
  const out = await reconcileScannerRuns(conn);

  assert.equal(out.closed, 1, 'this is what abandonment is for');
  assert.equal((await runRow(conn, run)).state, RUN.ABANDONED);
  assert.equal(out.modes[run], LIVENESS.STALE);
});

test('waiting cannot outlive the thing doing the waiting', async () => {
  // The load-bearing property. Capacity only looks full while somebody's claim
  // is fresh, so if the whole machine stops, the claims age out, capacity frees,
  // and the waiting run becomes closeable on its own. No excuse is immortal.
  const conn = db();
  await quietRun(conn, { items: 2 });
  const waiting = await quietRun(conn, { items: 2 });
  const taken = await fillSlots(conn);
  assert.equal((await livenessOf(conn, await runRow(conn, waiting))).mode, LIVENESS.WAITING_CAPACITY);

  // Every worker dies. Nothing refreshes those claims.
  for (const j of taken) {
    await conn.prepare(`UPDATE jobs SET claimed_at = datetime('now', ?) WHERE id = ?`)
      .bind(`-${CLAIM_TTL_MINUTES + 10} minutes`, j.id).run();
  }

  assert.equal(await scannerInFlight(conn), 0, 'the stale claims stop counting');
  const out = await reconcileScannerRuns(conn);
  assert.ok(out.closed >= 1, 'and now the abandonment rule can do its job');
});

test('the stale threshold is still the one canonical number', () => {
  const liveness = code('../lib/scanner-liveness.mjs');
  assert.match(liveness, /HEARTBEAT_STALE_MINUTES/);
  // No second timeout, and no second concurrency number.
  assert.ok(!/=\s*15\b/.test(liveness), 'the threshold is imported, never retyped');
  assert.ok(!/SCANNER_CONCURRENCY\s*=/.test(liveness), 'and so is the bound');
});

test('liveness and the lane count capacity the same way', () => {
  const items = code('../lib/scanner-items.mjs');
  const runner = code('../lib/runner.mjs');
  // Both go through inFlightCount for the same kind. Two counts with slightly
  // different filters is how the reconciler would start closing runs the lane
  // believes are waiting.
  assert.match(items, /export const scannerInFlight = \(db, opts\) => inFlightCount\(db, KIND\.SCANNER_ITEM, opts\)/);
  assert.match(runner, /inFlightCount\(db, KIND\.SCANNER_ITEM\)/);
});

// ── 18-21. Stopping, and terminal states ─────────────────────────────────

test('a stop that is still settling is not abandoned', async () => {
  const conn = db();
  const run = await quietRun(conn, { state: RUN.STOPPING, items: 3 });
  await conn.prepare(`UPDATE scanner_run_items SET state='RUNNING' WHERE scanner_run_id = ? AND position = 0`).bind(run).run();

  const live = await livenessOf(conn, await runRow(conn, run));
  assert.equal(live.mode, LIVENESS.STOP_SETTLING);

  const out = await reconcileScannerRuns(conn);
  assert.equal((await runRow(conn, run)).state, RUN.STOPPING, 'left to land');
});

test('a stopping run with nothing left is still not abandoned', async () => {
  const conn = db();
  const run = await quietRun(conn, { state: RUN.STOPPING, items: 0 });
  const live = await livenessOf(conn, await runRow(conn, run));
  assert.equal(live.mode, LIVENESS.STOP_SETTLING);
  assert.equal(ABANDONABLE.has(live.mode), false);
});

test('a finished run is never reconsidered', async () => {
  for (const state of [RUN.COMPLETED, RUN.STOPPED, RUN.FAILED, RUN.ABANDONED]) {
    const conn = db();
    const run = await quietRun(conn, { state, items: 2 });
    const live = await livenessOf(conn, await runRow(conn, run));
    assert.equal(live.mode, LIVENESS.TERMINAL, `${state} is over`);
    const out = await reconcileScannerRuns(conn);
    assert.equal(out.closed, 0);
    assert.equal((await runRow(conn, run)).state, state, `${state} stays ${state}`);
  }
});

test('a run about to finish itself is not closed in the gap', () => {
  // Nothing unfinished, heartbeat old: settleIfFinished is about to mark it
  // COMPLETED. Closing it as abandoned in that window would be wrong and would
  // say so on the page.
  const live = scannerRunLiveness({
    run: { state: RUN.RUNNING, heartbeat_at: sqlAgo(LONG_AGO) },
    running: 0, unfinished: 0, globalInFlight: 0, concurrency: SCANNER_CONCURRENCY,
  });
  assert.equal(ABANDONABLE.has(live.mode), false);
});

// ── 22-26. What Ary is told ──────────────────────────────────────────────

test('a healthy wait never borrows the words of a failure', () => {
  for (const mode of [LIVENESS.WAITING_CAPACITY, LIVENESS.WAITING_BUDGET, LIVENESS.STOP_SETTLING, LIVENESS.ACTIVE]) {
    const s = livenessSummary({ mode });
    assert.equal(s.healthy, true);
    const words = `${s.headline} ${s.detail}`.toLowerCase();
    for (const bad of ['unexpectedly', 'failed', 'error', 'stuck', 'problem', 'abandoned']) {
      assert.ok(!words.includes(bad), `${mode} must not say "${bad}"`);
    }
  }
  // And the one real incident still says what it is.
  assert.match(livenessSummary({ mode: LIVENESS.STALE }).headline, /stopped unexpectedly/);
});

test('System health calls a capacity wait waiting, not attention', () => {
  const run = { state: RUN.RUNNING, processed: 12, total: 60, heartbeat_at: sqlAgo(LONG_AGO) };
  const s = scannerSummary(run, new Date(), { liveness: { mode: LIVENESS.WAITING_CAPACITY } });
  assert.equal(s.attention, false, 'waiting is not something to act on');
  assert.equal(s.waiting, true);
  assert.match(s.text, /Waiting for a site checker/);
  assert.match(s.text, /12 of 60/);
});

test('System health still reports a genuinely dead run', () => {
  const run = { state: RUN.RUNNING, processed: 70, total: 5484, heartbeat_at: sqlAgo(LONG_AGO) };
  const s = scannerSummary(run, new Date(), { liveness: { mode: LIVENESS.STALE } });
  assert.equal(s.attention, true);
  assert.match(s.text, /stopped unexpectedly/);
});

test('the Hive shows the waiting copy and offers no way to jump the queue', () => {
  const panel = code('../components/ArmyPanel.jsx');
  assert.match(panel, /livenessSummary/);
  assert.match(panel, /WAITING_CAPACITY/);
  assert.match(panel, /WAITING_BUDGET/);
  for (const bad of ['Force run', 'force run', 'Run now', 'Skip the queue']) {
    assert.ok(!panel.includes(bad), `there is no queue to jump: ${bad}`);
  }
});

test('nobody implements their own staleness rule any more', () => {
  const panel = code('../components/ArmyPanel.jsx');
  // The page reads what the server decided; it does not compute liveness.
  assert.ok(!panel.includes('HEARTBEAT_STALE_MINUTES'), 'React must not own this rule');
  assert.ok(!/isStale\(/.test(panel));
});

// ── 27-30. Timestamps and cost ───────────────────────────────────────────

test('every liveness timestamp comparison normalises both sides', () => {
  for (const f of ['../lib/scanner-run.mjs', '../lib/scanner-items.mjs', '../lib/queue.mjs', '../app/api/cron/drain/route.js']) {
    const s = code(f);
    for (const col of ['heartbeat_at', 'claimed_at']) {
      const raw = new RegExp(`(?<!datetime\\()\\b${col}\\)?\\s*[<>]=?\\s*datetime`, 'g');
      const hits = (s.match(raw) || []).filter((h) => !h.startsWith('datetime('));
      assert.equal(hits.length, 0, `${f} compares ${col} without datetime(): ${hits.join(', ')}`);
    }
  }
});

test('the reconciler still keeps its decision inside the WHERE clause', () => {
  const mod = code('../lib/scanner-run.mjs');
  // Staleness is measured from the later of the two clocks, still inside the
  // WHERE clause so a run that reports in between the read and the write keeps
  // its life.
  assert.match(mod, /UPDATE scanner_runs[\s\S]*?\$\{LIVENESS_CLOCK\} < datetime\('now', \?\)/);
  assert.match(mod, /MAX\(datetime\(COALESCE\(heartbeat_at, started_at\)\), datetime\(COALESCE\(last_scheduler_seen_at/);
  // The protected list narrows what may be closed; it can never widen it.
  assert.match(mod, /AND id NOT IN/);
});

test('reconciliation itself spends nothing', () => {
  const mod = code('../lib/scanner-run.mjs');
  const recovery = mod.slice(mod.indexOf('export async function reconcileStaleScannerRuns'));
  for (const forbidden of ['spendCredits', 'recordAutoSpend', 'canSpendAutomatically', 'enqueue(', 'INSERT INTO']) {
    assert.ok(!recovery.includes(forbidden), `recovery must never ${forbidden}`);
  }
});

test('the scanner bound is still exactly two, and sending is untouched', () => {
  assert.equal(SCANNER_CONCURRENCY, 2);
  const liveness = code('../lib/scanner-liveness.mjs');
  for (const forbidden of ['sendApproved', 'SEND_APPROVED', 'gmail', 'Gmail', 'approval', 'canSendNow']) {
    assert.ok(!liveness.includes(forbidden), `liveness must not mention ${forbidden}`);
  }
});

// ── 31-33. The seam between the rule and the page ────────────────────────
//
// The rule was right and the page still said "stopped unexpectedly", because
// the health route selected a run row without its workspace, livenessOf bound
// undefined, and the route's own catch turned the throw back into the old,
// wrong answer. Only a live check found it.

test('the health page selects the workspace it is about to ask about', () => {
  const route = code('../app/api/system-health/route.js');
  const hive = route.slice(route.indexOf('FROM scanner_runs WHERE workspace = ? ORDER BY id DESC') - 400);
  assert.match(hive, /SELECT id, workspace, scanner, state/, 'workspace must be selected, not assumed');
  assert.match(route, /livenessOf\(db, run, \{ workspace: ws/, 'and passed explicitly as well');
});

test('asking about liveness without a workspace complains instead of guessing', async () => {
  const conn = db();
  const run = await quietRun(conn, { items: 2 });
  const row = await runRow(conn, run);
  await assert.rejects(
    () => livenessOf(conn, { id: row.id, state: row.state, heartbeat_at: row.heartbeat_at }),
    /needs a workspace/,
    'a silent wrong answer is worse than a loud failure'
  );
});

test('given the workspace, it answers the same either way', async () => {
  const conn = db();
  const busy = await quietRun(conn, { items: 2 });
  const waiting = await quietRun(conn, { items: 2 });
  await fillSlots(conn);
  const row = await runRow(conn, waiting);

  const fromRow = await livenessOf(conn, row);
  const fromArg = await livenessOf(conn, { ...row, workspace: undefined }, { workspace: 'ary' });
  assert.equal(fromRow.mode, LIVENESS.WAITING_CAPACITY);
  assert.equal(fromArg.mode, fromRow.mode);
});

// ── 34-39. The second clock ──────────────────────────────────────────────
//
// Sparing a waiting run is not enough on its own. Its silence keeps building
// the whole time it waits, because nothing is finishing, so the instant its
// protection lifts the very next reconcile sees an hour of quiet with work to
// do and a checker free, and closes it. That happened in production to run 7,
// at seventy minutes, one step before the lane would have handed it work.

test('a run the scheduler parked is not counted as quiet', () => {
  const live = scannerRunLiveness({
    run: {
      state: RUN.RUNNING,
      heartbeat_at: sqlAgo(90),                 // nothing has finished in an hour and a half
      last_scheduler_seen_at: sqlAgo(1),        // but the server looked a minute ago
    },
    running: 0, unfinished: 5, globalInFlight: 0, concurrency: SCANNER_CONCURRENCY,
  });
  assert.ok(live.quietFor < 5, 'the later clock is the one that counts');
  assert.notEqual(live.mode, LIVENESS.STALE);
});

test('the run survives the moment capacity frees, and gets to resume', async () => {
  const conn = db();
  const busy = await quietRun(conn, { items: 2 });
  const waiting = await quietRun(conn, { items: 2 });
  const taken = await fillSlots(conn);

  // A drain sees it waiting and stamps that it did.
  const first = await reconcileScannerRuns(conn);
  assert.equal(first.closed, 0);
  assert.equal(first.modes[waiting], LIVENESS.WAITING_CAPACITY);
  const stamped = await runRow(conn, waiting);
  assert.ok(stamped.last_scheduler_seen_at, 'the server wrote down that it looked');

  // Now capacity frees. The heartbeat is still ancient and untouched.
  for (const j of taken) {
    await conn.prepare(`UPDATE jobs SET status='done' WHERE id = ?`).bind(j.id).run();
  }
  const beforeResume = await runRow(conn, waiting);
  assert.equal(beforeResume.heartbeat_at, stamped.heartbeat_at, 'nothing faked a heartbeat');

  // The next reconcile must NOT close it for the silence it built up waiting.
  const second = await reconcileScannerRuns(conn);
  assert.equal(second.closed, 0, 'this is the bug that closed run 7');
  assert.equal((await runRow(conn, waiting)).state, RUN.RUNNING, 'still alive, and now claimable');
});

test('the two clocks stay different facts', () => {
  const items = code('../lib/scanner-items.mjs');
  const stamp = items.slice(items.indexOf('export async function reconcileScannerRuns'), items.indexOf('export async function cancelAbandonedItems'));
  assert.match(stamp, /UPDATE scanner_runs SET last_scheduler_seen_at = datetime\('now'\)/);
  // Never the heartbeat. That one means a check finished, and overloading it
  // would make a dead run indistinguishable from a parked one.
  assert.ok(!/heartbeat_at\s*=/.test(stamp), 'parking a run must never fake progress');
});

test('only runs that were proved to be waiting get stamped', () => {
  const items = code('../lib/scanner-items.mjs');
  const stamp = items.slice(items.indexOf('export async function reconcileScannerRuns'), items.indexOf('export async function cancelAbandonedItems'));
  assert.match(stamp, /WHERE id IN \(\$\{protect\.map/, 'the protected list, and nothing else');
  assert.match(stamp, /state IN \('RUNNING','STOPPING'\)/, 'and never a finished run');
});

test('a dead machine still cannot keep a run alive', async () => {
  const conn = db();
  const run = await quietRun(conn, { items: 3 });
  // Somebody parked it a long time ago and nothing has looked since.
  await conn.prepare(`UPDATE scanner_runs SET last_scheduler_seen_at = datetime('now','-90 minutes') WHERE id = ?`)
    .bind(run).run();

  const out = await reconcileScannerRuns(conn);
  assert.equal(out.closed, 1, 'an old parking stamp is not a licence to live for ever');
  assert.equal((await runRow(conn, run)).state, RUN.ABANDONED);
});

test('the start button joins a parked run rather than closing it', async () => {
  const { isStale } = await import('../lib/scanner-run.mjs');
  const parked = {
    state: RUN.RUNNING,
    heartbeat_at: sqlAgo(90),
    last_scheduler_seen_at: sqlAgo(1),
  };
  assert.equal(isStale(parked), false, 'pressing Start must not kill a run that is merely waiting');
  const dead = { state: RUN.RUNNING, heartbeat_at: sqlAgo(90), last_scheduler_seen_at: sqlAgo(90) };
  assert.equal(isStale(dead), true, 'and must still clear a genuinely dead one');
});
