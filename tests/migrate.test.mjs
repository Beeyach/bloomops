import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingMigrations, runMigrations, targetArgsFor, ENSURE_TABLE_SQL } from '../scripts/migrate.mjs';

test('pendingMigrations returns unapplied files in name order', () => {
  const files = ['002_library.sql', '001_clients.sql', '003_rubric.sql'];
  const applied = ['001_clients.sql'];
  assert.deepEqual(pendingMigrations(files, applied), ['002_library.sql', '003_rubric.sql']);
});

test('pendingMigrations with nothing applied returns everything sorted', () => {
  assert.deepEqual(
    pendingMigrations(['002_b.sql', '001_a.sql'], []),
    ['001_a.sql', '002_b.sql']
  );
});

test('pendingMigrations with everything applied returns empty', () => {
  assert.deepEqual(pendingMigrations(['001_a.sql'], ['001_a.sql']), []);
});

test('runMigrations ensures bookkeeping table, applies pending files, records each', async () => {
  const calls = [];
  const exec = async (args) => {
    calls.push(args);
    if (args.command && args.command.startsWith('SELECT name')) {
      return [{ name: '001_clients.sql' }];
    }
    return [];
  };
  const result = await runMigrations({
    files: ['001_clients.sql', '002_library.sql'],
    exec,
  });
  assert.deepEqual(result.applied, ['002_library.sql']);
  assert.deepEqual(result.skipped, ['001_clients.sql']);
  // call order: ensure table, select applied, apply file, record it
  assert.equal(calls[0].command, ENSURE_TABLE_SQL);
  assert.ok(calls[1].command.startsWith('SELECT name'));
  assert.equal(calls[2].file, 'migrations/002_library.sql');
  assert.ok(calls[3].command.includes("INSERT INTO _migrations"));
  assert.ok(calls[3].command.includes('002_library.sql'));
});

test('runMigrations with nothing pending applies nothing', async () => {
  const calls = [];
  const exec = async (args) => {
    calls.push(args);
    if (args.command && args.command.startsWith('SELECT name')) {
      return [{ name: '001_clients.sql' }];
    }
    return [];
  };
  const result = await runMigrations({ files: ['001_clients.sql'], exec });
  assert.deepEqual(result.applied, []);
  assert.equal(calls.length, 2); // ensure + select only
});

// ── Fresh-database bootstrap: schema.sql already carries the early migrations ──

import { schemaFromRows, LIVE_SCHEMA_SQL } from '../scripts/migrate.mjs';

const ledgerExec = (calls, appliedRows = []) => async (args) => {
  calls.push(args);
  if (args.command && args.command.startsWith('SELECT name')) return appliedRows;
  return [];
};

test('a pending migration whose postconditions already hold is recorded, not executed', async () => {
  const calls = [];
  const sql = { '001_a.sql': "CREATE TABLE IF NOT EXISTS t (id TEXT);\nALTER TABLE t ADD COLUMN c TEXT;" };
  const result = await runMigrations({
    files: ['001_a.sql'],
    exec: ledgerExec(calls),
    schema: async () => ({ tables: new Set(['t']), columns: { t: new Set(['id', 'c']) }, indexes: new Set() }),
    readSql: (name) => sql[name],
  });
  assert.deepEqual(result.applied, []);
  assert.deepEqual(result.satisfied, ['001_a.sql']);
  assert.deepEqual(result.skipped, []);
  assert.ok(!calls.some((c) => c.file), 'the SQL file was never executed');
  assert.ok(calls.some((c) => c.command && c.command.includes("INSERT INTO _migrations") && c.command.includes('001_a.sql')), 'but the ledger records it');
});

test('a migration whose postconditions are missing executes, and later ones see its result', async () => {
  const calls = [];
  const sql = {
    '001_a.sql': 'ALTER TABLE t ADD COLUMN c TEXT;',
    '002_b.sql': 'ALTER TABLE t ADD COLUMN c TEXT;',
    '003_c.sql': 'CREATE INDEX idx_t_c ON t (c);',
  };
  const result = await runMigrations({
    files: ['001_a.sql', '002_b.sql', '003_c.sql'],
    exec: ledgerExec(calls),
    schema: async () => ({ tables: new Set(['t']), columns: { t: new Set(['id']) }, indexes: new Set() }),
    readSql: (name) => sql[name],
  });
  assert.deepEqual(result.applied, ['001_a.sql', '003_c.sql']);
  assert.deepEqual(result.satisfied, ['002_b.sql']);
  assert.deepEqual(calls.filter((c) => c.file).map((c) => c.file), ['migrations/001_a.sql', 'migrations/003_c.sql']);
});

test('without a schema reader the runner behaves exactly as before', async () => {
  const calls = [];
  const result = await runMigrations({ files: ['001_a.sql'], exec: ledgerExec(calls) });
  assert.deepEqual(result.applied, ['001_a.sql']);
  assert.deepEqual(result.satisfied, []);
  assert.equal(calls.filter((c) => c.file).length, 1);
});

test('schemaFromRows builds the catalogue shape ledger-audit classifies against', () => {
  const live = schemaFromRows([
    { kind: 'table', name: 't', col: 'id' },
    { kind: 'table', name: 't', col: 'c' },
    { kind: 'table', name: 'empty', col: null },
    { kind: 'index', name: 'idx_t_c', col: null },
  ]);
  assert.deepEqual([...live.tables].sort(), ['empty', 't']);
  assert.deepEqual([...live.columns.t].sort(), ['c', 'id']);
  assert.deepEqual([...live.columns.empty], []);
  assert.deepEqual([...live.indexes], ['idx_t_c']);
  assert.match(LIVE_SCHEMA_SQL, /_cf_/, 'D1 internal tables are filtered in SQL');
});

test('targetArgsFor addresses the DB binding through an environment or an explicit config, never bare --remote', () => {
  assert.deepEqual(targetArgsFor(['node', 'migrate.mjs', '--local']), ['--local']);
  assert.deepEqual(targetArgsFor(['node', 'migrate.mjs', '--remote', '--env', 'staging']), ['--remote', '--env', 'staging']);
  assert.deepEqual(
    targetArgsFor(['node', 'migrate.mjs', '--remote', '--config', '/tmp/zero.jsonc']),
    ['--remote', '--config', '/tmp/zero.jsonc']
  );
  assert.deepEqual(
    targetArgsFor(['node', 'migrate.mjs', '--local', '--config', '/tmp/zero.jsonc']),
    ['--local', '--config', '/tmp/zero.jsonc']
  );
  assert.throws(() => targetArgsFor(['node', 'migrate.mjs', '--remote']), /--env staging, --env production, or --config/);
  assert.throws(() => targetArgsFor(['node', 'migrate.mjs', '--remote', '--env']), /--config/);
});
