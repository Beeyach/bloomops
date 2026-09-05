-- Historical email chronology, recovered from the mailbox.
--
-- Gmail sync began on 2026-08-09. Everything before that exists only in Ary's
-- mailbox, which is why every question about sequence marginality, reply
-- handling speed and what happened after somebody said "interested" came back
-- NOT ANSWERABLE in two forensic passes.
--
-- Deliberately a separate table from reply_events. reply_events is the live
-- canonical record that the outbound guard and the send reconciler read; a
-- backfill writing into it would rewrite the state of the safety engine from
-- history, which is the one thing a forensic tool must never do. This table is
-- read by analysis and by nothing else.
--
-- Headers only. Subject, addresses, timestamps, direction. No bodies: the
-- privacy architecture says the product does not become a mailbox archive, and
-- chronology is what the analysis actually needs.
CREATE TABLE IF NOT EXISTS legacy_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  prospect_id INTEGER NOT NULL,

  message_id TEXT NOT NULL,
  thread_id TEXT,
  rfc_message_id TEXT,

  -- outbound | inbound, decided by whether the mailbox owner sent it.
  direction TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  from_address TEXT,
  to_address TEXT,
  subject TEXT,

  -- Which rule matched, and how much it is worth. Never loosened to improve
  -- coverage: an ambiguous thread is left unmatched rather than guessed at.
  match_rule TEXT,
  match_confidence TEXT DEFAULT 'high',

  -- Always 1 here. Present so a query cannot accidentally treat a recovered
  -- 2026-06 message as modern structured history.
  legacy_backfill INTEGER NOT NULL DEFAULT 1,
  imported_at TEXT DEFAULT (datetime('now'))
);

-- Replayable: importing the same message twice is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS idx_legacy_msg ON legacy_messages(workspace, message_id);
CREATE INDEX IF NOT EXISTS idx_legacy_prospect ON legacy_messages(prospect_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_legacy_dir ON legacy_messages(workspace, direction, occurred_at);

-- What the backfill did for each prospect, so a rerun skips finished work and
-- an unmatched prospect is visible rather than silently absent.
ALTER TABLE prospects ADD COLUMN legacy_backfill_at TEXT;
ALTER TABLE prospects ADD COLUMN legacy_backfill_result TEXT;
ALTER TABLE prospects ADD COLUMN legacy_message_count INTEGER;
