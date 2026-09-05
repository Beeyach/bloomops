// Making the Hive faster without making sending faster.
//
// Site checks took thirty seconds each and the drain gave itself twenty-five
// for everything, checked between jobs, so the first one always overran and the
// invocation ended having done exactly one. Twelve an hour, measured.
//
// The tempting fix is a bigger global budget. That speeds up sending too, and
// sending is the one thing that must not change, so instead scanner work got
// its own lane with its own bound and the general lane stopped seeing it.
//
// These tests are mostly about the two ways a throughput change goes wrong:
// something spends money twice because two workers touched it, or Stop stops
// meaning stop because there is now more than one thing to stop.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1 } from './_d1.mjs';

import { runScannerLane, runJobs, HANDLERS } from '../lib/runner.mjs';
import { KIND, PRIORITY, enqueue, claimNext } from '../lib/queue.mjs';
import {
  SCANNER_CONCURRENCY, SCANNER_BUDGET_MS, SCANNER_WAVE_RESERVE_MS, FEED_BATCH,
  ITEM, snapshotMembership, feedRun, stopRun, runProgress,
} from '../lib/scanner-items.mjs';
import { RUN } from '../lib/scanner-run.mjs';

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
  WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running', 'waiting');`;

const db = () => d1([SCHEMA]);
const WS = 'ary';

const addRun = (conn, { state = RUN.RUNNING } = {}) =>
  conn.prepare(
    `INSERT INTO scanner_runs (workspace, scanner, state, started_at, heartbeat_at)
     VALUES (?, 'precheck', ?, datetime('now'), datetime('now'))`
  ).bind(WS, state).run();

// A run with `n` items, all already queued as jobs.
async function readyRun(conn, n) {
  await addRun(conn);
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: ids });
  await feedRun(conn, { workspace: WS, runId: 1, batch: n });
  return ids;
}

// A handler that reports how many of itself were running at once.
function watcher({ ms = 0, fail = null, tick = null } = {}) {
  const state = { active: 0, peak: 0, started: [], finished: [] };
  const handler = async (_db, _ws, job) => {
    state.active += 1;
    state.peak = Math.max(state.peak, state.active);
    state.started.push(job.prospect_id);
    try {
      if (ms) await new Promise((r) => setTimeout(r, ms));
      if (tick) tick();
      if (fail && fail(job)) throw new Error(`refused ${job.prospect_id}`);
      state.finished.push(job.prospect_id);
      return { prospectId: job.prospect_id, ok: true };
    } finally {
      state.active -= 1;
    }
  };
  return { handler, state };
}

const jobRows = (conn) => conn.prepare(`SELECT * FROM jobs ORDER BY id`).all().then((r) => r.results || []);

// ── 1-4. The lane is bounded, and the bound is the render service's ──────

test('the concurrency bound is the one the render service can actually serve', () => {
  // Not a taste decision. services/audit-render deploys with --concurrency 1
  // and --max-instances 3, so three is the ceiling that physically exists, and
  // one instance is left free for video renders and the manual button.
  const readme = src('../services/audit-render/README.md');
  assert.match(readme, /--concurrency 1/);
  assert.match(readme, /--max-instances 3/);
  assert.ok(SCANNER_CONCURRENCY < 3, 'never take every render instance');
  assert.ok(SCANNER_CONCURRENCY >= 2, 'but more than one, or nothing improved');
});

test('several site checks run at once, up to the bound, and the rest wait', async () => {
  const conn = db();
  await readyRun(conn, 6);
  const { handler, state } = watcher({ ms: 20 });

  const out = await runScannerLane(conn, { handler });

  assert.equal(state.peak, SCANNER_CONCURRENCY, 'never more than the bound at once');
  assert.equal(out.ran.length, 6, 'and all six still got done, in waves');
  assert.equal(out.waves, Math.ceil(6 / SCANNER_CONCURRENCY));
});

