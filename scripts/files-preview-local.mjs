#!/usr/bin/env node
// Serve the actual built Worker on loopback, without Wrangler's dev forwarding
// proxy. Uses only the existing development D1/R2 state and pinned runtime.
// First run npm run cf:build and the local migrations/bootstrap.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unstable_getMiniflareWorkerOptions } from 'wrangler';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const wranglerRoot = dirname(require.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve('miniflare', { paths: [wranglerRoot] }));
let mf, temporary;
try {
  assert.equal(process.argv.length, 2, 'This development-only preview takes no remote or environment arguments.');
  const config = unstable_getMiniflareWorkerOptions(join(root, 'wrangler.jsonc'));
  const options = config.workerOptions;
  assert.equal(options.bindings.BLOOMOPS_ENV, 'development');
  assert.equal(options.bindings.BLOOMOPS_MAIL_TRANSPORT, 'r2-dev');
  assert.equal(options.d1Databases.DB.id, 'bloomops-dev-local');
  assert.equal(options.r2Buckets.FILES.id, 'bloomops-files-dev');
  assert.equal(config.externalWorkers.length, 0);
  // The disposable browser harness always serves this loopback origin. Do not
  // rewrite a developer's .dev.vars (which may name their separate dev server).
  options.bindings.BLOOMOPS_APP_URL = 'http://localhost:8787';
  temporary = mkdtempSync(join(tmpdir(), 'bloomops-b5-preview-'));
  // Wrangler's local dry run supplies the same Node compatibility shims as
  // normal preview/deploy. A plain esbuild bundle would lose those shims.
  // --dry-run is unconditional; this command cannot upload a Worker or assets.
  execFileSync(process.execPath, [join(wranglerRoot, 'bin/wrangler.js'), 'deploy', '--dry-run', '--no-autoconfig',
    '--config', join(root, 'wrangler.jsonc'), '--outdir', temporary], {
    cwd: root, env: { ...process.env, WRANGLER_LOG: 'error' }, stdio: 'pipe',
  });
  // The bundle has already resolved module loaders. The pinned v5 adapter
  // rejects v4 module rules and uses one resourcePersistencePath for D1/R2.
  delete options.modulesRules;
  mf = new Miniflare(convertV4MiniflareOptions({ ...options, name: 'bloomops-dev', modules: true,
    script: readFileSync(join(temporary, 'worker.js'), 'utf8'), host: '127.0.0.1', port: 8787,
    cf: false, logRequests: false, resourcePersistencePath: join(root, '.wrangler/state/v3') }));
  await mf.ready;
  const health = await (await mf.dispatchFetch('http://localhost:8787/api/health')).json();
  assert.equal(health.environment, 'development');
  assert.equal(health.auth.mail, 'r2-dev');
  assert.equal(health.ok, true, 'Apply local migrations and configure development authentication first.');
  console.log('Built Worker ready at http://localhost:8787 with local development D1/R2.');
  await new Promise(resolve => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
} catch {
  // Config/child-process errors can contain local secrets; never echo them.
  console.error('Local File preview could not start. Check the built Worker, local migrations and development configuration.');
  process.exitCode = 1;
} finally {
  await mf?.dispose();
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
