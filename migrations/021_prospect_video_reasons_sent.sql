-- Two follow-on fields for the audit video, both empty on every existing row.
--
-- video_reasons is the short list of what the scan actually found worth
-- recording ("contact form 404s", "phone number mismatch"), stored as a JSON
-- array of strings the same way email_sequence stores its objects. It is the
-- recording worklist's "why", so it lives beside the tier and score rather
-- than buried in the Info text.
--
-- video_sent_at is the date the video variant of an email went out. The daily
-- sweep stamps it right after sending so the same video is never sent twice.
-- Empty until sent, like reply_date.
ALTER TABLE prospects ADD COLUMN video_reasons TEXT;
ALTER TABLE prospects ADD COLUMN video_sent_at TEXT;
