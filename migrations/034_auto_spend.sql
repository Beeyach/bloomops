-- How much of today's automation allowance a workspace has used.
--
-- Separate from the credit balance on purpose: the balance is the money, this
-- answers "how much unattended work has already happened today". Without it
-- the only circuit breaker available is the balance itself, which means the
-- first sign of a runaway job is an empty account.
CREATE TABLE IF NOT EXISTS auto_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  day TEXT NOT NULL,          -- date('now'), so the allowance resets daily
  kind TEXT,                  -- 'precheck' | 'score' | …
  credits INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_auto_spend_ws_day ON auto_spend(workspace, day);
