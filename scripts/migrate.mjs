// Idempotent D1 migration runner (spec §4). Ordered files in migrations/
// apply once each; bookkeeping lives in a _migrations table on the target
// database. The target is always the `DB` binding declared in wrangler.jsonc
// for the chosen environment, or in an explicit --config file; no database is
// ever addressed by name. Usage:
//   node scripts/migrate.mjs --local                      (development: wrangler's local D1)
//   node scripts/migrate.mjs --remote --env staging       (staging D1)
//   node scripts/migrate.mjs --remote --env production    (production D1, owner runs at deploy time)
//   node scripts/migrate.mjs --remote --config <file>     (the DB binding of that wrangler config only)
// A remote run without --env or --config is refused. --config exists for the
// disposable zero-to-current verification, which must never repoint the
// committed staging or production ids.
// Deploy rule: migrate the live DB BEFORE pushing code that reads new
// columns (HANDOFF gotcha #2).
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postconditions, classify, VERDICT } from './ledger-audit.mjs';

const DB_BINDING = 'DB';

export const ENSURE_TABLE_SQL =
  "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')))";

export function pendingMigrations(allFiles, appliedNames) {
  const applied = new Set(appliedNames);
  return [...allFiles].sort().filter((f) => !applied.has(f));
}

// exec({ command }) or exec({ file }) → parsed result rows (array).
// Injectable so the orchestration is testable without wrangler.
//
// A fresh BloomOps database is bootstrapped from schema.sql, which already
// carries the tables and columns that the early migrations add. Replaying
// those files fails on "duplicate column" and would stop the run, so when a
// live schema reader is supplied the runner checks each pending migration's
// postconditions (the same catalogue checks scripts/ledger-audit.mjs uses)
// and records a migration that is already fully present instead of executing
// it. Anything not fully present executes as before. On a fresh database no
// rows exist yet, so skipping a fully-present migration skips no backfill.
//
//   schema()      → { tables: Set, columns: { [table]: Set }, indexes: Set }
//   readSql(name) → the SQL text of migrations/<name>
export async function runMigrations({ files, exec, schema = null, readSql = null }) {
  await exec({ command: ENSURE_TABLE_SQL });
  const rows = await exec({ command: 'SELECT name FROM _migrations', rows: true });
  const appliedNames = (rows || []).map((r) => r.name);
  const pending = pendingMigrations(files, appliedNames);
  const applied = [];
  const satisfied = [];
  const live = schema && readSql ? await schema() : null;
  for (const name of pending) {
    let post = null;
    if (live) {
      post = postconditions(readSql(name));
      if (classify(post, live).verdict === VERDICT.PROVEN) {
        await exec({ command: `INSERT INTO _migrations (name) VALUES ('${name}')` });
        satisfied.push(name);
        continue;
      }
    }
    await exec({ file: `migrations/${name}` });
    await exec({ command: `INSERT INTO _migrations (name) VALUES ('${name}')` });
    applied.push(name);
    if (live && post) rememberPostconditions(live, post);
  }
  const done = new Set([...applied, ...satisfied]);
  return { applied, satisfied, skipped: files.filter((f) => !done.has(f)) };
}

// After a migration executes, its promised tables, columns, and indexes exist,
// so later pending migrations are classified against the updated picture
// without re-reading the catalogue from the database.
function rememberPostconditions(live, post) {
  for (const t of post.tables) {
    live.tables.add(t);
    if (!live.columns[t]) live.columns[t] = new Set();
  }
  for (const c of post.columns) {
    if (!live.columns[c.table]) live.columns[c.table] = new Set();
    live.columns[c.table].add(c.column);
  }
  for (const i of post.indexes) live.indexes.add(i);
}

// Live schema from sqlite's own catalogues, in one round trip. D1 refuses
// PRAGMA on its internal _cf_ tables, so those are filtered in SQL.
export const LIVE_SCHEMA_SQL =
  "SELECT m.type AS kind, m.name AS name, p.name AS col FROM sqlite_master m " +
  "LEFT JOIN pragma_table_info(m.name) p " +
  "WHERE m.type IN ('table','index') AND substr(m.name,1,4) <> '_cf_' AND substr(m.name,1,7) <> 'sqlite_'";

export function schemaFromRows(rows) {
  const live = { tables: new Set(), columns: {}, indexes: new Set() };
  for (const r of rows || []) {
    if (r.kind === 'index') { live.indexes.add(r.name); continue; }
    live.tables.add(r.name);
    if (!live.columns[r.name]) live.columns[r.name] = new Set();
    if (r.col) live.columns[r.name].add(r.col);
  }
  return live;
}

// SQL always travels via --file: passing multi-word SQL through --command
// with shell:true gets word-split by cmd.exe on Windows. A temp file
// sidesteps SQL quoting; the file PATH itself still needs quoting under
// shell:true (cmd.exe joins args with spaces and does not quote them), so
// any arg containing whitespace is wrapped explicitly.
const winShell = process.platform === 'win32';
const q = (s) => (winShell && /\s/.test(s) ? `"${s}"` : s);
// SQL always needs the quotes, not just when it happens to contain a space.
const qq = (s) => (winShell ? `"${String(s).replace(/"/g, '\\"')}"` : s);

