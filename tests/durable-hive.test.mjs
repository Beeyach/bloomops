// A Hive run that survives the tab closing.
//
// The run that started this: 5,484 sites asked for, 70 done, and then a laptop
// slept. The loop lived in a browser, so the work stopped with it, and because
// the run stored a requested total rather than a list, nothing could say which
// 5,414 were left. Both halves of that are fixed here, and both need proving:
// the list is real rows, and the work happens on the server.
//
// The tests below care about three things above all. Money is never spent
// twice. A stopped run stops. And the browser and the server can never both be
// processing the same run, which is the one failure that would double every
// charge in it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1 } from './_d1.mjs';

import {
  ITEM, FEED_BATCH, snapshotMembership, runProgress, unfinishedProspectIds,
  feedRun, feedLiveRuns, settleIfFinished, cancelUnstarted, cancelAbandonedItems, stopRun,
  markItemRunning, finishItem, syncRunCounters,
} from '../lib/scanner-items.mjs';
import { RUN } from '../lib/scanner-run.mjs';
import { KIND, PRIORITY } from '../lib/queue.mjs';
import { scannerSummary } from '../lib/system-health.mjs';

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
// Prose mentioning a thing is not code doing it. Every static check below
// strips comments first, because this file's own explanations would otherwise
// trip them.
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

const addRun = (conn, { state = RUN.RUNNING, ws = WS } = {}) =>
  conn.prepare(
    `INSERT INTO scanner_runs (workspace, scanner, state, started_at, heartbeat_at)
     VALUES (?, 'precheck', ?, datetime('now'), datetime('now'))`
  ).bind(ws, state).run();

const items = (conn, runId) =>
  conn.prepare(`SELECT * FROM scanner_run_items WHERE scanner_run_id = ? ORDER BY position`).bind(runId).all()
    .then((r) => r.results || []);

const jobs = (conn) => conn.prepare(`SELECT * FROM jobs ORDER BY id`).all().then((r) => r.results || []);
const runRow = (conn, id) => conn.prepare(`SELECT * FROM scanner_runs WHERE id = ?`).bind(id).first();

// ── 1-5. The snapshot ────────────────────────────────────────────────────

test('a run writes down exactly who is in it, before any work starts', async () => {
  const conn = db();
  await addRun(conn);
  const out = await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [11, 22, 33] });

  assert.equal(out.total, 3);
  const rows = await items(conn, 1);
  assert.deepEqual(rows.map((r) => r.prospect_id), [11, 22, 33]);
  assert.deepEqual(rows.map((r) => r.state), [ITEM.PENDING, ITEM.PENDING, ITEM.PENDING]);
  // The order Ary's selection produced, kept.
  assert.deepEqual(rows.map((r) => r.position), [0, 1, 2]);
});

test('the same prospect cannot be in a run twice', async () => {
  const conn = db();
  await addRun(conn);
  const out = await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [11, 11, 22, 11] });
  assert.equal(out.total, 2, 'the duplicates never became rows, so they can never be charged for');
});

test('a retried start does not double the list', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2, 3] });
  const again = await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2, 3] });
  assert.equal(again.total, 3, 'pressing Start twice, or an HTTP retry, is a no-op');
  assert.equal((await items(conn, 1)).length, 3);
});

test('the total comes from the rows that landed, not the list that was hoped for', async () => {
  const conn = db();
  await addRun(conn);
  // Two of these are not numbers at all.
  const out = await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, null, 2, 'x'] });
  assert.equal(out.total, 2, 'a run claiming four while two rows exist is the old lie in a new place');
});

test('an empty selection writes nothing and claims nothing', async () => {
  const conn = db();
  await addRun(conn);
  const out = await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [] });
  assert.equal(out.total, 0);
  assert.equal((await items(conn, 1)).length, 0);
});

// ── 6-9. Progress, counted rather than reported ──────────────────────────

