-- Clients were a row with a rate and a checklist. A client you are actually
-- working deserves a page: where things stand, what was agreed, screenshots,
-- links to the contract and the brand assets.
--
-- body reuses the same rich editor as workspace pages, so a client profile
-- gets headings, tables, checklists and pasted images for free.
-- stage says whether they are still onboarding, running, paused or finished —
-- "Onboarded / not" could not express a paused client.
-- files holds labelled links (contract, brand assets, invoices). The file
-- itself stays in Drive, so there is one copy and Google keeps owning the
-- permissions on it.
ALTER TABLE clients ADD COLUMN body TEXT;
ALTER TABLE clients ADD COLUMN stage TEXT;
ALTER TABLE clients ADD COLUMN files TEXT;