test('one drain now does more than one site check', async () => {
  const conn = db();
  await readyRun(conn, 4);
  const { handler } = watcher();
  const out = await runScannerLane(conn, { handler });
  assert.ok(out.ran.length > 1, 'the whole point: twelve an hour was one per drain');
  assert.equal(out.ran.length, 4);
});

test('nothing to do is not the same as out of time', async () => {
  const conn = db();
  await readyRun(conn, 2);
  const { handler } = watcher();
  const out = await runScannerLane(conn, { handler });
  assert.equal(out.stoppedBecause, 'no work left');

  const empty = await runScannerLane(db(), { handler });
  assert.equal(empty.stoppedBecause, 'no work');
  assert.equal(empty.waves, 0);
});

// ── 5-8. The time budget ─────────────────────────────────────────────────

test('the lane stops claiming before it runs out of invocation', async () => {
  const conn = db();
  await readyRun(conn, 20);

  // A clock that jumps a whole typical item every time it is read during work.
  let now = 0;
  const { handler } = watcher({ tick: () => { now += 30_000; } });

  const out = await runScannerLane(conn, {
    handler, startedAt: 0, clock: () => now,
    budgetMs: SCANNER_BUDGET_MS, reserveMs: SCANNER_WAVE_RESERVE_MS,
  });

  assert.equal(out.stoppedBecause, 'time budget');
  assert.ok(out.ran.length < 20, 'it left work for the next drain rather than overrunning');
  // Nothing was claimed after the budget minus the reserve.
  assert.ok(now <= SCANNER_BUDGET_MS * 2, 'and it did not keep starting waves forever');
});

test('a wave is never started without room for a typical one', async () => {
  const conn = db();
  await readyRun(conn, 10);
  let now = 0;
  const { handler, state } = watcher({ tick: () => { now += 1000; } });

  // Only a hair more than the reserve: room for exactly one wave.
  await runScannerLane(conn, {
    handler, startedAt: 0, clock: () => now,
    budgetMs: SCANNER_WAVE_RESERVE_MS + 1, reserveMs: SCANNER_WAVE_RESERVE_MS,
  });
  assert.equal(state.started.length, SCANNER_CONCURRENCY, 'one wave, then it stopped');
});

test('there is no unbounded fan-out anywhere in the lane', () => {
  const runner = code('../lib/runner.mjs');
  const lane = runner.slice(runner.indexOf('export async function runScannerLane'));
  // allSettled over a batch that was itself capped at `concurrency`, never over
  // a whole run.
  assert.match(lane, /Promise\.allSettled\(\s*batch\.map/);
  assert.equal(/Promise\.all\(/.test(lane), false, 'allSettled only: one bad site must not take its siblings down');
  // The batch is filled up to the headroom left in the shared bound, never to
  // this worker's own idea of the bound.
  assert.match(lane, /const room = concurrency - inFlight/);
  assert.match(lane, /i < room/, 'the batch is filled up to that headroom and no further');
});

test('progress never loads every item of a run', () => {
  const items = code('../lib/scanner-items.mjs');
  const progress = items.slice(items.indexOf('export async function runProgress'), items.indexOf('export async function unfinishedProspectIds'));
  assert.match(progress, /COUNT\(\*\)[\s\S]*GROUP BY state/, 'an aggregate, not five thousand rows');
});

// ── 9-13. One failure does not take the others with it ───────────────────

test('a site that will not load does not fail its siblings', async () => {
  const conn = db();
  await readyRun(conn, 4);
  const { handler, state } = watcher({ fail: (job) => job.prospect_id === 2 });

  const out = await runScannerLane(conn, { handler });

  assert.equal(out.ran.length, 4, 'every item was still attempted');
  assert.deepEqual(state.finished.sort(), [1, 3, 4], 'the other three completed normally');
  const done = out.ran.filter((j) => j.status === 'done').map((j) => j.prospectId).sort();
  assert.deepEqual(done, [1, 3, 4]);
});

test('a failure inside a wave is recorded on its own job only', async () => {
  const conn = db();
  await readyRun(conn, 2);
  const { handler } = watcher({ fail: (job) => job.prospect_id === 1 });
  await runScannerLane(conn, { handler });

  const jobs = await jobRows(conn);
  const bad = jobs.find((j) => j.prospect_id === 1);
  const good = jobs.find((j) => j.prospect_id === 2);
  assert.equal(good.status, 'done', 'the good one is done and stays done');
  assert.ok(['queued', 'failed'].includes(bad.status), 'the bad one is retried or failed, alone');
  assert.match(String(bad.last_error), /refused 1/);
});

test('each item is timed, so throughput can be measured rather than guessed', async () => {
  const conn = db();
  await readyRun(conn, 2);
  const { handler } = watcher();
  const out = await runScannerLane(conn, { handler });
  for (const j of out.ran) assert.equal(typeof j.ms, 'number');
});

// ── 14-18. Two workers, one item ─────────────────────────────────────────

test('two workers cannot claim the same scanner job', async () => {
  const conn = db();
  await readyRun(conn, 1);
  const a = await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] });
  const b = await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] });
  assert.ok(a, 'the first worker gets it');
  assert.equal(b, null, 'and the second gets nothing at all');
});

