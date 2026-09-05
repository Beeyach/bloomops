// The blind spot the five-minute heartbeat left behind.
//
// The daily wake is the top of the chain. It wakes budget-parked jobs, queues
// each workspace's sweep, and renews the Gmail watches. If it stops, nothing
// new ever enters the queue — and a queue nothing enters drains perfectly, on
// time, for ever, reporting excellent health while the pipeline quietly
// starves. The drain being fine is exactly what hides it.
//
// So it gets its own row, its own threshold and its own words, and these tests
// are mostly about the two staying independent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1, migration } from './_d1.mjs';

import {
  SCHEDULER, DAILY_WAKE, SCHEDULER_STALE_MINUTES,
  DAILY_WAKE_HOUR_UTC, DAILY_WAKE_EVERY_HOURS, DAILY_WAKE_GRACE_HOURS, DAILY_WAKE_STALE_MINUTES,
  schedulerHealth, dailyWakeHealth,
  markSchedulerInvoked, markSchedulerCompleted, readSchedulerHeartbeat,
} from '../lib/scheduler-health.mjs';
import { systemHealth, HEALTH } from '../lib/system-health.mjs';
import { HEARTBEAT_STALE_MINUTES } from '../lib/scanner-run.mjs';

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// The real migrations, not a hand-copy. This fixture used to spell the table
// out inline and silently fell behind the moment a column was added, which is
// the drift the schema-drift guard exists to catch elsewhere.
const SCHEMA = [migration('052_system_heartbeats.sql'), migration('057_scheduler_stage_results.sql')].join(String.fromCharCode(10));
const db = () => d1([SCHEMA]);
const ago = (mins) => new Date(Date.now() - mins * 60_000).toISOString().replace('T', ' ').slice(0, 19);
const hours = (h) => h * 60;

// ── The producer ─────────────────────────────────────────────────────────

test('the daily wake stamps its own row, never the drain one', () => {
  const route = code('../app/api/cron/drain/route.js');
  const put = route.slice(route.indexOf('export async function PUT'));
  assert.match(put, /markSchedulerInvoked\(db, \{ name: DAILY_WAKE \}\)/);
  assert.match(put, /markSchedulerCompleted\(db, \{ name: DAILY_WAKE \}\)/);

  const post = route.slice(route.indexOf('export async function POST'), route.indexOf('export async function PUT'));
  assert.ok(!post.includes('DAILY_WAKE'), 'the five-minute drain must not write the daily row');
});

test('the daily wake stamps only after it has proved who it is', () => {
  const route = code('../app/api/cron/drain/route.js');
  const put = route.slice(route.indexOf('export async function PUT'));
  const auth = put.indexOf('Not authorised');
  const invoked = put.indexOf('markSchedulerInvoked(db, { name: DAILY_WAKE })');
  assert.ok(auth > 0 && invoked > auth, 'an unauthenticated PUT must never stamp it');
});

test('the retired wake claims completion honestly', () => {
  // The wake had three responsibilities; Ary retired all of them on
  // 2026-08-27 with the rest of the autonomous chain. Doing nothing IS its
  // job now, so stamping completed right after invoked is the truth, not a
  // shortcut - and nothing may sneak back in between the two stamps.
  const route = code('../app/api/cron/drain/route.js');
  const put = route.slice(route.indexOf('export async function PUT'));
  const invoked = put.indexOf('markSchedulerInvoked(db, { name: DAILY_WAKE })');
  const completed = put.indexOf('markSchedulerCompleted(db, { name: DAILY_WAKE })');
  assert.ok(invoked > 0 && completed > invoked, 'invoked, then completed');
  const between = put.slice(invoked, completed);
  for (const gone of ['wakeBudgetWaiters', 'KIND.SWEEP', 'renewWatches', 'enqueue(']) {
    assert.ok(!between.includes(gone), 'nothing revives ' + gone + ' between the stamps');
  }
});

test('nothing outside the scheduler can stamp either heartbeat', () => {
  for (const f of [
    'app/api/system-health/route.js', 'app/api/scanner-runs/route.js',
    'components/ArmyPanel.jsx', 'lib/runner.mjs', 'lib/scanner-items.mjs', 'lib/queue.mjs',
  ]) {
    const s = code(`../${f}`);
    assert.ok(!s.includes('markSchedulerInvoked'), `${f} must not stamp a heartbeat`);
    assert.ok(!s.includes('markSchedulerCompleted'), `${f} must not stamp a heartbeat`);
    assert.ok(!/INSERT INTO system_heartbeats|UPDATE system_heartbeats/.test(s), `${f} must not touch the table`);
  }
});

// ── Two rows, one table, no interference ─────────────────────────────────

