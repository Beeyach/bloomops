import { test } from 'node:test';
import assert from 'node:assert/strict';
import { infraStatus } from '../lib/infra-status.mjs';

const fakeD1 = (row) => ({ prepare: () => ({ first: async () => row }) });
const failingD1 = () => ({ prepare: () => ({ first: async () => { throw new Error('no such database'); } }) });
const fakeR2 = () => ({ list: async () => ({ objects: [] }) });
const failingR2 = () => ({ list: async () => { throw new Error('bucket unavailable'); } });

test('reports the environment name and healthy bindings', async () => {
  const s = await infraStatus({ BLOOMOPS_ENV: 'staging', DB: fakeD1({ ok: 1 }), FILES: fakeR2() });
  assert.equal(s.environment, 'staging');
  assert.deepEqual(s.d1, { binding: 'DB', bound: true, ok: true });
  assert.deepEqual(s.r2, { binding: 'FILES', bound: true, ok: true });
});

test('an environment with no bindings reports unbound, and never throws', async () => {
  const s = await infraStatus({});
  assert.equal(s.environment, 'unknown');
  assert.equal(s.d1.bound, false);
  assert.equal(s.d1.ok, false);
  assert.equal(s.r2.bound, false);
  assert.equal(s.r2.ok, false);
});

test('a bound binding that fails is reported as bound but not ok', async () => {
  const s = await infraStatus({ BLOOMOPS_ENV: 'development', DB: failingD1(), FILES: failingR2() });
  assert.equal(s.d1.bound, true);
  assert.equal(s.d1.ok, false);
  assert.match(s.d1.error, /no such database/);
  assert.equal(s.r2.bound, true);
  assert.equal(s.r2.ok, false);
  assert.match(s.r2.error, /bucket unavailable/);
});

test('the payload carries names and booleans only, never ids or secrets', async () => {
  const env = {
    BLOOMOPS_ENV: 'production',
    DB: fakeD1({ ok: 1 }),
    FILES: fakeR2(),
    LTB_SESSION_SECRET: 'super-secret',
    SOME_DATABASE_ID: '412a33ad-0000',
  };
  const text = JSON.stringify(await infraStatus(env));
  assert.doesNotMatch(text, /super-secret|412a33ad/);
  assert.deepEqual(Object.keys(JSON.parse(text)).sort(), ['d1', 'environment', 'r2']);
});
