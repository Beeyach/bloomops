// Did the cron actually fire?
//
// Nothing could say. Health inferred it from jobs moving, mailboxes syncing and
// scanner runs progressing, and all three are ambiguous when the answer is
// "nothing changed": the scheduler ran and found nothing to do, or everything
// was waiting on something, or it has not fired since Tuesday. Same picture,
// and only one of them is a problem.
//
// So the drain writes down that it was called. The tests that matter here are
// less about the arithmetic and more about who is allowed to write it: a
// heartbeat that anything else can stamp is a heartbeat that says "healthy"
// because somebody opened a page.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1, migration } from './_d1.mjs';

import {
  SCHEDULER, CRON_DRAIN, CRON_EVERY_MINUTES, SCHEDULER_STALE_MINUTES,
  schedulerHealth, markSchedulerInvoked, markSchedulerCompleted, readSchedulerHeartbeat,
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
const beat = (conn) => conn.prepare(`SELECT * FROM system_heartbeats WHERE name = ?`).bind(CRON_DRAIN).first();

// ── 1-5. Only the scheduler may say the scheduler ran ────────────────────

test('the drain stamps the heartbeat, after the secret and before the work', () => {
  const route = code('../app/api/cron/drain/route.js');
  const auth = route.indexOf('Not authorised');
  // The call, not the import at the top of the file.
  const invoked = route.indexOf('markSchedulerInvoked(db)');
  // The drain's first work since the reconcile moved to the daily wake.
  const firstWork = route.indexOf('reconcileScannerRuns(db)');
  assert.ok(auth > 0 && invoked > auth, 'an unauthenticated request must never stamp it');
  assert.ok(invoked > 0 && firstWork > 0 && invoked < firstWork, 'it means the cron fired, not that the work succeeded');
});

test('completion is written only at the end, never on a failure path', () => {
  const route = code('../app/api/cron/drain/route.js');
  // The call, not the import.
  const completed = route.indexOf('markSchedulerCompleted(db)');
  const response = route.indexOf('ok: true,');
  assert.ok(completed > 0 && response > completed, 'last thing before the answer');
  // Not inside a catch BLOCK. `.catch(...)` on a neighbouring promise is a
  // different thing entirely and there are several of those about.
  const around = route.slice(completed - 400, completed);
  assert.ok(!/\}\s*catch\s*[({]/.test(around), 'a drain that threw has not completed');
  // And the stamp is on the main path, after the work rather than beside it.
  assert.ok(completed > route.indexOf('runScannerLane(db'), 'stamped only once the drain has done its round');
});

test('nothing else in the app writes the heartbeat', () => {
  const writers = ['markSchedulerInvoked', 'markSchedulerCompleted'];
  const allowed = new Set(['lib/scheduler-health.mjs', 'app/api/cron/drain/route.js']);
  for (const f of [
    'app/api/system-health/route.js', 'app/api/scanner-runs/route.js',
    'components/ArmyPanel.jsx', 'lib/runner.mjs', 'lib/scanner-items.mjs', 'lib/queue.mjs',
  ]) {
    const s = code(`../${f}`);
    for (const w of writers) {
      assert.ok(!s.includes(w), `${f} must not stamp the scheduler heartbeat`);
      assert.ok(allowed.size > 0);
    }
    // And nothing writes the table by hand either.
    assert.ok(!/INSERT INTO system_heartbeats|UPDATE system_heartbeats/.test(s), `${f} must not touch the table`);
  }
});

test('the health page only ever reads it', () => {
  const route = code('../app/api/system-health/route.js');
  assert.match(route, /readSchedulerHeartbeat/);
  assert.equal(/\b(INSERT|UPDATE|DELETE)\b/i.test(route), false, 'still read-only');
});

test('invoked and completed are two different facts', async () => {
  const conn = db();
  await markSchedulerInvoked(conn);
  const one = await beat(conn);
  assert.ok(one.last_invoked_at);
  assert.equal(one.last_completed_at, null, 'firing is not finishing');

  await markSchedulerCompleted(conn);
  const two = await beat(conn);
  assert.ok(two.last_completed_at, 'and finishing is recorded separately');

  const read = await readSchedulerHeartbeat(conn);
  assert.ok(read.invokedAt && read.completedAt);
});

// ── 6-10. What it means, and what it does not ────────────────────────────

test('an empty queue does not make the scheduler look ill', () => {
  const s = schedulerHealth({ invokedAt: ago(1), completedAt: ago(1) });
  assert.equal(s.state, SCHEDULER.HEALTHY);
  assert.equal(s.attention, false);
  // The queue is not mentioned at all: this signal is about the cron, nothing
  // downstream of it.
  assert.equal(/queue|job/i.test(s.detail), false);
});

test('a drain that fired and failed everything still has a healthy scheduler', () => {
  // Deliberate separation. A cron firing on time while every job it touches
  // fails is a healthy scheduler and a queue full of problems, and fixing the
  // wrong one of those wastes a day.
  const s = schedulerHealth({ invokedAt: ago(2), completedAt: ago(2) });
  assert.equal(s.state, SCHEDULER.HEALTHY);
});

test('silence past the threshold is the one thing that asks for attention', () => {
  const s = schedulerHealth({ invokedAt: ago(SCHEDULER_STALE_MINUTES + 5), completedAt: ago(SCHEDULER_STALE_MINUTES + 5) });
  assert.equal(s.state, SCHEDULER.STALE);
  assert.equal(s.attention, true);
  // Says what it means for her, and that nothing is lost.
  assert.match(s.detail, /Nothing has been lost/);
});

test('firing but never finishing is its own answer', () => {
  const s = schedulerHealth({ invokedAt: ago(1), completedAt: ago(90) });
  assert.equal(s.state, SCHEDULER.INCOMPLETE);
  assert.equal(s.attention, true);
  assert.match(s.headline, /not finishing/);
});

test('a brand new deployment says so rather than crying wolf', () => {
  const s = schedulerHealth({ invokedAt: null, completedAt: null });
  assert.equal(s.state, SCHEDULER.UNKNOWN);
  assert.equal(s.attention, false, 'a fresh deploy is not an outage');
});

// ── 11-14. The threshold ─────────────────────────────────────────────────

test('the cadence constant matches the cron that is actually configured', () => {
  const toml = src('../workers/bloomwired-review/wrangler.toml');
  const crons = toml.match(/crons\s*=\s*\[([^\]]*)\]/)?.[1] || '';
  assert.match(crons, /\*\/5 \* \* \* \*/, 'the drain runs every five minutes');
  assert.equal(CRON_EVERY_MINUTES, 5, 'and the constant says the same');
});

test('the threshold is derived from the cadence, not typed', () => {
  assert.equal(SCHEDULER_STALE_MINUTES, CRON_EVERY_MINUTES * 2 + 2);
  const lib = code('../lib/scheduler-health.mjs');
  assert.match(lib, /CRON_EVERY_MINUTES \* 2 \+ 2/);
  // One late run is not news.
  assert.equal(schedulerHealth({ invokedAt: ago(CRON_EVERY_MINUTES + 1), completedAt: ago(CRON_EVERY_MINUTES + 1) }).state, SCHEDULER.HEALTHY);
});

test('the scanner threshold is left alone', () => {
  // Different question, different number. Fifteen minutes of scanner silence
  // and twelve of scheduler silence mean different things.
  assert.notEqual(SCHEDULER_STALE_MINUTES, HEARTBEAT_STALE_MINUTES);
  const lib = code('../lib/scheduler-health.mjs');
  assert.ok(!lib.includes('HEARTBEAT_STALE_MINUTES'), 'the scanner rule is not borrowed');
});

test('there is no second copy of the stale number anywhere', () => {
  for (const f of ['../app/api/system-health/route.js', '../lib/system-health.mjs', '../app/api/cron/drain/route.js']) {
    const s = code(f);
    assert.ok(!/SCHEDULER_STALE_MINUTES\s*=/.test(s), `${f} must import it, not redefine it`);
  }
});

// ── 15-20. One outage, one warning ───────────────────────────────────────

test('a stale scheduler leads, because everything else is its symptom', () => {
  const h = systemHealth({
    queue: { queued: 40, running: 0 },
    attention: [{ id: 1 }, { id: 2 }],
    scheduler: { attention: true, state: SCHEDULER.STALE, headline: 'The background scheduler has not checked in', detail: 'x' },
  });
  assert.equal(h.state, HEALTH.ATTENTION);
  assert.match(h.headline, /scheduler has not checked in/, 'the cause, not the three symptoms');
  assert.equal(h.scheduler, SCHEDULER.STALE);
});

test('a healthy scheduler does not mask a real problem underneath it', () => {
  const h = systemHealth({
    queue: { queued: 1 },
    attention: [{ id: 1 }],
    scheduler: { attention: false, state: SCHEDULER.HEALTHY },
  });
  assert.equal(h.state, HEALTH.ATTENTION);
  assert.match(h.headline, /could not finish/, 'the job failure still surfaces');
});

test('waiting for capacity or budget is never the scheduler failing', () => {
  const h = systemHealth({
    queue: { queued: 0, waitingBudget: 5 },
    attention: [],
    scheduler: { attention: false, state: SCHEDULER.HEALTHY },
  });
  assert.equal(h.state, HEALTH.WAITING);
  assert.match(h.headline, /budget/i);
});

test('an idle queue with a live scheduler is simply quiet', () => {
  const h = systemHealth({ queue: {}, attention: [], scheduler: { attention: false, state: SCHEDULER.HEALTHY } });
  assert.equal(h.state, HEALTH.IDLE);
});

test('a dead service still outranks the scheduler', () => {
  const h = systemHealth({
    queue: {}, attention: [],
    services: [{ label: 'Mailbox sync', state: 'DOWN' }],
    scheduler: { attention: true, state: SCHEDULER.STALE, headline: 'x', detail: 'y' },
  });
  assert.equal(h.state, HEALTH.DEGRADED);
});

test('health reports the scheduler and never a secret', () => {
  const route = code('../app/api/system-health/route.js');
  assert.match(route, /scheduler,/);
  for (const secret of ['CRON_SECRET', 'RENDER_SECRET', 'x-cron-secret']) {
    assert.ok(!route.includes(secret), `${secret} must never reach the health output`);
  }
});

// ── 21-23. Cost and scope ────────────────────────────────────────────────

test('stamping costs one tiny write and nothing else', () => {
  const lib = code('../lib/scheduler-health.mjs');
  for (const forbidden of ['spendCredits', 'recordAutoSpend', 'canSpendAutomatically', 'enqueue(', 'askBackground', 'fetch(', 'FROM prospects', 'FROM scanner_run_items']) {
    assert.ok(!lib.includes(forbidden), `the heartbeat must never ${forbidden}`);
  }
});

test('it is one row, not a history of every cron run', () => {
  const sql = src('../migrations/052_system_heartbeats.sql');
  assert.match(sql, /name TEXT PRIMARY KEY/, 'one row per schedule, overwritten');
  const lib = code('../lib/scheduler-health.mjs');
  assert.match(lib, /ON CONFLICT\(name\) DO UPDATE/);
});

test('the cron is global, so the heartbeat is too', () => {
  const sql = src('../migrations/052_system_heartbeats.sql');
  assert.ok(!/workspace/i.test(sql.replace(/^--.*$/gm, '')), 'one Worker, one schedule, no per-workspace fiction');
});

test('the build marker is still there', () => {
  const route = code('../app/api/system-health/route.js');
  assert.match(route, /CF_PAGES_COMMIT_SHA/);
  assert.match(route, /build,/);
});