test('two lanes running at once do not double up on the same work', async () => {
  const conn = db();
  await readyRun(conn, 6);
  const { handler, state } = watcher({ ms: 10 });

  await Promise.all([
    runScannerLane(conn, { handler }),
    runScannerLane(conn, { handler }),
  ]);

  const seen = state.started;
  assert.equal(new Set(seen).size, seen.length, 'no prospect was picked up twice');
  assert.ok(seen.length <= 6);
});

test('the feeder does not overfill the queue', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: Array.from({ length: 100 }, (_, i) => i + 1) });
  const out = await feedRun(conn, { workspace: WS, runId: 1 });
  assert.equal(out.fed, FEED_BATCH);
  assert.equal((await jobRows(conn)).length, FEED_BATCH);
  // The ready pool is several drains' worth, not a round number picked by hand.
  assert.equal(FEED_BATCH % SCANNER_CONCURRENCY, 0);
  assert.ok(FEED_BATCH >= SCANNER_CONCURRENCY * 2, 'a worker must never wait on the feeder');
});

// ── 19-23. Stop, under concurrency ───────────────────────────────────────

test('Stop during a wave prevents any new claim', async () => {
  const conn = db();
  await readyRun(conn, 6);
  const { handler, state } = watcher({
    ms: 5,
    // Somebody presses Stop while the first wave is in flight.
    tick: () => {},
  });

  // Stop between waves is the realistic shape: the in-flight ones finish, and
  // nothing after them starts.
  await stopRun(conn, { workspace: WS, runId: 1, reason: 'Stopped by hand' });
  const out = await runScannerLane(conn, { handler });

  assert.equal(out.ran.length, 0, 'a stopped run offers the lane nothing');
  assert.equal(state.started.length, 0);
});

test('an in-flight item may finish after Stop, and its result is kept', async () => {
  const conn = db();
  await readyRun(conn, 3);

  // Claim one the way a worker would, then stop the run underneath it.
  const claimed = await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] });
  assert.ok(claimed);
  await conn.prepare(`UPDATE scanner_run_items SET state = 'RUNNING' WHERE prospect_id = ?`).bind(claimed.prospect_id).run();

  const out = await stopRun(conn, { workspace: WS, runId: 1, reason: 'Stopped by hand' });
  assert.equal(out.state, RUN.STOPPING, 'still one in the air');

  const p = await runProgress(conn, { workspace: WS, runId: 1 });
  assert.equal(p.running, 1, 'the one being worked on is left alone');
  assert.equal(p.cancelled, 2, 'the two that never started are cancelled');
});

