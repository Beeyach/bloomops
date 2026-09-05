-- Sending from the product, and the record that makes it safe to retry.
--
-- The hard case is not a failed send. It is a send whose outcome we do not
-- know: the request left, Gmail may have accepted it, and the connection died
-- before the response came back. Retrying sends a second email to a stranger.
-- Not retrying loses the send. Both are wrong, so the answer has to be written
-- down BEFORE the call, not after it.

-- What was approved, exactly.
--
-- "Ary approved prospect 123" is not permission to send any future text to
-- prospect 123. She approved a playbook, an evidence snapshot, a generator, a
-- workspace context, an address and a specific set of words. If any of those
-- move, the thing she looked at was a different email.
ALTER TABLE outreach_packages ADD COLUMN approved_fingerprint TEXT;

-- Approving the first email and approving the sequence are separate consents.
-- An approved first email must never imply unlimited future outreach.
ALTER TABLE outreach_packages ADD COLUMN sequence_approved INTEGER DEFAULT 0;
-- How far that consent reaches. Never further than the workspace's own
-- sequence, and never extended just because automation exists.
ALTER TABLE outreach_packages ADD COLUMN sequence_max_step INTEGER;

-- When the product intends to send it. Null while nothing is scheduled.
ALTER TABLE outreach_packages ADD COLUMN scheduled_send_at TEXT;
-- Why a scheduled send is not going out yet, in words a person can act on.
ALTER TABLE outreach_packages ADD COLUMN send_block_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_pkg_scheduled ON outreach_packages(workspace, scheduled_send_at);

-- One row per intent to send, written before the provider is called.
--
-- This is the thing that makes a crash recoverable. An attempt left `in-flight`
-- means the request went out and nobody knows what happened. The next run must
-- NOT send again: it reconciles from the mailbox, because Gmail's Sent folder
-- is the only place that knows.
CREATE TABLE IF NOT EXISTS send_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  prospect_id INTEGER NOT NULL,
  package_id INTEGER,
  sequence_step INTEGER NOT NULL DEFAULT 1,

  -- Stable across retries: prospect, step, and the approved fingerprint. A
  -- genuine second email has a different step; a retry of the same one does
  -- not, and collides here.
  attempt_key TEXT NOT NULL,

  -- in-flight | succeeded | failed | abandoned
  state TEXT NOT NULL DEFAULT 'in-flight',
  provider_message_id TEXT,
  provider_thread_id TEXT,
  error TEXT,

  started_at TEXT DEFAULT (datetime('now')),
  finished_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_attempt_key ON send_attempts(workspace, attempt_key);
CREATE INDEX IF NOT EXISTS idx_attempt_state ON send_attempts(workspace, state, started_at);

-- The provenance of a prepared follow-up, so a draft written under one set of
-- facts is not sent under another.
ALTER TABLE prospects ADD COLUMN pending_draft_meta TEXT;
