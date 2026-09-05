-- Qualification scoring columns (from Ellen's Dream Client Checklist, but
-- available to every workspace as optional columns):
--   must_haves    'Y' | 'N' | NULL — did they pass the pass/fail gate
--   revenue_score 0-7 — how many revenue signals they show
-- Hidden by default everywhere; turn them on from the Columns menu.
ALTER TABLE prospects ADD COLUMN must_haves TEXT;
ALTER TABLE prospects ADD COLUMN revenue_score INTEGER;