// Wrangler prints a version banner before its JSON, so `JSON.parse(out)` throws
// on every single call.
//
// That mattered far more than it looks. The old code swallowed the throw and
// returned [], which meant the runner read the ledger as EMPTY every time and
// therefore believed no migration had ever run. It then tried to replay 001
// against a live database, failed on the first CREATE, and reported "migration
// failed" — which read as a database problem and was actually a parser problem.
//
// The result was a migration runner that could never succeed on a database that
// had ever been migrated, which is every database it is for.
export function parseWranglerJson(out) {
  // ANSI first. Wrangler colourises its banner when it thinks it has a
  // terminal, and every colour code starts with an escape followed by "[", so
  // hunting for the first "[" lands inside "[32m" instead of the JSON. The
  // parse then throws, the throw is swallowed, and the ledger reads as empty
  // exactly as it did before this function existed. Same bug, one layer down.
  // eslint-disable-next-line no-control-regex
  const text = String(out ?? '').replace(/\[[0-9;]*m/g, '');
  const start = text.indexOf('[');
  if (start < 0) return [];
  try {
    const parsed = JSON.parse(text.slice(start));
    return parsed?.[0]?.results ?? [];
  } catch {
    return [];
  }
}

function wranglerExec(targetArgs) {
  return async ({ command, file, rows = false }) => {
    // `--file` and `--command` return DIFFERENT SHAPES, and that is the second
    // half of why this runner could never work.
    //
    // A file execution reports a summary ("Total queries executed: 1"). Only a
    // --command execution returns the actual rows. The old code sent everything
    // through a temp file, so `SELECT name FROM _migrations` came back as a
    // summary object, the ledger read as empty, and the runner tried to replay
    // 001 against a live database every single time.
    //
    // So: queries go through --command, and migration SQL keeps going through
    // --file, because multi-statement SQL through --command gets word-split by
    // cmd.exe on Windows. Each path is used for the thing it is good at.
    //
    // The caller says whether it needs rows back, rather than this guessing
    // from the SQL.
    //
    // An earlier version sniffed for a leading SELECT. The regex was subtly
    // wrong, so the ledger read went down the file path, wrangler answered with
    // a summary object instead of names, and the runner concluded that exactly
    // one migration had ever been applied and the other 47 were pending. It
    // then tried to replay 001 against a live database. Guessing intent from a
    // string is how that happened; the caller knows and now says.
    //
    // Writes keep going through a temp file, which sidesteps cmd.exe entirely:
    // `datetime('now')` inside a double-quoted argument is fine in bash and not
    // fine once cmd.exe has had its turn with the parentheses.
    if (command && rows) {
      const args = ['wrangler', 'd1', 'execute', DB_BINDING, ...targetArgs, '--json', '--command', qq(command)];
      return parseWranglerJson(execFileSync('npx', args, { encoding: 'utf8', shell: winShell }));
    }

    let tmp = null;
    try {
      let sqlFile = file;
      if (command) {
        tmp = mkdtempSync(join(tmpdir(), 'ltb-mig-'));
        sqlFile = join(tmp, 'cmd.sql');
        writeFileSync(sqlFile, command);
      }
      const args = ['wrangler', 'd1', 'execute', DB_BINDING, ...targetArgs, '--json', '--file', sqlFile].map(q);
      return parseWranglerJson(execFileSync('npx', args, { encoding: 'utf8', shell: winShell }));
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    }
  };
}

// The wrangler arguments that pick the database: --local or --remote, plus the
// environment of wrangler.jsonc and/or an explicit config file. A remote run
// must name at least one of them, so a bare `--remote` can never fall through
// to whatever the top-level config happens to bind.
export function targetArgsFor(argv) {
  const remote = argv.includes('--remote');
  const pick = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? String(argv[i + 1] || '') : '';
  };
  const env = pick('--env');
  const config = pick('--config');
  if (remote && !env && !config) {
    throw new Error('A remote migration needs --env staging, --env production, or --config <wrangler config>.');
  }
  const args = [remote ? '--remote' : '--local'];
  if (env) args.push('--env', env);
  if (config) args.push('--config', config);
  return args;
}

const isMain = process.argv[1] && process.argv[1].endsWith('migrate.mjs');
if (isMain) {
  let targetArgs;
  try {
    targetArgs = targetArgsFor(process.argv);
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  const files = readdirSync('migrations').filter((f) => f.endsWith('.sql'));
  const exec = wranglerExec(targetArgs);
  const schema = async () => schemaFromRows(await exec({ command: LIVE_SCHEMA_SQL, rows: true }));
  const readSql = (name) => readFileSync(join('migrations', name), 'utf8');
  runMigrations({ files, exec, schema, readSql })
    .then(({ applied, satisfied, skipped }) => {
      console.log(`applied: ${applied.length ? applied.join(', ') : '(none)'}`);
      console.log(`already present (recorded, not executed): ${satisfied.length ? satisfied.join(', ') : '(none)'}`);
      console.log(`already applied: ${skipped.length ? skipped.join(', ') : '(none)'}`);
    })
    .catch((err) => {
      console.error('migration failed:', err.message);
      const detail = (err.stderr || err.stdout || '').toString();
      if (detail) console.error(detail.slice(0, 1200));
      process.exit(1);
    });
}
