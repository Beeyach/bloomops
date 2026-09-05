-- Structured outcome events, so that later we can answer questions like
-- "which verified findings actually earned replies" without having to
-- reconstruct history out of an activity log written for humans.
--
-- Deliberately NOT an analytics system. It is a log of things that happened,
-- with enough shape to be counted. No conclusions are drawn from it yet, and
-- nothing in the app reads it for a number: with a pipeline of thirty
-- prospects, any percentage computed from this would be noise wearing a
-- decimal point.
--
-- The reason it exists now rather than later: these events are unrecoverable.
-- A vet verdict that was never written down cannot be scored against the reply
-- that came three weeks after it, and by the time there is enough data to
-- learn from, the early months are gone.
CREATE TABLE IF NOT EXISTS outcome_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  prospect_id INTEGER,
  -- 'vet' | 'outreach' | 'reply' | 'video-sent' | 'video-watched' | 'stage'
  kind TEXT NOT NULL,
  -- The verdict, reply type, stage, or angle. Short and countable.
  value TEXT,
  -- What was true about the prospect AT THE TIME, as JSON. Evidence strength,
  -- which findings existed, how many touches had happened. Snapshotted rather
  -- than looked up later, because the prospect record changes and the question
  -- is always "what did we know when we decided".
  context TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_outcome_ws_kind ON outcome_events(workspace, kind, created_at);
CREATE INDEX IF NOT EXISTS idx_outcome_prospect ON outcome_events(prospect_id);
