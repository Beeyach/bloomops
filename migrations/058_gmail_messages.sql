-- The stored Gmail conversation, whole messages, per prospect.
--
-- Until now the app fetched the thread live from Gmail every time a
-- conversation was opened. That kept it fresh and made every open slow.
-- This table is a reading copy: opening a prospect reads from here, a sync
-- refreshes it when events show something newer arrived, and Gmail stays the
-- source of truth. Bodies are stored cleaned for reading (quotes and
-- signature tails already trimmed), which is the only form the app shows or
-- feeds to drafting.
CREATE TABLE IF NOT EXISTS gmail_messages (
  workspace    TEXT NOT NULL,
  prospect_id  INTEGER NOT NULL,
  message_id   TEXT NOT NULL,
  thread_id    TEXT,
  from_side    TEXT NOT NULL,
  from_address TEXT,
  occurred_at  TEXT,
  subject      TEXT,
  body         TEXT,
  synced_at    TEXT NOT NULL,
  PRIMARY KEY (workspace, prospect_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_gmail_messages_prospect
  ON gmail_messages (workspace, prospect_id, occurred_at);
