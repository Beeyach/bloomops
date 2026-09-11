import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { channel } from 'node:diagnostics_channel';
import {
  createPerf4AnalyticsSink,
  handlePerf4Request,
  instrumentPerf4D1,
  perf4Route,
} from '../lib/bloomops/perf4-worker.mjs';

const ORIGIN = 'https://bloomops-staging.cool-sunset-2169.workers.dev';
const encoder = new TextEncoder();

function staging(overrides = {}) {
  const points = [];
  const dataset = { writeDataPoint(point) { points.push(structuredClone(point)); } };
  const env = {
    BLOOMOPS_ENV: 'staging',
    BLOOMOPS_APP_URL: ORIGIN,
    BLOOMOPS_PERF4_TIMING: 'enabled',
    PERF4_TIMING: dataset,
    DB: {},
    ...overrides,
  };
  return { env, points, dataset };
}

function streamResponse(text = 'unchanged body', headers = {}) {
  const parts = [text.slice(0, Math.max(1, Math.floor(text.length / 2))), text.slice(Math.max(1, Math.floor(text.length / 2)))];
  return new Response(new ReadableStream({
    pull(controller) {
      const next = parts.shift();
      if (next === undefined) controller.close();
      else controller.enqueue(encoder.encode(next));
    },
  }), { status: 200, headers });
}

function fakeD1() {
  const statement = value => ({
    bind(...bindings) { return statement({ value, bindings }); },
    async all() { return { success: true, results: [{ ok: true }] }; },
    async first() { return { ok: true }; },
    async raw() { return [['ok']]; },
    async run() { return { success: true, meta: {} }; },
    marker: value,
  });
  return {
    prepare(value) { return statement(value); },
    async batch(statements) { return statements.map(() => ({ success: true, results: [] })); },
    async exec() { return { count: 1, duration: 0 }; },
  };
}

function serialized(points) {
  return JSON.stringify(points);
}

test('activation requires deployment-owned staging gates, configured origin and fixed GET route', () => {
  const { env } = staging();
  assert.equal(perf4Route(new Request(`${ORIGIN}/systems?token=private`), env), 'systems');
  assert.equal(perf4Route(new Request(`${ORIGIN}/clients/`), env), 'clients');
  assert.equal(perf4Route(new Request(`${ORIGIN}/clients/child`), env), null);
  assert.equal(perf4Route(new Request(`${ORIGIN}/systems`, { method: 'POST' }), env), null);
  assert.equal(perf4Route(new Request('https://example.com/systems'), env), null);
  assert.equal(perf4Route(new Request(`${ORIGIN}/systems`), { ...env, BLOOMOPS_ENV: 'production' }), null);
  assert.equal(perf4Route(new Request(`${ORIGIN}/systems`), { ...env, BLOOMOPS_PERF4_TIMING: 'true' }), null);
  assert.equal(perf4Route(new Request(`${ORIGIN}/systems`), { ...env, PERF4_TIMING: undefined }), null);
  assert.equal(perf4Route(new Request(`${ORIGIN}/systems`), { ...env, BLOOMOPS_APP_URL: 'http://localhost:8787' }), null);
});

test('inactive production/default path delegates exact request, env, ctx and response without timing work', async () => {
  const request = new Request('https://prod.example/systems');
  const env = { BLOOMOPS_ENV: 'production', DB: fakeD1() };
  const ctx = { marker: true };
  const response = new Response('plain', { headers: { 'cache-control': 'no-store' } });
  let called = 0;
  const actual = await handlePerf4Request(request, env, ctx, (seenRequest, seenEnv, seenCtx) => {
    called++;
    assert.equal(seenRequest, request);
    assert.equal(seenEnv, env);
    assert.equal(seenCtx, ctx);
    return response;
  });
  assert.equal(called, 1);
  assert.equal(actual, response);
  assert.equal(actual.headers.has('x-bloomops-timing'), false);
});

test('D1 adapter records bounded native ordinals without inspecting SQL, binds, results or metadata', async () => {
  const calls = [];
  const timing = { measure: async (stage, work) => { calls.push(stage); return await work(); } };
  const db = instrumentPerf4D1(fakeD1(), timing);
  const first = db.prepare('SELECT private_sql').bind('private-bind');
  assert.deepEqual(await first.all(), { success: true, results: [{ ok: true }] });
  assert.deepEqual(await first.first(), { ok: true });
  const second = db.prepare('SELECT another_private_sql');
  await db.batch([first, second]);
  await db.exec('private exec text');
  for (let i = 0; i < 7; i++) await db.prepare(`secret-${i}`).run();
  assert.deepEqual(calls, ['wait1', 'wait2', 'wait3', 'wait4', 'wait5', 'wait6', 'wait7', 'wait8']);
  assert.equal(JSON.stringify(calls).includes('private'), false);
});

