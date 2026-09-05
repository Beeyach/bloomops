import { test } from 'node:test';
import assert from 'node:assert/strict';
import { growthFor, leafAt, DUR, EASE, MAX_LEAVES } from '../lib/motion-tokens.mjs';

// The loader may only draw work that actually happened. These tests exist to
// keep the growth mapping honest, since the thing being replaced was an
// exponential curve pretending to be progress.

test('unknown-length work is never given a fraction', () => {
  const g = growthFor({ indeterminate: true });
  assert.equal(g.determinate, false);
  assert.equal(g.ratio, null, 'an Apify run has no honest percentage');
});

test('a missing total is treated as unknown, not as zero progress', () => {
  assert.equal(growthFor({ done: 3, total: 0 }).determinate, false);
  assert.equal(growthFor({}).determinate, false);
});

test('real steps map straight to the stem', () => {
  const g = growthFor({ done: 3, total: 6 });
  assert.equal(g.determinate, true);
  assert.equal(g.ratio, 0.5);
  assert.equal(g.stemPct, 50);
});

test('nothing done draws nothing', () => {
  const g = growthFor({ done: 0, total: 10 });
  assert.equal(g.stemPct, 0);
  assert.equal(g.leaves, 0);
});

test('finished work fills the stem exactly', () => {
  assert.equal(growthFor({ done: 8, total: 8 }).stemPct, 100);
});

test('progress can never exceed the work', () => {
  // A double-counted callback must not draw 140%.
  const g = growthFor({ done: 14, total: 10 });
  assert.equal(g.stemPct, 100);
  assert.equal(g.ratio, 1);
});

test('negative progress is floored, not rendered backwards', () => {
  assert.equal(growthFor({ done: -5, total: 10 }).stemPct, 0);
});

test('one leaf per completed step, capped', () => {
  assert.equal(growthFor({ done: 3, total: 10 }).leaves, 3);
  assert.equal(growthFor({ done: 200, total: 200 }).leaves, MAX_LEAVES, 'a 200-lead run must not draw 200 leaves');
});

test('leaves alternate sides and are unevenly spaced', () => {
  const a = leafAt(0), b = leafAt(1), c = leafAt(2);
  assert.notEqual(a.side, b.side, 'alternating sides read as a plant');
  const gap1 = b.pct - a.pct;
  const gap2 = c.pct - b.pct;
  assert.notEqual(gap1, gap2, 'even spacing reads as a decorated progress bar');
});

test('leaf lookup wraps instead of returning undefined', () => {
  const far = leafAt(99);
  assert.equal(typeof far.pct, 'number');
  assert.ok(far.pct > 0);
});

test('durations form a real scale rather than one value', () => {
  const vals = [DUR.instant, DUR.quick, DUR.base, DUR.settle, DUR.slow];
  const sorted = [...vals].sort((a, b) => a - b);
  assert.deepEqual(vals, sorted, 'tokens must ascend');
  assert.equal(new Set(vals).size, vals.length, 'the whole point is that they differ');
});

test('no token uses a browser default easing', () => {
  for (const [name, curve] of Object.entries(EASE)) {
    assert.match(curve, /^cubic-bezier\(/, `${name} must be an explicit curve`);
    assert.notEqual(curve, 'cubic-bezier(0.4, 0, 0.2, 1)', `${name} is the default this replaces`);
  }
});
