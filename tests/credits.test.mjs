import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceOf, PRICES, PRICE_LABELS, scanPrice, spendCredits, refundCredits, setCredits, loadCredits } from '../lib/credits.mjs';

// A tiny stand-in for D1: one settings row, same shape the real one has.
function fakeDb(initial = null) {
  let stored = initial;
  return {
    prepare(sql) {
      const isRead = /SELECT/i.test(sql);
      return {
        bind() { return this; },
        async first() { return isRead ? (stored ? { value: stored } : null) : null; },
        async run() { return {}; },
        _write(v) { stored = v; },
      };
    },
    get value() { return stored; },
    set value(v) { stored = v; },
  };
}

// The real writes go through prepare().bind().run(), which the fake cannot
// see, so wrap: spend/refund/set all read then write, and we assert on the
// returned values plus a live-tracking db.
function trackingDb(startBalance, { onRead = null } = {}) {
  let stored = JSON.stringify({ balance: startBalance, spentAllTime: 0 });
  const ledger = [];
  return {
    prepare(sql) {
      const read = /SELECT/i.test(sql);
      // Spending also writes a line to credit_events now. Treating every
      // non-SELECT as the settings write clobbered the balance with an action
      // name, which is the fake's fault rather than the code's, but it is the
      // kind of fault that would have hidden a real one.
      const isLedger = /credit_events/i.test(sql);
      // The balance write is conditional now: it only lands if the row still
      // holds the value the caller read. The fake has to model that, because a
      // fake that always says "written" cannot tell a working optimistic lock
      // from a broken one, and the whole point of the lock is what happens when
      // two writers race.
      const isSwap = /UPDATE settings/i.test(sql) && /value = \?$/m.test(sql.trim());
      let bound = [];
      return {
        bind(...args) { bound = args; return this; },
        async first() {
          if (!read) return null;
          // A hook for tests that need somebody else to commit in the window
          // between this read and the write that follows it.
          if (onRead) await onRead();
          return { value: stored };
        },
        async run() {
          if (read) return { meta: { changes: 0 } };
          if (isLedger) {
            ledger.push({ workspace: bound[0], action: bound[1], credits: bound[2], kind: bound[3], actor: bound[4] });
            return { meta: { changes: 1 } };
          }
          if (isSwap) {
            const [value, , expected] = bound;
            if (stored !== expected) return { meta: { changes: 0 } };  // somebody got there first
            stored = value;
            return { meta: { changes: 1 } };
          }
          // The unconditional writes that remain: the admin set, and the
          // first-ever insert.
          stored = bound[1];
          return { meta: { changes: 1 } };
        },
      };
    },
    read() { return JSON.parse(stored); },
    // Let a test act as the other worker.
    poke(next) { stored = JSON.stringify(next); },
    ledger() { return ledger; },
  };
}

// Every charge and refund now leaves a line behind, because the balance alone
// could answer "how much is left" and no other question worth asking.
test('a charge and its refund are both written to the ledger', async () => {
  const db = trackingDb(1000);
  await spendCredits(db, 'ary', 'precheck');
  await refundCredits(db, 'ary', PRICES.precheck, { action: 'precheck' });
  const rows = db.ledger();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].action, 'precheck');
  assert.equal(rows[0].credits, PRICES.precheck);
  assert.equal(rows[0].kind, 'charge');
  // Signed negative, so a period's net spend is one SUM.
  assert.equal(rows[1].credits, -PRICES.precheck);
  assert.equal(rows[1].kind, 'refund');
});

test('the ledger records who asked for the spend', async () => {
  const db = trackingDb(1000);
  await spendCredits(db, 'ary', 'precheck', 1, { actor: 'auto', prospectId: 7 });
  assert.equal(db.ledger()[0].actor, 'auto');
});

test('a ledger failure never costs the caller their charge', async () => {
  // The row is worth less than the job. A broken insert must not throw out of
  // spendCredits and lose a charge that already left the balance.
  const db = trackingDb(1000);
  const broken = {
    prepare(sql) {
      if (/credit_events/i.test(sql)) throw new Error('no such table');
      return db.prepare(sql);
    },
  };
  const r = await spendCredits(broken, 'ary', 'precheck');
  assert.equal(r.ok, true);
  assert.equal(r.balance, 1000 - PRICES.precheck);
});

test('every priced job has a price, and unknown jobs cost one', () => {
  for (const [job, price] of Object.entries(PRICES)) {
    assert.ok(price > 0, `${job} must cost something`);
    assert.equal(priceOf(job), price);
  }
  assert.equal(priceOf('something-new'), 1);
});

test('the price ladder matches what these jobs really cost', () => {
  // A scan buys a batch of leads from outside and is far and away the
  // dearest thing. A video is next. Everything a bee does is small change
  // beside both. Getting this order wrong is how a workspace burns real
  // money while the number it watches barely moves.
  // A scan is priced base-plus-per-result now, so the ladder is about what a
  // real scan totals, not about the base sitting in the table.
  assert.ok(scanPrice(50) > PRICES.video, 'a normal scan outcosts a video');
  assert.ok(scanPrice(100) > PRICES.video * 2, 'a big scan outcosts several');
  assert.ok(PRICES.video > PRICES.analyze, 'recording beats reading');
  assert.ok(PRICES.analyze > PRICES['reply-coach'], 'whole-pipeline beats one prospect');
  assert.ok(PRICES['reply-coach'] > PRICES['lead-score'], 'a prospect beats one lead');
});

test('spending takes exactly the price and reports the new balance', async () => {
  const db = trackingDb(1000);
  const r = await spendCredits(db, 'ary', 'video');
  assert.equal(r.ok, true);
  assert.equal(r.price, PRICES.video);
  assert.equal(r.balance, 1000 - PRICES.video);
  assert.equal(db.read().balance, 1000 - PRICES.video);
  assert.equal(db.read().spentAllTime, PRICES.video);
});

