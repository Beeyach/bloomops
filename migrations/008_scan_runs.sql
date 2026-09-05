-- In-app Facebook ad scans (Apify runs the scrape server-side on a shared
-- token; users never touch Apify). One row per scan; the weekly per-workspace
-- allowance is enforced by counting recent rows against the 'limits' settings
-- key (admin-set).
CREATE TABLE IF NOT EXISTS scan_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  query TEXT,
  country TEXT,
  apify_run_id TEXT,
  status TEXT DEFAULT 'running',   -- running | done | failed
  items_found INTEGER,
  leads_added INTEGER,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_scan_runs_ws ON scan_runs(workspace, created_at);
