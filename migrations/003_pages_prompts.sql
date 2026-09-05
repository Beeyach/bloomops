-- Notion-style custom pages: user-created sidebar entries with an emoji
-- icon and a freeform text body.
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  emoji TEXT DEFAULT '📄',
  body TEXT DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- Library groups gain a category so one table backs both the Workspace
-- (scripts/SOPs) and the Prompts library. Existing rows are workspace.
ALTER TABLE library_groups ADD COLUMN category TEXT NOT NULL DEFAULT 'workspace';
