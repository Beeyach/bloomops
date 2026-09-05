-- Multi-tenant isolation: every data table gets a `workspace` tag and every
-- query is scoped to it. Existing rows belong to the 'ary' workspace (the
-- admin/owner). settings needs a composite primary key (workspace, key) so
-- each workspace keeps its own engine profile, so it is rebuilt.

ALTER TABLE prospects ADD COLUMN workspace TEXT NOT NULL DEFAULT 'ary';
ALTER TABLE leads ADD COLUMN workspace TEXT NOT NULL DEFAULT 'ary';
ALTER TABLE clients ADD COLUMN workspace TEXT NOT NULL DEFAULT 'ary';
ALTER TABLE library_groups ADD COLUMN workspace TEXT NOT NULL DEFAULT 'ary';
ALTER TABLE pages ADD COLUMN workspace TEXT NOT NULL DEFAULT 'ary';

CREATE TABLE settings_new (
  workspace TEXT NOT NULL DEFAULT 'ary',
  key TEXT NOT NULL,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (workspace, key)
);
INSERT INTO settings_new (workspace, key, value, updated_at)
  SELECT 'ary', key, value, updated_at FROM settings;
DROP TABLE settings;
ALTER TABLE settings_new RENAME TO settings;

CREATE INDEX IF NOT EXISTS idx_prospects_ws ON prospects(workspace);
CREATE INDEX IF NOT EXISTS idx_leads_ws ON leads(workspace);
CREATE INDEX IF NOT EXISTS idx_clients_ws ON clients(workspace);
CREATE INDEX IF NOT EXISTS idx_library_ws ON library_groups(workspace);
CREATE INDEX IF NOT EXISTS idx_pages_ws ON pages(workspace);
