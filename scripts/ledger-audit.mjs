// Prove which migrations actually ran, rather than assuming.
//
// The production `_migrations` ledger stopped recording at 019 while the live
// schema kept moving to 046. So the runner tries to replay 27 migrations and
// fails, and nobody can safely add 048.
//
// The wrong fix is to insert 27 rows because "the app works". The app working
// proves the columns the app reads exist; it proves nothing about an index, a
// table nothing has queried yet, or half of a migration that failed midway.
//
// So this reads each migration, extracts what it PROMISES the schema will look
// like afterwards, checks production for each promise, and classifies:
//
//   PROVEN_APPLIED     every postcondition present
//   PARTIALLY_APPLIED  some present, some missing. The dangerous one
//   NOT_APPLIED        none present
//   CANNOT_PROVE       nothing inspectable to check
//
// Only PROVEN_APPLIED may be written to the ledger. Anything else stops and is
// reported, because inserting a ledger row for a migration that half ran is how
// a missing column becomes a mystery six months later.

import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const DB = 'bloomtrack-pro';
const DIR = 'migrations';

export const VERDICT = {
  PROVEN: 'PROVEN_APPLIED',
  PARTIAL: 'PARTIALLY_APPLIED',
  NOT_APPLIED: 'NOT_APPLIED',
  CANNOT_PROVE: 'CANNOT_PROVE',
};

// What a migration promises the schema will contain afterwards.
//
// Deliberately conservative: only the shapes that can be checked against
// sqlite's own catalogues. A CHECK constraint inside a CREATE TABLE is not
// separately inspectable, so it is not claimed as a postcondition.
export function postconditions(sql) {
  const out = { tables: [], columns: [], indexes: [] };
  const text = String(sql || '');

  // sqlite has no ALTER COLUMN, so changing one means build-copy-rename-drop.
  // The scaffolding tables in that dance are created and then renamed or
  // dropped away, so their absence afterwards is the migration working, not
  // failing. 004 rebuilds `settings` exactly this way.
  const gone = new Set();
  for (const m of text.matchAll(/ALTER\s+TABLE\s+["'`]?(\w+)["'`]?\s+RENAME\s+TO/gi)) gone.add(m[1]);
  for (const m of text.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["'`]?(\w+)["'`]?/gi)) gone.add(m[1]);

  for (const m of text.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?/gi)) {
    if (!gone.has(m[1])) out.tables.push(m[1]);
  }
  // A rename's destination IS a postcondition.
  for (const m of text.matchAll(/ALTER\s+TABLE\s+["'`]?\w+["'`]?\s+RENAME\s+TO\s+["'`]?(\w+)["'`]?/gi)) {
    out.tables.push(m[1]);
  }
  for (const m of text.matchAll(/ALTER\s+TABLE\s+["'`]?(\w+)["'`]?\s+ADD\s+(?:COLUMN\s+)?["'`]?(\w+)["'`]?/gi)) {
    out.columns.push({ table: m[1], column: m[2] });
  }
  for (const m of text.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?/gi)) {
    out.indexes.push(m[1]);
  }
  return out;
}

// Classify one migration against a snapshot of the live schema.
export function classify(post, live) {
  const checks = [];
  const push = (kind, name, ok) => checks.push({ kind, name, ok });

  for (const t of post.tables) push('table', t, live.tables.has(t));
  for (const c of post.columns) push('column', `${c.table}.${c.column}`, Boolean(live.columns[c.table]?.has(c.column)));
  for (const i of post.indexes) push('index', i, live.indexes.has(i));

  if (!checks.length) return { verdict: VERDICT.CANNOT_PROVE, checks, present: 0, total: 0 };

  const present = checks.filter((c) => c.ok).length;
  if (present === checks.length) return { verdict: VERDICT.PROVEN, checks, present, total: checks.length };
  if (present === 0) return { verdict: VERDICT.NOT_APPLIED, checks, present, total: checks.length };
  return { verdict: VERDICT.PARTIAL, checks, present, total: checks.length };
}

// ── Live schema, read from sqlite's own catalogues ───────────────────────

function d1(command) {
  // Quoted, because with shell:true on Windows an unquoted SQL string arrives
  // at wrangler as a dozen separate arguments.
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB, '--remote', '--json', '--command', `"${command.replace(/"/g, '\\"')}"`],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, shell: true }
  );
  const start = out.indexOf('[');
  const parsed = JSON.parse(out.slice(start));
  return parsed[0]?.results || [];
}

export async function liveSchema() {
  const objs = d1("SELECT type, name, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
  const tables = new Set(objs.filter((o) => o.type === 'table').map((o) => o.name));
  const indexes = new Set(objs.filter((o) => o.type === 'index').map((o) => o.name));
  const columns = {};
  for (const t of tables) {
    // Cloudflare's own internal tables are not introspectable and are not ours.
    if (t.startsWith('_cf')) continue;
    const cols = d1(`SELECT name FROM pragma_table_info('${t}')`);
    columns[t] = new Set(cols.map((c) => c.name));
  }
  return { tables, indexes, columns };
}

// ── Report ───────────────────────────────────────────────────────────────

async function main() {
  const apply = process.argv.includes('--apply');
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
  const live = await liveSchema();

  const applied = new Set(d1('SELECT name FROM _migrations').map((r) => r.name));

  const rows = [];
  for (const f of files) {
    const sql = readFileSync(join(DIR, f), 'utf8');
    const post = postconditions(sql);
    const res = classify(post, live);
    rows.push({ file: f, inLedger: applied.has(f), ...res });
  }

  const unproven = rows.filter((r) => !r.inLedger && r.verdict !== VERDICT.PROVEN);

  for (const r of rows) {
    const mark = r.inLedger ? 'ledger' : '     ';
    console.log(`${mark}  ${r.verdict.padEnd(18)} ${r.file}  (${r.present}/${r.total})`);
    if (r.verdict === VERDICT.PARTIAL) {
      for (const c of r.checks.filter((c) => !c.ok)) console.log(`         MISSING ${c.kind} ${c.name}`);
    }
  }

  console.log(`\n${rows.length} migrations, ${rows.filter((r) => r.inLedger).length} in the ledger.`);
  console.log(`${rows.filter((r) => r.verdict === VERDICT.PROVEN).length} proven applied.`);

  if (unproven.length) {
    console.log(`\n${unproven.length} not in the ledger and not proven:`);
    for (const r of unproven) console.log(`  ${r.verdict}  ${r.file}`);
    console.log('\nRefusing to write the ledger. Fix or explain these first.');
    if (apply) process.exitCode = 1;
    return;
  }

  const toWrite = rows.filter((r) => !r.inLedger && r.verdict === VERDICT.PROVEN);
  if (!toWrite.length) {
    console.log('\nLedger is already correct.');
    return;
  }
  console.log(`\n${toWrite.length} proven migrations are missing from the ledger.`);
  if (!apply) {
    console.log('Dry run. Re-run with --apply to record them.');
    return;
  }
  const values = toWrite.map((r) => `('${r.file}')`).join(', ');
  d1(`INSERT OR IGNORE INTO _migrations (name) VALUES ${values}`);
  console.log('Recorded.');
}

if (process.argv[1] && process.argv[1].endsWith('ledger-audit.mjs')) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
