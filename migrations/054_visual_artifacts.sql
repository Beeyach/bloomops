-- A photograph of one page, at one viewport, at one moment.
--
-- The app could render a website and measure it. It could not see it. Every
-- claim about what a visitor experiences — a buried booking button, two actions
-- competing, a form asking for details before the page has explained anything —
-- was settled by reading `getBoundingClientRect()` and a list of
-- call-to-action words. findings.mjs already records what that cost: three
-- videos told owners there was nothing above the fold to click while a Book
-- button sat on screen.
--
-- This is the missing evidence. One row per capture, holding enough to
-- reproduce and audit the claim it supports, and never the image itself: the
-- bytes live in R2 behind the review worker, and a prospect row that carries
-- megabytes of PNG is a prospect row nobody can list.
--
-- Deliberately NOT a general artifact store. It answers one question — what did
-- this page look like — and a second kind of artifact should get its own table
-- rather than a `kind` column that turns this into a junk drawer.
CREATE TABLE IF NOT EXISTS visual_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,

  -- Nullable: a shadow run photographs a page to prove the pipeline works
  -- without any prospect being involved, and inventing a prospect id for that
  -- would put a fake row in the causal chain.
  prospect_id INTEGER,
  -- Which capture run this came from, so a set of pictures taken together can
  -- be read together.
  run_id TEXT,

  -- The page, exactly as requested and as normalised for comparison. Both,
  -- because a claim is validated against the normalised form and a human
  -- checking the work needs the one that was actually opened.
  url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,

  -- 'desktop' | 'mobile', plus the numbers, because "mobile" means nothing in
  -- two years when the canonical phone is a different size.
  viewport TEXT NOT NULL,
  viewport_width INTEGER,
  viewport_height INTEGER,

  captured_at TEXT NOT NULL,
  -- The HTTP status the page answered with, and whether it was a wall.
  -- A page nobody could see proves nothing about how it looks, so this is
  -- recorded rather than the capture being discarded.
  http_status INTEGER,
  blocked INTEGER NOT NULL DEFAULT 0,
  -- Something naturally covered the page. Recorded, never dismissed before the
  -- shutter: a popup over the content is exactly what a visitor gets.
  overlay INTEGER NOT NULL DEFAULT 0,
  page_title TEXT,

  -- Where the image is. Null means the capture happened and could not be
  -- stored, which is a different fact from no capture at all.
  stored_at TEXT,
  store_error TEXT,
  sha256 TEXT,
  bytes INTEGER,

  -- What a vision model said about it, if anything was asked. Kept beside the
  -- picture rather than in a separate table: an observation with no image is
  -- not evidence, and the two should not be able to drift apart.
  observation TEXT,
  vision_model TEXT,
  vision_at TEXT,
  -- The structured verdict, as returned. JSON so a question added later does
  -- not need a migration.
  vision_json TEXT,

  created_at TEXT DEFAULT (datetime('now'))
);

-- The same page, viewport and bytes captured twice is one artifact, not two.
-- Re-running a shadow sample must not accumulate rows.
CREATE UNIQUE INDEX IF NOT EXISTS visual_artifacts_once
  ON visual_artifacts(workspace, normalized_url, viewport, sha256);

CREATE INDEX IF NOT EXISTS visual_artifacts_prospect
  ON visual_artifacts(workspace, prospect_id, captured_at);

CREATE INDEX IF NOT EXISTS visual_artifacts_run
  ON visual_artifacts(workspace, run_id);
