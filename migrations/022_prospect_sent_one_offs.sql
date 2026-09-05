-- The two emails that are not part of the numbered sequence.
--
-- Emails 1 to 5 live in email_sequence, so what went out is always readable.
-- The standalone video email (for a prospect whose video landed after the
-- sequence ended) and the playbook reactivation email are built fresh by the
-- sweep at send time, so until now nothing recorded what the prospect actually
-- received. These two columns close that gap.
--
-- Each holds a JSON object { subject, body, sent_at }, written by the sweep
-- right after a confirmed send. Empty on every existing row, and empty forever
-- on prospects who never get one.
ALTER TABLE prospects ADD COLUMN video_sent_email TEXT;
ALTER TABLE prospects ADD COLUMN playbook_sent_email TEXT;
