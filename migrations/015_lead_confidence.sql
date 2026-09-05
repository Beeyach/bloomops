-- The scorer has always returned a confidence flag and the parser has always
-- read it — but the route dropped it on the floor, so an unverifiable page
-- landed in Qualified looking exactly like a checked one. Keep it, and let a
-- low-confidence green stay in review instead.
ALTER TABLE leads ADD COLUMN confidence TEXT;
