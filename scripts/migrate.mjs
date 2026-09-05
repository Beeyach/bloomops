// Idempotent D1 migration runner (spec §4). Ordered files in migrations/
// apply once each; bookkeeping lives in a _migrations table on the target
// database. Usage:
//   node scripts/migrate.mjs --local    (dev D1 — safe anytime)
//   node scripts/migrate.mjs --remote   (production — owner runs at deploy time)
// Deploy rule: migrate the live DB BEFORE pushing code that reads new
// columns (HANDOFF gotcha #2).
import { readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DB_NAME = 'bloomtrack-pro';

export const ENSURE_TABLE_SQL =
  "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')))";

export function pendingMigrations(allFiles, appliedNames) {
  const applied = new Set(appliedNames);
  return [...allFiles].sort().filter((f) => !applied.has(f));
}

// exec({ command }) or exec({ file }) → parsed result rows (array).
// Injectable so the orchestration is testable without wrangler.
export async function runMigrations({ files, exec }) {
  await exec({ command: ENSURE_TABLE_SQL });
  const rows = await exec({ command: 'SELECT name FROM _migrations', rows: true });
  const appliedNames = (rows || []).map((r) => r.name);
  const pending = pendingMigrations(files, appliedNames);
  const applied = [];
  for (const name of pending) {
    await exec({ file: `migrations/${name}` });
    await exec({ command: `INSERT INTO _migrations (name) VALUES ('${name}')` });
    applied.push(name);
  }
  return { applied, skipped: files.filter((f) => !applied.includes(f)) };
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

function wranglerExec(target) {
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
      const args = ['wrangler', 'd1', 'execute', DB_NAME, target, '--json', '--command', qq(command)];
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
      const args = ['wrangler', 'd1', 'execute', DB_NAME, target, '--json', '--file', sqlFile].map(q);
      return parseWranglerJson(execFileSync('npx', args, { encoding: 'utf8', shell: winShell }));
    } finally {
      if (tmp) rmSync(tmp, { recursive: true, force: true });
    }
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith('migrate.mjs');
if (isMain) {
  const target = process.argv.includes('--remote') ? '--remote' : '--local';
  const files = readdirSync('migrations').filter((f) => f.endsWith('.sql'));
  runMigrations({ files, exec: wranglerExec(target) })
    .then(({ applied, skipped }) => {
      console.log(`applied: ${applied.length ? applied.join(', ') : '(none)'}`);
      console.log(`already applied: ${skipped.length ? skipped.join(', ') : '(none)'}`);
    })
    .catch((err) => {
      console.error('migration failed:', err.message);
      const detail = (err.stderr || err.stdout || '').toString();
      if (detail) console.error(detail.slice(0, 1200));
      process.exit(1);
    });
}
