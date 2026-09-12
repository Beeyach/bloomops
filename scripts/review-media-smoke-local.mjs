#!/usr/bin/env node
// E3A on disposable workerd/D1/R2, never an account or persistent binding.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve('miniflare', { paths: [dirname(require.resolve('wrangler/package.json'))] }));
const temp = mkdtempSync(join(tmpdir(), 'bloomops-e3a-smoke-'));
let mf;
try {
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url)));
  assert.equal(journal.entries.length, 24);
  const migrations = journal.entries.map(({ tag }) => readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean));
  const entry = join(temp, 'entry.mjs');
  // Exercise the actual accepted E2B application and its older schema against
  // upgraded D1, including its all-column INSERT builder. Never mutate checkout.
  const baseline = '09de9d61d419add9a9e85d8e5e933936b5561154';
  execFileSync('tar', ['-x', '-C', temp], { input: execFileSync('git', ['archive', baseline, 'lib'], { maxBuffer: 32 * 1024 * 1024 }) });
  symlinkSync(new URL('../node_modules', import.meta.url).pathname, join(temp, 'node_modules'), 'dir');
  const oldApp = join(temp, 'old-app.mjs');
  writeFileSync(oldApp, `export * from './lib/bloomops/content-approvals.mjs';\nexport { createContent } from './lib/bloomops/content.mjs';\nexport * as schema from './lib/bloomops/schema.mjs';\n`);
  await build({ entryPoints: [new URL('./review-media-smoke-worker.mjs', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', outfile: entry,
    // Use the package's real context implementation without its CLI barrel
    // exports (which pull Node filesystem code into a bare workerd bundle).
    alias: { 'e3a-baseline': oldApp, '@opennextjs/cloudflare': join(dirname(require.resolve('@opennextjs/cloudflare')), 'cloudflare-context.js') },
    external: ['node:*'], define: { E3A_MIGRATIONS: JSON.stringify(migrations) }, logLevel: 'silent' });
  // Better Auth's dependency graph includes optional Node filesystem imports.
  // Apply the pinned Wrangler Node-compat shims, exactly as the built app does.
  // This generated config has no remote bindings and --dry-run is unconditional.
  const config = join(temp, 'wrangler.json');
  writeFileSync(config, JSON.stringify({ name: 'bloomops-e3a-disposable', main: entry, compatibility_date: '2025-05-01', compatibility_flags: ['nodejs_compat'] }));
  execFileSync(process.execPath, [join(dirname(require.resolve('wrangler/package.json')), 'bin/wrangler.js'), 'deploy', '--config', config,
    '--dry-run', '--no-autoconfig', '--outdir', join(temp, 'bundle')], { stdio: 'pipe' });
  mf = new Miniflare(convertV4MiniflareOptions({ name: 'bloomops-e3a-disposable', modules: true, script: readFileSync(join(temp, 'bundle/entry.js'), 'utf8'),
    compatibilityDate: '2025-05-01', compatibilityFlags: ['nodejs_compat'], cf: false,
    d1Databases: { DB: 'bloomops-e3a-disposable-local' }, r2Buckets: { FILES: 'bloomops-e3a-disposable-local' },
    resourcePersistencePath: temp, bindings: { E3A_DISPOSABLE: 'local-only' } }));
  const response = await mf.dispatchFetch('http://localhost/e3a-disposable'), result = await response.json();
  for (const message of result.messages || []) console.log(`ok   ${message}`);
  assert.equal(response.status, 200, result.error);
  console.log(`E3A disposable workerd/D1/R2: ${result.checks} checks passed.`);
} finally { await mf?.dispose(); rmSync(temp, { recursive: true, force: true }); }
