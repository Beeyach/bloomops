-- Maps scans became review-first: results wait in the scan row until the
-- user picks which to import (see /api/scan/import).
ALTER TABLE scan_runs ADD COLUMN results TEXT;
