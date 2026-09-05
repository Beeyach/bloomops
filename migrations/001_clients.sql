-- Clients + onboarding checklists (spec §3b). Checklist is a JSON column:
-- [{id, label, done, doneDate}] — never queried per-step.
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  prospect_id INTEGER,
  name TEXT NOT NULL,
  handle TEXT DEFAULT '',
  platforms TEXT DEFAULT '[]',
  monthly_rate TEXT DEFAULT '',
  start_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  onboarding TEXT DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clients_prospect ON clients(prospect_id);
