-- Scan types: the in-app scans grew from FB ads to posts and Google Maps.
ALTER TABLE scan_runs ADD COLUMN type TEXT DEFAULT 'fb-ads';
