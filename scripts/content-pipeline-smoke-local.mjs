#!/usr/bin/env node
// Run C2 inside the real Worker runtime with disposable D1. No account,
// repository secrets, remote binding, persistent data or production config.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'esbuild';
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve('miniflare', { paths: [dirname(require.resolve('wrangler/package.json'))] }));
const temp = mkdtempSync(join(tmpdir(), 'bloomops-c2-smoke-'));
let mf;
try {
  const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url)));
  assert.equal(journal.entries[14].tag, '0014_c2_content_pipeline');
  const migrations = journal.entries.flatMap(({ tag }) => readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean));
  const bundle = await build({ entryPoints: [new URL('./content-pipeline-smoke-worker.mjs', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false,
    external: ['node:*'], define: { C2_MIGRATIONS: JSON.stringify(migrations) }, logLevel: 'silent' });
  mf = new Miniflare(convertV4MiniflareOptions({ name: 'bloomops-c2-disposable', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2025-05-01', compatibilityFlags: ['nodejs_compat'], cf: false,
    d1Databases: { DB: 'bloomops-c2-disposable-local' },
    resourcePersistencePath: temp, bindings: { C2_DISPOSABLE: 'local-only' } }));
  // Dispatch into the Worker itself; no Node-side R2 proxy is used.
  const response = await mf.dispatchFetch('http://localhost/c2-disposable');
  const result = await response.json();
  for (const message of result.messages || []) console.log(`ok   ${message}`);
  assert.equal(response.status, 200, result.error);
  console.log(`C2 disposable workerd/D1: ${result.checks} checks passed.`);
} finally { await mf?.dispose(); rmSync(temp, { recursive: true, force: true }); }
