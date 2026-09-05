// How much does the scanner lane actually get through?
//
// This measures the SCHEDULER, not the render service. Item durations are
// simulated from the five real production samples (25, 26, 32, 32, 89 seconds)
// scaled down by SCALE so the whole sweep runs in seconds. What it proves is
// how many items a drain claims and settles at each concurrency, and where the
// time budget cuts a run off.
//
// What it does NOT prove is that the render service can serve four at once. It
// cannot: Cloud Run is deployed --concurrency 1 --max-instances 3, so anything
// above three queues there instead. That ceiling is why the chosen bound is 2,
// and no local number can override it.
//
//   node scripts/bench-scanner-lane.mjs

import { d1 } from '../tests/_d1.mjs';
import { runScannerLane } from '../lib/runner.mjs';
import { snapshotMembership, feedRun, SCANNER_BUDGET_MS, SCANNER_WAVE_RESERVE_MS } from '../lib/scanner-items.mjs';

const SCALE = 100;                       // 32s of real work becomes 320ms here
const REAL_SAMPLES = [25_000, 26_000, 32_000, 32_000, 89_000];
const ITEMS = 40;
const DRAIN_EVERY_MINUTES = 5;

const SCHEMA = `
CREATE TABLE scanner_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL, scanner TEXT NOT NULL, label TEXT,
  state TEXT NOT NULL DEFAULT 'RUNNING', stop_reason TEXT,
  total INTEGER DEFAULT 0, processed INTEGER DEFAULT 0, succeeded INTEGER DEFAULT 0, failed INTEGER DEFAULT 0,
  current_item TEXT, started_at TEXT, heartbeat_at TEXT, stopped_at TEXT, finished_at TEXT);
CREATE TABLE scanner_run_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL, scanner_run_id INTEGER NOT NULL,
  prospect_id INTEGER NOT NULL, position INTEGER NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'PENDING',
  attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT, queued_at TEXT, started_at TEXT, finished_at TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE UNIQUE INDEX scanner_run_items_unique ON scanner_run_items (workspace, scanner_run_id, prospect_id);
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, workspace TEXT NOT NULL, kind TEXT NOT NULL, prospect_id INTEGER,
  payload TEXT, priority INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER DEFAULT 0, max_attempts INTEGER DEFAULT 3, last_error TEXT, error_kind TEXT,
  run_after TEXT, dedupe_key TEXT, scanner_run_id INTEGER, claimed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
CREATE UNIQUE INDEX idx_jobs_dedupe_active ON jobs(dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued','running','waiting');`;

const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function oneDrain(concurrency, seedOffset) {
  const db = d1([SCHEMA]);
  await db.prepare(
    `INSERT INTO scanner_runs (workspace, scanner, state, started_at, heartbeat_at)
     VALUES ('ary','precheck','RUNNING', datetime('now'), datetime('now'))`
  ).run();
  const ids = Array.from({ length: ITEMS }, (_, i) => i + 1);
  await snapshotMembership(db, { workspace: 'ary', runId: 1, prospectIds: ids });
  await feedRun(db, { workspace: 'ary', runId: 1, batch: ITEMS });

  const durations = [];
  let peak = 0;
  let active = 0;
  let n = seedOffset;

  // A simulated clock, so the budget is enforced against REAL seconds while
  // the benchmark itself finishes quickly.
  let virtualNow = 0;

  const handler = async (_db, _ws, job) => {
    active += 1; peak = Math.max(peak, active);
    const real = REAL_SAMPLES[n++ % REAL_SAMPLES.length];
    durations.push(real);
    await new Promise((r) => setTimeout(r, real / SCALE));
    virtualNow += real / concurrency;   // a wave of N costs one item's time
    active -= 1;
    return { prospectId: job.prospect_id, ok: true };
  };

  const wall = Date.now();
  const out = await runScannerLane(db, {
    concurrency, handler,
    startedAt: 0, clock: () => virtualNow,
    budgetMs: SCANNER_BUDGET_MS, reserveMs: SCANNER_WAVE_RESERVE_MS,
  });

  return {
    concurrency,
    settled: out.ran.filter((j) => j.status === 'done').length,
    claimed: out.ran.length,
    waves: out.waves,
    stoppedBecause: out.stoppedBecause,
    peak,
    realWallMs: Date.now() - wall,
    simulatedMs: Math.round(virtualNow),
    p50: pct(durations, 50),
    p90: pct(durations, 90),
  };
}

const rows = [];
for (const c of [1, 2, 3, 4]) rows.push(await oneDrain(c, 0));

const drainsPerHour = 60 / DRAIN_EVERY_MINUTES;
console.log(`\nScanner lane, simulated from real production durations (p50 32s, p90 89s)`);
console.log(`Budget ${SCANNER_BUDGET_MS / 1000}s per drain, reserve ${SCANNER_WAVE_RESERVE_MS / 1000}s, cron every ${DRAIN_EVERY_MINUTES}m\n`);
console.log('conc | items/drain | waves | peak | stopped        | sites/hour');
console.log('-----+-------------+-------+------+----------------+-----------');
for (const r of rows) {
  console.log(
    `  ${String(r.concurrency).padEnd(2)} |     ${String(r.settled).padEnd(7)} |   ${String(r.waves).padEnd(3)} |  ${String(r.peak).padEnd(3)} | ${r.stoppedBecause.padEnd(14)} | ${r.settled * drainsPerHour}`
  );
}
console.log(`\nBaseline before the lane: 1 item/drain = ${1 * drainsPerHour} sites/hour (measured in production).`);
console.log(`Render service ceiling: 3 concurrent (--concurrency 1, --max-instances 3).`);
console.log(`Anything above 3 queues inside Cloud Run and does not go faster.\n`);
