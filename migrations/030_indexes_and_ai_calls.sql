-- The composite index prospects got in migration 029 was never given to its
-- siblings, though they run the same query shape every load:
--   pages:  WHERE workspace = ? AND deleted_at IS NULL ORDER BY position
--   leads:  WHERE workspace = ? ... ORDER BY created_at DESC  (hottest list)
--   leads:  WHERE promoted_prospect_id = ?                    (un-promote)
--   library_groups: WHERE category = ? AND workspace = ?
CREATE INDEX IF NOT EXISTS idx_pages_ws_deleted ON pages(workspace, deleted_at);
CREATE INDEX IF NOT EXISTS idx_leads_ws_created ON leads(workspace, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_promoted ON leads(promoted_prospect_id);
CREATE INDEX IF NOT EXISTS idx_library_ws_category ON library_groups(workspace, category);

-- Daily counter behind the /api/ai spend cap (see lib/limits.mjs
-- bumpAiCalls). One row per workspace per UTC day, atomically upserted.
CREATE TABLE IF NOT EXISTS ai_calls (
  workspace TEXT NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace, day)
);
