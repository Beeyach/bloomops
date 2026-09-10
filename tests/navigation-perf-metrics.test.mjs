import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginInvocation, completeSample } from '../scripts/navigation-perf-metrics.mjs';
const statement = { kind: 'page', bindings: 3, bytes: 120 };

test('parallel statements are distinct invocations but one depth; overlapping D1 wait is counted once', () => {
  const sample = { queries: [] };
  const a = beginInvocation(sample, [statement], 10), b = beginInvocation(sample, [statement], 20);
  a.durationMs = 100; b.durationMs = 150;
  completeSample(sample, 200);
  assert.equal(sample.statements, 2); assert.equal(sample.invocations, 2); assert.equal(sample.depth, 1);
  assert.equal(sample.d1WaitMs, 160); assert.equal(sample.nonD1ElapsedMs, 40);
});

test('native batch statement count is not invocation count and dependent stages remain visible', () => {
  const sample = { queries: [] };
  beginInvocation(sample, [statement], 0).durationMs = 100;
  beginInvocation(sample, [statement], 110).durationMs = 100;
  beginInvocation(sample, [statement, statement, statement, statement], 220).durationMs = 100;
  completeSample(sample, 350);
  assert.equal(sample.statements, 6); assert.equal(sample.invocations, 3); assert.equal(sample.depth, 3);
  assert.equal(sample.d1WaitMs, 300); assert.equal(sample.nonD1ElapsedMs, 50);
});

test('a request without database work reports zero stages and elapsed time, not invented SQL/CPU timing', () => {
  const sample = completeSample({ queries: [] }, 80);
  assert.equal(sample.statements, 0); assert.equal(sample.depth, 0); assert.equal(sample.d1WaitMs, 0);
  assert.equal(sample.nonD1ElapsedMs, 80); assert.equal(sample.sqlMs, undefined); assert.equal(sample.cpuMs, undefined);
});
