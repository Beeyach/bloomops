-- Soft-delete / Trash. Deleting a page or prospect stamps deleted_at instead
-- of removing the row; it hides from normal views, can be restored, and is
-- purged for good after 30 days (enforced when the Trash view is opened).

ALTER TABLE pages ADD COLUMN deleted_at TEXT;
ALTER TABLE prospects ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_pages_deleted ON pages(deleted_at);
CREATE INDEX IF NOT EXISTS idx_prospects_deleted ON prospects(deleted_at);
