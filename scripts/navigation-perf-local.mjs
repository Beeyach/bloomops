#!/usr/bin/env node
// The real built OpenNext Worker, with a local-only D1 timing wrapper.
// Usage: node scripts/navigation-perf-local.mjs [--d1-delay-ms 100]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unstable_getMiniflareWorkerOptions } from 'wrangler';
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url), wranglerRoot = dirname(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve('miniflare', { paths: [wranglerRoot] }));
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--d1-delay-ms'));
const delay = Number(args[1] || 0);
assert.ok(Number.isInteger(delay) && delay >= 0 && delay <= 500);
let mf, temporary;
try {
  const config = unstable_getMiniflareWorkerOptions(join(root, 'wrangler.jsonc')), options = config.workerOptions;
  assert.equal(options.bindings.BLOOMOPS_ENV, 'development');
  assert.equal(options.bindings.BLOOMOPS_MAIL_TRANSPORT, 'r2-dev');
  assert.equal(options.d1Databases.DB.id, 'bloomops-dev-local');
  assert.equal(options.r2Buckets.FILES.id, 'bloomops-files-dev');
  assert.equal(config.externalWorkers.length, 0);
  Object.assign(options.bindings, { BLOOMOPS_APP_URL: 'http://localhost:8787', PERF1_LOCAL_ONLY: 'synthetic-local', PERF1_D1_DELAY_MS: String(delay) });
  temporary = mkdtempSync(join(tmpdir(), 'bloomops-perf1-'));
  execFileSync(process.execPath, [join(wranglerRoot, 'bin/wrangler.js'), 'deploy', 'scripts/navigation-perf-worker.mjs', '--dry-run', '--no-autoconfig',
    '--config', join(root, 'wrangler.jsonc'), '--outdir', temporary], { cwd: root, env: { ...process.env, WRANGLER_LOG: 'error' }, stdio: 'pipe' });
  delete options.modulesRules;
  mf = new Miniflare(convertV4MiniflareOptions({ ...options, name: 'bloomops-dev', modules: true,
    script: readFileSync(join(temporary, 'navigation-perf-worker.js'), 'utf8'), host: '127.0.0.1', port: 8787,
    cf: false, logRequests: false, resourcePersistencePath: join(root, '.wrangler/state/v3') }));
  await mf.ready;
  const health = await (await mf.dispatchFetch('http://localhost:8787/api/health')).json();
  assert.equal(health.environment, 'development'); assert.equal(health.auth.mail, 'r2-dev'); assert.equal(health.ok, true);
  console.log(`PERF1 local built Worker ready; synthetic D1 latency ${delay}ms per call.`);
  await new Promise(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
} catch {
  console.error('PERF1 preview failed. Check build, local migrations and development configuration.'); process.exitCode = 1;
} finally { await mf?.dispose(); if (temporary) rmSync(temporary, { recursive: true, force: true }); }
