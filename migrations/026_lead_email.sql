-- A contact email on an inbox lead.
--
-- The Meta Ad Library finds who is running ads but never their email, and Ellen
-- reaches people by email. The address is pulled from the advertiser's own
-- landing page where one is listed. Nullable, and a lead with no email is still
-- a match worth showing: the email is a bonus, never the reason to keep or drop
-- a lead.
ALTER TABLE leads ADD COLUMN email TEXT;
