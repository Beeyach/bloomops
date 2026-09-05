// A run that died and kept saying it was alive.
//
// The state machine always knew a stale heartbeat means ABANDONED, and code
// that writes it has existed since the Stop work. It just never ran: the only
// thing that called it was the Hive page mounting in a browser, and the one
// situation where a run dies is the situation where nobody is looking at the
// Hive. Recovery was gated on the event that cannot happen.
//
// The tests below are mostly about the two ways this can go wrong now that it
// does run: killing a live run because a read happened a moment before a write,
// and letting a dead worker walk back in afterwards.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1 } from './_d1.mjs';

import {
  RUN, isStale, isLive, isTerminal, stopTransition, settleState, describe as describeRun,
  reconcileStaleScannerRuns, abandonedSummary, ABANDON_REASON, STALE_MODIFIER,
  HEARTBEAT_STALE_MINUTES,
} from '../lib/scanner-run.mjs';
import { scannerSummary } from '../lib/system-health.mjs';

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

const SCHEMA = `
CREATE TABLE scanner_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL, scanner TEXT NOT NULL, label TEXT,
  state TEXT NOT NULL DEFAULT 'RUNNING', stop_reason TEXT,
  total INTEGER DEFAULT 0, processed INTEGER DEFAULT 0,
  succeeded INTEGER DEFAULT 0, failed INTEGER DEFAULT 0, current_item TEXT,
  started_at TEXT, heartbeat_at TEXT, last_scheduler_seen_at TEXT, stopped_at TEXT, finished_at TEXT
);
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL, kind TEXT NOT NULL, prospect_id INTEGER,
  status TEXT NOT NULL DEFAULT 'queued', last_error TEXT,
  scanner_run_id INTEGER, claimed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);`;

// Minutes ago, in the format D1 writes: UTC, space separated, no zone marker.
const sqlAgo = (mins) => new Date(Date.now() - mins * 60_000).toISOString().replace('T', ' ').slice(0, 19);

// The helper takes chunks and is synchronous. A fresh in-memory database per
// test, so nothing leaks between them.
const db = () => d1([SCHEMA]);

