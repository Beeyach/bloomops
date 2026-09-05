-- Ad-library leads are a different animal from post leads. A post's TEXT is
-- the buying signal; an ad's text is marketing copy, and the buying signal is
-- the fact that someone is paying to run it. Scoring them with the same rules
-- marks every ad red, so leads now carry what kind they are.
--
-- dest_url is the page the ad sends paid traffic to. For Bloomwired that is
-- the single most useful field in the whole payload: it proves a real site
-- exists and it points at the exact page where the booking path can leak.
ALTER TABLE leads ADD COLUMN lead_kind TEXT;
ALTER TABLE leads ADD COLUMN dest_url TEXT;
