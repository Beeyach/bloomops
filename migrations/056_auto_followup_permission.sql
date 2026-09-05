-- Per-package permission to send an approved follow-up automatically.
--
-- Separate from sequence approval on purpose. Sequence approval is a judgement
-- about words, and this is a judgement about whether the machine may act on them
-- while nobody is watching. Without it, turning the global switch on would hand
-- that authority to every historical package at once.
--
-- DEFAULT 0 is the whole safety property: every package that already exists is
-- off, and stays off until somebody says otherwise about that exact package.
ALTER TABLE outreach_packages ADD COLUMN auto_followup_approved INTEGER NOT NULL DEFAULT 0;
ALTER TABLE outreach_packages ADD COLUMN auto_followup_approved_at TEXT;
ALTER TABLE outreach_packages ADD COLUMN auto_followup_approved_by TEXT;
-- The highest step permission covers. The pilot only ever writes 2.
ALTER TABLE outreach_packages ADD COLUMN auto_followup_max_step INTEGER;
-- Kept after a revocation, so the trail shows it was armed and then disarmed
-- rather than never armed at all.
ALTER TABLE outreach_packages ADD COLUMN auto_followup_revoked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_pkg_auto_followup
  ON outreach_packages (workspace, auto_followup_approved, status);
