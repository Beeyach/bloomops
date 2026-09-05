-- What happened to a job along the way, kept after it eventually succeeds.
--
-- PREPARE_OUTREACH job 522 failed twice with "parseFollowUp is not defined" and
-- succeeded on the third attempt. The row afterwards reads status=done and
-- last_error=null, which is the correct answer to "what is true now" and the
-- complete loss of the answer to "what happened". `complete()` clears the error,
-- and every `fail()` overwrites the one before it, so even mid-flight only the
-- most recent failure ever existed.
--
-- The consequence was not theoretical. Diagnosing that job meant reading a
-- transcript rather than the database, and a job nobody was watching would have
-- left nothing at all.
--
-- Deliberately separate from `outcome_events`, which is prospect-shaped: it has
-- no job id and no attempt number, most of what it stores is a snapshot of what
-- was known about a prospect, and half the jobs in this queue have no prospect
-- at all. Overloading it would have meant two unrelated meanings in one table.
--
-- Append-only. Nothing updates or deletes a row here, and no cleanup is added
-- in this migration: history that disappears on a schedule nobody remembers is
-- the same problem in slower motion.
CREATE TABLE IF NOT EXISTS job_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  job_id INTEGER NOT NULL,
  -- Denormalised on purpose. The history has to stay readable even if the job
  -- row is ever pruned, and it is the first thing anybody looking at this asks.
  kind TEXT,
  -- Which try this was. The queue increments `attempts` on every claim, so this
  -- is the number that distinguishes two failures with identical messages.
  attempt INTEGER NOT NULL,
  -- claimed | succeeded | retry_scheduled | terminal_failed
  -- waiting_on_human | waiting_on_budget | released | cancelled
  event TEXT NOT NULL,
  error_kind TEXT,
  -- A sanitized summary. Useful operational text survives; anything that looks
  -- like a credential does not. See lib/job-events.mjs.
  error TEXT,
  -- The exact value written to jobs.run_after for a retry, so the schedule that
  -- was actually chosen is recoverable rather than recomputed later from a
  -- backoff formula that may since have changed.
  run_after TEXT,
  occurred_at TEXT DEFAULT (datetime('now'))
);

-- The same logical transition replayed must not double-write. A job cannot
-- succeed twice on attempt 3, and two attempts with the same error stay
-- distinct because the attempt number differs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_events_once ON job_events(job_id, attempt, event);

-- Reading one job's story, in order.
CREATE INDEX IF NOT EXISTS idx_job_events_job ON job_events(job_id, id);

-- Recent activity for one workspace, so the health page never scans the table.
CREATE INDEX IF NOT EXISTS idx_job_events_recent ON job_events(workspace, occurred_at);