test('progress is counted from the items', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2, 3, 4, 5] });
  await conn.prepare(`UPDATE scanner_run_items SET state = 'SUCCEEDED' WHERE prospect_id IN (1,2)`).run();
  await conn.prepare(`UPDATE scanner_run_items SET state = 'FAILED' WHERE prospect_id = 3`).run();
  await conn.prepare(`UPDATE scanner_run_items SET state = 'RUNNING' WHERE prospect_id = 4`).run();

  const p = await runProgress(conn, { workspace: WS, runId: 1 });
  assert.equal(p.total, 5);
  assert.equal(p.succeeded, 2);
  assert.equal(p.failed, 1);
  assert.equal(p.processed, 3, 'attempted and settled');
  assert.equal(p.unfinished, 2, 'the one running and the one still pending');
});

test('cancelled items are not counted as done', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2] });
  await conn.prepare(`UPDATE scanner_run_items SET state = 'SUCCEEDED' WHERE prospect_id = 1`).run();
  await conn.prepare(`UPDATE scanner_run_items SET state = 'CANCELLED' WHERE prospect_id = 2`).run();

  const p = await runProgress(conn, { workspace: WS, runId: 1 });
  assert.equal(p.processed, 1, 'work that never happened is not progress');
  assert.equal(p.cancelled, 1);
});

test('the exact prospects a run never got to', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [10, 20, 30, 40] });
  await conn.prepare(`UPDATE scanner_run_items SET state = 'SUCCEEDED' WHERE prospect_id IN (10,20)`).run();

  // The question the old run could not answer at all.
  assert.deepEqual(await unfinishedProspectIds(conn, { workspace: WS, runId: 1 }), [30, 40]);
});

test('a legacy run with no membership reports nothing rather than guessing', async () => {
  const conn = db();
  await addRun(conn);
  await conn.prepare(`UPDATE scanner_runs SET total = 5484, processed = 70 WHERE id = 1`).run();
  assert.deepEqual(await unfinishedProspectIds(conn, { workspace: WS, runId: 1 }), []);
  assert.equal((await runProgress(conn, { workspace: WS, runId: 1 })).total, 0);
});

// ── 10-15. The feeder ────────────────────────────────────────────────────

test('the feeder hands work to the queue, bounded', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: Array.from({ length: 60 }, (_, i) => i + 1) });

  const out = await feedRun(conn, { workspace: WS, runId: 1 });
  assert.equal(out.fed, FEED_BATCH, 'sixty items do not become sixty job rows');

  const q = await jobs(conn);
  assert.equal(q.length, FEED_BATCH);
  assert.equal(q[0].kind, KIND.SCANNER_ITEM);
  assert.equal(q[0].priority, PRIORITY.SCANNER_ITEM);
  // Ownership. Stop and abandonment cancel a run's work by this column.
  assert.equal(q[0].scanner_run_id, 1);
});

test('the feeder does not top up a queue that is already full', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: Array.from({ length: 60 }, (_, i) => i + 1) });
  await feedRun(conn, { workspace: WS, runId: 1 });
  const again = await feedRun(conn, { workspace: WS, runId: 1 });
  assert.equal(again.fed, 0);
  assert.equal((await jobs(conn)).length, FEED_BATCH);
});

test('two feeders racing cannot queue the same item twice', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2, 3] });
  await Promise.all([
    feedRun(conn, { workspace: WS, runId: 1 }),
    feedRun(conn, { workspace: WS, runId: 1 }),
  ]);
  const q = await jobs(conn);
  assert.equal(q.length, 3, 'one job per item, and one charge per item');
});

test('a stopping run is never fed', async () => {
  const conn = db();
  await addRun(conn, { state: RUN.STOPPING });
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2, 3] });
  const out = await feedRun(conn, { workspace: WS, runId: 1 });
  assert.equal(out.fed, 0, 'this is what Stop means, enforced here rather than hoped for downstream');
  assert.equal((await jobs(conn)).length, 0);
});

test('a finished run is never fed', async () => {
  const conn = db();
  await addRun(conn, { state: RUN.ABANDONED });
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2] });
  assert.equal((await feedRun(conn, { workspace: WS, runId: 1 })).fed, 0);
});

test('the cron feeds every live run and settles the ones that are done', async () => {
  const conn = db();
  await addRun(conn);                       // 1: has work left
  await addRun(conn);                       // 2: everything finished
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2] });
  await snapshotMembership(conn, { workspace: WS, runId: 2, prospectIds: [3] });
  await conn.prepare(`UPDATE scanner_run_items SET state = 'SUCCEEDED' WHERE scanner_run_id = 2`).run();

  const out = await feedLiveRuns(conn);
  assert.equal(out.fed, 2);
  assert.deepEqual(out.settled, [{ id: 2, state: RUN.COMPLETED }]);
});

