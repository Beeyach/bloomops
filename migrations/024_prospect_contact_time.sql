-- When an email actually went out, not just which day.
--
-- last_contact_date is a date, so "which send time earns replies" has no answer
-- on this data: 737 sends and 57 replies and no way to tell 8am from 2pm. Day
-- of week is answerable and already showed Saturday at 4.9% against Monday at
-- 14.3%, which is the same question one level up.
--
-- Stored as a full ISO timestamp in UTC. The prospect's local time is that plus
-- their country's offset, which is why this is a timestamp rather than a local
-- clock reading: the offset can be applied later and correctly, and a local
-- reading from the sender's machine could not be undone.
--
-- Nullable, and every row already on file stays null. Nothing reads it yet
-- beyond reporting, so an empty column costs nothing while it fills.
ALTER TABLE prospects ADD COLUMN last_contact_at TEXT;

-- Same for the reply, so time-to-reply becomes measurable as well. A reply that
-- lands forty minutes after the send says something different about the send
-- than one that arrives three days later, and reply_date cannot tell them
-- apart.
ALTER TABLE prospects ADD COLUMN reply_at TEXT;
