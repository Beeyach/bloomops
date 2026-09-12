#!/usr/bin/env node
// D1 Systems queries in disposable, real workerd/D1. No R2 binding is
// supplied: Systems composition must depend on D1 metadata alone.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve('miniflare', { paths: [dirname(require.resolve('wrangler/package.json'))] }));
const temp = mkdtempSync(join(tmpdir(), 'bloomops-d1-systems-smoke-'));
let mf;
try {
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url)));
  assert.equal(journal.entries.length, 21, 'D4 remains schema-free over the verified D3 migrations');
  const migrations = journal.entries.flatMap(({ tag }) => readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean));
  const bundle = await build({ entryPoints: [new URL('./systems-smoke-worker.mjs', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false,
    external: ['node:*'], define: { D1_SYSTEMS_MIGRATIONS: JSON.stringify(migrations) }, logLevel: 'silent' });
  mf = new Miniflare(convertV4MiniflareOptions({ name: 'bloomops-d1-systems-disposable', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2025-05-01', compatibilityFlags: ['nodejs_compat'], cf: false,
    d1Databases: { DB: 'bloomops-d1-systems-disposable-local' }, resourcePersistencePath: temp, bindings: { D1_SYSTEMS_DISPOSABLE: 'local-only' } }));
  const response = await mf.dispatchFetch('http://localhost/d1-systems-disposable');
  const result = await response.json();
  for (const message of result.messages || []) console.log(`ok   ${message}`);
  assert.equal(response.status, 200, result.error);
  console.log(`D1 Systems disposable workerd/D1: ${result.checks} checks passed. ${JSON.stringify(result.metrics)}`);
} finally { await mf?.dispose(); rmSync(temp, { recursive: true, force: true }); }