test('the two heartbeats are independent rows in the existing table', async () => {
  const conn = db();
  await markSchedulerInvoked(conn);                        // the drain
  await markSchedulerInvoked(conn, { name: DAILY_WAKE });  // the daily wake
  await markSchedulerCompleted(conn);                      // the drain finishes

  const drain = await readSchedulerHeartbeat(conn);
  const daily = await readSchedulerHeartbeat(conn, { name: DAILY_WAKE });
  assert.ok(drain.completedAt, 'the drain completed');
  assert.equal(daily.completedAt, null, 'and that says nothing whatever about the daily wake');

  const rows = await conn.prepare(`SELECT COUNT(*) n FROM system_heartbeats`).first();
  assert.equal(rows.n, 2, 'one row each, no second table');
});

test('a stale daily wake does not make the drain look stale, or the reverse', () => {
  assert.equal(schedulerHealth({ invokedAt: ago(1), completedAt: ago(1) }).state, SCHEDULER.HEALTHY);
  assert.equal(dailyWakeHealth({ invokedAt: ago(hours(40)), completedAt: ago(hours(40)) }).state, SCHEDULER.STALE);

  assert.equal(schedulerHealth({ invokedAt: ago(120), completedAt: ago(120) }).state, SCHEDULER.STALE);
  assert.equal(
    dailyWakeHealth({ invokedAt: ago(60), completedAt: ago(60) }).state,
    SCHEDULER.HEALTHY,
    'an hour is nothing to a once-a-day schedule'
  );
});

// ── What the states mean ─────────────────────────────────────────────────

test('before the first wake it waits rather than crying outage', () => {
  const s = dailyWakeHealth({ invokedAt: null, completedAt: null });
  assert.equal(s.state, SCHEDULER.UNKNOWN);
  assert.equal(s.attention, false, 'the row only appears after the next 04:00');
  assert.match(s.headline, /Waiting for the first daily check-in/);
});

test('a wake from this morning is healthy', () => {
  const s = dailyWakeHealth({ invokedAt: ago(hours(6)), completedAt: ago(hours(6)) });
  assert.equal(s.state, SCHEDULER.HEALTHY);
  assert.equal(s.attention, false);
  assert.match(s.detail, /once a day, at 04:00 UTC/);
});

test('a whole missed day asks for attention, and says what it costs', () => {
  const s = dailyWakeHealth({ invokedAt: ago(hours(30)), completedAt: ago(hours(30)) });
  assert.equal(s.state, SCHEDULER.STALE);
  assert.equal(s.attention, true);
  // Not broken. Starved. That is the useful distinction.
  assert.match(s.detail, /no new work will be lined up/);
});

test('fired but never finished is its own answer here too', () => {
  const s = dailyWakeHealth({ invokedAt: ago(30), completedAt: ago(hours(40)) });
  assert.equal(s.state, SCHEDULER.INCOMPLETE);
  assert.equal(s.attention, true);
  assert.match(s.headline, /did not finish/);
});

// ── The threshold ────────────────────────────────────────────────────────

test('the daily threshold is derived from the daily cadence', () => {
  assert.equal(DAILY_WAKE_STALE_MINUTES, (DAILY_WAKE_EVERY_HOURS + DAILY_WAKE_GRACE_HOURS) * 60);
  assert.equal(DAILY_WAKE_STALE_MINUTES, 26 * 60, 'a day plus two hours of slack');
  assert.notEqual(DAILY_WAKE_STALE_MINUTES, SCHEDULER_STALE_MINUTES, 'not the drain rule');
  assert.notEqual(DAILY_WAKE_STALE_MINUTES, HEARTBEAT_STALE_MINUTES, 'and not the scanner rule');
  assert.match(code('../lib/scheduler-health.mjs'), /\(DAILY_WAKE_EVERY_HOURS \+ DAILY_WAKE_GRACE_HOURS\) \* 60/);
});

test('there is no hand-typed 26 anywhere it matters', () => {
  for (const f of ['../lib/scheduler-health.mjs', '../lib/system-health.mjs', '../app/api/system-health/route.js', '../app/api/cron/drain/route.js']) {
    const s = code(f);
    assert.ok(!/\b26\s*\*\s*60\b|\b1560\b/.test(s), `${f} must derive the threshold, not restate it`);
  }
});

test('the daily cron in wrangler.toml still matches the assumption', () => {
  const toml = src('../workers/bloomwired-review/wrangler.toml');
  const crons = toml.match(/crons\s*=\s*\[([^\]]*)\]/)?.[1] || '';
  assert.match(crons, /0 4 \* \* \*/, 'the daily wake runs at 04:00 UTC');
  assert.equal(DAILY_WAKE_HOUR_UTC, 4);
  assert.equal(DAILY_WAKE_EVERY_HOURS, 24, 'once a day');
});

test('the Worker routes the daily schedule to the daily path', () => {
  const worker = src('../workers/bloomwired-review/src/index.js');
  // It matches the DRAIN rather than the daily one, so moving the daily
  // schedule can never silently turn it into a second drain.
  assert.match(worker, /!==\s*'\*\/5 \* \* \* \*'/);
  assert.match(worker, /method: daily \? 'PUT' : 'POST'/);
});

