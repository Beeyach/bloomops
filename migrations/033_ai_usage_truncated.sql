-- Whether a call hit its output ceiling. Without this, tuning an output cap is
-- a guess: a task that truncated looks identical in the ledger to one that
-- finished early, and the only difference visible anywhere is a worse answer.
ALTER TABLE ai_usage ADD COLUMN truncated INTEGER DEFAULT 0;
