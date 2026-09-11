import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServerTiming } from '../lib/bloomops/server-timing.mjs';
import { testAuth, run, APP_URL } from './_bloomops-db.mjs';
import { getAccess } from '../lib/bloomops/access.mjs';

function fixture(extra = {}) {
  let time = 1000;
  const events = [];
  return { events, at: value => { time = 1000 + value; },
    timing: createServerTiming({ enabled: true, environment: 'development', route: 'home',
      now: () => time, emit: event => events.push(event), ...extra }) };
}

for (const options of [{}, { enabled: true }, { enabled: 'true', environment: 'development' },
  { enabled: true, environment: 'staging' }, { enabled: true, environment: 'production' },
  { enabled: true, environment: 'test' }, { enabled: true, environment: 'development', route: '/home' }]) {
  test(`default/environment gate stays off: ${JSON.stringify(options)}`, async () => {
    let calls = 0;
    const t = createServerTiming({ route: 'home', now: () => { throw Error('must not read'); },
      emit: () => { throw Error('must not emit'); }, ...options });
    t.mark('identity', 'start'); t.firstChunk();
    assert.deepEqual(t.response(), {}); assert.equal(t.finish(), undefined);
    const value = Promise.resolve('unchanged');
    assert.equal(t.measure('identity', () => { calls++; return value; }), value);
    assert.equal(calls, 1);
  });
}

test('headers freeze at availability; final events correlate with fresh opaque IDs and include late phases', () => {
  const { timing: t, at, events } = fixture();
  t.mark('identity', 'start'); at(2.14);
  const headers = t.response();
  assert.deepEqual(Object.keys(headers), ['Server-Timing', 'X-Bloomops-Timing']);
  assert.equal(headers['Server-Timing'], 'response;dur=2.1');
  assert.match(headers['X-Bloomops-Timing'], /^[a-f0-9]{32}$/);
  at(3); t.firstChunk(); at(103); t.mark('identity', 'end');
  at(104); t.mark('home', 'start'); t.mark('wait2', 'start');
  at(206); t.mark('wait2', 'end'); at(207); t.mark('wait3', 'start');
  at(309); t.mark('wait3', 'end'); at(310); t.mark('home', 'end'); at(312);
  const record = t.finish();
  assert.equal(record.id, headers['X-Bloomops-Timing']);
  assert.deepEqual(record.metrics, { response: 2.1, identity: 103, home: 206, wait2: 102,
    wait3: 102, first: 3, total: 312, unattributed: 3 });
  assert.deepEqual(record.spans.wait2, { start: 104, duration: 102 });
  assert.deepEqual(record.spans.wait3, { start: 207, duration: 102 });
  assert.ok(Object.isFrozen(record.spans.wait2));
  assert.equal(t.response(), headers); assert.equal(headers['Server-Timing'], 'response;dur=2.1');
  assert.equal(t.finish(), undefined); assert.equal(events.length, 1);
  const ids = new Set(Array.from({ length: 128 }, () => fixture().timing.response()['X-Bloomops-Timing']));
  assert.equal(ids.size, 128); assert.ok(!ids.has(record.id));
});

test('completed phases alone enter headers; overlapping intervals are unioned, not summed', () => {
  const { timing: t, at } = fixture();
  t.mark('identity', 'start'); at(10); t.mark('actor', 'start');
  at(20); t.mark('identity', 'end'); at(30); t.mark('actor', 'end'); at(40);
  assert.equal(t.response()['Server-Timing'], 'response;dur=40.0, identity;dur=20.0, actor;dur=20.0');
  at(50); assert.equal(t.finish().metrics.unattributed, 20);
});

for (const route of ['home', 'clients', 'work', 'social', 'systems', 'team', 'ads']) {
  test(`fixed route ${route} supports bounded native invocation ordinals without data`, () => {
    const { timing: t, at } = fixture({ route });
    for (let i = 1; i <= 9; i++) {
      at(i * 10); t.mark(`wait${i}`, 'start'); at(i * 10 + 5); t.mark(`wait${i}`, 'end');
    }
    t.mark(route === 'home' ? 'systems' : 'home', 'start');
    t.mark(route === 'home' ? 'systems' : 'home', 'end');
    const headers = t.response();
    assert.ok(!headers['Server-Timing'].includes('wait9'));
    assert.ok(!headers['Server-Timing'].includes('home'));
    assert.ok(!headers['Server-Timing'].includes('systems'));
    const event = t.finish(); assert.equal(event.route, route);
    assert.equal(Object.keys(event.metrics).length, 11);
  });
}

