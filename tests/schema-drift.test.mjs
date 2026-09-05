// The test schema must not silently lag production.
//
// It did. Two test files built their database from hand-picked migration lists,
// and both stopped before the migration that added
// `send_events.approval_fingerprint`. So a write to that column worked in
// production and failed in tests — the wrong way round for a test to be wrong,
// because the failure looked like a bug in new code rather than a gap in the
// harness.
//
// One of those lists sits directly beneath a test whose own comment explains
// that a partial list only checks what somebody remembered. The other carries a
// note about a migration having been left out once already, for the same
// reason. Neither note stopped it happening again, which is why this is a test
// rather than a third comment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { allMigrationNames } from './_d1.mjs';

const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

// Files that assemble a schema from individual migrations rather than replaying
// all of them. Each one is a place drift can start.
const HAND_PICKED = ['./native-send.test.mjs', './outcome-chain.test.mjs'];

const listedIn = (src) => [...src.matchAll(/migration\('([^']+)'\)/g)].map((m) => m[1]);

test('the migration list comes from the directory, not from memory', () => {
  const names = allMigrationNames();
  const onDisk = readdirSync(new URL('../migrations/', import.meta.url))
    .filter((f) => f.endsWith('.sql')).sort();
  assert.deepEqual(names, onDisk, 'a new migration is included by existing, not by being remembered');
  assert.ok(names.length > 40, 'the repository has migrations and they were found');
});

test('every column the send path writes exists in the schemas tests build', () => {
  // The specific failure that started this: recordSend writes
  // approval_fingerprint, the column was added in 047, and neither hand-picked
  // list reached 047. Rather than name that column alone, this asserts every
  // column the send-event write actually binds.
  const events = read('../lib/send-events.mjs');
  const insert = events.slice(events.indexOf('INSERT OR IGNORE INTO send_events'));
  const columns = insert.slice(insert.indexOf('(') + 1, insert.indexOf(')'))
    .split(',').map((c) => c.trim()).filter((c) => /^[a-z_]+$/.test(c));
  assert.ok(columns.includes('approval_fingerprint'), 'the column that started this is still written');

  for (const file of HAND_PICKED) {
    const applied = listedIn(read(file)).map((n) => read(`../migrations/${n}`)).join('\n');
    const base = read(file);
    for (const col of columns) {
      const found = applied.includes(col) || base.includes(col);
      assert.ok(found, `${file} builds a send_events without ${col}, which the send path writes`);
    }
  }
});

test('a hand-picked list may not silently fall behind the newest migration', () => {
  // Not "must include everything" — a focused test legitimately builds a small
  // schema. The rule is narrower: if a list reaches into the migrations
  // directory at all, it may not stop before a migration that touches a table
  // it has already created. That is exactly the shape of the drift that bit.
  const all = allMigrationNames();
  for (const file of HAND_PICKED) {
    const src = read(file);
    const listed = listedIn(src);
    assert.ok(listed.length, `${file} is listed as hand-picked but names no migrations`);

    const tables = new Set();
    for (const name of listed) {
      for (const m of read(`../migrations/${name}`).matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(\w+)/gi)) {
        tables.add(m[1].toLowerCase());
      }
    }
    const highest = listed.map((n) => all.indexOf(n)).reduce((a, b) => Math.max(a, b), -1);

    for (let i = highest + 1; i < all.length; i += 1) {
      const later = read(`../migrations/${all[i]}`);
      for (const m of later.matchAll(/ALTER TABLE (\w+) ADD COLUMN/gi)) {
        const table = m[1].toLowerCase();
        assert.ok(
          !tables.has(table),
          `${file} creates ${table} but stops at ${all[highest]}, missing ${all[i]} which adds a column to it`
        );
      }
    }
  }
});