// ── Severity ─────────────────────────────────────────────────────────────

test('a stale daily wake leads the page, because a quiet queue is its symptom', () => {
  const h = systemHealth({
    queue: { queued: 0 }, attention: [],
    scheduler: { attention: false, state: SCHEDULER.HEALTHY },
    dailyWake: { attention: true, state: SCHEDULER.STALE, headline: 'The daily wake has not checked in', detail: 'x' },
  });
  assert.equal(h.state, HEALTH.ATTENTION);
  assert.match(h.headline, /daily wake has not checked in/);
  assert.equal(h.dailyWake, SCHEDULER.STALE);
});

test('a healthy daily wake hides nothing underneath it', () => {
  const h = systemHealth({
    queue: { queued: 0 }, attention: [{ id: 1 }],
    scheduler: { attention: false, state: SCHEDULER.HEALTHY },
    dailyWake: { attention: false, state: SCHEDULER.HEALTHY },
  });
  assert.match(h.headline, /could not finish/, 'the real job failure still surfaces');
});

test('when both schedules are down, the cron itself is the story', () => {
  const h = systemHealth({
    queue: {}, attention: [],
    scheduler: { attention: true, state: SCHEDULER.STALE, headline: 'The background scheduler has not checked in', detail: 'x' },
    dailyWake: { attention: true, state: SCHEDULER.STALE, headline: 'The daily wake has not checked in', detail: 'y' },
  });
  assert.match(h.headline, /background scheduler/, 'one warning, and the simpler explanation');
});

test('a first-run daily wake never raises attention', () => {
  const h = systemHealth({
    queue: {}, attention: [],
    scheduler: { attention: false, state: SCHEDULER.HEALTHY },
    dailyWake: { attention: false, state: SCHEDULER.UNKNOWN },
  });
  assert.equal(h.state, HEALTH.IDLE, 'a fresh deploy is not an outage');
});

// ── Health output, and cost ──────────────────────────────────────────────

test('health reports both signals separately and still writes nothing', () => {
  const route = code('../app/api/system-health/route.js');
  assert.match(route, /dailyWake,/);
  assert.match(route, /readSchedulerHeartbeat\(db, \{ name: DAILY_WAKE \}\)/);
  assert.match(route, /scheduler,/, 'and the drain is still its own line');
  assert.equal(/\b(INSERT|UPDATE|DELETE)\b/i.test(route), false, 'still read-only');
  for (const secret of ['CRON_SECRET', 'x-cron-secret']) {
    assert.ok(!route.includes(secret), `${secret} must never reach the health output`);
  }
});

test('the daily wake is a heartbeat and nothing else', () => {
  const route = code('../app/api/cron/drain/route.js');
  const put = route.slice(route.indexOf('export async function PUT'));
  for (const forbidden of ['spendCredits', 'recordAutoSpend', 'askBackground', 'runPrecheck',
    'wakeBudgetWaiters', 'KIND.SWEEP', 'renewWatches', 'enqueue(']) {
    assert.ok(!put.includes(forbidden), 'the daily wake must not ' + forbidden);
  }
});

test('no new table was added for this', () => {
  const sql = src('../migrations/052_system_heartbeats.sql');
  assert.match(sql, /name TEXT PRIMARY KEY/, 'named rows were already supported');

  // The property is one table and one reader, not one SELECT statement.
  //
  // This used to count occurrences of `FROM system_heartbeats` and expect
  // exactly one, which broke the moment a deliberate fallback read was added
  // for the window between a deployment and migration 057. That fallback is a
  // second query against the same table, not a second mechanism, and counting
  // statements could not tell the difference.
  const lib = code('../lib/scheduler-health.mjs');
  // `DO UPDATE SET` in the upsert matches "UPDATE <word>" too, and SET is a
  // keyword rather than a table.
  const KEYWORDS = new Set(['SET']);
  const tables = new Set(
    (lib.match(/(?:FROM|INTO|UPDATE)\s+(\w+)/g) || [])
      .map((m) => m.split(/\s+/)[1])
      .filter((t) => !KEYWORDS.has(t.toUpperCase()))
  );
  assert.deepEqual([...tables], ['system_heartbeats'], 'only ever this one table');

  // And exactly one exported way to read it.
  const readers = (lib.match(/export\s+(?:async\s+)?function\s+read\w*Heartbeat/g) || []);
  assert.equal(readers.length, 1, 'one exported reader');

  // Later migrations may add columns; none may add another heartbeat table.
  for (const name of ['057_scheduler_stage_results.sql']) {
    const later = src(`../migrations/${name}`);
    assert.doesNotMatch(later, /CREATE TABLE/i, `${name} extends the table rather than adding one`);
  }
});
