-- Structured signals on a prospect, in the same shape lib/signals.mjs produces:
-- type, text, source, observed_at, confidence, method.
--
-- The detection has existed in lib/extract-email.mjs for months and only
-- ad-scan leads could reach it, because `signals` was a column on `leads` and
-- nothing equivalent existed here. So a prospect's own site could be read for
-- a contact address and buying signals, and the result had nowhere to live.
ALTER TABLE prospects ADD COLUMN signals TEXT;
