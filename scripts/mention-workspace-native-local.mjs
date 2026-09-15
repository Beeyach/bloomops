// No Wrangler config, credentials, persistent state or remote resources loaded.
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import { migrationFiles } from '../tests/_bloomops-db.mjs';
import { verifyMentionWorkspace } from '../tests/_mention-workspace.mjs';
const require = createRequire(import.meta.url);
const { Miniflare, convertV4MiniflareOptions } = require(require.resolve('miniflare', { paths: [dirname(require.resolve('wrangler/package.json'))] }));
const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("local only")}}', compatibilityDate: '2025-05-01', cf: false, d1Databases: { DB: 'maintenance-mentions-disposable' } }));
try {
  const db = await mf.getD1Database('DB');
  for (const file of migrationFiles()) {
    for (const sql of readFileSync(file.url, 'utf8').split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean)) await db.prepare(sql).run();
  }
  console.log(JSON.stringify({ localOnly: true, migrations: migrationFiles().length, checks: await verifyMentionWorkspace(db) }));
} finally { await mf.dispose(); }
