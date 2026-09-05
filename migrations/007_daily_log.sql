-- Daily outreach log, adopted from Ellen's spreadsheet. One row per
-- workspace per day: how many touches went out on each channel and how many
-- replies came back per channel. The Stats tab renders this and computes
-- totals/gap against the daily target (stored in the 'targets' settings key).
CREATE TABLE IF NOT EXISTS daily_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  date TEXT NOT NULL,             -- YYYY-MM-DD
  pe_sent INTEGER DEFAULT 0,      -- Personal email
  li_sent INTEGER DEFAULT 0,      -- LinkedIn
  ig_sent INTEGER DEFAULT 0,      -- Instagram
  ce_sent INTEGER DEFAULT 0,      -- Cold email
  pe_replies INTEGER DEFAULT 0,
  li_replies INTEGER DEFAULT 0,
  ig_replies INTEGER DEFAULT 0,
  ce_replies INTEGER DEFAULT 0,
  misc_replies INTEGER DEFAULT 0, -- replies not attributed to a channel
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(workspace, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_log_ws_date ON daily_log(workspace, date);
