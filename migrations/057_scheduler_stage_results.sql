-- Which stage of a scheduled run failed, not just whether it finished.
--
-- The 2026-08-12 daily wake woke budget waiters and enqueued both workspace
-- sweeps, and then did not write its completion mark. The health page correctly
-- said "started, but did not finish" and could say nothing more: one row with
-- two timestamps cannot distinguish a cron that never fired from one whose
-- sweep enqueue failed from one where the sweep worked and an unrelated
-- maintenance step died afterwards.
--
-- Those are three different problems with three different fixes, and the third
-- one -- the one that actually happened -- is the least alarming of them.

-- 'completed' | 'partial' | 'failed'. Null for rows written before this.
ALTER TABLE system_heartbeats ADD COLUMN last_outcome TEXT;

-- JSON: one entry per named stage with ok/error. Small and bounded.
ALTER TABLE system_heartbeats ADD COLUMN last_stages TEXT;

-- The first error that stopped a stage, sanitized. Never a raw payload.
ALTER TABLE system_heartbeats ADD COLUMN last_error TEXT;

-- When the run stopped, whatever the outcome. Distinct from last_completed_at,
-- which still means only "reached its intended terminal point".
ALTER TABLE system_heartbeats ADD COLUMN last_finished_at TEXT;
