import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handlePerf4Request } from '../lib/bloomops/perf4-worker.mjs';

const ORIGIN = 'https://bloomops-staging.cool-sunset-2169.workers.dev';

function staging() {
  const points = [];
  return {
    points,
    env: {
      BLOOMOPS_ENV: 'staging',
      BLOOMOPS_APP_URL: ORIGIN,
      BLOOMOPS_PERF4_TIMING: 'enabled',
      PERF4_TIMING: { writeDataPoint(point) { points.push(structuredClone(point)); } },
      DB: {},
    },
  };
}

for (const status of [307, 401, 403, 404, 500]) {
  test(`active wrapper preserves protected response status, headers and body (${status})`, async () => {
    const { env, points } = staging();
    const original = new Response(`body-${status}`, {
      status,
      headers: {
        'cache-control': 'no-store',
        location: '/sign-in?private=not-logged',
        'set-cookie': 'fixture=sensitive; Path=/; HttpOnly',
        'x-product-header': 'kept',
      },
    });
    const response = await handlePerf4Request(
      new Request(`${ORIGIN}/systems?_rsc=private-query`), env, {}, () => original,
    );
    assert.equal(response.status, status);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('location'), '/sign-in?private=not-logged');
    assert.equal(response.headers.get('set-cookie'), 'fixture=sensitive; Path=/; HttpOnly');
    assert.equal(response.headers.get('x-product-header'), 'kept');
    assert.match(response.headers.get('x-bloomops-timing'), /^[a-f0-9]{32}$/);
    assert.equal(await response.text(), `body-${status}`);
    assert.equal(points.length, 3);
    const serialized = JSON.stringify(points);
    for (const secret of ['private-query', 'not-logged', 'fixture=sensitive', `body-${status}`]) {
      assert.equal(serialized.includes(secret), false);
    }
  });
}

test('active wrapper preserves bodyless response status and headers', async () => {
  const { env, points } = staging();
  const original = new Response(null, {
    status: 204,
    headers: { 'cache-control': 'no-store', 'x-product-header': 'kept' },
  });
  const response = await handlePerf4Request(new Request(`${ORIGIN}/team`), env, {}, () => original);
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-product-header'), 'kept');
  assert.match(response.headers.get('x-bloomops-timing'), /^[a-f0-9]{32}$/);
  assert.equal(points.length, 3);
});

test('pre-response application errors propagate unchanged and emit no fabricated completion', async () => {
  const { env, points } = staging();
  const failure = Error('private application failure');
  await assert.rejects(
    handlePerf4Request(new Request(`${ORIGIN}/`), env, {}, (_request, measuredEnv) => {
      assert.notEqual(measuredEnv, env);
      throw failure;
    }),
    error => error === failure,
  );
  assert.deepEqual(points, []);
});
