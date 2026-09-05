-- Did the background scheduler actually fire?
--
-- Nothing could answer that. System health inferred activity from jobs moving,
-- mailboxes syncing and scanner runs progressing, and every one of those is
-- ambiguous when the answer is "nothing changed": maybe the scheduler ran and
-- there was nothing to do, maybe everything was waiting for something, or maybe
-- the cron has not fired since Tuesday. Those three look identical from the
-- outside and only one of them is a problem.
--
-- A tiny table rather than a row in `settings`, because settings is per
-- workspace by construction (workspace NOT NULL, one row per key per
-- workspace) and the cron is not. There is one Worker, one schedule, and one
-- drain that walks every workspace; inventing a fake workspace to hold a global
-- fact would be a lie that some later query would eventually believe.
--
-- Deliberately not a history of cron runs. Latest truth only, one row per
-- named schedule, overwritten in place. A log of every invocation would be
-- thousands of rows a week answering a question nobody asks.
CREATE TABLE IF NOT EXISTS system_heartbeats (
  -- 'cron-drain'. Named rather than assumed, so a second schedule can be added
  -- later without changing the shape.
  name TEXT PRIMARY KEY,

  -- The scheduler reached us and proved who it was. Written immediately after
  -- the secret check and before any work, so it means exactly "fired", not
  -- "succeeded".
  last_invoked_at TEXT,

  -- The drain finished its intended control flow. Written last. When this is
  -- stale while last_invoked_at is fresh, the cron is firing and the drains are
  -- dying partway, which is a different problem with a different fix.
  last_completed_at TEXT,

  updated_at TEXT DEFAULT (datetime('now'))
);
