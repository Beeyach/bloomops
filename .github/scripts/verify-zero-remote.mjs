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
import { getTableName } from 'drizzle-orm';
import { BLOOMOPS_TABLES } from '../../lib/bloomops/schema.mjs';

const DB_NAME = 'bloomops-a2-zero-verify';
const LOCAL = process.argv.includes('--local');
const MODE = LOCAL ? '--local' : '--remote';
const REPO = process.cwd();

// Names this script must never address, from the products and environments
// that own real data. The disposable name is checked against them too.
const FORBIDDEN = /bloomtrack|leadsthatbloom|bloomwired|412a33ad|staging|production/i;
if (FORBIDDEN.test(DB_NAME)) throw new Error(`disposable name ${DB_NAME} collides with a protected name`);

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

// Every wrangler call passes through here. A database command must carry the
// temporary config written by this script. An account command may only name
// the disposable database, except `d1 info`, which may also read the staging
// database's metadata to show it did not change.
function guard(args) {
  if (args.includes('--config')) {
    if (!configPath || args[args.indexOf('--config') + 1] !== configPath) throw new Error('refusing a database command without the temporary config');
    return;
  }
  const [group, command, ...named] = args.filter((a) => !a.startsWith('-'));
  if (group !== 'd1' || !['list', 'info', 'create', 'delete'].includes(command)) throw new Error(`refusing wrangler ${group} ${command}`);
  const allowed = command === 'info' ? [DB_NAME, stagingName] : [DB_NAME];
  for (const n of named) if (!allowed.includes(n)) throw new Error(`refusing to address ${n}`);
}
function run(args, { quiet = false } = {}) {
  guard(args);
  const out = execFileSync('npx', ['--no-install', 'wrangler', ...args], {
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
  return parsed?.[0]?.results || [];
}
function execFile(file) {
  const parsed = runJson(['d1', 'execute', 'DB', ...target(), '--file', file]);
  const statements = Array.isArray(parsed) ? parsed : [parsed];
  if (statements.some((r) => r && r.success === false)) throw new Error(`${file}: a statement failed`);
  return statements.length;
}
function node(args) {
  const out = execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  console.log(stripAnsi(out).trim());
  return stripAnsi(out);
}

// ── expectations, all derived from the repository ────────────────────────
const inheritedFiles = readdirSync(join(REPO, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
const journal = JSON.parse(readFileSync(join(REPO, 'drizzle', 'meta', '_journal.json'), 'utf8'));
const domainFiles = journal.entries.map((e) => `${e.tag}.sql`);
const domainTables = BLOOMOPS_TABLES.map(getTableName);
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
    noop ? 'No migrations to apply' : `applied ${appliedNow.join(', ')}`);
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
try {
  if (!LOCAL) {
    record('committed staging id and production id are known and distinct', Boolean(stagingId) && stagingId !== productionId);
    before = inventory();
    record(`no database named ${DB_NAME} exists before this run`, !before.some((d) => d.name === DB_NAME),
      `${before.length} databases on the account: ${namesOf(before)}`);
    if (stagingName) {
      stagingBefore = account(['d1', 'info', stagingName]);
      console.log(`${stagingName} before: ${stagingBefore.num_tables} tables`);
    }

    run(['d1', 'create', DB_NAME]);
    created = true;
    const now = inventory();
    const mine = now.find((d) => d.name === DB_NAME);
    createdId = mine?.uuid || '';
    record(`${DB_NAME} was newly created`, Boolean(createdId) && !before.some((d) => d.uuid === createdId), `id ${createdId}`);
    record('the new id is not the staging or production id', createdId !== stagingId && createdId !== productionId);
    record('nothing else on the account changed when it was created', namesOf(now.filter((d) => d.uuid !== createdId)) === namesOf(before));
  } else {
    createdId = `${DB_NAME}-local`;
  }

  tmp = mkdtempSync(join(tmpdir(), 'bloomops-zero-verify-'));
  configPath = join(tmp, 'wrangler.zero-verify.jsonc');
  writeFileSync(configPath, JSON.stringify({
    name: DB_NAME,
    compatibility_date: committed.compatibility_date || '2025-05-01',
    d1_databases: [{ binding: 'DB', database_name: DB_NAME, database_id: createdId, migrations_dir: resolve(REPO, 'drizzle') }],
  }, null, 2));
  record('temporary wrangler config binds DB to the disposable database only', true, `${configPath}, ${LOCAL ? 'local' : 'remote'}`);

  const initial = query("SELECT type, name FROM sqlite_master ORDER BY name");
  const own = initial.filter((r) => !/^(sqlite_|_cf_)/.test(r.name));
  record('the database begins empty', own.length === 0,
    `sqlite_master holds ${initial.length} internal object(s): ${initial.map((r) => `${r.type} ${r.name}`).join(', ') || 'none'}; no user objects`);

  const first = migrateAll('first run');
  record('first run applied every domain migration', first.domainApplied.length === domainFiles.length, first.domainApplied.join(', '));

  const inheritedLedger = query('SELECT name FROM _migrations ORDER BY name').map((r) => r.name);
  record('inherited ledger is complete', JSON.stringify(inheritedLedger) === JSON.stringify(inheritedFiles),
    `${inheritedLedger.length} of ${inheritedFiles.length} migration files recorded`);
  const domainLedger = query('SELECT name FROM d1_migrations ORDER BY id').map((r) => r.name);
  record('Drizzle ledger holds every domain migration in committed order', JSON.stringify(domainLedger) === JSON.stringify(domainFiles), domainLedger.join(', '));

  const tables = names('table');
  const missing = domainTables.filter((t) => !tables.includes(t));
  record('all current BloomOps tables exist', missing.length === 0,
    `${domainTables.length} domain tables present, ${tables.length} tables in total (including _migrations and d1_migrations)`);
  const triggers = names('trigger');
  const missingTriggers = triggerNames.filter((t) => !triggers.includes(t));
  record('every migration-defined immutability trigger exists', missingTriggers.length === 0 && triggerNames.length > 0, `${triggers.join(', ')}`);
  const indexes = names('index');
  const missingIndexes = indexNames.filter((i) => !indexes.includes(i));
  record('every index the migrations create exists', missingIndexes.length === 0 && indexNames.length > 0,
    missingIndexes.length === 0 ? `${indexNames.length} indexes, including the partial unique ones` : `missing: ${missingIndexes.join(', ')}`);

  const snapA = snapshot();
  const second = migrateAll('second run');
  record('second run changed nothing in the inherited ledger', second.inherited.applied === 0 && second.inherited.satisfied === 0 && second.inherited.skipped === inheritedFiles.length);
  record('second run applied no domain migration', second.domainApplied.length === 0);
  record('schema and both ledgers are identical after the second run', snapshot() === snapA);

  summary(`Zero-to-current migration of ${DB_NAME} (${LOCAL ? 'local' : 'remote'})`);
  console.log('::notice::zero-to-current verification passed');
} catch (err) {
  exitCode = 1;
  console.error(`::error::${err.message}`);
  if (err.stdout || err.stderr) console.error(stripAnsi(err.stderr || err.stdout).slice(0, 2000));
  summary(`Zero-to-current migration of ${DB_NAME} (${LOCAL ? 'local' : 'remote'}) FAILED`);
} finally {
  results.length = 0;
  try {
    if (created) {
      const info = account(['d1', 'info', DB_NAME]);
      if (info.uuid !== createdId) throw new Error(`${DB_NAME} resolves to ${info.uuid}, not the id created here (${createdId}); leaving it alone`);
      run(['d1', 'delete', DB_NAME, '--skip-confirmation']);
      const after = inventory();
      record(`${DB_NAME} deleted`, !after.some((d) => d.name === DB_NAME || d.uuid === createdId));
      record('the account holds exactly the databases it held before', JSON.stringify(after) === JSON.stringify(before),
        `${after.length} databases: ${namesOf(after)}`);
      if (stagingBefore) {
        const stagingAfter = account(['d1', 'info', stagingName]);
        record(`${stagingName} untouched`, stagingAfter.uuid === stagingBefore.uuid && stagingAfter.num_tables === stagingBefore.num_tables && stagingAfter.created_at === stagingBefore.created_at,
          `${stagingAfter.num_tables} tables before and after`);
      }
    }
  } catch (err) {
    exitCode = 1;
    console.error(`::error::cleanup: ${err.message}`);
  }
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  if (results.length) summary('Cleanup');
  process.exit(exitCode);
}
