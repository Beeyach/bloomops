-- Two things Ary asked for after living with V2 for a day.
--
-- 1. Old pre-V2 drafts were sitting in the same "Ready for approval" area as
--    real V2 packages, so the screen showed two different systems as if they
--    were one. Dismissing one has to remove it from today's work without
--    deleting anything or pretending the prospect was rejected.
--
-- 2. The Hive scanners could be started and not stopped. They are client-driven
--    loops, so "stop" has to mean something the server knows, otherwise
--    closing a tab and reopening it starts the work up again.

-- ── Legacy drafts ────────────────────────────────────────────────────────
--
-- Dismissal, not deletion. The draft text stays exactly where it was, and the
-- prospect's stage, rating and reply state are not touched: "I do not want to
-- see this today" is not "this prospect is rejected", and conflating the two is
-- how a good prospect quietly disappears.
ALTER TABLE prospects ADD COLUMN pending_draft_dismissed_at TEXT;

-- ── Scanner runs ─────────────────────────────────────────────────────────
--
-- One row per press of a Hive button. The state lives here rather than in the
-- browser, because the loop that does the work runs in a tab and a tab is not
-- a durable place to keep a decision. Stop writes STOPPING here; the loop reads
-- it before claiming the next item and puts it down.
CREATE TABLE IF NOT EXISTS scanner_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  -- Which Hive worker. 'precheck', 'score', and so on.
  scanner TEXT NOT NULL,
  label TEXT,

  -- RUNNING | STOPPING | STOPPED | COMPLETED | FAILED | ABANDONED
  --
  -- STOPPING is its own state on purpose. An item already in flight is allowed
  -- to finish, because killing a request halfway through leaves a half-written
  -- answer and no way to tell. So the honest thing to show is "stopping after
  -- the current one finishes", and that needs a state to say it.
  state TEXT NOT NULL DEFAULT 'RUNNING',
  stop_reason TEXT,

  total INTEGER DEFAULT 0,
  processed INTEGER DEFAULT 0,
  succeeded INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  current_item TEXT,

  started_at TEXT DEFAULT (datetime('now')),
  -- Written on every progress report. A run whose heartbeat stopped long ago is
  -- a tab that was closed, and that is recoverable without guessing.
  heartbeat_at TEXT DEFAULT (datetime('now')),
  stopped_at TEXT,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_scanner_runs_ws ON scanner_runs(workspace, state, started_at);
CREATE INDEX IF NOT EXISTS idx_scanner_runs_live ON scanner_runs(workspace, scanner, state);

-- Queue work belonging to a run, so stopping a run can cancel what it queued
-- without touching anybody else's jobs. Nullable: almost every job in the
-- system has no scanner run behind it and never will.
ALTER TABLE jobs ADD COLUMN scanner_run_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_jobs_scanner_run ON jobs(scanner_run_id, status);
