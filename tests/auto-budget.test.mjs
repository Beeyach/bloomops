import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sanitizeAutoLimits, canSpendAutomatically, estimateCost, DEFAULT_AUTO_LIMITS,
} from '../lib/auto-budget.mjs';

// A human clicking a button is its own rate limit. Automation is not, and the
// failure mode is specific: import 20,000 prospects, decide each deserves a
// site probe, and that is 400,000 credits before anybody notices.

// Minimal stand-in for the D1 handle. Only autoSpentToday reads it.
const fakeDb = (spentToday = 0) => ({
  prepare() {
    return {
      bind() { return this; },
      first: async () => ({ spent: spentToday }),
      run: async () => ({}),
    };
  },
});

const ON = { ...DEFAULT_AUTO_LIMITS, autoVet: true };

test('automation is off until somebody turns it on', () => {
  assert.equal(DEFAULT_AUTO_LIMITS.autoVet, false);
});

test('nothing spends while automatic research is off', async () => {
  const r = await canSpendAutomatically(fakeDb(), 'ary', { credits: 20, balance: 100000 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'disabled');
});

test('a normal job passes', async () => {
  const r = await canSpendAutomatically(fakeDb(0), 'ary', { credits: 20, balance: 100000, limits: ON });
  assert.equal(r.ok, true);
});

test('the daily allowance stops a runaway import', async () => {
  // 20,000 prospects at 20 credits each is the scenario this exists for.
  const r = await canSpendAutomatically(fakeDb(600), 'ary', { credits: 20, balance: 500000, limits: ON });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'daily');
  assert.match(r.reason, /resets tomorrow/);
  // And it says the manual path is unaffected, because a person hitting a wall
  // they did not set needs to know what still works.
  assert.match(r.reason, /run by hand is unaffected/);
});

test('one pathological prospect cannot eat the day', async () => {
  const r = await canSpendAutomatically(fakeDb(0), 'ary', {
    credits: 20, balance: 100000, limits: ON, prospectSpend: 110,
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'per-prospect');
  assert.match(r.reason, /needs a person/);
});

test('background work never spends the last of the balance', async () => {
  // She should never open the app to find a background job took the credits
  // she was about to use answering somebody.
  const r = await canSpendAutomatically(fakeDb(0), 'ary', { credits: 20, balance: 510, limits: ON });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'reserve');
});

test('spending right up to the reserve is allowed, one credit past is not', async () => {
  const at = await canSpendAutomatically(fakeDb(0), 'ary', { credits: 100, balance: 600, limits: ON });
  assert.equal(at.ok, true, '600 - 100 = 500, exactly the reserve');
  const past = await canSpendAutomatically(fakeDb(0), 'ary', { credits: 101, balance: 600, limits: ON });
  assert.equal(past.ok, false);
});

test('limits are sanitised, and nonsense falls back to the safe default', () => {
  const l = sanitizeAutoLimits({ autoVet: 'yes', autoCreditsPerDay: -5, maxProspectsPerRun: 'lots' });
  assert.equal(l.autoVet, false, 'only a real boolean turns it on');
  assert.equal(l.autoCreditsPerDay, DEFAULT_AUTO_LIMITS.autoCreditsPerDay);
  assert.equal(l.maxProspectsPerRun, DEFAULT_AUTO_LIMITS.maxProspectsPerRun);
});

test('limits are capped so a typo cannot remove the ceiling', () => {
  const l = sanitizeAutoLimits({ autoVet: true, autoCreditsPerDay: 99_999_999 });
  assert.ok(l.autoCreditsPerDay <= 100_000);
});

test('an unpriced job is costed high, never free', () => {
  // A job nobody priced must not slip past the budget because of it.
  assert.ok(estimateCost('something-new') >= 100);
  assert.equal(estimateCost('precheck', { count: 3 }), 60);
  assert.ok(estimateCost('video') > estimateCost('precheck'));
});

test('the draft budget is small, and separate from the research budget', () => {
  // A probe costs credits. A draft costs credits AND a slot in a worklist
  // somebody has to read. 87 prospects are due on an ordinary day and 87
  // drafts waiting for approval is a wall, not a morning's work.
  const l = sanitizeAutoLimits({});
  assert.equal(l.maxDraftsPerDay, 10);
  assert.ok(l.maxDraftsPerDay < l.maxProspectsPerRun, 'never write more than the run touches');
  assert.equal(sanitizeAutoLimits({ maxDraftsPerDay: 5000 }).maxDraftsPerDay, 200, 'capped');
  assert.equal(sanitizeAutoLimits({ maxDraftsPerDay: -3 }).maxDraftsPerDay, 10, 'nonsense falls back');
  assert.equal(sanitizeAutoLimits({ maxDraftsPerDay: 0 }).maxDraftsPerDay, 0, 'zero is a real answer: write none');
});
