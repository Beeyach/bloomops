-- The outreach package: one coherent thing, instead of several disconnected
-- AI outputs that each had to be triggered and none of which knew about the
-- others.
--
-- Versioned rather than overwritten. Once a package has been reviewed, silently
-- replacing it destroys the one record of what a person actually saw and
-- agreed to, and makes the review feedback below meaningless.
CREATE TABLE IF NOT EXISTS outreach_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  prospect_id INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,

  -- PREPARING | READY_FOR_APPROVAL | NEEDS_DECISION | BLOCKED | APPROVED
  -- | STALE | SKIPPED
  status TEXT NOT NULL DEFAULT 'PREPARING',
  -- Why it is not ready, in words a person can act on.
  status_reason TEXT,

  -- The decision, and what justified it.
  playbook TEXT,
  why_contact TEXT,
  evidence TEXT,            -- JSON: the exact lines that supported the angle
  evidence_level TEXT,      -- none | thin | sufficient | strong

  -- Who we intend to write to, and how confident we are that it is right.
  contact_email TEXT,
  contact_source TEXT,

  -- The proposal itself.
  email_subject TEXT,
  email_body TEXT,
  -- Validator output. Kept even when empty, so "checked and clean" and "never
  -- checked" are different states.
  email_flags TEXT,
  followup_plan TEXT,

  -- Asset decisions, always calculated, generation separately gated.
  pdf_decision TEXT,
  pdf_reason TEXT,
  video_decision TEXT,
  video_reason TEXT,
  estimated_asset_credits INTEGER DEFAULT 0,

  -- What this prospect has cost so far, from the ledgers rather than guessed.
  credits_spent INTEGER DEFAULT 0,

  -- Review outcome. Recorded for later study, never used to train anything.
  reviewed_at TEXT,
  review_outcome TEXT,      -- APPROVED_UNCHANGED | EDITED | REJECTED | SKIPPED_PROSPECT | RESEARCHED_MORE
  review_reason TEXT,       -- optional: TOO_GENERIC | WRONG_ANGLE | ...
  edited_subject TEXT,
  edited_body TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- One live package per prospect. A retry that produced a second one would show
-- Ary the same prospect twice and let her approve two different emails to the
-- same person.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pkg_live
  ON outreach_packages(workspace, prospect_id)
  WHERE status IN ('PREPARING', 'READY_FOR_APPROVAL', 'NEEDS_DECISION', 'APPROVED');

CREATE INDEX IF NOT EXISTS idx_pkg_status ON outreach_packages(workspace, status, updated_at);
CREATE INDEX IF NOT EXISTS idx_pkg_prospect ON outreach_packages(prospect_id, version);
