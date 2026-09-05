-- fb-ads scans can cap page size ("solo-size only") — the cap must survive
-- until the poll that finalizes the run, so it lives on the scan row.
ALTER TABLE scan_runs ADD COLUMN max_likes INTEGER;
