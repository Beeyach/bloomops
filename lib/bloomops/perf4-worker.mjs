// PERF4 staging-only correlation adapter. This module owns the outer Worker
// response boundary but never receives or emits identity, SQL, request metadata
// or response payloads. Production/default requests delegate without wrapping.
import { AsyncLocalStorage } from 'node:async_hooks';
import { channel } from 'node:diagnostics_channel';
import { createServerTiming } from './server-timing.mjs';

const ROUTES = new Map([
  ['/', 'home'], ['/clients', 'clients'], ['/work', 'work'], ['/social', 'social'],
  ['/systems', 'systems'], ['/team', 'team'], ['/ads', 'ads'],
]);
const ROUTE_NAMES = new Set(ROUTES.values());
const EVENTS = new Set(['complete', 'cancel', 'error']);
const METRICS = Object.freeze([
  'response', 'identity', 'membership', 'actor', 'home', 'systems',
  'wait1', 'wait2', 'wait3', 'wait4', 'wait5', 'wait6', 'wait7', 'wait8',
  'first', 'total', 'elapsed', 'unattributed',
]);
const SPANS = Object.freeze([
  'identity', 'membership', 'actor', 'home', 'systems',
  'wait1', 'wait2', 'wait3', 'wait4', 'wait5', 'wait6', 'wait7', 'wait8',
]);
const MISSING = -1;
const MAX_ELAPSED = 120_000;
const ID = /^[a-f0-9]{32}$/;

const navigation = channel('bloomops.navigation');
const requestTiming = new AsyncLocalStorage();
let navigationSubscribers = 0;

function navigationEvent(message) {
  const state = requestTiming.getStore();
  if (!state?.timing || !message || typeof message !== 'object') return;
  state.timing.mark(message.stage, message.event);
}

function subscribeNavigation() {
  if (navigationSubscribers++ === 0) navigation.subscribe(navigationEvent);
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    navigationSubscribers = Math.max(0, navigationSubscribers - 1);
    if (navigationSubscribers === 0) navigation.unsubscribe(navigationEvent);
  };
}

function routeFromRequest(request) {
  if (!request || String(request.method || '').toUpperCase() !== 'GET') return null;
  try {
    const url = new URL(request.url);
    let path = url.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return ROUTES.get(path) || null;
  } catch { return null; }
}

/**
 * A request can activate PERF4 only through deployment-owned staging state.
 * Request headers/query parameters are never activation inputs. The request URL
 * is used only to require the configured staging origin and one fixed route.
 */
export function perf4Route(request, env) {
  if (env?.BLOOMOPS_ENV !== 'staging' || env?.BLOOMOPS_PERF4_TIMING !== 'enabled') return null;
  if (typeof env?.PERF4_TIMING?.writeDataPoint !== 'function') return null;
  const route = routeFromRequest(request);
  if (!route) return null;
  try {
    const configured = new URL(env.BLOOMOPS_APP_URL);
    const actual = new URL(request.url);
    if (configured.protocol !== 'https:' || actual.origin !== configured.origin) return null;
    return route;
  } catch { return null; }
}

function boundedNumber(value) {
  return Number.isFinite(value) && value >= 0 && value <= MAX_ELAPSED ? value : MISSING;
}