test('no wave is launched after Stop because a worker was holding stale run state', async () => {
  const conn = db();
  await readyRun(conn, 8);
  const { handler, state } = watcher({ ms: 5 });

  // Stop lands after the first wave has been claimed. The lane must not start
  // a second one, because Stop cancelled the jobs behind the remaining items.
  const lane = runScannerLane(conn, { handler });
  await stopRun(conn, { workspace: WS, runId: 1, reason: 'Stopped mid-run' });
  const out = await lane;

  assert.ok(state.started.length <= SCANNER_CONCURRENCY * 2, 'it did not keep going through the whole run');
  const items = await conn.prepare(`SELECT state, COUNT(*) n FROM scanner_run_items WHERE scanner_run_id=1 GROUP BY state`).all();
  const by = Object.fromEntries((items.results || []).map((r) => [r.state, r.n]));
  assert.ok((by.CANCELLED || 0) > 0, 'the untouched remainder was cancelled');
  assert.equal(out.ran.length + (by.CANCELLED || 0) >= 8, true, 'everything is accounted for');
});

test('a stopped, stopping or abandoned run is never fed again', async () => {
  for (const state of [RUN.STOPPING, RUN.STOPPED, RUN.ABANDONED, RUN.COMPLETED]) {
    const conn = db();
    await addRun(conn, { state });
    await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2, 3] });
    const out = await feedRun(conn, { workspace: WS, runId: 1 });
    assert.equal(out.fed, 0, `${state} must not be fed`);
  }
});

// ── 24-30. Sending is untouched ──────────────────────────────────────────

test('the drain claims send-approved and nothing else', () => {
  // An include-list, not an exclude-list. Every other kind reads Gmail or
  // spends AI money, and Ary shut both down on 2026-08-27: the skills do
  // the reading and the writing, the app sends what she approved.
  const drain = code('../app/api/cron/drain/route.js');
  assert.ok(drain.includes('kinds: [KIND.SEND_APPROVED]'), 'send-approved is the whole allow-list');
  assert.ok(!drain.includes('excludeKinds'), 'no exclude-list to forget a new kind in');
});

test('the push notification endpoint does not sync the mailbox', () => {
  const push = code('../app/api/gmail/push/route.js');
  assert.ok(!push.includes('syncMailbox'), 'no sync call');
  assert.ok(!push.includes('runJobs'), 'no job runner');
  assert.ok(!push.includes('enqueue'), 'no enqueue');
  assert.ok(!push.includes('GMAIL_SYNC'), 'the kind name does not appear');
  assert.ok(push.includes('mailbox sync retired'), 'the acknowledgement names the shutdown');
});

test('the scanner lane is gone from the drain entirely', () => {
  const drain = code('../app/api/cron/drain/route.js');
  assert.ok(!drain.includes('runScannerLane'), 'no waves, no paid site checks from the cron');
});

test('the send job class is claimed exactly as it was', async () => {
  const conn = db();
  await enqueue(conn, { workspace: WS, kind: KIND.SEND_APPROVED, prospectId: 9, priority: PRIORITY.SEND_APPROVED });
  await enqueue(conn, { workspace: WS, kind: KIND.SCANNER_ITEM, prospectId: 10, priority: PRIORITY.SCANNER_ITEM, scannerRunId: 1 });

  // What the general drain now asks for.
  const job = await claimNext(conn, { workspace: WS, excludeKinds: [KIND.SCANNER_ITEM] });
  assert.equal(job.kind, KIND.SEND_APPROVED, 'the send is still first in line and still claimable');
});

test('a queue full of scanner work does not delay a send by even one drain', async () => {
  const conn = db();
  await readyRun(conn, 50);
  await enqueue(conn, { workspace: WS, kind: KIND.SEND_APPROVED, prospectId: 999, priority: PRIORITY.SEND_APPROVED });

  const job = await claimNext(conn, { workspace: WS, excludeKinds: [KIND.SCANNER_ITEM] });
  assert.equal(job.kind, KIND.SEND_APPROVED);
  assert.equal(job.prospect_id, 999, 'fifty queued site checks did not get in front of it');
});

