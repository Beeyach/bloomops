-- Scan leads carry the page/author profile picture when the scraper
-- returns one. CDN links can expire — the UI falls back to a monogram.
ALTER TABLE leads ADD COLUMN avatar_url TEXT;
