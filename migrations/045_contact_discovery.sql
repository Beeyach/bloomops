-- Contacts, with a reason to believe each one reaches the right business.
--
-- A pilot over fifty real prospects found fourteen addresses and about half
-- belonged to somebody else: a Square template's placeholder, the foundry that
-- made a site's font, a Dallas roofer on a San Jose roofer's page. The old
-- storage could not have expressed the difference, because it was one `email`
-- column and whatever the extractor found first went into it.
--
-- So a candidate now carries where it was found, what surrounded it, and what
-- relationship that implies. Rejected candidates are kept too: "we saw an
-- address and refused it" is a different answer from "there was nothing", and
-- only one of them is worth a person's time.
CREATE TABLE IF NOT EXISTS contact_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  prospect_id INTEGER NOT NULL,

  -- EMAIL | PHONE | FORM | LINKEDIN | INSTAGRAM | FACEBOOK
  contact_type TEXT NOT NULL DEFAULT 'EMAIL',
  value TEXT NOT NULL,

  -- SAME_DOMAIN | OWNER_EXTERNAL | UNKNOWN | THIRD_PARTY.
  -- Never a boolean: "is this theirs" has four honest answers and collapsing
  -- them is what put another company's address into an outreach queue.
  relationship TEXT NOT NULL DEFAULT 'UNKNOWN',
  person_name TEXT,

  -- Where it came from and what was around it. The context is what makes
  -- OWNER_EXTERNAL decidable: a personal address under "Email me:" and the
  -- same string in a stylesheet comment are different facts.
  source_url TEXT,
  source_page_type TEXT,
  context_snippet TEXT,
  method TEXT,

  -- FOUND | SOURCE_CONFIRMED | VERIFIED. Native extraction never sets
  -- VERIFIED: publishing an address is not proof a mailbox exists.
  confidence TEXT NOT NULL DEFAULT 'FOUND',

  adopted INTEGER NOT NULL DEFAULT 0,
  rejection_reason TEXT,

  -- A person overriding the machine. Both are kept: the machine still says
  -- UNKNOWN, and the human confirmation sits beside it rather than rewriting
  -- history to look like the machine was right.
  confirmed_by TEXT,
  confirmed_at TEXT,

  discovered_at TEXT DEFAULT (datetime('now'))
);

-- One row per address per prospect, however many times the job runs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_candidate_unique
  ON contact_candidates(workspace, prospect_id, contact_type, value);
CREATE INDEX IF NOT EXISTS idx_candidate_review
  ON contact_candidates(workspace, relationship, adopted);

-- The search itself, so it is not repeated every sweep.
--
-- A finished search that found nothing is a real result and keeps for months:
-- the site has to change before the answer does. A timeout keeps for days,
-- because only the network has to behave.
ALTER TABLE prospects ADD COLUMN contact_searched_at TEXT;
ALTER TABLE prospects ADD COLUMN contact_search_result TEXT;
ALTER TABLE prospects ADD COLUMN contact_search_pages INTEGER;
ALTER TABLE prospects ADD COLUMN contact_refresh_after TEXT;
-- Why this address, in words. Shown next to it so a person can disagree.
ALTER TABLE prospects ADD COLUMN primary_contact_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_prospect_contact_search
  ON prospects(workspace, contact_search_result, contact_refresh_after);