function writePoint(dataset, point) {
  try {
    const result = dataset.writeDataPoint(point);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch { /* diagnostics never change product behavior */ }
}

/**
 * Fixed Analytics Engine schema, version 1.
 *
 * Each request writes exactly three records under one opaque random index:
 *   metrics-v1: doubles follow METRICS order (18 values)
 *   spans-a-v1: start,duration pairs for SPANS[0..9] (20 values)
 *   spans-b-v1: start,duration pairs for SPANS[10..12] (6 values)
 * Missing values are -1. Blobs are only record kind, fixed route and event.
 */
export function createPerf4AnalyticsSink(dataset) {
  return record => {
    if (!record || !ID.test(record.id) || !ROUTE_NAMES.has(record.route) || !EVENTS.has(record.event)) return;
    const common = [record.route, record.event];
    writePoint(dataset, {
      indexes: [record.id],
      blobs: ['metrics-v1', ...common],
      doubles: METRICS.map(name => boundedNumber(record.metrics?.[name])),
    });
    for (const [kind, names] of [
      ['spans-a-v1', SPANS.slice(0, 10)],
      ['spans-b-v1', SPANS.slice(10)],
    ]) {
      const doubles = [];
      for (const name of names) {
        doubles.push(boundedNumber(record.spans?.[name]?.start));
        doubles.push(boundedNumber(record.spans?.[name]?.duration));
      }
      writePoint(dataset, { indexes: [record.id], blobs: [kind, ...common], doubles });
    }
  };
}

function objectLike(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

/**
 * Request-local D1 proxy. It observes only native invocation ordinals and wall
 * time around their returned work. SQL text, bind values, result rows and D1
 * metadata are never inspected or retained. The ninth and later calls run
 * normally without a timing slot rather than creating an unbounded label.
 */
export function instrumentPerf4D1(db, timing) {
  if (!objectLike(db)) return db;
  let ordinal = 0;
  const originals = new WeakMap();
  const execute = work => {
    const number = ++ordinal;
    return number <= 8 ? timing.measure(`wait${number}`, work) : work();
  };
  const statement = raw => {
    if (!objectLike(raw)) return raw;
    const proxy = new Proxy(raw, {
      get(target, key) {
        if (key === 'bind' && typeof target.bind === 'function') {
          return (...values) => statement(target.bind(...values));
        }
        if (['all', 'first', 'raw', 'run'].includes(key) && typeof target[key] === 'function') {
          return (...args) => execute(() => target[key](...args));
        }
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    originals.set(proxy, raw);
    return proxy;
  };
  return new Proxy(db, {
    get(target, key) {
      if (key === 'prepare' && typeof target.prepare === 'function') {
        return (...args) => statement(target.prepare(...args));
      }
      if (key === 'batch' && typeof target.batch === 'function') {
        return (statements, ...rest) => execute(() => target.batch(
          statements.map(item => originals.get(item) || item), ...rest,
        ));
      }
      if (key === 'exec' && typeof target.exec === 'function') {
        return (...args) => execute(() => target.exec(...args));
      }
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function environmentWithMeasuredD1(env, timing) {
  const db = instrumentPerf4D1(env.DB, timing);
  return new Proxy(env, {
    get(target, key, receiver) {
      if (key === 'DB') return db;
      return Reflect.get(target, key, receiver);
    },
  });
}

function copyHeaders(source) {
  const headers = new Headers(source);
  // Preserve separate Set-Cookie fields on runtimes that expose them.
  if (typeof source?.getSetCookie === 'function') {
    const cookies = source.getSetCookie();
    if (cookies.length) {
      headers.delete('set-cookie');
      for (const cookie of cookies) headers.append('set-cookie', cookie);
    }
  }
  return headers;
}

function responseWithTiming(response, timing, state, detach) {
  const fields = timing.response();
  if (!fields['X-Bloomops-Timing'] || !(response instanceof Response)) {
    detach();
    return response;
  }
  // WebSocket upgrades are outside protected navigation and cannot be rebuilt
  // with the ordinary Response constructor. Preserve them untouched if one is
  // ever returned unexpectedly.
  if (response.status === 101 || response.webSocket) {
    detach();
    return response;
  }
  const headers = copyHeaders(response.headers);
  if (fields['Server-Timing']) headers.append('Server-Timing', fields['Server-Timing']);
  headers.set('X-Bloomops-Timing', fields['X-Bloomops-Timing']);
  let finalized = false;
  const finish = event => {
    if (finalized) return;
    finalized = true;
    try { timing.finish(event); } finally { detach(); }
  };
  if (!response.body) {
    finish('complete');
    return new Response(null, { status: response.status, statusText: response.statusText, headers });
  }
  const reader = response.body.getReader();
  let first = false;
  const body = new ReadableStream({
    async pull(controller) {
      try {
        const chunk = await requestTiming.run(state, () => reader.read());
        if (chunk.done) {
          finish('complete');
          controller.close();
          return;
        }
        if (!first) {
          first = true;
          timing.firstChunk();
        }
        controller.enqueue(chunk.value);
      } catch (error) {
        finish('error');
        controller.error(error);
      }
    },
    cancel(reason) {
      finish('cancel');
      return requestTiming.run(state, () => reader.cancel(reason));
    },
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * Delegates every inactive request directly to OpenNext. Active staging
 * requests receive a request-local timing collector, request-local D1 proxy and
 * streaming response observer. The body is never buffered or decoded.
 */
export async function handlePerf4Request(request, env, ctx, fetchApp) {
  const route = perf4Route(request, env);
  if (!route) return fetchApp(request, env, ctx);

  const timing = createServerTiming({
    enabled: true,
    environment: 'staging',
    stagingAuthorized: true,
    route,
    emit: createPerf4AnalyticsSink(env.PERF4_TIMING),
  });
  const state = Object.freeze({ timing });
  const detach = subscribeNavigation();
  const measuredEnv = environmentWithMeasuredD1(env, timing);
  try {
    const response = await requestTiming.run(state, () => fetchApp(request, measuredEnv, ctx));
    return responseWithTiming(response, timing, state, detach);
  } catch (error) {
    detach();
    throw error;
  }
}