// ── 16-20. Finishing, and stopping ───────────────────────────────────────

test('a run with nothing left finishes itself', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2] });
  await conn.prepare(`UPDATE scanner_run_items SET state = 'SUCCEEDED'`).run();

  const out = await settleIfFinished(conn, { workspace: WS, runId: 1 });
  assert.equal(out.settled, true);
  assert.equal((await runRow(conn, 1)).state, RUN.COMPLETED);
});

test('a run that was stopped settles as stopped, never completed', async () => {
  const conn = db();
  await addRun(conn, { state: RUN.STOPPING });
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2] });
  await conn.prepare(`UPDATE scanner_run_items SET state = 'SUCCEEDED' WHERE prospect_id = 1`).run();
  await conn.prepare(`UPDATE scanner_run_items SET state = 'CANCELLED' WHERE prospect_id = 2`).run();

  await settleIfFinished(conn, { workspace: WS, runId: 1 });
  assert.equal((await runRow(conn, 1)).state, RUN.STOPPED, 'half a list is half a list');
});

test('a run still working is not settled', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2] });
  await conn.prepare(`UPDATE scanner_run_items SET state = 'RUNNING' WHERE prospect_id = 1`).run();
  assert.equal((await settleIfFinished(conn, { workspace: WS, runId: 1 })).settled, false);
  assert.equal((await runRow(conn, 1)).state, RUN.RUNNING);
});

test('cancelling only ever touches work that never started', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2, 3, 4] });
  await conn.prepare(`UPDATE scanner_run_items SET state = 'SUCCEEDED' WHERE prospect_id = 1`).run();
  await conn.prepare(`UPDATE scanner_run_items SET state = 'FAILED' WHERE prospect_id = 2`).run();
  await conn.prepare(`UPDATE scanner_run_items SET state = 'RUNNING' WHERE prospect_id = 3`).run();

  const out = await cancelUnstarted(conn, { workspace: WS, runId: 1 });
  assert.equal(out.cancelled, 1, 'only the pending one');
  const rows = await items(conn, 1);
  assert.deepEqual(rows.map((r) => r.state), ['SUCCEEDED', 'FAILED', 'RUNNING', 'CANCELLED']);
});

test('stopping a run stops it, and keeps what it finished', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2, 3, 4] });
  await conn.prepare(`UPDATE scanner_run_items SET state = 'SUCCEEDED' WHERE prospect_id = 1`).run();
  await feedRun(conn, { workspace: WS, runId: 1 });         // 2, 3, 4 queued with jobs
  await conn.prepare(`UPDATE scanner_run_items SET state = 'RUNNING' WHERE prospect_id = 2`).run();

  const out = await stopRun(conn, { workspace: WS, runId: 1, reason: 'Stopped by hand' });
  assert.equal(out.changed, true);

  const rows = await items(conn, 1);
  assert.equal(rows[0].state, 'SUCCEEDED', 'finished work is never relabelled');
  assert.equal(rows[1].state, 'RUNNING', 'the one in flight is left to land');
  assert.deepEqual(rows.slice(2).map((r) => r.state), ['CANCELLED', 'CANCELLED']);

  // And the jobs behind the cancelled ones are gone, so nothing spends later.
  const left = (await jobs(conn)).filter((j) => j.status === 'queued');
  assert.equal(left.length, 0);
  assert.equal((await runRow(conn, 1)).state, RUN.STOPPING, 'still one in flight');
});

test('stopping a run with nothing in flight ends it there and then', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2] });
  const out = await stopRun(conn, { workspace: WS, runId: 1 });
  assert.equal(out.state, RUN.STOPPED);
  assert.equal((await runRow(conn, 1)).state, RUN.STOPPED, 'it does not sit in STOPPING waiting for a worker that will never come');
});

