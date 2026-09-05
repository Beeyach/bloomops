-- Nested pages. A client gets a page, and under it the onboarding page, the
-- content calendar, the updates — instead of six siblings at the top level
-- with no relationship between them.
--
-- No foreign key on purpose: if a parent is trashed, the children must still
-- be reachable. The tree builder surfaces a page whose parent is missing at
-- the top level rather than hiding it inside a branch nobody can open.
ALTER TABLE pages ADD COLUMN parent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_pages_parent ON pages(workspace, parent_id);
