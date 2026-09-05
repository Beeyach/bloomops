// A real SQLite database wearing D1's interface.
//
// The alternative, a hand-written fake, is what the reply-ingest tests use and
// it is right for them: they test a decision, and the database is scenery.
//
// It is the wrong tool for send events and the outcome chain, because the
// property under test IS the database. Idempotency here is enforced by a
// unique index and an INSERT OR IGNORE, and a fake that returns whatever the
// test author expected would pass whether or not that index exists. So this
// runs the actual migration SQL and the actual statements.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

export function d1(sqlChunks = []) {
  const raw = new DatabaseSync(':memory:');
  for (const chunk of sqlChunks) raw.exec(chunk);

  const db = {
    raw,
    prepare(sql) {
      const run = (args) => {
        const stmt = raw.prepare(sql);
        const trimmed = sql.trim().slice(0, 6).toUpperCase();
        if (trimmed === 'SELECT' || /RETURNING/i.test(sql)) {
          return { rows: stmt.all(...args) };
        }
        const r = stmt.run(...args);
        return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
      };
      const api = (args) => ({
        async run() {
          const r = run(args);
          return { meta: { changes: r.changes ?? (r.rows ? r.rows.length : 0), last_row_id: r.lastInsertRowid ?? 0 } };
        },
        async first() {
          const stmt = raw.prepare(sql);
          const rows = stmt.all(...args);
          return rows.length ? rows[0] : null;
        },
        async all() {
          const stmt = raw.prepare(sql);
          return { results: stmt.all(...args) };
        },
      });
      return { bind: (...args) => api(args), ...api([]) };
    },
  };
  return db;
}

export const migration = (name) =>
  readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8');

// The prospects table as it stood before migration 041, holding only the
// columns the chain actually touches. Deliberately pre-041 so the migration
// under test is the thing that adds first_client_at and qualification: writing
// them in by hand here would mean the test never runs the migration at all.
export const PROSPECTS_BEFORE_041 = `
CREATE TABLE prospects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL DEFAULT 'ary',
  name TEXT, business_name TEXT, email TEXT, domain TEXT, niche TEXT,
  stage TEXT DEFAULT 'New', rating TEXT, source TEXT, info TEXT,
  emails_sent INTEGER DEFAULT 0,
  last_contact_date TEXT, last_contact_at TEXT,
  replied INTEGER DEFAULT 0, reply_type TEXT, reply_date TEXT,
  next_action_date TEXT, video_url TEXT, video_sent_at TEXT,
  activity_log TEXT, site_intel TEXT, site_intel_at TEXT,
  deleted_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);`;

// The settings blob every workspace-scoped read goes through.
export const SETTINGS_TABLE = `
CREATE TABLE settings (
  workspace TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (workspace, key)
);`;

// Every migration in the repository, in order.
//
// The two test files that build a schema used hand-picked lists, and both
// stopped before 047. A column added there existed in production and not in
// tests, so a write to it passed live and failed here — which is the wrong way
// round for a test to be wrong. One of those lists sat directly under a test
// whose own comment explains that a partial list only checks what somebody
// remembered.
//
// Derived from the directory, so a new migration is included by existing.
export function allMigrationNames() {
  const dir = new URL('../migrations/', import.meta.url);
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

export function allMigrations() {
  const dir = new URL('../migrations/', import.meta.url);
  return allMigrationNames().map((f) => readFileSync(new URL(f, dir), 'utf8'));
}
