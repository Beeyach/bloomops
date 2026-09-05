-- Audit videos: a narrated walkthrough of a prospect's own site, rendered by
-- services/audit-render and hosted at file.gobloomwired.com/video/{slug}.
--
-- video_url mirrors review_url, which already holds the Email 5 PDF link. Same
-- shape, same host, same purpose: a branded link that goes in an email.
--
-- video_tier and video_score come from the triage pass, which decides whether
-- there is anything worth recording. Kept as columns rather than only in the
-- Info text so a render queue can be sorted and filtered rather than searched.
--
-- SEND, MAYBE, NO_VIDEO or BLOCKED. None of these rank the prospect. NO_VIDEO
-- means their site is in good order so a video would have to invent a problem,
-- and BLOCKED means their site would not load for us. Both still get the full
-- email sequence. Early scans wrote SKIP where NO_VIDEO is now written, and it
-- carried the same meaning.
ALTER TABLE prospects ADD COLUMN video_url TEXT;
ALTER TABLE prospects ADD COLUMN video_tier TEXT;
ALTER TABLE prospects ADD COLUMN video_score INTEGER;
