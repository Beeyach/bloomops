-- Closing the three holes in the outcome chain.
--
-- 1. SEND was not an event. The app never sends: the sweep skill does, out of
--    Gmail. So "approved" was the last thing the database knew, and approved is
--    not sent. Every question shaped like "how long until it went out" or "did
--    that one actually go" was unanswerable, and the honest reading of an
--    approval as a send would have quietly overcounted every funnel.
--
-- 2. CLIENT had no timestamp. `stage = 'Client'` is a state. States cannot be
--    ordered against replies, and a state that gets edited loses the moment it
--    first became true.
--
-- 3. Qualification was thrown away at promotion. A lead scored against the
--    workspace's own green and red rules arrived as a prospect carrying prose
--    in a notes field, and the structure that justified it was gone.

-- The canonical record of an outreach message actually leaving.
--
-- Deliberately not folded into outcome_events: that table is append-only and
-- fire-and-forget by design, and a send must be idempotent. Recording the same
-- send twice would double the sequence step, double the metrics and, once
-- outcome learning starts, double a prospect's weight in whatever it learns.
CREATE TABLE IF NOT EXISTS send_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  prospect_id INTEGER NOT NULL,

  -- What was sent. Nullable because a manual send has no package behind it,
  -- and pretending otherwise would put a fake id in the causal chain.
  package_id INTEGER,
  package_version INTEGER,
  generator_version TEXT,
  playbook TEXT,
  -- 1 = first contact, 2+ = follow-ups.
  sequence_step INTEGER NOT NULL DEFAULT 1,

  channel TEXT NOT NULL DEFAULT 'email',
  provider TEXT NOT NULL DEFAULT 'gmail',
  -- The provider's own identifiers. These are what make reconciliation
  -- possible: if the callback is lost, the sent message is still in the
  -- mailbox with these on it.
  provider_message_id TEXT,
  provider_thread_id TEXT,
  subject TEXT,

  sent_at TEXT NOT NULL,
  -- 'skill-callback' | 'gmail-reconcile' | 'manual'. How we came to know.
  recorded_via TEXT NOT NULL DEFAULT 'skill-callback',

  -- The provider message id where one exists, otherwise a derived key. Either
  -- way it is stable across retries, which is the whole point.
  dedupe_key TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Recording a send twice must be a no-op, not a second row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_send_dedupe ON send_events(workspace, dedupe_key);
CREATE INDEX IF NOT EXISTS idx_send_prospect ON send_events(prospect_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_send_ws_time ON send_events(workspace, sent_at);
CREATE INDEX IF NOT EXISTS idx_send_thread ON send_events(workspace, provider_thread_id);

-- When they first became a client. Set once and never rewritten: editing a
-- client's record later must not move the date they became one.
ALTER TABLE prospects ADD COLUMN first_client_at TEXT;

-- The workspace qualification that was already true when this prospect was
-- promoted from a scored lead. JSON: the post text, the scorer's verdict, the
-- reasons it gave, and the rule ids those reasons matched.
--
-- Carried rather than re-derived. The scoring happened once, against rules
-- that may since have been edited, and re-running it later would answer a
-- different question than the one that produced this prospect.
ALTER TABLE prospects ADD COLUMN qualification TEXT;
