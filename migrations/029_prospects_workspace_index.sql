-- The list query's exact shape: WHERE workspace = ? AND deleted_at IS NULL.
-- The existing single-column indexes (deleted_at alone, email alone) don't
-- cover that pair, so every load walked more rows than it returned. One
-- composite index matches the filter exactly.
CREATE INDEX IF NOT EXISTS idx_prospects_ws_deleted ON prospects(workspace, deleted_at);
