-- Traceability for outcome learning.
--
-- Without these, "this playbook converts badly" and "this playbook converted
-- badly in July before we fixed it" are the same sentence, and the first real
-- analysis pass would draw a confident wrong conclusion from them.
--
-- Identifiers only, never whole prompts. The prompt lives in the code at that
-- version; storing a copy per row would be a slow way to fill the database
-- with something git already has.
ALTER TABLE outreach_packages ADD COLUMN generator_version TEXT;
ALTER TABLE outreach_packages ADD COLUMN playbook_version INTEGER;
ALTER TABLE outreach_packages ADD COLUMN model TEXT;
-- What the workspace said it sold at the time. A package written before the
-- offer changed was written for a different business.
ALTER TABLE outreach_packages ADD COLUMN workspace_context_hash TEXT;
-- The evidence exactly as it stood when the angle was chosen, so a later
-- re-probe cannot quietly rewrite the reason a decision was made.
ALTER TABLE outreach_packages ADD COLUMN evidence_hash TEXT;
-- Angles that also qualified but lost, and why this one won. The losers are
-- what makes "was the selection any good" answerable later.
ALTER TABLE outreach_packages ADD COLUMN also_eligible TEXT;
ALTER TABLE outreach_packages ADD COLUMN selection_reason TEXT;
-- Whether this workspace can actually help with what was found.
ALTER TABLE outreach_packages ADD COLUMN workspace_fit TEXT;

CREATE INDEX IF NOT EXISTS idx_pkg_generator ON outreach_packages(workspace, generator_version, playbook);
