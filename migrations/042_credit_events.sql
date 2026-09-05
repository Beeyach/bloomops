-- Credits, per product action, rather than one number going down.
--
-- The balance lived in a settings blob: a current figure and a lifetime total,
-- and nothing in between. So "what did we charge for video this month" and
-- "how much of the spend was automatic" had no answer at all, and the internal
-- economics view would have had to guess or leave most of itself blank.
--
-- AI work was already itemised in ai_usage, which is why its economics could
-- be worked out and nothing else's could. This is the same ledger for the
-- actions that cost real money somewhere other than a model: the browser
-- probe, the video render, a scan.
--
-- Written from inside the spend helpers, so no call site has to remember.
CREATE TABLE IF NOT EXISTS credit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  -- The catalogued action: 'precheck' | 'video' | 'scan' | an AI task name.
  -- Matches lib/credit-catalog.mjs ids where one exists.
  action TEXT NOT NULL,
  -- Positive for a charge, negative for a refund. Signed rather than a
  -- separate table so a period's net is one SUM and cannot drift.
  credits INTEGER NOT NULL,
  -- 'charge' | 'refund'
  kind TEXT NOT NULL DEFAULT 'charge',
  -- Who asked. 'human' when a person clicked, 'auto' when the sweep did.
  -- This is the split that decides whether unattended spend is worth it.
  actor TEXT NOT NULL DEFAULT 'human',
  prospect_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_credit_ws_time ON credit_events(workspace, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_action ON credit_events(workspace, action, created_at);
CREATE INDEX IF NOT EXISTS idx_credit_prospect ON credit_events(prospect_id);
