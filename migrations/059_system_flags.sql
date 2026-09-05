-- Global on/off facts that are nobody's workspace setting. The first one is
-- the spend breaker: 'autonomy-paused' set to '1' stops the cron drain doing
-- anything at all, and the drain sets it ITSELF when one of its own runs
-- reads an absurd number of rows. Cloudflare alerts can only announce a
-- burn; this is the thing that stops one.
CREATE TABLE IF NOT EXISTS system_flags (
  name TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  reason TEXT,
  updated_at TEXT NOT NULL
);