test('active wrapper preserves streamed response semantics and emits only fixed sanitized Analytics Engine fields', async () => {
  const db = fakeD1();
  const { env, points } = staging({ DB: db });
  const secrets = [
    'cookie=super-secret', 'private@example.com', 'SELECT secret FROM session', 'bound-secret',
    'private response body', 'token-in-query', ORIGIN,
  ];
  const request = new Request(`${ORIGIN}/systems?_rsc=token-in-query`, {
    headers: { cookie: 'cookie=super-secret', 'user-agent': 'private@example.com' },
  });
  const originalHeaders = new Headers([
    ['cache-control', 'no-store'], ['location', '/kept'], ['server-timing', 'upstream;dur=1.0'],
    ['set-cookie', 'one=1; Path=/'], ['set-cookie', 'two=2; Path=/'], ['x-original', 'kept'],
  ]);
  const nav = channel('bloomops.navigation');
  const response = await handlePerf4Request(request, env, {}, async (_request, measuredEnv) => {
    assert.notEqual(measuredEnv, env);
    assert.notEqual(measuredEnv.DB, db);
    nav.publish({ stage: 'identity', event: 'start' });
    await measuredEnv.DB.prepare('SELECT secret FROM session').bind('bound-secret').all();
    nav.publish({ stage: 'identity', event: 'end' });
    nav.publish({ stage: 'systems', event: 'start' });
    await measuredEnv.DB.prepare('SELECT another private value').first();
    nav.publish({ stage: 'systems', event: 'end' });
    return streamResponse('private response body', originalHeaders);
  });

  const id = response.headers.get('x-bloomops-timing');
  assert.match(id, /^[a-f0-9]{32}$/);
  assert.match(response.headers.get('server-timing'), /upstream;dur=1\.0/);
  assert.match(response.headers.get('server-timing'), /response;dur=/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('location'), '/kept');
  assert.equal(response.headers.get('x-original'), 'kept');
  if (typeof response.headers.getSetCookie === 'function') {
    assert.deepEqual(response.headers.getSetCookie(), originalHeaders.getSetCookie());
  } else {
    assert.equal(response.headers.get('set-cookie'), originalHeaders.get('set-cookie'));
  }
  assert.equal(await response.text(), 'private response body');

  assert.equal(points.length, 3);
  assert.deepEqual(points.map(point => point.blobs[0]), ['metrics-v1', 'spans-a-v1', 'spans-b-v1']);
  for (const point of points) {
    assert.deepEqual(point.indexes, [id]);
    assert.deepEqual(point.blobs.slice(1), ['systems', 'complete']);
    assert.ok(point.doubles.every(Number.isFinite));
  }
  const metrics = points[0].doubles;
  assert.equal(metrics.length, 18);
  assert.ok(metrics[1] >= 0); // identity
  assert.ok(metrics[5] >= 0); // systems
  assert.ok(metrics[6] >= 0); // wait1
  assert.ok(metrics[7] >= 0); // wait2
  assert.ok(metrics[15] >= 0); // total
  const output = serialized(points);
  for (const secret of secrets) assert.equal(output.includes(secret), false);
});

test('normal EOF, cancellation and stream errors emit distinct lifecycle events without changing stream failures', async () => {
  {
    const { env, points } = staging({ DB: fakeD1() });
    const response = await handlePerf4Request(new Request(`${ORIGIN}/work`), env, {}, () => streamResponse('complete'));
    assert.equal(await response.text(), 'complete');
    assert.ok(points.every(point => point.blobs[2] === 'complete'));
  }
  {
    let cancelled;
    const { env, points } = staging({ DB: fakeD1() });
    const source = new ReadableStream({
      pull(controller) { controller.enqueue(encoder.encode('chunk')); },
      cancel(reason) { cancelled = reason; },
    });
    const response = await handlePerf4Request(new Request(`${ORIGIN}/social`), env, {}, () => new Response(source));
    const reader = response.body.getReader();
    assert.equal(new TextDecoder().decode((await reader.read()).value), 'chunk');
    await reader.cancel('caller-stop');
    assert.equal(cancelled, 'caller-stop');
    assert.ok(points.every(point => point.blobs[2] === 'cancel'));
    assert.equal(points[0].doubles[15], -1); // no successful total
    assert.ok(points[0].doubles[16] >= 0); // elapsed
  }
  {
    const failure = Error('private stream failure');
    const { env, points } = staging({ DB: fakeD1() });
    const source = new ReadableStream({ pull(controller) { controller.error(failure); } });
    const response = await handlePerf4Request(new Request(`${ORIGIN}/ads`), env, {}, () => new Response(source));
    await assert.rejects(response.text(), error => error === failure);
    assert.ok(points.every(point => point.blobs[2] === 'error'));
    assert.equal(serialized(points).includes(failure.message), false);
  }
});

