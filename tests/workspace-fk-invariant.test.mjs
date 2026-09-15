import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { hasWorkspaceForeignKey } from './_workspace-fk.mjs';

test('workspace invariant accepts anchored composites and rejects bypassable or missing constraints', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE workspaces(id TEXT PRIMARY KEY NOT NULL);
      CREATE TABLE parent(workspace_id TEXT NOT NULL REFERENCES workspaces(id), id TEXT NOT NULL, UNIQUE(workspace_id,id));
      CREATE TABLE valid(workspace_id TEXT NOT NULL, parent_id TEXT NOT NULL, FOREIGN KEY(workspace_id,parent_id) REFERENCES parent(workspace_id,id));
      CREATE TABLE nullable_tuple(workspace_id TEXT NOT NULL, parent_id TEXT, FOREIGN KEY(workspace_id,parent_id) REFERENCES parent(workspace_id,id));
      CREATE TABLE nullable_scope(workspace_id TEXT REFERENCES workspaces(id));
      CREATE TABLE missing(workspace_id TEXT NOT NULL);
      CREATE TABLE wrong_column(workspace_id TEXT NOT NULL, other TEXT NOT NULL REFERENCES workspaces(id));
      CREATE TABLE cycle_a(workspace_id TEXT NOT NULL UNIQUE REFERENCES cycle_b(workspace_id));
      CREATE TABLE cycle_b(workspace_id TEXT NOT NULL UNIQUE REFERENCES cycle_a(workspace_id));`);
    assert.equal(hasWorkspaceForeignKey(db, 'parent'), true);
    assert.equal(hasWorkspaceForeignKey(db, 'valid'), true);
    for (const table of ['nullable_tuple', 'nullable_scope', 'missing', 'wrong_column', 'cycle_a', 'cycle_b']) {
      assert.equal(hasWorkspaceForeignKey(db, table), false, table);
    }
  } finally { db.close(); }
});

import { workspaceKeyCases, representativeWrite, keyWriteError } from './_workspace-key-cases.mjs';
import { freshSqlite } from './_bloomops-db.mjs';
for (const fixture of workspaceKeyCases) {
  test(`workspace parent key: ${fixture.name}`, () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('PRAGMA foreign_keys=ON');
      assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
      for (const sql of fixture.ddl) assert.doesNotThrow(() => db.exec(sql), 'DDL is accepted');
      assert.throws(() => db.prepare(representativeWrite(fixture)).run(), keyWriteError(fixture));
      assert.equal(hasWorkspaceForeignKey(db, 'child'), fixture.valid);
    } finally { db.close(); }
  });
}
test('shipped mentions mandatory parent keys remain valid', () => {
  const db = freshSqlite();
  try { assert.equal(hasWorkspaceForeignKey(db, 'record_discussion_mentions'), true); }
  finally { db.close(); }
});
