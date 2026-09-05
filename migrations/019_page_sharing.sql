-- Public page sharing. A page carries an unguessable token; anything nested
-- under it is reachable through that same token.
--
-- The token is NOT the page id on purpose: an id in the URL would let anyone
-- walk the space and find pages that were never shared.
--
-- Revoking is setting share_token back to NULL, which kills the link the
-- moment it is saved.
ALTER TABLE pages ADD COLUMN share_token TEXT;
ALTER TABLE pages ADD COLUMN shared_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_share_token ON pages(share_token) WHERE share_token IS NOT NULL;