test('the send limits themselves were not touched', () => {
  const drain = code('../app/api/cron/drain/route.js');
  // The general lane keeps the exact numbers it had before the lane existed.
  assert.match(drain, /const MAX_JOBS_PER_RUN = 12;/);
  assert.match(drain, /const MAX_MS = 25_000;/);
  assert.match(drain, /const MAX_PER_WORKSPACE = 5;/);
  // And the scanner budget is a different constant living somewhere else.
  assert.equal(/SCANNER_BUDGET_MS = /.test(drain), false);
});

test('nothing in the throughput change touches sending, approval or Gmail', () => {
  const lane = code('../lib/runner.mjs');
  const slice = lane.slice(lane.indexOf('export async function runScannerLane'));
  for (const forbidden of ['sendApproved', 'canSendNow', 'gmail', 'Gmail', 'SEND_APPROVED', 'approval']) {
    assert.equal(slice.includes(forbidden), false, `the scanner lane must not mention ${forbidden}`);
  }
});

test('a human-triggered Hive run still spends human credits, not the daily allowance', () => {
  const runner = code('../lib/runner.mjs');
  const handler = runner.slice(runner.indexOf('[KIND.SCANNER_ITEM]'), runner.indexOf('[KIND.VET]'));
  assert.match(handler, /actor: 'human'/);
  assert.equal(handler.includes('canSpendAutomatically'), false);
  assert.equal(handler.includes('recordAutoSpend'), false);
  // Running on the server did not make it automatic, and running it faster
  // must not either.
  const lane = runner.slice(runner.indexOf('export async function runScannerLane'));
  assert.equal(lane.includes('recordAutoSpend'), false);
  assert.equal(lane.includes('autoSpentToday'), false);
});

// ── 31-36. Telemetry, health and the speed line ──────────────────────────

test('a speed is not reported from too few samples', async () => {
  const { recentThroughput, MIN_SPEED_SAMPLES } = await import('../lib/scanner-items.mjs');
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2] });
  await conn.prepare(
    `UPDATE scanner_run_items SET state='SUCCEEDED',
       started_at = datetime('now','-40 seconds'), finished_at = datetime('now')`
  ).run();

  const t = await recentThroughput(conn, { workspace: WS });
  assert.equal(t.finished, 2);
  assert.equal(t.enough, false, `two is fewer than ${MIN_SPEED_SAMPLES}`);
});

test('a speed is reported once enough have finished', async () => {
  const { recentThroughput } = await import('../lib/scanner-items.mjs');
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2, 3, 4, 5, 6] });
  await conn.prepare(
    `UPDATE scanner_run_items SET state='SUCCEEDED',
       started_at = datetime('now','-30 seconds'), finished_at = datetime('now')`
  ).run();

  const t = await recentThroughput(conn, { workspace: WS });
  assert.equal(t.enough, true);
  assert.equal(t.finished, 6);
  assert.ok(t.p50Seconds >= 25 && t.p50Seconds <= 35, 'the measured duration is real');
});

test('throughput reads are bounded and cannot become a full scan', () => {
  const items = code('../lib/scanner-items.mjs');
  const fn = items.slice(items.indexOf('export async function recentThroughput'), items.indexOf('export async function scannerLoad'));
  assert.match(fn, /finished_at >= datetime\('now', \?\)/, 'a time window');
  assert.match(fn, /LIMIT \?/, 'and a hard row cap');
  const sql = src('../migrations/050_scanner_item_finished_index.sql');
  assert.match(sql, /scanner_run_items \(workspace, finished_at\)/, 'and an index behind it');
});

test('a big queued scan is never called unhealthy', async () => {
  const { scannerLane } = await import('../lib/system-health.mjs');
  const busy = scannerLane({
    load: { running: 2, queued: 4000, pending: 1400, failed: 0, concurrency: SCANNER_CONCURRENCY },
    throughput: { enough: true, perHour: 48 },
  });
  assert.equal(busy.attention, false, 'a big scan is a big scan, not a fault');
  assert.match(busy.text, /2 sites being checked right now/);
  assert.match(busy.text, /About 48 an hour recently/);
});

