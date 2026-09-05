-- Your call has to be able to beat the model's. Skipping a lead used to move
-- it out of the list while leaving the AI's green sitting on the record, so a
-- page you had personally checked and rejected still read GREEN.
--
-- verdict_source records who decided ('ai' or 'you'). your_note is where the
-- reason lives — "AI-generated persona, scam review" is worth more than the
-- verdict itself, because that is what turns into a red rule later.
ALTER TABLE leads ADD COLUMN verdict_source TEXT;
ALTER TABLE leads ADD COLUMN your_note TEXT;