const addRun = (conn, { state = RUN.RUNNING, heartbeatMins = 0, processed = 0, total = 0, ws = 'ary', scanner = 'precheck' } = {}) =>
  conn.prepare(
    `INSERT INTO scanner_runs (workspace, scanner, state, total, processed, started_at, heartbeat_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(ws, scanner, state, total, processed, sqlAgo(heartbeatMins + 5), sqlAgo(heartbeatMins)).run();

const runRow = (conn, id) => conn.prepare(`SELECT * FROM scanner_runs WHERE id = ?`).bind(id).first();

// ── 1, 2, 3. The transition itself ───────────────────────────────────────

test('a run that is still reporting is left alone', async () => {
  const conn = db();
  await addRun(conn, { heartbeatMins: 1 });
  const out = await reconcileStaleScannerRuns(conn);
  assert.equal(out.closed, 0);
  assert.equal((await runRow(conn, 1)).state, RUN.RUNNING);
});

test('a run that stopped reporting is closed', async () => {
  const conn = db();
  await addRun(conn, { heartbeatMins: HEARTBEAT_STALE_MINUTES + 5, processed: 70, total: 5484 });
  const out = await reconcileStaleScannerRuns(conn);
  assert.equal(out.closed, 1);
  const r = await runRow(conn, 1);
  assert.equal(r.state, RUN.ABANDONED);
  assert.equal(r.stop_reason, ABANDON_REASON);
  assert.ok(r.finished_at, 'when it was closed is recorded');
});

test('the threshold is the canonical one, in the query as well as the reason', () => {
  assert.equal(STALE_MODIFIER, `-${HEARTBEAT_STALE_MINUTES} minutes`);
  assert.match(ABANDON_REASON, new RegExp(`${HEARTBEAT_STALE_MINUTES} minutes`));
  const mod = src('../lib/scanner-run.mjs');
  // The number itself must appear once, as the constant.
  assert.ok(!/-15 minutes'/.test(mod), 'the cutoff must be built from the constant, not typed');
});

// ── 4 to 8. Which states may ever be abandoned ───────────────────────────

test('only a live run can be abandoned by time passing', async () => {
  const conn = db();
  const states = [RUN.RUNNING, RUN.STOPPING, RUN.STOPPED, RUN.COMPLETED, RUN.FAILED, RUN.ABANDONED];
  for (const state of states) await addRun(conn, { state, heartbeatMins: HEARTBEAT_STALE_MINUTES * 10 });

  await reconcileStaleScannerRuns(conn);

  const after = [];
  for (let i = 1; i <= states.length; i += 1) after.push((await runRow(conn, i)).state);

  assert.equal(after[0], RUN.ABANDONED, 'stale RUNNING closes');
  assert.equal(after[1], RUN.ABANDONED, 'stale STOPPING closes: it was asked to stop and never did');
  assert.equal(after[2], RUN.STOPPED, 'you stopped it; time does not change that');
  assert.equal(after[3], RUN.COMPLETED, 'a finished run stays finished');
  assert.equal(after[4], RUN.FAILED, 'a failed run keeps its own reason');
  assert.equal(after[5], RUN.ABANDONED, 'already closed, unchanged');
});

// ── 9, 10. Idempotent and race safe ──────────────────────────────────────

test('running it twice changes nothing the second time', async () => {
  const conn = db();
  await addRun(conn, { heartbeatMins: HEARTBEAT_STALE_MINUTES + 5, processed: 70, total: 5484 });
  const first = await reconcileStaleScannerRuns(conn);
  const after = await runRow(conn, 1);
  const second = await reconcileStaleScannerRuns(conn);
  assert.equal(first.closed, 1);
  assert.equal(second.closed, 0);
  const later = await runRow(conn, 1);
  assert.equal(later.finished_at, after.finished_at, 'the closing time is not rewritten');
  assert.equal(later.processed, 70);
});

test('a worker that reports in before the write keeps its run', async () => {
  // The bug the old implementation had: it read the rows, decided in
  // JavaScript which looked dead, and only then wrote, guarding on state but
  // not on the heartbeat. A run that checked in during that gap was killed
  // while it was alive.
  const conn = db();
  await addRun(conn, { heartbeatMins: HEARTBEAT_STALE_MINUTES + 5 });
  // The heartbeat lands.
  await conn.prepare(`UPDATE scanner_runs SET heartbeat_at = ? WHERE id = 1`).bind(sqlAgo(0)).run();
  const out = await reconcileStaleScannerRuns(conn);
  assert.equal(out.closed, 0);
  assert.equal((await runRow(conn, 1)).state, RUN.RUNNING);

  const mod = src('../lib/scanner-run.mjs');
  // Still in the WHERE clause, and now wrapped in datetime() on both sides so a
  // T-and-Z timestamp and a space-separated bound cannot compare as raw text.
  assert.match(mod, /UPDATE scanner_runs[\s\S]*?\$\{LIVENESS_CLOCK\} < datetime\('now', \?\)/, 'the staleness test must be in the WHERE clause');
});

// ── 11, 12. Late workers are fenced out ──────────────────────────────────

test('a late worker cannot revive an abandoned run or move it on', () => {
  // The route guards every write on the run still being live, so an abandoned
  // run cannot be heartbeaten, progressed, completed or stopped back open.
  const route = src('../app/api/scanner-runs/route.js');
  // A durable run answers this without writing anything at all; a legacy one
  // writes only while the run is live.
  assert.match(route, /if \(action === 'progress'\) \{[\s\S]{0,400}?if \(isLive\(run\.state\)\)/, 'progress and heartbeat are gated on the run being live');
  assert.match(route, /if \(action === 'progress'\) \{\s*if \(durable\) return/, 'a durable run never takes progress from a browser');
  assert.match(route, /WHERE id = \? AND workspace = \? AND state IN \('RUNNING','STOPPING'\)/, 'finishing is gated too');

  // And the loop is told to stop asking.
  assert.equal(isLive(RUN.ABANDONED), false);
  assert.equal(isTerminal(RUN.ABANDONED), true);
  assert.equal(stopTransition(RUN.ABANDONED).changed, false);
  assert.equal(settleState(RUN.ABANDONED), RUN.COMPLETED, 'settleState is only ever called on a live run');
});

// ── 13, 14. Finished work survives ───────────────────────────────────────

test('everything the run completed is untouched', async () => {
  const conn = db();
  await addRun(conn, { heartbeatMins: HEARTBEAT_STALE_MINUTES + 500, processed: 70, total: 5484 });
  await conn.prepare(`UPDATE scanner_runs SET succeeded = 62, failed = 8 WHERE id = 1`).run();

  await reconcileStaleScannerRuns(conn);

  const r = await runRow(conn, 1);
  assert.equal(r.processed, 70, 'the completed count is not reset');
  assert.equal(r.succeeded, 62);
  assert.equal(r.failed, 8);
  assert.equal(r.total, 5484, 'and the requested total is not rewritten to match');
});

// ── 15, 16, 17. The work the run owned ───────────────────────────────────

test('queued work the dead run owned cannot start, and nobody else is touched', async () => {
  const conn = db();
  await addRun(conn, { heartbeatMins: HEARTBEAT_STALE_MINUTES + 5 });   // id 1, dead
  await addRun(conn, { heartbeatMins: 0 });                              // id 2, alive

  const job = (ws, status, runId) => conn.prepare(
    `INSERT INTO jobs (workspace, kind, status, scanner_run_id) VALUES (?, 'verify-site', ?, ?)`
  ).bind(ws, status, runId).run();

  await job('ary', 'queued', 1);     // 1: owned by the dead run
  await job('ary', 'running', 1);    // 2: owned by it, already in flight
  await job('ary', 'done', 1);       // 3: owned by it, finished
  await job('ary', 'queued', 2);     // 4: owned by the live run
  await job('ary', 'queued', null);  // 5: not a scanner job at all
  await job('other', 'queued', 1);   // 6: another workspace

  const out = await reconcileStaleScannerRuns(conn);
  assert.equal(out.cancelledJobs, 1, 'only the dead run\'s queued work');

  const state = async (id) => (await conn.prepare(`SELECT status FROM jobs WHERE id = ?`).bind(id).first()).status;
  assert.equal(await state(1), 'cancelled');
  assert.equal(await state(2), 'running', 'an item already in flight finishes; the queue reclaims it if the worker died');
  assert.equal(await state(3), 'done', 'finished work is never rolled back');
  assert.equal(await state(4), 'queued', 'the live run keeps its work');
  assert.equal(await state(5), 'queued', 'unrelated work is not collateral');
  assert.equal(await state(6), 'queued', 'another workspace is untouched');
});

// ── 18, 19, 20, 21. Recovery is free and silent ──────────────────────────

test('recovery spends nothing and starts nothing', () => {
  const mod = src('../lib/scanner-run.mjs');
  const recovery = mod.slice(mod.indexOf('export async function reconcileStaleScannerRuns'));
  for (const forbidden of ['spendCredits', 'recordAutoSpend', 'canSpendAutomatically', 'enqueue(', 'INSERT INTO scanner_runs', 'INSERT INTO jobs', 'sendApproved', 'buildMime']) {
    assert.ok(!recovery.includes(forbidden), `recovery must never ${forbidden}`);
  }
});

test('the cron runs it, which is the thing that was missing', () => {
  const cron = src('../app/api/cron/drain/route.js');
  // Through the entry point that asks which runs are legitimately waiting
  // first. Calling the raw reconciler is what once closed a healthy run that
  // was only queuing for a free site checker.
  assert.match(cron, /reconcileScannerRuns/);
  assert.match(cron, /await reconcileScannerRuns\(db\)/);
  assert.match(cron, /scannerRunsClosed/, 'and reports what it closed');
  assert.ok(!/reconcileStaleScannerRuns/.test(cron), 'never the raw one, which cannot see a waiting run');
});

test('the API action delegates rather than keeping its own copy of the rule', () => {
  const route = src('../app/api/scanner-runs/route.js');
  const block = route.slice(route.indexOf("if (action === 'reconcile')"));
  assert.match(block, /reconcileScannerRuns\(db, \{ workspace: ws \}\)/);
  assert.ok(!/filter\(\(r\) => isStale\(r\)\)/.test(block), 'the second implementation must not come back');
});

// ── 22, 23, 24, 25. What Ary is told ─────────────────────────────────────

test('stopped and abandoned do not say the same thing', () => {
  const stopped = describeRun({ state: RUN.STOPPED, processed: 70, total: 5484 });
  const abandoned = describeRun({ state: RUN.ABANDONED, processed: 70, total: 5484 });
  assert.notEqual(stopped.text, abandoned.text);
  // One is a decision she made, the other happened to her.
  assert.match(stopped.text, /Stopped\./);
  assert.match(abandoned.text, /closed/i);
  for (const t of [stopped.text, abandoned.text]) assert.match(t, /kept/i, 'both promise the work survived');
});

test('the abandoned summary keeps the work and never invents a remainder', () => {
  const s = abandonedSummary({ processed: 70, total: 5484 });
  assert.equal(s.progress, '70 of 5,484 finished');
  assert.match(s.kept, /Everything it completed was kept/);
  const blob = JSON.stringify(s);
  // 5484 - 70 = 5414. The run stored a requested total, not a list of members,
  // so nothing may claim those 5,414 were tried and failed, or skipped.
  for (const lie of ['5,414', '5414', 'failed', 'skipped']) {
    assert.ok(!blob.includes(lie), `must not claim ${lie}`);
  }
});

test('there is no Resume, because the unfinished prospects are not knowable', () => {
  const s = abandonedSummary({ processed: 70, total: 5484 });
  assert.ok(!/resume/i.test(JSON.stringify(s)));
  assert.match(s.next, /Start a fresh scan/);
  // And nothing in the UI offers one.
  for (const f of ['../components/SystemHealth.jsx', '../components/ArmyPanel.jsx']) {
    assert.ok(!/Resume run|resumeRun|action: 'resume'/.test(src(f)), `${f} must not offer to resume`);
  }
});

// ── 26, 27. Health observes; it does not mutate ──────────────────────────

test('opening System health cannot close a run', () => {
  const health = src('../app/api/system-health/route.js');
  const code = health.replace(/\/\/.*$/gm, '');
  assert.ok(!code.includes('reconcileStaleScannerRuns'), 'health observes, scanner recovery mutates');
  for (const write of ['UPDATE ', 'INSERT ', 'DELETE ']) {
    assert.ok(!code.includes(write), `health must never ${write.trim()}`);
  }
});

test('a closed run is still reported, and says it was closed safely', () => {
  const now = new Date('2026-08-10T16:00:00Z');
  const ago = (m) => new Date(now.getTime() - m * 60_000).toISOString();

  const closed = scannerSummary({ scanner: 'precheck', state: RUN.ABANDONED, processed: 70, total: 5484, finished_at: ago(5) }, now);
  assert.equal(closed.attention, true, 'correcting the row does not mean nothing happened');
  assert.match(closed.text, /stopped unexpectedly and was safely closed/);
  assert.match(closed.text, /70 of 5,484 finished/);
  assert.match(closed.text, /Everything it completed was kept/);

  // Reported for a day, not for ever: a warning nobody can clear is a warning
  // people learn to scroll past.
  const old = scannerSummary({ scanner: 'precheck', state: RUN.ABANDONED, processed: 70, total: 5484, finished_at: ago(60 * 30) }, now);
  assert.equal(old.attention, false);

  // And the wording does not change under Ary when the cron corrects the row.
  const pending = scannerSummary({ scanner: 'precheck', state: RUN.RUNNING, processed: 70, total: 5484, heartbeat_at: ago(540) }, now);
  assert.equal(pending.attention, true);
  assert.match(pending.text, /70 of 5,484 finished/);
  assert.match(pending.text, /Everything it completed was kept/);
});

// ── 28, 29, 30. The behaviour that already worked, still works ───────────

test('stopping by hand is unchanged', () => {
  assert.deepEqual(stopTransition(RUN.RUNNING), { changed: true, next: RUN.STOPPING, message: 'Stopping after the current one finishes...' });
  assert.equal(stopTransition(RUN.STOPPING).changed, false);
  assert.equal(settleState(RUN.STOPPING), RUN.STOPPED, 'a stopped run never reports as completed');
});

test('a normal finish is still a completion', () => {
  assert.equal(settleState(RUN.RUNNING), RUN.COMPLETED);
  assert.equal(settleState(RUN.RUNNING, { error: true }), RUN.FAILED);
});

test('staleness still reads D1 timestamps as UTC', () => {
  const now = new Date('2026-08-10T16:00:00Z');
  assert.equal(isStale({ state: RUN.RUNNING, heartbeat_at: '2026-08-10 15:59:00' }, { now }), false);
  assert.equal(isStale({ state: RUN.RUNNING, heartbeat_at: '2026-08-10 07:45:05' }, { now }), true);
  assert.equal(isStale({ state: RUN.COMPLETED, heartbeat_at: '2020-01-01 00:00:00' }, { now }), false);
});

// ── 31, 32, 33. Nothing about email moved ────────────────────────────────

test('sending, approval and the sequence are untouched', () => {
  const guard = readFileSync(new URL('../lib/send-guard.mjs', import.meta.url), 'latin1');
  assert.ok(guard.includes('AUTOMATION_OFF'));
  for (const f of ['../lib/send-guard.mjs', '../lib/send-runner.mjs', '../lib/approval.mjs']) {
    const s = readFileSync(new URL(f, import.meta.url), 'latin1');
    assert.ok(!s.includes('scanner-run'), `${f} must not depend on scanner recovery`);
  }
});

test('both send switches are still off by default', async () => {
  const { SEND_DEFAULTS } = await import('../lib/send-policy.mjs');
  assert.equal(SEND_DEFAULTS.autoSendApprovedFirstEmails, false);
  assert.equal(SEND_DEFAULTS.autoSendApprovedFollowups, false);
});


test('the reconcile action is reachable, which it was not', () => {
  // The deeper half of the root cause, found by calling it against production
  // rather than by reading it. The Hive calls reconcile with id 0, because the
  // action is about every run rather than one of them. The branch sat below
  // `if (!id) return 400`, so the only caller in the app had been receiving
  // "Which run?" since the day it was written, and the recovery code had never
  // executed once in any environment. Nothing failed loudly: the browser fired
  // it and forgot it.
  const route = src('../app/api/scanner-runs/route.js');
  const reconcileAt = route.indexOf("if (action === 'reconcile')");
  const guardAt = route.indexOf("if (!id) return NextResponse.json({ error: 'Which run?' }");
  assert.ok(reconcileAt > 0 && guardAt > 0);
  assert.ok(reconcileAt < guardAt, 'reconcile needs no run id and must sit above the guard that demands one');
});


test('the Hive itself shows a run that was closed, not just System health', () => {
  // The gap in the first pass. The abandoned copy existed in describe() and
  // System health rendered its own line, but the Hive page drew a run only
  // while this tab was the one driving it. A run that died in a previous
  // session left no trace on the page it was started from, and "Hive shows it
  // truthfully" was reported after checking the wrong surface.
  const hive = src('../components/ArmyPanel.jsx');
  assert.match(hive, /abandonedSummary/, 'and it uses the shared wording');
  assert.match(hive, /lastIncident/);
  assert.match(hive, /newest\.state !== RUN\.ABANDONED/, 'only for a run that was actually closed');

  // Everything the incident card has to answer.
  for (const field of ['Started', 'Last reported', 'Closed', 'Reason']) {
    assert.ok(hive.includes(`'${field}'`), `the details need ${field}`);
  }
  // Behind the disclosure, not in the headline.
  const headlineArea = hive.slice(hive.indexOf('{sum.headline}'), hive.indexOf('Technical details'));
  for (const jargon of ['ABANDONED', 'heartbeat_at', 'stop_reason', 'scanner_run']) {
    assert.ok(!headlineArea.includes(jargon), `${jargon} must not be in the visible summary`);
  }
});

test('the incident card cannot widen a phone', () => {
  const hive = src('../components/ArmyPanel.jsx');
  // End anchor follows the comment that opens whatever comes next: Chapter 9
  // replaced the loop strip, and without re-anchoring this slice ran on into
  // the workflow chips and read their (correct) whitespace-nowrap as a fault.
  const card = hive.slice(hive.indexOf('{lastIncident ? (()'), hive.indexOf('Lead workflow: the order'));
  assert.match(card, /break-words/, 'a reason string must wrap');
  assert.ok(!/min-w-\[\d{3,}px\]/.test(card), 'nothing in the card is pinned wide');
  assert.ok(!/whitespace-nowrap/.test(card), 'and nothing refuses to wrap');
});
