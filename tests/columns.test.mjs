import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LEAD_COLUMNS, PROSPECT_COLUMNS } from '../lib/columns.mjs';

// The failure this guards against is silent: a migration adds a column, a
// SELECT list does not, and the field simply never reaches the browser. It has
// happened twice. These tests fail loudly instead.

const migrationSql = readdirSync('migrations')
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(`migrations/${f}`, 'utf8'))
  .join('\n');

// ALTER TABLE <table> ADD COLUMN <name> — the way every column here was added
// after the initial schema.
function addedColumns(table) {
  const re = new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+COLUMN\\s+(\\w+)`, 'gi');
  return [...migrationSql.matchAll(re)].map((m) => m[1]);
}

function listOf(cols) {
  return cols.split(',').map((c) => c.trim());
}

// Columns that exist for the server's own bookkeeping and must never be sent
// to the browser. `workspace` is the tenant key: shipping it would hand every
// client the name of the partition it is reading from, for no benefit.
const INTERNAL = new Set(['workspace', 'deleted_at']);

test('every column added to leads by a migration is selected', () => {
  const selected = listOf(LEAD_COLUMNS);
  for (const col of addedColumns('leads').filter((c) => !INTERNAL.has(c))) {
    assert.ok(selected.includes(col), `leads.${col} exists in a migration but is missing from LEAD_COLUMNS`);
  }
});

test('every column added to prospects by a migration is selected', () => {
  const selected = listOf(PROSPECT_COLUMNS);
  for (const col of addedColumns('prospects').filter((c) => !INTERNAL.has(c))) {
    assert.ok(selected.includes(col), `prospects.${col} exists in a migration but is missing from PROSPECT_COLUMNS`);
  }
});

test('no route hardcodes its own lead or prospect column list', () => {
  // Three copies of these lists is how they drifted. Any new inline list with
  // these telltale columns should go through lib/columns.mjs instead.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(p);
      else if (entry.name === 'route.js') {
        const src = readFileSync(p, 'utf8');
        // A literal string listing several of the identifying columns together.
        if (/'id, platform, post_url|'id, name, business_name/.test(src)) offenders.push(p);
      }
    }
  };
  walk('app/api');
  assert.deepEqual(offenders, [], `these routes inline a column list instead of importing it: ${offenders.join(', ')}`);
});

test('the shared lists have no duplicate or empty entries', () => {
  for (const [name, cols] of [['LEAD_COLUMNS', LEAD_COLUMNS], ['PROSPECT_COLUMNS', PROSPECT_COLUMNS]]) {
    const list = listOf(cols);
    assert.ok(list.every(Boolean), `${name} has an empty entry`);
    assert.equal(new Set(list).size, list.length, `${name} repeats a column`);
  }
});
