-- How fast is the Hive going right now?
--
-- Answered by counting the items that finished in the last hour, which without
-- this index means reading every row of every run the workspace has ever done.
-- One 5,484-item run makes that a five-thousand-row scan on a page Ary might
-- leave open, refreshing.
--
-- The existing index is (workspace, scanner_run_id, state), which serves "how
-- is THIS run doing" and cannot serve "what happened lately" because the run id
-- is the second column and a throughput question does not know it.
CREATE INDEX IF NOT EXISTS scanner_run_items_finished
  ON scanner_run_items (workspace, finished_at);