test('sensitive labels, caller IDs and arbitrary properties cannot enter output', () => {
  const secrets = ['cookie=secret', 'person@example.com', 'https://example.com/private?a=b',
    'SELECT * FROM session', 'workspace-private', '123e4567-e89b-12d3-a456-426614174000', '\r\nInjected: yes'];
  const { timing: t } = fixture({ id: secrets[5], build: secrets[4], token: secrets[0] });
  for (const value of secrets) {
    t.mark(value, 'start'); t.mark(value, 'end'); t.mark('identity', value);
  }
  const result = JSON.stringify([t.response(), t.finish()]);
  for (const secret of secrets) assert.ok(!result.includes(secret));
  assert.equal(createServerTiming({ enabled: true, environment: 'development', route: secrets[4] }).finish(), undefined);
});

for (const bad of [undefined, null, NaN, Infinity, -Infinity, -1, '10', 120001]) {
  test(`invalid/backward/out-of-range clock drops diagnostics (${String(bad)})`, () => {
    let value = 0;
    const t = createServerTiming({ enabled: true, environment: 'development', route: 'home', now: () => value });
    t.mark('identity', 'start'); value = bad; t.mark('identity', 'end');
    assert.deepEqual(t.response(), {}); assert.equal(t.finish(), undefined);
  });
}

test('mismatched, duplicate and unfinished marks omit misleading phases and residual', () => {
  for (const sequence of [['end'], ['start', 'start', 'end'], ['start', 'end', 'end'], ['start']]) {
    const { timing: t } = fixture();
    sequence.forEach(event => t.mark('identity', event));
    assert.equal(t.response()['Server-Timing'], 'response;dur=0.0');
    assert.deepEqual(t.finish().metrics, { response: 0, total: 0 });
  }
});

test('completion requires response boundary; cancel/error never claim EOF', () => {
  for (const event of ['cancel', 'error']) {
    const { timing: t, at } = fixture();
    assert.equal(t.finish(), undefined); t.firstChunk(); t.response(); at(5);
    const record = t.finish(event);
    assert.deepEqual(record.metrics, { response: 0, elapsed: 5 }); assert.equal(record.event, event);
  }
});

test('clock/sink failure and sync/async product failures retain ordinary return and error behavior', async () => {
  const failure = Error('private error that must never enter output');
  for (const emit of [() => { throw failure; }, () => Promise.reject(failure)]) {
    const { timing: t } = fixture({ emit });
    assert.equal(await t.measure('identity', () => 'value'), 'value');
    await assert.rejects(t.measure('actor', () => { throw failure; }), error => error === failure);
    await assert.rejects(t.measure('home', () => Promise.reject(failure)), error => error === failure);
    t.response(); assert.doesNotThrow(() => t.finish());
  }
  let calls = 0;
  const { timing: t } = fixture({ now: () => { if (calls++) throw failure; return 0; } });
  assert.equal(await t.measure('identity', () => 42), 42);
  assert.deepEqual(t.response(), {}); assert.equal(t.finish(), undefined);
  await new Promise(resolve => setImmediate(resolve)); // exposes any unhandled sink rejection
});

test('primitive leaves status, redirects, cookies, no-store, and original streamed body untouched', async () => {
  for (const status of [200, 307, 401, 403, 404, 500]) {
    const response = new Response('protected unchanged body', { status,
      headers: { location: '/sign-in', 'cache-control': 'no-store', 'set-cookie': 'fixture=sensitive' } });
    const beforeHeaders = [...response.headers];
    const { timing: t } = fixture();
    assert.equal(await t.measure('identity', () => response), response);
    t.response(); t.firstChunk(); t.finish();
    assert.deepEqual([...response.headers], beforeHeaders); assert.equal(response.status, status);
    assert.equal(await response.text(), 'protected unchanged body');
  }
});

test('explicit local measurement around real issued sessions cannot cache access across revocation', async context => {
  const t = testAuth(); context.after(() => t.raw.close());
  run(t.raw, "INSERT INTO workspaces(id,name,slug) VALUES('timing-w','Synthetic','timing-w')");
  run(t.raw, "INSERT INTO user(id,name,email,email_verified) VALUES('timing-u','Synthetic','timing@example.com',1)");
  run(t.raw, "INSERT INTO workspace_memberships(id,workspace_id,user_id,role,status) VALUES('timing-m','timing-w','timing-u','owner','active')");
  const { cookie } = await t.signIn('timing@example.com');
  const read = () => fixture().timing.measure('identity', () => getAccess(new Request(APP_URL + '/systems',
    { headers: { cookie } }), { env: t.env }));
  assert.ok((await read()).membership);
  run(t.raw, "UPDATE workspace_memberships SET status='suspended' WHERE id='timing-m'");
  assert.equal((await read()).membership, null);
  run(t.raw, "DELETE FROM session WHERE user_id='timing-u'");
  assert.equal(await read(), null);
});
