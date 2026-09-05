-- Where a prospect came from, and what that origin can honestly support.
--
-- The discovery that forced this: all twenty of the workspace's qualification
-- rules ask about something the prospect WROTE, and a business scraped from a
-- map listing has no post and never will. Evaluating a post rule against a map
-- listing does not produce "no". It produces nothing.
--
-- The product was recording that nothing as a weaker prospect, which meant
-- every Maps record would sit below every social lead permanently, for a reason
-- that has nothing to do with the business. Fixing it needs the origin on the
-- record, because "this rule cannot apply here" is only decidable if we know
-- where the row came from.

-- Provider: where the record entered the product. Deliberately not the same
-- column as `source`, which is free text a person picks from a menu and which
-- already contains values the app does not validate ("Google Maps" is 744 rows
-- and was never in the vocabulary).
ALTER TABLE prospects ADD COLUMN source_provider TEXT;
-- The thing it came from, where there is one: a post URL, a listing id.
ALTER TABLE prospects ADD COLUMN source_ref TEXT;
-- When the source itself is from, not when we imported it. A post from March
-- read in August is three-month-old evidence and should read as such.
ALTER TABLE prospects ADD COLUMN source_at TEXT;

CREATE INDEX IF NOT EXISTS idx_prospect_provider ON prospects(workspace, source_provider);

-- The qualification that was true at the moment a source produced it.
--
-- Append-only, and that is the whole point. A prospect who wrote "my inquiries
-- keep disappearing before they book" qualified on POST_TEXT evidence, and a
-- site check three weeks later finding a perfectly tidy website does not make
-- that untrue. It adds a second kind of evidence. Overwriting would let the
-- newer, weaker signal erase the stronger, older one, and the only trace would
-- be a prospect that mysteriously stopped looking good.
CREATE TABLE IF NOT EXISTS qualification_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  prospect_id INTEGER NOT NULL,

  -- The evidence type this qualification rests on: POST_TEXT, AD, MAP_LISTING,
  -- WEBSITE, MANUAL, CONVERSATION. Never the provider.
  source_type TEXT NOT NULL,
  -- Where it came in from: SOCIAL_POST, APIFY_GOOGLE_MAPS, MANUAL_IMPORT.
  provider TEXT,
  source_ref TEXT,
  source_at TEXT,

  -- Which code and which rules produced this. Without both, a verdict reached
  -- under one reading of a rule gets compared against one reached under
  -- another, and the comparison looks valid.
  scorer_version TEXT,
  rules_version INTEGER,

  -- What the scorer concluded, in its own words.
  verdict TEXT,
  confidence TEXT,

  -- JSON arrays of rule ids. Four states, kept apart: a rule that could not
  -- apply here and a rule that was checked and did not fire are different
  -- facts, and collapsing them is what made this necessary.
  matched_green TEXT,
  matched_red TEXT,
  unknown_rules TEXT,
  not_applicable TEXT,

  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qual_prospect ON qualification_snapshots(prospect_id, created_at);
CREATE INDEX IF NOT EXISTS idx_qual_source ON qualification_snapshots(workspace, source_type, created_at);

-- How a send's identity was established, strongest first. A send recorded from
-- a provider message id and one inferred from a recipient address are not the
-- same claim, and the second must never be filed as the first.
ALTER TABLE send_events ADD COLUMN identity TEXT DEFAULT 'derived';
-- Set when the send is real but its identity is not yet strong enough to trust
-- for anything that depends on which message it was.
ALTER TABLE send_events ADD COLUMN needs_reconciliation INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_send_needs_recon ON send_events(workspace, needs_reconciliation);
