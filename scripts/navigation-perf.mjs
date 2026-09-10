#!/usr/bin/env node
// Read-only browser timing. Supply an already-issued storage state; credentials
// are read only by Playwright and are never copied into the output. Remote
// operation requires the exact staging origin and an explicit storage state.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const arg = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg('--url', 'http://localhost:8787');
const local = ['localhost', '127.0.0.1'].includes(new URL(base).hostname);
assert.ok(local || base === 'https://bloomops-staging.cool-sunset-2169.workers.dev');
const storage = arg('--storage-state'); assert.ok(storage, 'Provide an issued Playwright storage state.');
const project = arg('--project'); assert.match(project || '', /^[A-Za-z0-9_-]{1,200}$/);
const out = resolve(arg('--out', '/tmp/bloomops-perf1'));
const rounds = Number(arg('--rounds', '10')), warmups = 2;
assert.ok(Number.isInteger(rounds) && rounds >= 5 && rounds <= 50);
const require = createRequire(join(resolve(arg('--playwright', '/tmp/bloomops-c6-tools')), 'package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const rows = [];
const routes = [
  { label: 'Home', path: '/', heading: 'Home' }, { label: 'Clients', path: '/clients', heading: 'Clients' },
  { label: 'Work', path: '/work', heading: 'Actions' }, { label: 'Social', path: '/social', heading: 'Social' },
  { label: 'Systems', path: '/systems', heading: 'Systems' }, { label: 'Team', path: '/team', heading: 'Team' },
  { label: 'Project detail', path: `/work/projects/${project}`, selector: '#project-details-title' },
];
try {
  const context = await browser.newContext({ storageState: storage, viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    window.perf1 = null;
    const pending = JSON.parse(sessionStorage.getItem('perf1-navigation') || 'null');
    if (!pending || location.pathname !== pending.path) return;
    const observer = new MutationObserver(() => {
      if (!document.querySelector(pending.selector)?.checkVisibility()) return;
      observer.disconnect();
      requestAnimationFrame(() => requestAnimationFrame(() => {
        window.perf1 = { visibleMs: performance.timeOrigin + performance.now() - pending.started, resources: [] };
        sessionStorage.removeItem('perf1-navigation');
      }));
    });
    observer.observe(document, { subtree: true, childList: true, attributes: true });
  });
  const page = await context.newPage();
  await page.goto(base + '/systems', { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/systems', 'The supplied session must authorize Systems.');
  for (let round = 0; round < rounds; round++) for (const route of routes) {
    // Detail uses its canonical link from Systems, never a synthetic router push.
    if (route.selector) await page.goto(base + '/systems', { waitUntil: 'networkidle' });
    const responses = [];
    const onResponse = response => {
      const req = response.request(), url = new URL(response.url());
      if (url.origin === base && url.pathname === route.path && ['document', 'fetch'].includes(req.resourceType())) responses.push(response);
    };
    page.on('response', onResponse);
    await page.evaluate(route => {
      performance.clearResourceTimings();
      window.perf1 = null;
      let started;
      const ready = () => location.pathname === route.path && (route.selector
        ? document.querySelector(route.selector)?.checkVisibility()
        : [...document.querySelectorAll('main h1')].some(n => n.textContent === route.heading && n.checkVisibility()));
      const finish = () => { if (started !== undefined && ready()) { observer.disconnect(); requestAnimationFrame(() => requestAnimationFrame(() => {
        window.perf1 = { visibleMs: performance.now() - started, resources: performance.getEntriesByType('resource')
          .filter(r => r.startTime >= started).map(r => ({ durationMs: r.duration, ttfbMs: r.responseStart - r.requestStart,
            offsetMs: r.startTime - started, bytes: r.encodedBodySize, rsc: r.name.includes('_rsc='), type: r.initiatorType })) };
      })); } };
      document.addEventListener('click', () => {
        started = performance.now();
        if (route.selector) sessionStorage.setItem('perf1-navigation', JSON.stringify({ path: route.path, selector: route.selector, started: performance.timeOrigin + started }));
      }, { capture: true, once: true });
      const observer = new MutationObserver(finish);
      observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    }, route);
    const selector = route.selector ? `main a[href="${route.path}"]` : `nav[aria-label="Main"] a[href="${route.path}"]`;
    await page.locator(selector).filter({ visible: true }).first().click();
    await page.waitForFunction(() => Boolean(window.perf1?.visibleMs), null, { timeout: 30000 });
    const timing = await page.evaluate(() => window.perf1);
    page.off('response', onResponse);
    const requests = [];
    for (const response of responses) {
      const headers = await response.allHeaders(), request = response.request();
      const trace = local && headers['x-perf1-sample'] ? await (await fetch(base + '/__perf1?id=' + headers['x-perf1-sample'])).json() : null;
      if (trace) { delete trace.id; delete trace.started; }
      requests.push({ status: response.status(), timing: request.timing(), prefetch: Boolean(request.headers()['next-router-prefetch']),
        type: request.resourceType(), trace });
    }
    const row = { round, route: route.label, ...timing, requests };
    rows.push(row);
    console.log(JSON.stringify({ round, route: route.label, visibleMs: +timing.visibleMs.toFixed(2), queries: requests.flatMap(r => r.trace?.queries || []).length }));
  }
  const summary = routes.map(route => {
    const samples = rows.filter(r => r.route === route.label && r.round >= warmups);
    const values = samples.map(r => r.visibleMs).sort((a, b) => a - b), n = values.length;
    return { route: route.label, samples: n, medianMs: (values[Math.floor((n - 1) / 2)] + values[Math.floor(n / 2)]) / 2,
      minMs: values[0], maxMs: values.at(-1), p95Ms: values[Math.ceil(n * .95) - 1],
      queryCounts: [...new Set(samples.map(r => r.requests.flatMap(q => q.trace?.queries || []).length))] };
  });
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'navigation.json'), JSON.stringify({ environment: local ? 'local' : 'staging', rounds, warmups, summary, rows }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally { await browser.close(); }
