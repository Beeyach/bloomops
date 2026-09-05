-- The durable job queue.
--
-- Everything automatic goes through here rather than running inside whichever
-- request happened to trigger it. A job survives the browser closing, a
-- deployment, a worker restart and a dropped network, because it is a row.
--
-- The two columns that make retries safe are `dedupe_key` and `attempts`.
-- dedupe_key is UNIQUE across everything not yet finished, so the same work
-- cannot be queued twice while a copy of it is still pending or running: no
-- double charge, no duplicate research, no prospect advanced twice.
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  -- 'prescreen' | 'verify-site' | 'signals' | 'vet' | 'prepare-outreach' | 'sweep'
  kind TEXT NOT NULL,
  prospect_id INTEGER,
  -- JSON, whatever the handler needs beyond the prospect.
  payload TEXT,
  -- queued | running | done | failed | waiting | cancelled
  --   waiting means blocked on budget or a human, and is NOT a failure: it is
  --   picked up again when the thing it waits for changes.
  status TEXT NOT NULL DEFAULT 'queued',
  -- Higher runs first. Conversations beat research, same as Pick Bee.
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  -- Set while a worker holds the job, so a crashed worker's jobs can be
  -- reclaimed rather than being stuck running forever.
  claimed_at TEXT,
  -- Not before this time. Used for backoff and for scheduled work.
  run_after TEXT,
  last_error TEXT,
  -- transient | permanent | human | budget. Decides whether a retry happens.
  error_kind TEXT,
  -- Unique among unfinished jobs. NULL is allowed and never collides.
  dedupe_key TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- The deduplication guarantee. A partial index so finished jobs do not block
-- the same work being queued again later, which is the whole point: research
-- should be repeatable next month, just not twice at once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_dedupe_active
  ON jobs(dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running', 'waiting');

CREATE INDEX IF NOT EXISTS idx_jobs_claim ON jobs(status, priority DESC, run_after, id);
CREATE INDEX IF NOT EXISTS idx_jobs_ws ON jobs(workspace, status);
CREATE INDEX IF NOT EXISTS idx_jobs_prospect ON jobs(prospect_id);