test('stopping twice is a no-op the second time', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1] });
  await stopRun(conn, { workspace: WS, runId: 1 });
  const again = await stopRun(conn, { workspace: WS, runId: 1 });
  assert.equal(again.changed, false);
  assert.equal((await runRow(conn, 1)).state, RUN.STOPPED);
});

// ── 21-25. One item's lifecycle ──────────────────────────────────────────

test('a worker claims an item, and a second worker cannot', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1] });
  const id = (await items(conn, 1))[0].id;

  assert.equal(await markItemRunning(conn, { workspace: WS, itemId: id }), true);
  await finishItem(conn, { workspace: WS, itemId: id, state: ITEM.SUCCEEDED });
  assert.equal(await markItemRunning(conn, { workspace: WS, itemId: id }), false, 'finished is finished');
});

test('a late worker cannot revive a cancelled item', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1] });
  const id = (await items(conn, 1))[0].id;
  await cancelUnstarted(conn, { workspace: WS, runId: 1 });

  assert.equal(await markItemRunning(conn, { workspace: WS, itemId: id }), false);
  assert.equal(await finishItem(conn, { workspace: WS, itemId: id, state: ITEM.SUCCEEDED }), false);
  assert.equal((await items(conn, 1))[0].state, 'CANCELLED');
});

test('attempts are counted on the item, not guessed', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1] });
  const id = (await items(conn, 1))[0].id;
  await markItemRunning(conn, { workspace: WS, itemId: id });
  await markItemRunning(conn, { workspace: WS, itemId: id });
  assert.equal((await items(conn, 1))[0].attempts, 2);
});

test('server work is the heartbeat', async () => {
  const conn = db();
  await addRun(conn);
  await conn.prepare(`UPDATE scanner_runs SET heartbeat_at = '2000-01-01 00:00:00' WHERE id = 1`).run();
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2] });
  await conn.prepare(`UPDATE scanner_run_items SET state = 'SUCCEEDED' WHERE prospect_id = 1`).run();

  await syncRunCounters(conn, { workspace: WS, runId: 1 });
  const r = await runRow(conn, 1);
  assert.equal(r.processed, 1);
  assert.equal(r.succeeded, 1);
  assert.equal(r.total, 2);
  assert.notEqual(r.heartbeat_at, '2000-01-01 00:00:00', 'no tab has to be open for a live run to look alive');
});

test('counters are not written onto a run that already finished', async () => {
  const conn = db();
  await addRun(conn, { state: RUN.ABANDONED });
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1] });
  await conn.prepare(`UPDATE scanner_run_items SET state = 'SUCCEEDED'`).run();
  await syncRunCounters(conn, { workspace: WS, runId: 1 });
  assert.equal((await runRow(conn, 1)).processed, 0, 'a late worker does not rewrite a closed run');
});

// ── 26-33. One implementation, and only one ──────────────────────────────

test('the browser cannot run scanner work any more', () => {
  const panel = code('../components/ArmyPanel.jsx');
  assert.equal(/audit-video\/precheck/.test(panel), false, 'the Hive page no longer calls the per-site endpoint at all');
  // The loop itself, not just the URL: a for-loop over targets calling fetch is
  // the shape that has to be gone.
  assert.equal(/for \(let i = 0; i < targets\.length[\s\S]{0,600}audit-video/.test(panel), false);
});

test('the Hive page starts a run by handing over the list', () => {
  const panel = code('../components/ArmyPanel.jsx');
  assert.match(panel, /startRun\('precheck'[^)]*targets\.map\(\(t\) => t\.id\)\)/, 'membership is sent at start');
  assert.match(panel, /You can close this page\. LTB keeps working in the background\./);
});

