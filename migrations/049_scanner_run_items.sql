-- Exactly which prospects a Hive run was given.
--
-- The run that died knew it had asked for 5,484 and finished 70. It did not
-- know which 5,484, so it could not say which 5,414 were left. 5484 - 70 is
-- arithmetic, not a set: the eligible list changes as sites get checked by
-- other means, so the difference cannot be reconstructed afterwards and
-- pretending otherwise would offer a Resume that quietly did something else.
--
-- One row per prospect per run, written at start, before any work begins. That
-- makes the unfinished set a query rather than a guess, and it is the thing
-- that lets execution move off the browser at all: a server worker needs to be
-- told what to do, and until now the only copy of that list lived in a
-- JavaScript array inside a tab.
--
-- Normalised rather than a JSON blob of ids on the run. Five thousand ids in
-- one column cannot be indexed, cannot be claimed one at a time, cannot record
-- a per-item error, and turn every progress read into parsing a 60KB string.

CREATE TABLE IF NOT EXISTS scanner_run_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  scanner_run_id INTEGER NOT NULL,
  prospect_id INTEGER NOT NULL,

  -- Where in the run it sat when the snapshot was taken. Kept so work can be
  -- handed out in the order Ary's selection produced rather than by rowid.
  position INTEGER NOT NULL DEFAULT 0,

  -- PENDING   in the run, not yet handed to the queue
  -- QUEUED    a job exists for it
  -- RUNNING   a worker owns it
  -- SUCCEEDED the canonical work finished
  -- FAILED    terminal, after the queue's normal retries
  -- CANCELLED never started, because the run stopped or was closed
  --
  -- CANCELLED is only ever reachable from a state that never started. Finished
  -- work is never relabelled: a run stopping does not make what it already did
  -- untrue.
  state TEXT NOT NULL DEFAULT 'PENDING',

  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,

  queued_at TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- One row per prospect per run. A double-pressed start, a retried HTTP call or
-- a feeder that runs twice must not put the same business in a run twice and
-- charge for it twice.
CREATE UNIQUE INDEX IF NOT EXISTS scanner_run_items_unique
  ON scanner_run_items (workspace, scanner_run_id, prospect_id);

-- The two questions asked constantly: what is left to hand out, and how far
-- along is this run. Both are counts over (run, state), and neither may ever
-- become "load five thousand rows and count them in JavaScript".
CREATE INDEX IF NOT EXISTS scanner_run_items_run_state
  ON scanner_run_items (workspace, scanner_run_id, state);

-- Deliberately no backfill.
--
-- Run 1 stays as it is: total 5,484, processed 70, membership unknown. Writing
-- 5,414 invented rows would turn "we do not know" into a list somebody could
-- act on, and the whole point of this table is that the list is real.
