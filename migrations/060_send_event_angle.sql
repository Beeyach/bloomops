-- V3: stamp the angle each cold email took, so the history is readable
-- and the uniqueness rule is auditable after the fact.
ALTER TABLE send_events ADD COLUMN angle TEXT;
