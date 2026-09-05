-- Inbound replies, as structured events rather than markers glued into a text
-- column.
--
-- The reply-sync skill has been writing "REPLYSYNC:<id> INTERESTED <date>: ..."
-- into prospects.info for months. That worked for a person reading a row, and
-- it is useless for everything else: the outbound guard cannot parse it, the
-- metrics cannot count it without also counting out-of-office bounces, and
-- nothing can tell whether Ary has answered.
--
-- Deliberately holds no message body. The subject and a short snippet are
-- enough to recognise a thread; storing the correspondence would be collecting
-- other people's mail into a prospecting database for no feature that needs it.
CREATE TABLE IF NOT EXISTS reply_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  prospect_id INTEGER,
  -- Provider identifiers. message_id is the deduplication key: the same
  -- message must never be ingested twice, across restarts and re-runs.
  message_id TEXT NOT NULL,
  thread_id TEXT,
  direction TEXT NOT NULL DEFAULT 'inbound',   -- inbound | outbound
  -- Precise, not date-level. This is what lets "did she answer" be answered
  -- properly rather than conservatively.
  occurred_at TEXT NOT NULL,
  from_address TEXT,
  to_address TEXT,
  subject TEXT,
  snippet TEXT,                                -- first ~300 chars, for recognition only
  -- interested | question | price | objection | not-now | referral |
  -- wrong-person | decline | unsubscribe | out-of-office | bounce | unknown
  classification TEXT,
  confidence TEXT,                             -- high | medium | low
  classified_by TEXT,                          -- 'rules' | model id
  why TEXT,                                    -- one line, for the activity feed
  requires_human INTEGER DEFAULT 0,
  -- Set when an outbound from us appears later in the same thread.
  answered_at TEXT,
  -- Where it came from, so a future Gmail OAuth path and the current skill
  -- path are distinguishable in the data.
  source TEXT DEFAULT 'skill',
  ingested_at TEXT DEFAULT (datetime('now'))
);

-- The deduplication guarantee.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reply_msg ON reply_events(workspace, message_id);
CREATE INDEX IF NOT EXISTS idx_reply_prospect ON reply_events(prospect_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_reply_unanswered ON reply_events(workspace, answered_at, direction);

-- Replies that could not be matched to a prospect with confidence. Never
-- guessed onto a record: one person's reply appearing on another person's row
-- is a data-integrity failure, not a UX inconvenience.
CREATE TABLE IF NOT EXISTS unmatched_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  message_id TEXT NOT NULL,
  thread_id TEXT,
  occurred_at TEXT,
  from_address TEXT,
  subject TEXT,
  snippet TEXT,
  -- Why matching failed, and any candidates, so a person can resolve it fast.
  reason TEXT,
  candidates TEXT,
  resolved_prospect_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unmatched_msg ON unmatched_replies(workspace, message_id);

-- Durable sync cursor, so ingestion resumes rather than rescanning.
CREATE TABLE IF NOT EXISTS sync_state (
  workspace TEXT NOT NULL,
  source TEXT NOT NULL,
  cursor TEXT,
  last_run_at TEXT,
  last_error TEXT,
  PRIMARY KEY (workspace, source)
);

-- A prepared follow-up that has not been sent. Kept so an inbound reply can
-- invalidate it: a draft prepared at 9am and a reply at 9:05 is exactly the
-- race that produces the worst email in the sequence.
ALTER TABLE prospects ADD COLUMN pending_draft TEXT;
ALTER TABLE prospects ADD COLUMN pending_draft_at TEXT;
-- Set when a reply lands after the draft was prepared. The UI must not offer
-- a green Send on a draft written before the conversation moved.
ALTER TABLE prospects ADD COLUMN pending_draft_stale INTEGER DEFAULT 0;
-- Explicit do-not-contact, set by an unsubscribe. Separate from a decline:
-- a decline is an answer, this is a legal-ish instruction.
ALTER TABLE prospects ADD COLUMN do_not_contact INTEGER DEFAULT 0;
ALTER TABLE prospects ADD COLUMN unsubscribed INTEGER DEFAULT 0;