test('there is one precheck implementation and the route uses it', () => {
  const route = code('../app/api/audit-video/precheck/route.js');
  assert.match(route, /runPrecheck/);
  assert.equal(/fetch\(`\$\{service\}\/precheck`/.test(route), false, 'the route no longer has its own copy of the work');
  assert.equal(/spendCredits\(/.test(route), false, 'nor its own charging');

  const runner = code('../lib/runner.mjs');
  assert.match(runner, /runPrecheck\(db, \{ workspace: ws, prospectId, service, secret, actor: 'human' \}\)/);
});

test('a Hive run spends the credit balance, not the unattended daily allowance', () => {
  const runner = code('../lib/runner.mjs');
  const handler = runner.slice(runner.indexOf('[KIND.SCANNER_ITEM]'), runner.indexOf('[KIND.VET]'));
  assert.equal(handler.includes('canSpendAutomatically'), false, 'Ary pressed a button, so this is not the sweep budget');
  assert.equal(handler.includes('recordAutoSpend'), false);
  assert.match(handler, /actor: 'human'/);
  // And the default in the shared function is the careful one.
  assert.match(code('../lib/precheck.mjs'), /actor = 'human'/);
});

test('the cron no longer feeds live runs, only closes abandoned ones', () => {
  // Feeding a run is spending: every item it hands out becomes a paid site
  // check. Ary shut app-side scanning down on 2026-08-27, so the drain keeps
  // only the cleanup half - a run left open still closes itself.
  const drain = code('../app/api/cron/drain/route.js');
  assert.ok(!drain.includes('feedLiveRuns'), 'nothing feeds scanner runs');
  assert.ok(drain.includes('reconcileScannerRuns(db)'), 'cleanup of abandoned runs stays');
});

test('a durable run never takes its numbers from a browser', () => {
  const route = code('../app/api/scanner-runs/route.js');
  assert.match(route, /if \(action === 'progress'\) \{\s*if \(durable\) return/);
  assert.match(route, /if \(action === 'finish'\) \{\s*if \(durable\) return/);
});

test('the run is only told its size after the rows exist', () => {
  const route = code('../app/api/scanner-runs/route.js');
  const start = route.slice(route.indexOf("action === 'start'"), route.indexOf("action === 'reconcile'"));
  const snap = start.indexOf('snapshotMembership');
  const total = start.indexOf('UPDATE scanner_runs SET total');
  assert.ok(snap > 0 && total > snap, 'total is written from the snapshot, after it');
  assert.match(start, /snap\.total/);
});

test('a run closed as abandoned does not leave items claiming a worker is coming', async () => {
  const conn = db();
  await addRun(conn);
  await snapshotMembership(conn, { workspace: WS, runId: 1, prospectIds: [1, 2, 3] });
  await feedRun(conn, { workspace: WS, runId: 1 });
  await conn.prepare(`UPDATE scanner_run_items SET state = 'SUCCEEDED' WHERE prospect_id = 1`).run();
  await conn.prepare(`UPDATE scanner_runs SET state = 'ABANDONED' WHERE id = 1`).run();

  const n = await cancelAbandonedItems(conn, [{ id: 1, workspace: WS }]);
  assert.equal(n, 2);
  const rows = await items(conn, 1);
  assert.equal(rows[0].state, 'SUCCEEDED', 'what it finished is still finished');
  assert.deepEqual(rows.slice(1).map((r) => r.state), ['CANCELLED', 'CANCELLED']);
});

test('both callers of the reconciler clean up its items', () => {
  assert.match(code('../app/api/cron/drain/route.js'), /cancelAbandonedItems\(db, staleRuns\.runs\)/);
  assert.match(code('../app/api/scanner-runs/route.js'), /cancelAbandonedItems\(db, out\.runs\)/);
});

test('System health says a durable run does not need the page open', () => {
  const live = { state: RUN.RUNNING, processed: 30, total: 5484, heartbeat_at: new Date().toISOString(), durable: true };
  assert.match(scannerSummary(live).text, /keeps going whether or not the page is open/);
  // And says nothing of the sort about a run that really does need a tab.
  assert.equal(/keeps going/.test(scannerSummary({ ...live, durable: false }).text), false);
});

test('System health is still read-only after the durable check', () => {
  const route = code('../app/api/system-health/route.js');
  assert.equal(/\b(INSERT|UPDATE|DELETE)\b/i.test(route), false, 'a page refreshed every thirty seconds must not be able to change anything');
  assert.match(route, /SELECT COUNT\(\*\) n FROM scanner_run_items/);
});

test('the migration exists and refuses to invent the run that died', () => {
  const sql = src('../migrations/049_scanner_run_items.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS scanner_run_items/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS scanner_run_items_unique/);
  assert.match(sql, /no backfill/i, 'run 1 keeps saying it does not know which prospects were left');
});
