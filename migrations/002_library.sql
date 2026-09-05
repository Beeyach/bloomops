-- Workspace library (spec §3c + amendment A5). Groups of copyable, editable
-- text blocks: DM scripts, SOPs, templates. Items are a JSON column:
-- [{id, title, body}] — never queried per-item.
CREATE TABLE IF NOT EXISTS library_groups (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  note TEXT DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  items TEXT DEFAULT '[]'
);