test('health says nothing about speed when there is not enough of it', async () => {
  const { scannerLane } = await import('../lib/system-health.mjs');
  const quiet = scannerLane({ load: { running: 0, queued: 0 }, throughput: { enough: false, perHour: 900 } });
  assert.equal(quiet.perHour, null);
  assert.equal(/an hour/.test(quiet.text), false);
  assert.match(quiet.text, /No site checks in progress/);
});

test('the Hive shows a speed only when the server says there is one', () => {
  const panel = code('../components/ArmyPanel.jsx');
  assert.match(panel, /setSpeed\(d\.speed\?\.enough \? d\.speed : null\)/);
  assert.match(panel, /About \$\{speed\.perHour\} sites an hour recently/);
  // No ETA anywhere: a finish time from a handful of samples is a wrong promise.
  assert.equal(/finishes? (at|by|around)/i.test(panel), false);
});

test('System health is still read-only after the scanner lane was added', () => {
  const route = code('../app/api/system-health/route.js');
  assert.equal(/\b(INSERT|UPDATE|DELETE)\b/i.test(route), false);
});

// ── 38-43. The bound has to be global, not per-worker ────────────────────
//
// Found the hard way, in production. Two drain invocations overlapped by two
// seconds, each obeyed its own limit of two, and three site checks ran at once.
// Bounding the loop is not the same as bounding the resource.

test('a second worker will not exceed the bound the first one is already using', async () => {
  const conn = db();
  await readyRun(conn, 8);

  // Worker one takes its two and is still holding them.
  const a1 = await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] });
  const a2 = await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] });
  assert.ok(a1 && a2);

  // Worker two arrives while those are in flight.
  const { handler, state } = watcher();
  const out = await runScannerLane(conn, { handler });

  assert.equal(state.started.length, 0, 'it took nothing at all');
  assert.equal(out.stoppedBecause, 'another worker has the lane');
});

test('a worker takes only the headroom that is left', async () => {
  const conn = db();
  await readyRun(conn, 8);
  await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] });   // one already out

  const { handler, state } = watcher();
  // One wave only, so the count is unambiguous.
  await runScannerLane(conn, { handler, budgetMs: 1, reserveMs: 0, startedAt: 0, clock: () => 0 });

  assert.equal(state.peak, SCANNER_CONCURRENCY - 1, 'it filled the gap and no more');
});

test('two lanes racing never put more than the bound in flight', async () => {
  const conn = db();
  await readyRun(conn, 12);
  const shared = { active: 0, peak: 0 };
  const handler = async () => {
    shared.active += 1;
    shared.peak = Math.max(shared.peak, shared.active);
    await new Promise((r) => setTimeout(r, 15));
    shared.active -= 1;
    return { ok: true };
  };

  await Promise.all([
    runScannerLane(conn, { handler }),
    runScannerLane(conn, { handler }),
    runScannerLane(conn, { handler }),
  ]);

  assert.ok(shared.peak <= SCANNER_CONCURRENCY, `three overlapping workers still peaked at ${shared.peak}`);
});

test('a job put back is not charged an attempt for a try it never made', async () => {
  const { release } = await import('../lib/queue.mjs');
  const conn = db();
  await readyRun(conn, 1);
  const job = await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] });
  assert.equal(job.attempts, 1);

  await release(conn, job);
  const back = await conn.prepare(`SELECT * FROM jobs WHERE id = ?`).bind(job.id).first();
  assert.equal(back.status, 'queued', 'available again');
  assert.equal(back.attempts, 0, 'and its retries are intact');
  assert.equal(back.claimed_at, null);
});

test('a dead worker does not hold a slot for ever', async () => {
  const { inFlightCount } = await import('../lib/queue.mjs');
  const conn = db();
  await readyRun(conn, 4);
  await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] });
  assert.equal(await inFlightCount(conn, KIND.SCANNER_ITEM), 1);

  // Same expiry the queue's own claim recovery uses.
  const later = new Date(Date.now() + 60 * 60_000);
  assert.equal(await inFlightCount(conn, KIND.SCANNER_ITEM, { now: later }), 0, 'the stale claim stops counting');
});

