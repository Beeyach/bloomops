import test from 'node:test';
import assert from 'node:assert/strict';
import { feedResearch } from '../lib/runner.mjs';

// The feeder is the thing that makes "automatic research is on" mean anything.
// Before it existed the sweep only ever enqueued deferred prospects, so the
// daily credit ceiling was guarding an empty queue and nothing was ever
// researched without somebody clicking.
//
// Its one hard rule: never feed more than today's allowance can pay for.
// Over-feeding does not research more prospects, it builds a backlog of jobs
// waiting on budget that grows every day and never drains.

// A fake D1 that answers by matching the SQL. Small on purpose: this pins the
// batch-size arithmetic and the ordering, nothing else.
function fakeDb({ limits, spentToday = 0, balance = 10_000, prospects = [] }) {
  const inserted = [];
  let lastSelect = null;
  return {
    inserted,
    get lastSelect() { return lastSelect; },
    prepare(sql) {
      return {
        bind(...binds) {
          return {
            async first() {
              if (/key = 'auto_limits'/.test(sql)) return { value: JSON.stringify(limits) };
              if (/key = 'credits'/.test(sql)) return { value: JSON.stringify({ balance }) };
              if (/FROM auto_spend/.test(sql)) return { spent: spentToday };
              return null;
            },
            async all() {
              if (/FROM prospects/.test(sql)) {
                lastSelect = { sql, binds };
                const take = Number(binds[binds.length - 1]) || 0;
                return { results: prospects.slice(0, take) };
              }
              return { results: [] };
            },
            async run() {
              if (/INSERT INTO jobs/.test(sql)) inserted.push(binds);
              return { meta: { last_row_id: inserted.length, changes: 1 } };
            },
          };
        },
      };
    },
  };
}

const ON = { autoVet: true, autoCreditsPerDay: 160, maxCreditsPerProspect: 120, reserveCredits: 500, maxProspectsPerRun: 25 };
const rows = Array.from({ length: 40 }, (_, i) => ({ id: i + 1 }));

test('switched off means nothing is queued, with a reason', async () => {
  const db = fakeDb({ limits: { ...ON, autoVet: false }, prospects: rows });
  const r = await feedResearch(db, 'ary');
  assert.equal(r.queued, 0);
  assert.match(r.reason, /switched off/i);
  assert.equal(db.inserted.length, 0);
});

test('the batch is what the day can pay for, not a round number', async () => {
  // 160 credits a day, 20 a probe. Eight, never twenty-five.
  const db = fakeDb({ limits: ON, prospects: rows });
  const r = await feedResearch(db, 'ary');
  assert.equal(r.affordable, 8);
  assert.equal(r.queued, 8);
});

test('what was already spent today comes off the batch', async () => {
  const db = fakeDb({ limits: ON, spentToday: 120, prospects: rows });
  const r = await feedResearch(db, 'ary');
  assert.equal(r.queued, 2, '40 credits left buys two probes');
});

test('a spent allowance queues nothing rather than a backlog', async () => {
  const db = fakeDb({ limits: ON, spentToday: 160, prospects: rows });
  const r = await feedResearch(db, 'ary');
  assert.equal(r.queued, 0);
  assert.match(r.reason, /resets tomorrow/i);
  assert.equal(db.inserted.length, 0, 'not one job may be left waiting on a budget that is gone');
});

test('the reserve stops it even when the daily allowance is untouched', async () => {
  // 520 credits with a 500 reserve leaves 20: exactly one probe.
  const db = fakeDb({ limits: ON, balance: 520, prospects: rows });
  const r = await feedResearch(db, 'ary');
  assert.equal(r.queued, 1);

  const empty = fakeDb({ limits: ON, balance: 500, prospects: rows });
  const r2 = await feedResearch(empty, 'ary');
  assert.equal(r2.queued, 0);
  assert.match(r2.reason, /reserve/i);
});

test('the per-run cap still applies when the budget is large', async () => {
  const db = fakeDb({ limits: { ...ON, autoCreditsPerDay: 100_000 }, balance: 200_000, prospects: rows });
  const r = await feedResearch(db, 'ary');
  assert.equal(r.queued, 25, 'one run never fans out across a whole import');
});

test('it asks for prospects with no evidence, best-rated first', async () => {
  const db = fakeDb({ limits: ON, prospects: rows });
  await feedResearch(db, 'ary');
  const { sql } = db.lastSelect;
  assert.match(sql, /site_intel IS NULL/, 'a probed prospect must never be re-bought');
  assert.match(sql, /own_findings IS NULL OR own_findings = ''/, 'what Ary saw herself counts as evidence');
  assert.match(sql, /do_not_contact = 0/);
  assert.match(sql, /unsubscribed = 0/);
  assert.match(sql, /domain IS NOT NULL/, 'nothing to check without a site');
  assert.match(sql, /ORDER BY COALESCE\(rating, 0\) DESC/, 'her own rating decides who gets the day');
});

test('every queued job is a prescreen, which is free', async () => {
  // The paid stage is three jobs downstream and gates itself. Feeding the free
  // stage is what keeps a bad batch from costing anything.
  const db = fakeDb({ limits: ON, prospects: rows });
  await feedResearch(db, 'ary');
  for (const binds of db.inserted) {
    assert.equal(binds[1], 'prescreen');
  }
});

test('research goes to people she is already writing to, not the newest import', () => {
  // The first real run sent all eight probes to the newest raw imports: no
  // name, no contact, and two of them 404s. Almost nothing in a 5,000-row
  // import is rated, so the tiebreak was deciding everything and `id DESC` is
  // the speculative end of the list.
  const db = fakeDb({ limits: ON, prospects: rows });
  return feedResearch(db, 'ary').then(() => {
    const { sql } = db.lastSelect;
    const order = sql.slice(sql.indexOf('ORDER BY'));
    assert.ok(order.indexOf('rating') < order.indexOf('emails_sent'), 'her judgment outranks everything');
    assert.ok(order.indexOf('emails_sent') < order.indexOf('email IS NOT NULL'), 'already in the sequence beats merely contactable');
    assert.ok(order.indexOf('email IS NOT NULL') < order.indexOf('id DESC'), 'import order is the last resort, not the first');
  });
});
