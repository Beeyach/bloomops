// PERF1 measurement wrapper. Imported only by navigation-perf-local.mjs, never
// the deployed entrypoint. No SQL, bound values, identity or response payloads
// enter the metrics. Synthetic latency is explicitly marked in every sample.
import { AsyncLocalStorage } from 'node:async_hooks';
import { channel } from 'node:diagnostics_channel';
import app from '../.open-next/worker.js';
import { beginInvocation, completeSample } from './navigation-perf-metrics.mjs';

const requests = new AsyncLocalStorage();
channel('bloomops.navigation').subscribe(message => {
  const sample = requests.getStore();
  if (sample && sample.marks.length < 32) sample.marks.push({ stage: message.stage, event: message.event, atMs: performance.now() - sample.started });
});
const environments = new WeakMap();
const samples = new Map();
const originals = new WeakMap();
const metadata = new WeakMap();
const stages = new Set(['session', 'user', 'workspace_memberships', 'member_capabilities', 'project_assignments', 'client_assignments', 'service_assignments', 'client_contacts']);
function outerTable(query) {
  let depth = 0, quote = null;
  for (let i = 0; i < query.length; i++) {
    const ch = query[i];
    if (quote) {
      if (ch === quote) { if (query[i + 1] === quote) i++; else quote = null; }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && /^from\s/i.test(query.slice(i)) && /\s/.test(query[i - 1] || ' ')) return query.slice(i).match(/^from\s+["`]?([a-z_]+)/i)?.[1];
  }
}
function category(query) {
  query = query.match(/^WITH bo_read\((?:bo_c\d+,?)+\) AS \(([\s\S]*)\) SELECT \* FROM bo_read$/)?.[1] || query;
  // Authorization loaders select plain columns. Do not mistake an EXISTS
  // subquery in a page projection for the top-level actor loader.
  const table = outerTable(query);
  if (!stages.has(table)) return 'page';
  if (table === 'session' || table === 'user') return 'identity';
  if (table === 'workspace_memberships' && /order by "workspace_memberships"\."created_at"/i.test(query)) return 'membership';
  if (table === 'member_capabilities' || (/assignments$/.test(table) && !/join "workspace_memberships"/i.test(query))) return 'actor';
  if (table === 'client_contacts' && /"user_id"\s*=/.test(query)) return 'actor';
  return 'page';
}
function measured(db, delayMs) {
  async function execute(statements, operation) {
    const sample = requests.getStore();
    if (!sample) return operation();
    const query = beginInvocation(sample, statements, performance.now() - sample.started);
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    try {
      const result = await operation();
      // raw() has no metadata. Do not substitute wall time for SQL duration.
      const results = Array.isArray(result) ? result : [result];
      query.sqlMs = results.filter(r => Number.isFinite(r?.meta?.duration)).map(r => r.meta.duration);
      return result;
    }
    finally { query.durationMs = performance.now() - sample.started - query.startMs; }
  }
  function statement(raw, query, bindings = 0) {
    const proxy = new Proxy(raw, { get(target, key) {
      if (key === 'bind') return (...values) => statement(target.bind(...values), query, values.length);
      if (['all', 'first', 'raw', 'run'].includes(key)) return (...args) => execute([metadata.get(proxy)], () => target[key](...args));
      const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
    } });
    originals.set(proxy, raw);
    metadata.set(proxy, { kind: category(query), bindings, bytes: query.length });
    return proxy;
  }
  return new Proxy(db, { get(target, key) {
    if (key === 'prepare') return query => statement(target.prepare(query), query);
    if (key === 'batch') return statements => execute(statements.map(s => metadata.get(s) || { kind: 'unknown' }), () => target.batch(statements.map(s => originals.get(s) || s)));
    const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
  } });
}

export default { async fetch(request, env, ctx) {
  const url = new URL(request.url);
  if (env.PERF1_LOCAL_ONLY !== 'synthetic-local' || env.BLOOMOPS_ENV !== 'development'
    || !['localhost', '127.0.0.1'].includes(url.hostname)) return new Response(null, { status: 403 });
  if (url.pathname === '/__perf1') {
    const sample = samples.get(url.searchParams.get('id'));
    return Response.json(sample || null, { headers: { 'cache-control': 'no-store' } });
  }
  const delayMs = Number(env.PERF1_D1_DELAY_MS || 0);
  let environment = environments.get(env);
  if (!environment) { environment = { ...env, DB: measured(env.DB, delayMs) }; environments.set(env, environment); }
  const sample = { id: crypto.randomUUID(), delayMs, started: performance.now(), queries: [], marks: [] };
  return requests.run(sample, async () => {
    const response = await app.fetch(request, environment, ctx);
    sample.responseMs = performance.now() - sample.started;
    const headers = new Headers(response.headers);
    headers.set('x-perf1-sample', sample.id);
    samples.set(sample.id, sample);
    if (samples.size > 300) samples.delete(samples.keys().next().value);
    const body = response.body?.pipeThrough(new TransformStream({
      transform(chunk, controller) {
        const now = performance.now() - sample.started;
        sample.firstChunkMs ??= now;
        sample.lastChunkMs = now;
        sample.bodyBytes = (sample.bodyBytes || 0) + chunk.byteLength;
        sample.chunks = (sample.chunks || 0) + 1;
        controller.enqueue(chunk);
      },
      flush() {
        completeSample(sample, performance.now() - sample.started);
      },
    }));
    return new Response(body, { status: response.status, statusText: response.statusText, headers });
  });
} };