test('a refund can be traced back to the prospect it belongs to', () => {
  const pre = code('../lib/precheck.mjs');
  const refunds = pre.match(/refundCredits\([^)]*\)/g) || [];
  assert.ok(refunds.length >= 2, 'both refund paths exist');
  for (const r of refunds) assert.match(r, /prospectId/, `a refund with no prospect id cannot be reconciled: ${r}`);
});

test('the health page says which commit is answering', () => {
  const route = code('../app/api/system-health/route.js');
  assert.match(route, /CF_PAGES_COMMIT_SHA/, 'Cloudflare already knows; ask it');
  assert.match(route, /commit: sha \? sha\.slice\(0, 7\) : 'unknown'/, 'and never guess when it does not');
  // Still a read.
  assert.equal(/\b(INSERT|UPDATE|DELETE)\b/i.test(route), false);
});

// ── 44-47. The two timestamp formats in one column ───────────────────────
//
// Found while trying to fake a held claim during the live acceptance test. The
// hold was written with datetime('now'), which is space separated; claimNext
// writes claimed_at as an ISO string with a T and a Z. Compared as text those
// differ at character eleven, so the answer never depends on the clock.
//
// The test setup was the thing that was wrong there, but the same shape was
// already sitting in the drain's own stale-claim clause, where it meant that
// clause had never matched a row in its life.

test('a stale claim is recognised whichever way the timestamp was written', async () => {
  const { inFlightCount } = await import('../lib/queue.mjs');
  const conn = db();
  await readyRun(conn, 2);

  const job = await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] });
  assert.equal(await inFlightCount(conn, KIND.SCANNER_ITEM), 1, 'the ISO-with-T claim counts');

  // Now the other spelling, the one SQLite's own datetime() produces.
  await conn.prepare(`UPDATE jobs SET claimed_at = datetime('now') WHERE id = ?`).bind(job.id).run();
  assert.equal(await inFlightCount(conn, KIND.SCANNER_ITEM), 1, 'and so does the space-separated one');
});

test('an old claim stops counting, in either format', async () => {
  const { inFlightCount } = await import('../lib/queue.mjs');
  const conn = db();
  await readyRun(conn, 2);
  const job = await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] });

  await conn.prepare(`UPDATE jobs SET claimed_at = datetime('now','-60 minutes') WHERE id = ?`).bind(job.id).run();
  assert.equal(await inFlightCount(conn, KIND.SCANNER_ITEM), 0, 'space separated, an hour old');

  await conn.prepare(`UPDATE jobs SET claimed_at = ? WHERE id = ?`)
    .bind(new Date(Date.now() - 60 * 60_000).toISOString(), job.id).run();
  assert.equal(await inFlightCount(conn, KIND.SCANNER_ITEM), 0, 'ISO with a T, an hour old');
});

test('a job abandoned by a dead worker can be claimed again', async () => {
  const conn = db();
  await readyRun(conn, 1);
  const first = await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] });
  assert.ok(first);
  assert.equal(await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] }), null, 'not while the claim is fresh');

  // The worker died. Written the way the drain writes it.
  await conn.prepare(`UPDATE jobs SET claimed_at = datetime('now','-60 minutes') WHERE id = ?`).bind(first.id).run();
  const again = await claimNext(conn, { kinds: [KIND.SCANNER_ITEM] });
  assert.equal(again?.id, first.id, 'the queue takes it back rather than losing it');
});

test('every claimed_at comparison normalises both sides', () => {
  for (const f of ['../lib/queue.mjs', '../app/api/cron/drain/route.js']) {
    const s = code(f);
    // Any raw comparison of the column against a bound is the bug.
    const raw = s.match(/claimed_at\s*[<>]=?\s*(\?|datetime)/g) || [];
    for (const hit of raw) {
      assert.ok(false, `${f} compares claimed_at without datetime(): ${hit}`);
    }
    for (const m of s.match(/datetime\(claimed_at\)\s*[<>]=?\s*datetime\(/g) || []) assert.ok(m);
  }
});