test('Analytics Engine failure is isolated from product response', async () => {
  const { env } = staging({
    DB: fakeD1(),
    PERF4_TIMING: { writeDataPoint() { throw Error('private sink failure'); } },
  });
  const response = await handlePerf4Request(new Request(`${ORIGIN}/team`), env, {}, () => streamResponse('still works'));
  assert.match(response.headers.get('x-bloomops-timing'), /^[a-f0-9]{32}$/);
  assert.equal(await response.text(), 'still works');
});

test('concurrent active requests keep navigation-stage events request-local', async () => {
  const { env, points } = staging({ DB: fakeD1() });
  const nav = channel('bloomops.navigation');
  const run = (path, stage, delay) => handlePerf4Request(new Request(`${ORIGIN}${path}`), env, {}, async () => {
    nav.publish({ stage: 'identity', event: 'start' });
    nav.publish({ stage, event: 'start' });
    await new Promise(resolve => setTimeout(resolve, delay));
    nav.publish({ stage, event: 'end' });
    nav.publish({ stage: 'identity', event: 'end' });
    return streamResponse(stage);
  }).then(async response => ({ id: response.headers.get('x-bloomops-timing'), body: await response.text() }));
  const [home, systems] = await Promise.all([run('/', 'home', 8), run('/systems', 'systems', 2)]);
  assert.equal(home.body, 'home');
  assert.equal(systems.body, 'systems');
  assert.notEqual(home.id, systems.id);
  const metrics = points.filter(point => point.blobs[0] === 'metrics-v1');
  assert.equal(metrics.length, 2);
  const homePoint = metrics.find(point => point.blobs[1] === 'home');
  const systemsPoint = metrics.find(point => point.blobs[1] === 'systems');
  assert.ok(homePoint.doubles[1] >= 0 && homePoint.doubles[4] >= 0);
  assert.equal(homePoint.doubles[5], -1);
  assert.ok(systemsPoint.doubles[1] >= 0 && systemsPoint.doubles[5] >= 0);
  assert.equal(systemsPoint.doubles[4], -1);
});

test('sink accepts only fixed record shape and bounded numbers', () => {
  const points = [];
  const sink = createPerf4AnalyticsSink({ writeDataPoint(point) { points.push(point); } });
  sink({ id: 'not-an-id', route: 'systems', event: 'complete', metrics: {}, spans: {} });
  sink({ id: '0'.repeat(32), route: 'private-route', event: 'complete', metrics: {}, spans: {} });
  assert.equal(points.length, 0);
  sink({
    id: 'a'.repeat(32), route: 'home', event: 'complete',
    metrics: { response: 1, total: 130000, injected: 7 },
    spans: { identity: { start: 2, duration: Infinity }, injected: { start: 1, duration: 1 } },
  });
  assert.equal(points.length, 3);
  assert.equal(points[0].doubles[0], 1);
  assert.equal(points[0].doubles[15], -1);
  assert.equal(points[1].doubles[0], 2);
  assert.equal(points[1].doubles[1], -1);
  assert.equal(serialized(points).includes('injected'), false);
});

test('Wrangler keeps ordinary telemetry off and makes PERF4 binding/opt-in staging-only', () => {
  const config = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  assert.match(config, /"main": "worker\.mjs"/);
  assert.match(config, /"observability":\s*\{\s*"enabled": false/);
  assert.match(config, /"logs": \{ "enabled": false, "invocation_logs": false \}/);
  assert.match(config, /"traces": \{ "enabled": false \}/);
  const stagingBlock = config.split('"staging": {')[1].split('"production": {')[0];
  const productionBlock = config.split('"production": {')[1];
  assert.match(stagingBlock, /"BLOOMOPS_PERF4_TIMING": "enabled"/);
  assert.match(stagingBlock, /"binding": "PERF4_TIMING"/);
  assert.match(stagingBlock, /"dataset": "bloomops_perf4_staging_timing"/);
  assert.doesNotMatch(productionBlock, /BLOOMOPS_PERF4_TIMING|PERF4_TIMING|analytics_engine_datasets/);
});
