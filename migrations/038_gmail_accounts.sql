-- A mailbox the app is allowed to read, and everything needed to keep reading
-- it without anybody being present.
--
-- Keyed by (workspace, email_address) rather than one row per workspace. One
-- mailbox is all that exists today, but the relationship a SaaS needs is
-- workspace → mailboxes → threads → prospects, and retrofitting the plural
-- later means rewriting every join. The table is plural from the start; the UI
-- simply does not offer a second one yet.
CREATE TABLE IF NOT EXISTS gmail_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  email_address TEXT NOT NULL,

  -- Sealed with the same AES-GCM box as the AI keys. Never returned to a
  -- browser, never logged, never put in an API response.
  refresh_token TEXT,
  access_token TEXT,
  access_expires_at TEXT,
  -- Exactly what the user consented to, stored so a scope change is visible
  -- rather than discovered as a 403 at 4am.
  scope TEXT,

  -- The sync cursor. Everything about incremental sync hangs off this one
  -- value: it advances only after a batch is fully processed, so a crash
  -- mid-batch replays rather than skips.
  history_id TEXT,

  -- Watches expire after seven days. Google's own advice is to renew daily,
  -- which is what the cron does; this is stored so a failed renewal is
  -- visible before the watch actually lapses.
  watch_expiration TEXT,
  last_watch_at TEXT,

  -- Observability. Each answers a different question a person actually asks:
  -- "is it listening" (notification), "is it working" (sync), "is it about to
  -- stop" (watch), "what went wrong" (error).
  last_notification_at TEXT,
  last_sync_at TEXT,
  last_error TEXT,
  -- connected | needs-reconnect | error
  status TEXT NOT NULL DEFAULT 'connected',
  connected_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gmail_ws_email ON gmail_accounts(workspace, email_address);

-- Message identity, from the headers rather than inferred.
--
-- message_id already holds the Gmail message id and remains the dedupe key.
-- These are the RFC 5322 identifiers, which are what actually prove a message
-- is a reply to something we sent: In-Reply-To and References name our
-- Message-ID explicitly, and no amount of subject similarity is equivalent.
ALTER TABLE reply_events ADD COLUMN rfc_message_id TEXT;
ALTER TABLE reply_events ADD COLUMN in_reply_to TEXT;
ALTER TABLE reply_events ADD COLUMN refs TEXT;
ALTER TABLE reply_events ADD COLUMN gmail_account_id INTEGER;
-- How the match was made, kept per event so a wrong attachment can be traced
-- back to the rule that made it rather than guessed at.
ALTER TABLE reply_events ADD COLUMN matched_by TEXT;
-- Structured facts the reply stated: a date they asked for, somebody else to
-- talk to, an objection, a provider they already use. Separate column because
-- this is conversation evidence and must never be mistaken for a verified
-- finding about their website.
ALTER TABLE reply_events ADD COLUMN extracted TEXT;

ALTER TABLE unmatched_replies ADD COLUMN rfc_message_id TEXT;
ALTER TABLE unmatched_replies ADD COLUMN gmail_account_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_reply_rfc ON reply_events(workspace, rfc_message_id);
CREATE INDEX IF NOT EXISTS idx_reply_thread ON reply_events(workspace, thread_id);
