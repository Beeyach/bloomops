import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingMigrations, runMigrations, ENSURE_TABLE_SQL } from '../scripts/migrate.mjs';

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
