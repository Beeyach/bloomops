-- High-ticket clues found on an ad lead's landing page, as a JSON array of
-- { key, label }. Not a price, which real high-ticket hides behind a call, but
-- the shape of the offer around it: a program, an apply/book-a-call funnel, a
-- stated income claim, a figure when one is shown. Surfaced so a lead can be
-- judged at a glance. Nullable; no clues found is an empty result, not a
-- reason to drop a match.
ALTER TABLE leads ADD COLUMN signals TEXT;