test('a balance that will not cover the job is left untouched', async () => {
  const db = trackingDb(5);
  const r = await spendCredits(db, 'ellen', 'video');
  assert.equal(r.ok, false);
  assert.equal(r.balance, 5);
  assert.equal(db.read().balance, 5, 'nothing may be taken on refusal');
});

test('spending several at once multiplies the price', async () => {
  const db = trackingDb(1000);
  const r = await spendCredits(db, 'ary', 'lead-score', 12);
  assert.equal(r.price, PRICES['lead-score'] * 12);
  assert.equal(r.balance, 1000 - PRICES['lead-score'] * 12);
});

test('a refund puts the credits back and undoes the spend', async () => {
  const db = trackingDb(1000);
  await spendCredits(db, 'ary', 'video');
  await refundCredits(db, 'ary', PRICES.video);
  assert.equal(db.read().balance, 1000);
  assert.equal(db.read().spentAllTime, 0);
});

test('an admin can set a balance, and it never goes negative', async () => {
  const db = trackingDb(10);
  assert.equal(await setCredits(db, 'ellen', 250), 250);
  assert.equal(db.read().balance, 250);
  assert.equal(await setCredits(db, 'ellen', -5), 0);
});

test('a workspace with no credits row starts at zero', async () => {
  const db = { prepare: () => ({ bind() { return this; }, async first() { return null; }, async run() {} }) };
  assert.deepEqual(await loadCredits(db, 'new'), { balance: 0, spentAllTime: 0 });
});

test('the price list only names prices that exist', () => {
  const known = new Set(Object.values(PRICES));
  for (const [label, price] of PRICE_LABELS) {
    assert.ok(label && typeof label === 'string');
    assert.ok(known.has(price), `${label} shows ${price}, which is nothing's price`);
  }
});

test('a scan is priced on the size asked for, not a flat fee', async () => {
  const { scanPrice, spendExact } = await import('../lib/credits.mjs');
  assert.equal(scanPrice(0), PRICES.scan, 'the base stands alone');
  assert.equal(scanPrice(50), PRICES.scan + PRICES['scan-result'] * 50);
  assert.ok(scanPrice(100) > scanPrice(20), 'more results must cost more');
  // And the exact-amount spend behaves like the fixed one.
  const db = trackingDb(1000);
  const r = await spendExact(db, 'ary', scanPrice(50));
  assert.equal(r.ok, true);
  assert.equal(db.read().balance, 1000 - scanPrice(50));
  const poor = trackingDb(10);
  const no = await spendExact(poor, 'ellen', scanPrice(100));
  assert.equal(no.ok, false);
  assert.equal(poor.read().balance, 10, 'nothing taken when it will not cover');
});

// ── Two workers spending at once ─────────────────────────────────────────
//
// This became reachable the moment scanner items started running in parallel.
// Before that the queue ran one job at a time and read-then-write was safe by
// accident rather than by design.
//
// The failure it prevents is quiet: two workers read the same balance, both
// subtract, and the second write erases the first. One of the two site checks
// is free. Nothing errors, no job fails, and the balance simply drifts away
// from the ledger with nobody the wiser.

test('a charge that lost a race is not silently thrown away', async () => {
  // Somebody else commits in the gap between this caller's read and its write.
  let interfered = false;
  const db = trackingDb(1000, {
    onRead: async () => {
      if (interfered) return;
      interfered = true;
      db.poke({ balance: 900, spentAllTime: 100 });   // the other worker won
    },
  });

  const r = await spendCredits(db, 'ary', 'video');   // 200

  assert.equal(r.ok, true, 'it retries rather than failing');
  // The point: it subtracted from 900, the number that actually won, not from
  // the 1000 it first read.
  assert.equal(db.read().balance, 900 - PRICES.video);
  assert.equal(db.read().spentAllTime, 100 + PRICES.video);
  assert.equal(r.balance, 900 - PRICES.video);
});

test('two charges at once both land, and neither is lost', async () => {
  const db = trackingDb(1000);
  const [a, b] = await Promise.all([
    spendCredits(db, 'ary', 'precheck', 1, { prospectId: 1 }),
    spendCredits(db, 'ary', 'precheck', 1, { prospectId: 2 }),
  ]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(db.read().balance, 1000 - PRICES.precheck * 2, 'both were charged');
  assert.equal(db.read().spentAllTime, PRICES.precheck * 2);
  assert.equal(db.ledger().length, 2, 'and the ledger agrees with the balance');
});

test('a race cannot spend a balance that only covers one of them', async () => {
  // The last 20 credits, wanted by two workers. Exactly one may have them:
  // the check and the write are the same attempt, so there is no window where
  // both see enough.
  const db = trackingDb(PRICES.precheck);
  const [a, b] = await Promise.all([
    spendCredits(db, 'ary', 'precheck'),
    spendCredits(db, 'ary', 'precheck'),
  ]);
  const won = [a, b].filter((r) => r.ok);
  assert.equal(won.length, 1, 'one of them, never both');
  assert.equal(db.read().balance, 0);
  assert.ok(db.read().balance >= 0, 'and it can never go below zero');
});

test('concurrent refunds do not erase each other', async () => {
  const db = trackingDb(1000);
  await spendCredits(db, 'ary', 'precheck');
  await spendCredits(db, 'ary', 'precheck');
  await Promise.all([
    refundCredits(db, 'ary', PRICES.precheck),
    refundCredits(db, 'ary', PRICES.precheck),
  ]);
  assert.equal(db.read().balance, 1000, 'both refunds are back');
  assert.equal(db.read().spentAllTime, 0);
});
