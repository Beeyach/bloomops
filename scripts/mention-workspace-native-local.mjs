// No Wrangler config, credentials, persistent state or remote resources loaded.
import assert from 'node:assert/strict';
import { workspaceKeyCases, representativeWrite, keyWriteError } from '../tests/_workspace-key-cases.mjs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { migrationFiles } from '../tests/_bloomops-db.mjs';
import { verifyMentionWorkspace } from '../tests/_mention-workspace.mjs';
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve('miniflare', { paths: [dirname(require.resolve('wrangler/package.json'))] }));
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("local only")}}', compatibilityDate: '2025-05-01', cf: false, d1Databases: { DB: 'maintenance-mentions-disposable', ...Object.fromEntries(workspaceKeyCases.map((_, i) => ['KEY'+i, 'maintenance-key-'+i])) } }));
try {
  const db = await mf.getD1Database('DB');
  for (const file of migrationFiles()) {
    for (const sql of readFileSync(file.url, 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
  }
  for (const [i, fixture] of workspaceKeyCases.entries()) {
    const isolated = await mf.getD1Database('KEY'+i);
    assert.equal((await isolated.prepare('PRAGMA foreign_keys').first()).foreign_keys, 1);
    for (const sql of fixture.ddl) await isolated.prepare(sql).run();
    await assert.rejects(isolated.prepare(representativeWrite(fixture)).run(), keyWriteError(fixture));
    console.log(JSON.stringify({ parentKeyCase: fixture.name, ddl: 'accepted', write: fixture.valid ? 'FK constraint rejected orphan' : 'broken FK rejected write' }));
  }
  console.log(JSON.stringify({ parentKeyCases: workspaceKeyCases.length, localOnly: true, migrations: migrationFiles().length, checks: await verifyMentionWorkspace(db) }));
} finally { await mf.dispose(); }
