#!/usr/bin/env node
// Read-only: all destination sections + two frames define visible completion
// (includes driver overhead). Record body completion separately; Chromium may
// omit requestfinished for an RSC stream even after the server flushed it.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { navigationRoutes, completedContent } from './navigation-content.mjs';
const arg = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg('--url', 'http://localhost:8787');
const local = ['localhost', '127.0.0.1'].includes(new URL(base).hostname);
assert.ok(local || base === 'https://bloomops-staging.cool-sunset-2169.workers.dev');
const expectedSha = arg('--expected-sha');
if (!local) assert.match(expectedSha || '', /^[0-9a-f]{40}$/, 'Remote measurement requires the exact deployed SHA.');
const version = await (await fetch(base + '/api/version')).json();
if (expectedSha) assert.ok(expectedSha.startsWith(version.sha) && version.sha.length >= 7, 'Deployed build does not match the candidate.');
const storage = arg('--storage-state'); assert.ok(storage, 'Provide an issued Playwright storage state.');
const project = arg('--project'); assert.match(project || '', /^[A-Za-z0-9_-]{1,200}$/);
const out = resolve(arg('--out', '/tmp/bloomops-perf2'));
const rounds = Number(arg('--rounds', '12')), warmups = 2;
assert.ok(Number.isInteger(rounds) && rounds >= 5 && rounds <= 50);
const require = createRequire(join(resolve(arg('--playwright', '/tmp/bloomops-c6-tools')), 'package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const rows = [], routes = navigationRoutes(project);
let checkpoint = 'launch';
try {
  const context = await browser.newContext({ storageState: storage, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  let started;
  await page.exposeFunction('perf2Click', value => { started = value; });
  await page.goto(base + '/systems', { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/systems');
  for (let round = 0; round < rounds; round++) for (const route of routes) {
    checkpoint = `${round} ${route.label}: click`;
    if (route.detail) await page.goto(base + '/systems', { waitUntil: 'networkidle' });
    const responses = [];
    const onResponse = response => {
      const req = response.request(), url = new URL(response.url());
      if (url.origin === base && url.pathname === route.path && ['document', 'fetch'].includes(req.resourceType())) responses.push(response);
    };
    page.on('response', onResponse);
    started = undefined;
    await page.evaluate(() => document.addEventListener('click', () => window.perf2Click(performance.timeOrigin + performance.now()), { capture: true, once: true }));
    const responsePromise = page.waitForResponse(response => new URL(response.url()).pathname === route.path
      && ['document', 'fetch'].includes(response.request().resourceType()) && !response.request().headers()['next-router-prefetch']);
    const selector = route.detail ? `main a[href="${route.path}"]` : `nav[aria-label="Main"] a[href="${route.path}"]`;
    await page.locator(selector).filter({ visible: true }).first().click();
    const destination = await responsePromise;
    assert.equal(destination.status(), 200);
    checkpoint = `${round} ${route.label}: rendered content`;
    const content = await completedContent(page, route);
    assert.ok(started);
    const visibleMs = content.visibleAt - started; delete content.visibleAt;
    page.off('response', onResponse);
    const requests = [];
    checkpoint = `${round} ${route.label}: trace`;
    for (const response of responses) {
      const headers = await response.allHeaders(), request = response.request();
      const trace = local && headers['x-perf1-sample'] ? await (await fetch(base + '/__perf1?id=' + headers['x-perf1-sample'])).json() : null;
      if (trace) { delete trace.id; delete trace.started; assert.ok(trace.completeMs !== undefined); }
      const resource = await page.evaluate(url => {
        const r = performance.getEntriesByName(url).at(-1);
        return r ? { bodyMs: r.responseEnd - r.startTime, bytes: r.encodedBodySize } : null;
      }, response.url());
      requests.push({ status: response.status(), timing: request.timing(), responseBodyBytes: resource?.bytes ?? null,
        browserBodyMs: resource?.bodyMs ?? null, browserBodyComplete: request.timing().responseEnd >= 0,
        colo: headers['cf-ray']?.match(/-([A-Z]{3})$/)?.[1] || null,
        prefetch: Boolean(request.headers()['next-router-prefetch']), type: request.resourceType(), trace });
    }
    rows.push({ round, route: route.label, visibleMs, ...content, requests });
    console.log(JSON.stringify({ round, route: route.label, visibleMs: +visibleMs.toFixed(2), ...content,
      statements: requests.reduce((n, r) => n + (r.trace?.statements || 0), 0),
      invocations: requests.reduce((n, r) => n + (r.trace?.invocations || 0), 0), depth: Math.max(0, ...requests.map(r => r.trace?.depth || 0)) }));
  }
  const distribution = values => {
    values = values.filter(v => typeof v === 'number' && v >= 0);
    if (!values.length) return null;
    values.sort((a, b) => a - b); const n = values.length;
    return { median: (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2,
      min: values[0], max: values.at(-1), p95: values[Math.ceil(n * .95) - 1] };
  };
  const summary = routes.map(route => {
    const samples = rows.filter(r => r.route === route.label && r.round >= warmups);
    const traces = samples.flatMap(s => s.requests.map(r => r.trace).filter(Boolean));
    return { route: route.label, samples: samples.length, visibleMs: distribution(samples.map(s => s.visibleMs)),
      bodyMs: distribution(samples.flatMap(s => s.requests.map(r => r.timing.responseEnd))),
      serverCompleteMs: distribution(traces.map(t => t.completeMs)),
      browserBodySamples: samples.flatMap(s => s.requests).filter(r => r.browserBodyComplete).length,
      bodyBytes: distribution(samples.flatMap(s => s.requests.map(r => r.responseBodyBytes))),
      renderedRows: [...new Set(samples.map(s => s.renderedRows))],
      statements: [...new Set(traces.map(t => t.statements))], invocations: [...new Set(traces.map(t => t.invocations))], depth: [...new Set(traces.map(t => t.depth))],
      d1WaitMs: distribution(traces.map(t => t.d1WaitMs)), nonD1ElapsedMs: distribution(traces.map(t => t.nonD1ElapsedMs)),
      statementsPerInvocation: [...new Set(traces.map(t => JSON.stringify(t.queries.map(q => q.count))))] };
  });
  mkdirSync(out, { recursive: true, mode: 0o700 });
  writeFileSync(join(out, 'navigation.json'), JSON.stringify({ environment: local ? 'local' : 'staging', expectedSha: expectedSha || null, servedSha: version.sha, rounds, warmups, summary, rows }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(JSON.stringify({ checkpoint, error: error.name }));
  console.error('Navigation measurement failed. Check authentication, destination content and Worker availability; no private response or URL is logged.');
  process.exitCode = 1;
} finally { await browser.close(); }
