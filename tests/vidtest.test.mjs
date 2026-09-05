import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vidtestGroup, vidtestStats } from '../lib/vidtest.mjs';

test('reads the VIDTEST arm from a multi-line prepended info blob', () => {
  assert.equal(vidtestGroup('VIDTEST:A\nPRESCREEN ok\nniche: florist'), 'A');
  assert.equal(vidtestGroup('PRESCREEN ok\nVIDTEST:B\nservices: mowing'), 'B');
  assert.equal(vidtestGroup('just notes, no marker'), null);
  assert.equal(vidtestGroup(null), null);
  assert.equal(vidtestGroup(undefined), null);
});

test('only A/B count; a stray VIDTEST:C or lowercase is ignored', () => {
  assert.equal(vidtestGroup('VIDTEST:C'), null);
  assert.equal(vidtestGroup('vidtest:a'), null);
});

test('rolls up count, replied, and rate per arm', () => {
  const rows = [
    { info: 'VIDTEST:A', replied: 1 },
    { info: 'VIDTEST:A', replied: 0 },
    { info: 'VIDTEST:A\nnotes', replied: 1 },
    { info: 'VIDTEST:B', replied: 1 },
    { info: 'VIDTEST:B', replied: 0 },
    { info: 'no marker', replied: 1 },
  ];
  const s = vidtestStats(rows, (p) => !!p.replied);
  assert.deepEqual(s.A, { count: 3, replied: 2, rate: 66.7 });
  assert.deepEqual(s.B, { count: 2, replied: 1, rate: 50 });
});

test('not readable until BOTH arms reach the minimum', () => {
  const rows = [];
  for (let i = 0; i < 40; i++) rows.push({ info: 'VIDTEST:A', replied: i % 2 });
  for (let i = 0; i < 10; i++) rows.push({ info: 'VIDTEST:B', replied: 1 });
  const s = vidtestStats(rows, (p) => !!p.replied, 30);
  assert.equal(s.A.count, 40);
  assert.equal(s.B.count, 10);
  assert.equal(s.readable, false); // B hasn't reached 30
});

test('readable once both arms clear the minimum; empty input is safe', () => {
  const rows = [];
  for (let i = 0; i < 30; i++) rows.push({ info: 'VIDTEST:A', replied: 1 });
  for (let i = 0; i < 30; i++) rows.push({ info: 'VIDTEST:B', replied: 0 });
  assert.equal(vidtestStats(rows, (p) => !!p.replied, 30).readable, true);
  const empty = vidtestStats([], () => false);
  assert.deepEqual(empty.A, { count: 0, replied: 0, rate: 0 });
  assert.equal(empty.readable, false);
});
