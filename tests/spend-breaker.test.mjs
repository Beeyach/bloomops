// The spend breaker: the difference between an alert and a stop.
//
// Cloudflare usage alerts announce a burn after the money is gone and stop
// nothing. These pin the machinery that actually stops one: a pause flag the
// drain reads before any work, a tripwire the drain pulls on itself, and one
// flag both hands share so there is exactly one way to be paused.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ROWS_TRIPWIRE, AUTONOMY_FLAG, tripIfBurning } from '../lib/spend-breaker.mjs';

const src = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('both schedules check the flag before any work, and a paused one does none', () => {
  const drain = src('app/api/cron/drain/route.js');
  const put = drain.indexOf('export async function PUT');
  assert.ok(put > 0, 'the daily wake exists');

  // The five-minute drain: heartbeat, then the flag, then jobs.
  const post = drain.slice(0, put);
  const pausedAt = post.indexOf('autonomyPaused(db)');
  const firstWork = post.indexOf('reconcileScannerRuns(db)');
  assert.ok(pausedAt > 0 && pausedAt < firstWork, 'the breaker is read before the first work');
  const invoked = post.indexOf('markSchedulerInvoked(db)');
  assert.ok(invoked < pausedAt, 'the heartbeat still stamps, so a paused app never looks like an outage');

  // The daily wake: same order around its own work.
  const daily = drain.slice(put);
  const dailyPaused = daily.indexOf('autonomyPaused(db)');
  const dailyWork = daily.indexOf('reconcileProspectFacts(db)');
  assert.ok(dailyPaused > 0 && dailyPaused < dailyWork, 'the daily bookkeeping waits with everything else');
});

test('the heavy bookkeeping runs once a day, not every five minutes', () => {
  // The reconcile read tens of thousands of rows per pass to find nothing
  // drifted, 288 times a day — most of the app's D1 reads spent proving a
  // negative. Replies land on the prospect row at ingest time, so daily is
  // enough for a drift net, and the tripwire moved with the only pass that
  // still reads at scale.
  const drain = src('app/api/cron/drain/route.js');
  const put = drain.indexOf('export async function PUT');
  const post = drain.slice(0, put);
  assert.ok(!post.includes('reconcileProspectFacts(db)'), 'the five-minute drain does no reconcile');
  assert.ok(!post.includes('tripIfBurning('), 'and carries no meter to hand the wire');
  const daily = drain.slice(put);
  assert.ok(daily.includes('reconcileProspectFacts(db)'), 'the daily wake owns the reconcile');
  assert.ok(daily.includes('tripIfBurning(db, prospectFacts.rowsRead'), 'and hands its meter to the wire');
});

test('the tripwire is unambiguous: 50x normal, 12x under the burns', () => {
  // Normal bookkeeping reads 20-40K rows; both 2026 burns read ~24.5M per
  // run. The wire sits where neither side can touch it by drifting.
  assert.equal(ROWS_TRIPWIRE, 2_000_000);
  const facts = src('lib/prospect-facts.mjs');
  assert.match(facts, /rows_read/, 'the pass meters its own reads');
  const drain = src('app/api/cron/drain/route.js');
  assert.ok(drain.includes('tripIfBurning(db, prospectFacts.rowsRead'), 'the drain hands its meter to the wire');
});

test('a quiet run never trips; a burn-sized run always does', async () => {
  const writes = [];
  const db = {
    prepare: (sql) => ({ bind: (...args) => ({ run: async () => { writes.push({ sql, args }); } }) }),
  };
  assert.equal(await tripIfBurning(db, 40_000), false);
  assert.equal(writes.length, 0, 'a normal run writes nothing');
  assert.equal(await tripIfBurning(db, 24_500_000), true);
  assert.equal(writes.length, 1, 'a burn writes the pause flag');
  assert.ok(writes[0].args.includes(AUTONOMY_FLAG));
  assert.ok(writes[0].args.some((a) => String(a).includes('self-tripped')));
});

test('pausing pauses sending too, and the migration exists', () => {
  const drain = src('app/api/cron/drain/route.js');
  const pausedReturn = drain.indexOf('paused: true');
  const jobs = drain.indexOf('KIND.SEND_APPROVED');
  assert.ok(pausedReturn > 0 && pausedReturn < jobs, 'the paused return comes before any job runs');
  const mig = src('migrations/059_system_flags.sql');
  assert.match(mig, /CREATE TABLE IF NOT EXISTS system_flags/);
  assert.match(mig, /name TEXT PRIMARY KEY/);
});

test('both hands hold the same flag', () => {
  const route = src('app/api/system-pause/route.js');
  assert.match(route, /setAutonomyPaused/);
  assert.match(route, /getWorkspace/, 'the handle is behind her session, not open to the internet');
  const breaker = src('lib/spend-breaker.mjs');
  assert.equal((breaker.match(/AUTONOMY_FLAG/g) || []).length >= 3, true, 'one flag name, used everywhere');
});
