-- Cold-email / DM outreach tracker columns, adopted from Ellen's spreadsheet.
-- Global: every workspace gets the columns. They start hidden in the Prospects
-- table for existing workspaces and show by default only where a workspace opts
-- into the cold-email layout (see DEFAULT_HIDDEN in ProspectsApp.jsx).
--
-- niche         free text, e.g. "Coaching", "Attorney", "Course creator"
-- call_booked   NULL = undecided, 1 = Yes, 0 = No
-- proposal_sent NULL = undecided, 1 = Yes, 0 = No
ALTER TABLE prospects ADD COLUMN niche TEXT;
ALTER TABLE prospects ADD COLUMN call_booked INTEGER;
ALTER TABLE prospects ADD COLUMN proposal_sent INTEGER;
