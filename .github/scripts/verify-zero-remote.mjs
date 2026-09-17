// Proves that a brand-new D1 database reaches the current BloomOps schema from
// zero through the repository's own migration paths, then removes the
// database it created. Phase A2 requires this on a remote database, and the
// existing staging database cannot show it because it carried the inherited
// schema before the domain migrations arrived.
//
//   node .github/scripts/verify-zero-remote.mjs            (remote: creates, migrates, deletes)
//   node .github/scripts/verify-zero-remote.mjs --local    (same steps on wrangler's local D1, no account)
//
// What it touches. One disposable database, created here under the name below
// and deleted at the end whether or not the checks pass. Every migration
// command runs with an explicit --config file written to a temporary directory
// whose only D1 binding is that database, so the committed wrangler.jsonc, its
// staging and production ids, and every other database on the account are out
// of reach. The account inventory is read before and after and must match.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getTableName } from 'drizzle-orm';
import { BLOOMOPS_TABLES } from '../../lib/bloomops/schema.mjs';
import { assertDisposableName, assertDisposableIdentity, guardWranglerCommand, protectedIdsAreDistinct, sameDatabaseInventory, stagingIdentityUnchanged } from './zero-verify-safety.mjs';

export async function verifyZero({execute = execFileSync, local = false, diagnostic = false,
  summaryPath = process.env.ZERO_VERIFY_SUMMARY_PATH, logger = globalThis.console} = {}) {
const console = logger;
const DB_NAME = 'bloomops-a2-zero-verify';
const LOCAL = local;
const MODE = LOCAL ? '--local' : '--remote';
const REPO = process.cwd();
const outcome = {revision:process.env.GITHUB_SHA || null, mode:MODE, databaseName:DB_NAME,
  databaseId:null, firstPass:'not_run', integrity:'not_run', repeatPass:'not_run', cleanup:'not_needed', diagnostics:[]};
function persist() { if (summaryPath) writeFileSync(summaryPath, JSON.stringify(outcome,null,2)+'\n'); }

// Names this script must never address, from the products and environments
// that own real data. The disposable name is checked against them too.
assertDisposableName(DB_NAME);

const results = [];
function record(step, ok, detail = '') {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${step}${detail ? `  (${detail})` : ''}`);
  if (!ok) throw new Error(`${step}: ${detail}`);
}
function summary(title) {
  const lines = results.map((r) => `| ${r.ok ? 'pass' : 'FAIL'} | ${r.step} | ${r.detail} |`);
  const md = `### ${title}\n\n| Result | Step | Detail |\n|---|---|---|\n${lines.join('\n')}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
}

// The committed config is read only to learn which ids must stay untouched.
const committed = JSON.parse(readFileSync(join(REPO, 'wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
let configPath = '';
const stagingId = committed?.env?.staging?.d1_databases?.[0]?.database_id || '';
const stagingName = committed?.env?.staging?.d1_databases?.[0]?.database_name || '';
const productionId = committed?.env?.production?.d1_databases?.[0]?.database_id || '';

// ── wrangler plumbing ────────────────────────────────────────────────────
const stripAnsi = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, '');

// Every Wrangler call is checked before execution. Only the disposable DB
// binding can be queried/migrated; staging info is explicitly read-only.
function guard(args) {
  guardWranglerCommand(args, { configPath, mode: MODE, databaseName: DB_NAME, stagingName });
}
function run(args, { quiet = true } = {}) {
  guard(args);
  const out = execute('npx', ['--no-install', 'wrangler', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  const text = stripAnsi(out);
  if (!quiet) console.log(text.trim());
  return text;
}
function runJson(args) {
  const text = run([...args, '--json'], { quiet: true });
  const starts = ['[', '{'].map((c) => text.indexOf(c)).filter((i) => i >= 0);
  if (!starts.length) throw new Error(`wrangler ${args.join(' ')} returned no JSON`);
  return JSON.parse(text.slice(Math.min(...starts)));
}

const account = (args) => runJson(args);
const inventory = () => account(['d1', 'list']).map((d) => ({ uuid: d.uuid, name: d.name, version: d.version, created_at: d.created_at }));
const namesOf = (list) => list.map((d) => d.name).sort().join(', ');

// Database commands. Every one carries the temporary config, so the DB
// binding can only be the disposable database.
const target = () => {
  if (!configPath) throw new Error('temporary config not written yet');
  return ['--config', configPath, MODE];
};
function query(sql) {
  const parsed = runJson(['d1', 'execute', 'DB', ...target(), '--command', sql]);
  if (!Array.isArray(parsed) || parsed.length !== 1 || parsed[0]?.success !== true || !Array.isArray(parsed[0].results)) throw Error('Invalid query response');
  return parsed[0].results;
}
function execFile(file) {
  const parsed = runJson(['d1', 'execute', 'DB', ...target(), '--file', file]);
  const statements = Array.isArray(parsed) ? parsed : [parsed];
  if (statements.some((r) => r && r.success === false)) throw new Error(`${file}: a statement failed`);
  return statements.length;
}
function node(args) {
  const out = execute('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  return stripAnsi(out);
}

// ── expectations, all derived from the repository ────────────────────────
const inheritedFiles = readdirSync(join(REPO, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
const journal = JSON.parse(readFileSync(join(REPO, 'drizzle', 'meta', '_journal.json'), 'utf8'));
const domainFiles = journal.entries.map((e) => `${e.tag}.sql`);
const domainTables = BLOOMOPS_TABLES.map(getTableName);
// Derive the complete final table inventory, including inherited tables and
// their rename migration, rather than accepting arbitrary extra tables.
const expectedTables = new Set(['_migrations', 'd1_migrations']);
for (const file of ['schema.sql', ...inheritedFiles.map(f => `migrations/${f}`), ...domainFiles.map(f => `drizzle/${f}`)]) {
  const source = readFileSync(join(REPO, file), 'utf8');
  for (const match of source.matchAll(/^\s*(?:CREATE TABLE(?: IF NOT EXISTS)?\s+["'`]?([\w]+)|DROP TABLE(?: IF EXISTS)?\s+["'`]?([\w]+)|ALTER TABLE\s+["'`]?([\w]+)["'`]?\s+RENAME TO\s+["'`]?([\w]+))/gmi)) {
    if (match[1]) expectedTables.add(match[1]);
    if (match[2]) expectedTables.delete(match[2]);
    if (match[3]) { expectedTables.delete(match[3]); expectedTables.add(match[4]); }
  }
}
const triggerNames = [...domainFiles.map((file) => readFileSync(join(REPO, 'drizzle', file), 'utf8')).join('\n')
  .matchAll(/CREATE\s+TRIGGER\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)/gi)].map((m) => m[1]);
// Every index the committed migrations create, read from the migrations
// themselves rather than listed here, so a migration that adds one is
// covered without editing this file. Some phases add nothing but an index
// (A6's one primary contact per client, A7's one open engagement per
// service type), and a table-only check would pass with it missing.
const indexNames = [...domainFiles
  .map((file) => readFileSync(join(REPO, 'drizzle', file), 'utf8'))
  .join('\n')
  .matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)/gi)].map((m) => m[1]);
const listSql = (type) => `SELECT name FROM sqlite_master WHERE type = '${type}' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name`;
const names = (type) => query(listSql(type)).map((r) => r.name);

// One picture of the whole schema plus both ledgers, for the no-op comparison.
function snapshot() {
  const objects = query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name");
  const inherited = query('SELECT name FROM _migrations ORDER BY name').map((r) => r.name);
  const domain = query('SELECT name FROM d1_migrations ORDER BY id').map((r) => r.name);
  return JSON.stringify({ objects, inherited, domain });
}

// The three repository migration paths, in bootstrap order, against the
// disposable database. Returns what each reported.
function migrateAll(label) {
  const schemaStatements = execFile('schema.sql');
  record(`${label}: inherited base schema (schema.sql)`, schemaStatements > 0, `${schemaStatements} statements, none failed`);

  const out = node([join(REPO, 'scripts', 'migrate.mjs'), MODE, '--config', configPath]);
  const line = (prefix) => (out.split('\n').find((l) => l.startsWith(prefix)) || '').slice(prefix.length).trim();
  const count = (v) => (v === '(none)' || !v ? 0 : v.split(',').length);
  const inherited = {
    applied: count(line('applied:')),
    satisfied: count(line('already present (recorded, not executed):')),
    skipped: count(line('already applied:')),
  };
  record(`${label}: inherited migration ledger (scripts/migrate.mjs)`, inherited.applied + inherited.satisfied + inherited.skipped === inheritedFiles.length,
    `applied ${inherited.applied}, recorded as already present ${inherited.satisfied}, already applied ${inherited.skipped}, of ${inheritedFiles.length} files`);

  const apply = run(['d1', 'migrations', 'apply', 'DB', ...target()]);
  const noop = /No migrations to apply/i.test(apply);
  const appliedNow = domainFiles.filter((f) => apply.includes(f));
  record(`${label}: BloomOps domain migrations (wrangler d1 migrations apply)`, noop || appliedNow.length === domainFiles.length,
    noop ? 'No migrations to apply' : `applied ${appliedNow.length} domain migrations`);
  const list = run(['d1', 'migrations', 'list', 'DB', ...target()], { quiet: true });
  record(`${label}: no domain migration left pending`, /No migrations to apply/i.test(list));
  return { schemaStatements, inherited, domainApplied: noop ? [] : appliedNow };
}

// ── the run ──────────────────────────────────────────────────────────────
let created = false;
let createdId = '';
let before = [];
let stagingBefore = null;
let tmp = '';
let exitCode = 0;
function errorDetail(err) { return stripAnsi(err.stderr || err.stdout || err.message).slice(0,2000); }
function diagnose(label, operation) {
  try { const value=operation();outcome.diagnostics.push({label,status:'completed',value}); }
  catch(err) { outcome.diagnostics.push({label,status:'error',error:errorDetail(err)}); }
}
function configureTarget() {
  tmp = mkdtempSync(join(tmpdir(), 'bloomops-zero-verify-'));
  configPath = join(tmp, 'wrangler.zero-verify.jsonc');
  writeFileSync(configPath, JSON.stringify({
    name: DB_NAME,
    compatibility_date: committed.compatibility_date || '2025-05-01',
    d1_databases: [{ binding: 'DB', database_name: DB_NAME, database_id: createdId, migrations_dir: resolve(REPO, 'drizzle') }],
  }, null, 2));
}
try {
  if (!LOCAL) {
    record('committed staging id and production id are known and distinct', protectedIdsAreDistinct(stagingId, productionId));
    before = inventory();
    record(`no database named ${DB_NAME} exists before this run`, !before.some((d) => d.name === DB_NAME),
      `${before.length} databases on the account: ${namesOf(before)}`);
    if (stagingName) {
      stagingBefore = account(['d1', 'info', stagingName]);
      console.log(`${stagingName} before: ${stagingBefore.num_tables} tables`);
    }

    outcome.cleanup='creation_unconfirmed';persist();
    const creation = run(['d1', 'create', DB_NAME]);
    created = true;
    // Pin the id returned by CREATE itself before any further account call.
    // An inventory lookup alone cannot prove ownership of a replacement.
    createdId = creation.match(/"database_id"\s*:\s*"([a-f0-9-]{36})"/i)?.[1] || '';
    outcome.databaseId=createdId;outcome.cleanup='pending';persist();
    record(`${DB_NAME} CREATE returned a new identity`, Boolean(createdId) && !before.some(d=>d.uuid===createdId), `id ${createdId}`);
    record('the new id is not the staging or production id', createdId !== stagingId && createdId !== productionId);
    configureTarget();
    summary('Disposable identity');results.length=0;
    const now = inventory();
    const mine = now.find((d) => d.name === DB_NAME);
    assertDisposableIdentity(mine,createdId,DB_NAME);
    record('nothing else on the account changed when it was created', sameDatabaseInventory(now.filter((d) => d.uuid !== createdId),before));
  } else {
    createdId = `${DB_NAME}-local`;
    configureTarget();
  }

  record('temporary wrangler config binds DB to the disposable database only', true, `${configPath}, ${LOCAL ? 'local' : 'remote'}`);

  const initial = query("SELECT type, name FROM sqlite_master ORDER BY name");
  const own = initial.filter((r) => !/^(sqlite_|_cf_)/.test(r.name));
  record('the database begins empty', own.length === 0,
    `sqlite_master holds ${initial.length} internal object(s): ${initial.map((r) => `${r.type} ${r.name}`).join(', ') || 'none'}; no user objects`);

  outcome.firstPass='running';
  const first = migrateAll('first run');
  record('first run applied every domain migration', first.domainApplied.length === domainFiles.length, `${first.domainApplied.length} migrations`);

  const inheritedLedger = query('SELECT name FROM _migrations ORDER BY name').map((r) => r.name);
  record('inherited ledger is complete', JSON.stringify(inheritedLedger) === JSON.stringify(inheritedFiles),
    `${inheritedLedger.length} of ${inheritedFiles.length} migration files recorded`);
  const domainLedger = query('SELECT name FROM d1_migrations ORDER BY id').map((r) => r.name);
  record('Drizzle ledger holds every domain migration in committed order', JSON.stringify(domainLedger) === JSON.stringify(domainFiles), `${domainLedger.length} migrations`);

  const tables = names('table');
  record('only migration-defined tables and ledgers exist', JSON.stringify(tables) === JSON.stringify([...expectedTables].sort()), `${tables.length} expected tables`);
  const missing = domainTables.filter((t) => !tables.includes(t));
  record('all current BloomOps tables exist', missing.length === 0,
    `${domainTables.length} domain tables present, ${tables.length} tables in total (including _migrations and d1_migrations)`);
  const triggers = names('trigger');
  const missingTriggers = triggerNames.filter((t) => !triggers.includes(t));
  record('every migration-defined immutability trigger exists', missingTriggers.length === 0 && triggerNames.length > 0, `${triggers.length} triggers`);
  const indexes = names('index');
  const missingIndexes = indexNames.filter((i) => !indexes.includes(i));
  record('every index the migrations create exists', missingIndexes.length === 0 && indexNames.length > 0,
    missingIndexes.length === 0 ? `${indexNames.length} indexes, including the partial unique ones` : `missing: ${missingIndexes.join(', ')}`);

  record('fresh database has no foreign-key violations', query('PRAGMA foreign_key_check').length === 0);
  outcome.firstPass='passed';persist();
  if (diagnostic && !LOCAL) {
    diagnose('SQLite runtime',()=>query('SELECT sqlite_version() AS version'));
    diagnose('small statement compilation control',()=>({opcodes:query('EXPLAIN SELECT 1').length}));
    diagnose('whole-schema quick_check compilation (EXPLAIN only)',()=>({opcodes:query('EXPLAIN PRAGMA quick_check').length}));
  }
  try {
   if (LOCAL) {
    const { localD1Integrity } = await import('./zero-local-integrity.mjs');
    const integrity = localD1Integrity(tmp);
    record('fresh database passes whole-database SQLite integrity check', integrity.result === 'ok', `exact disposable D1 file, query-only SQLite ${integrity.version}; no partial-table substitution`);
    if (diagnostic) {
      const {localBytecodeDiagnostic}=await import('./zero-local-integrity.mjs');
      diagnose('local statement-bytecode limit experiment',()=>localBytecodeDiagnostic(tmp));
    }
   } else {
    const integrity = query('PRAGMA quick_check');
    outcome.integrity='finding';
    record('fresh database passes SQLite integrity check', integrity.length === 1 && Object.values(integrity[0])[0] === 'ok');
   }
   outcome.integrity='passed';
  } catch(err) {
    if(outcome.integrity!=='finding')outcome.integrity='uncompleted';
    outcome.integrityError=errorDetail(err);exitCode=1;persist();
    console.error(`::error::integrity ${outcome.integrity}: ${outcome.integrityError}`);
    // Only the diagnosed compilation/resource error permits independent
    // repeat-pass evidence. It never replaces or passes the integrity gate.
    if(!diagnostic || outcome.integrity==='finding' || !outcome.integrityError.includes('SQLITE_NOMEM'))throw err;
  }
  const snapA = snapshot();
  outcome.repeatPass='running';
  const second = migrateAll('second run');
  record('second run changed nothing in the inherited ledger', second.inherited.applied === 0 && second.inherited.satisfied === 0 && second.inherited.skipped === inheritedFiles.length);
  record('second run applied no domain migration', second.domainApplied.length === 0);
  record('schema and both ledgers are identical after the second run', snapshot() === snapA);
  outcome.repeatPass='passed';

  summary(`Zero-to-current migration of ${DB_NAME} (${LOCAL ? 'local' : 'remote'})`);
  if(!exitCode)console.log('::notice::zero-to-current verification passed');
} catch (err) {
  exitCode = 1;
  if(outcome.firstPass==='running')outcome.firstPass='failed';
  if(outcome.repeatPass==='running')outcome.repeatPass='failed';
  outcome.error=errorDetail(err);
  console.error(`::error::${err.message}`);
  if (err.stdout || err.stderr) console.error(stripAnsi(err.stderr || err.stdout).slice(0, 2000));
  summary(`Zero-to-current migration of ${DB_NAME} (${LOCAL ? 'local' : 'remote'}) FAILED`);
} finally {
  results.length = 0;
  try {
    if (created) {
      const info = account(['d1', 'info', DB_NAME]);
      assertDisposableIdentity(info, createdId, DB_NAME);
      // Resolve the immutable UUID via the isolated binding, not a second
      // name lookup that could target a replacement created during cleanup.
      run(['d1', 'delete', 'DB', '--config', configPath, '--skip-confirmation']);
      const after = inventory();
      record(`${DB_NAME} deleted`, !after.some((d) => d.name === DB_NAME || d.uuid === createdId));
      outcome.cleanup='absent';
      outcome.inventoryBefore=before;outcome.inventoryAfter=after;
      record('the account holds exactly the databases it held before', sameDatabaseInventory(before, after),
        `${after.length} databases: ${namesOf(after)}`);
      if (stagingBefore) {
        const stagingAfter = account(['d1', 'info', stagingName]);
        record(`${stagingName} identity unchanged`, stagingIdentityUnchanged(stagingBefore, stagingAfter),
          `uuid ${stagingAfter.uuid}; created_at ${stagingAfter.created_at}`);
        console.log(`${stagingName} table count (informational): ${stagingBefore.num_tables} before, ${stagingAfter.num_tables} after; concurrent staging migrations are allowed. Isolation is enforced by the disposable command/config guards.`);
      }
    }
  } catch (err) {
    exitCode = 1;
    outcome.cleanupError=errorDetail(err);if(outcome.cleanup!=='absent')outcome.cleanup='unconfirmed';
    console.error(`::error::cleanup: ${err.message}`);
  }
  try { if (tmp) rmSync(tmp, { recursive: true, force: true }); }
  catch(err) { exitCode=1;outcome.localCleanupError=errorDetail(err); }
  outcome.exitCode=exitCode;
  console.log('ZERO_VERIFY_SUMMARY '+JSON.stringify(outcome));
  summary('Cleanup');
  if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,`\nFinal outcome\n\n\`\`\`json\n${JSON.stringify(outcome,null,2)}\n\`\`\`\n`);
  persist();
}
return outcome;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outcome=await verifyZero({local:process.argv.includes('--local'),diagnostic:process.argv.includes('--diagnose-bytecode')});
  process.exitCode=outcome.exitCode; // Let pending stdout/stderr drain naturally.
}
