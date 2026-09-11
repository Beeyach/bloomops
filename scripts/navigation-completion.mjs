#!/usr/bin/env node
// Read-only PERF3 browser phases. No request URLs, headers, identifiers,
// credentials, content, network bodies or browser console output are saved.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { navigationRoutes } from './navigation-content.mjs';
import { completionMetrics, distribution } from './navigation-completion-metrics.mjs';

const arg = (key, fallback) => { const i = process.argv.indexOf(key); return i < 0 ? fallback : process.argv[i + 1]; };
const base = arg('--url', 'http://localhost:8787');
const local = ['http://localhost:8787', 'http://127.0.0.1:8787'].includes(base);
assert.ok(local || base === 'https://bloomops-staging.cool-sunset-2169.workers.dev');
const expectedSha = arg('--expected-sha');
if (!local) assert.match(expectedSha || '', /^[0-9a-f]{40}$/);
const version = await (await fetch(base + '/api/version')).json();
if (expectedSha) assert.ok(version.sha?.length >= 7 && expectedSha.startsWith(version.sha), 'Build SHA mismatch');
const storageState = arg('--storage-state'); assert.ok(storageState);
const rounds = Number(arg('--rounds', '12')), warmups = 2;
assert.ok(Number.isInteger(rounds) && rounds >= 5 && rounds <= 50);
const routes = navigationRoutes('').filter(r => !r.detail);
routes.push({ label: 'Ads', path: '/ads', heading: 'Ads', content: '.bo-preview-list' });
const require = createRequire(join(resolve(arg('--playwright', '/tmp/bloomops-c6-tools')), 'package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
let checkpoint = 'initialization';
try {
  const context = await browser.newContext({ storageState, viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    const now = () => performance.timeOrigin + performance.now();
    let route, sample;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const url = new URL(response.url);
      if (sample && url.origin === location.origin && url.pathname === route.path
        && response.headers.get('content-type')?.startsWith('text/x-component')) {
        // Chromium can cancel a fully rendered RSC fetch when React drops its
        // reader. Drain a bounded clone without delaying the application's
        // response or adding a request, so network EOF remains observable.
        const body = sample.body = { bytes: 0 };
        const reader = response.clone().body.getReader();
        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) { body.endAt = now(); break; }
              body.firstAt ??= now(); body.lastAt = now(); body.bytes += value.byteLength;
              if (body.bytes > 4 * 1024 * 1024) { body.exceeded = true; await reader.cancel(); break; }
            }
          } catch { body.failed = true; }
        })();
      }
      return response;
    };
    function check() {
      if (!sample || sample.domAt || location.pathname !== route.path) return;
      const heading = document.querySelector('main h1');
      const content = document.querySelector(`main ${route.content.split(', ').join(', main ')}`);
      if (!heading || heading.textContent.trim() !== route.heading || !heading.checkVisibility() || !content?.checkVisibility()) return;
      sample.domAt = now();
      requestAnimationFrame(() => requestAnimationFrame(() => { sample.framesAt = now(); }));
    }
    window.perf3Arm = next => { route = next; sample = null; };
    window.perf3Read = () => sample && { ...sample, body: sample.body && { ...sample.body } };
    document.addEventListener('click', event => {
      const link = event.target.closest('a');
      if (route && link && new URL(link.href).pathname === route.path) sample = { clickAt: now() };
    }, true);
    new MutationObserver(check).observe(document, { childList: true, subtree: true, attributes: true });
    for (const key of ['pushState', 'replaceState']) {
      const original = history[key].bind(history);
      history[key] = (...args) => { const result = original(...args); queueMicrotask(check); return result; };
    }
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  let active = null, requests = new Map(), errors = 0;
  page.on('pageerror', () => errors++);
  cdp.on('Network.requestWillBeSent', event => {
    const url = new URL(event.request.url);
    if (!active || url.origin !== base || url.pathname !== active.path || !['Fetch', 'Document'].includes(event.type)) return;
    requests.set(event.requestId, { clockOffset: event.wallTime * 1000 - event.timestamp * 1000,
      requestAt: event.wallTime * 1000, prefetch: Object.keys(event.request.headers).some(k => k.toLowerCase() === 'next-router-prefetch'), type: event.type });
  });
  cdp.on('Network.responseReceived', event => {
    const r = requests.get(event.requestId); if (!r) return;
    const h = event.response.headers, timing = event.response.timing;
    r.headersAt = timing ? r.clockOffset + timing.requestTime * 1000 + timing.receiveHeadersStart : r.clockOffset + event.timestamp * 1000;
    r.status = event.response.status;
    const headers = Object.fromEntries(Object.entries(h).map(([k,v]) => [k.toLowerCase(),v]));
    r.sampleId = local ? headers['x-perf1-sample'] : null;
    r.edgeColo = headers['cf-ray']?.match(/-([A-Z]{3})$/)?.[1] || null;
    r.noStore = /no-store/.test(headers['cache-control'] || '');
  });
  cdp.on('Network.dataReceived', event => {
    const r = requests.get(event.requestId); if (!r || !event.dataLength) return;
    const at = r.clockOffset + event.timestamp * 1000;
    r.firstChunkAt ??= at; r.lastChunkAt = at;
    r.decodedBytes = (r.decodedBytes || 0) + event.dataLength;
  });
  cdp.on('Network.loadingFinished', event => {
    const r = requests.get(event.requestId); if (!r) return;
    r.bodyEndAt = r.clockOffset + event.timestamp * 1000; r.encodedBytes = event.encodedDataLength;
  });
  cdp.on('Network.loadingFailed', event => { const r = requests.get(event.requestId); if (r) r.failed = true; });
  await page.goto(base + '/systems', { waitUntil: 'networkidle' });
  assert.equal(new URL(page.url()).pathname, '/systems', 'Signed-in Systems required');
  const rows = [];
  for (let round = 0; round < rounds; round++) for (const route of routes) {
    checkpoint = `${round} ${route.label}`; active = route; requests = new Map();
    await page.evaluate(route => window.perf3Arm(route), route);
    await page.locator(`nav[aria-label="Main"] a[href="${route.path}"]`).filter({ visible: true }).first().click();
    await page.waitForFunction(() => Boolean(window.perf3Read()?.framesAt));
    await page.waitForFunction(() => Boolean(window.perf3Read()?.body?.endAt));
    const dom = await page.evaluate(() => window.perf3Read());
    // Wait only for measurement delivery, after the browser-owned DOM/frame
    // timestamps. A missing Chromium completion event remains explicitly null.
    for (let i = 0; i < 20 && [...requests.values()].some(r => !r.bodyEndAt); i++) await new Promise(resolve => setTimeout(resolve, 25));
    assert.equal(requests.size, 1, 'Exactly one actual destination request required');
    const r = [...requests.values()][0];
    assert.ok(!r.failed, 'Destination request failed');
    assert.equal(r.status, 200, 'Destination status');
    assert.equal(r.prefetch, false, 'Protected prefetch');
    assert.equal(r.noStore, true, 'Protected response must be no-store');
    const trace = r.sampleId ? await (await fetch(base + '/__perf1?id=' + r.sampleId)).json() : null;
    if (trace) { delete trace.id; delete trace.started; assert.ok(Number.isFinite(trace.completeMs)); }
    const row = { round, route: route.label, ...completionMetrics(r, dom),
      status: r.status, prefetch: r.prefetch, noStore: r.noStore, edgeColo: r.edgeColo, trace };
    rows.push(row); console.log(JSON.stringify({ ...row, trace: trace && { completeMs: trace.completeMs, d1WaitMs: trace.d1WaitMs, depth: trace.depth } }));
    active = null;
  }
  assert.equal(errors, 0, 'No browser errors');
  const metrics = Object.keys(rows[0]).filter(k => k.endsWith('Ms') || k.endsWith('Bytes'));
  const summary = routes.map(route => { const retained = rows.filter(r => r.route === route.label && r.round >= warmups);
    return { route: route.label, ...Object.fromEntries(metrics.map(k => [k, distribution(retained.map(r => r[k]))])),
      serverCompleteMs: distribution(retained.map(r => r.trace?.completeMs)),
      d1WaitMs: distribution(retained.map(r => r.trace?.d1WaitMs)),
      nonD1ElapsedMs: distribution(retained.map(r => r.trace?.nonD1ElapsedMs)),
      depth: [...new Set(retained.map(r => r.trace?.depth).filter(Number.isFinite))] }; });
  const out = resolve(arg('--out', '/tmp/bloomops-perf3-completion'));
  mkdirSync(out, { recursive: true, mode: 0o700 });
  writeFileSync(join(out, 'completion.json'), JSON.stringify({ environment: local ? 'local' : 'staging', expectedSha: expectedSha || null,
    servedSha: version.sha, rounds, warmups, summary, rows }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(summary, null, 2));
} catch (error) {
  console.error(JSON.stringify({ checkpoint, error: error.name, assertion: error.name === 'AssertionError' ? error.message : null,
    message: 'Completion measurement failed; no private URL or response logged.' })); process.exitCode = 1;
} finally { await browser.close(); }
