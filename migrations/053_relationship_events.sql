-- What this person and Ary are to each other, over time.
--
-- `reply_events` already keeps every message and its label, and it stays the
-- record of what was said. This is a different question: what each meaningful
-- message MEANT for the relationship, and what the relationship is now.
--
-- The old answer was one column, `prospects.stage`, overwritten each time. That
-- lost the case this exists for: somebody replied interested, said the offer was
-- not what she needed, raised budget, seemed to decline, then three minutes
-- later accepted a one-time cleanup. The decline-shaped message set the stage to
-- Rejected with nobody asked to look, and a won deal read as a dead lead.
--
-- Append-only. Nothing here is ever updated or deleted; a correction is a new
-- row that wins by being newer. The current state is derived, never stored,
-- because a stored summary and its own history drift apart the first time
-- anything writes one without the other.
--
-- Deliberately NOT a CRM. No deals, no opportunities, no pipelines, no stages
-- beyond what the app already had. One row per meaningful moment.
CREATE TABLE IF NOT EXISTS relationship_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace TEXT NOT NULL,
  prospect_id INTEGER NOT NULL,

  -- One of the small vocabulary in lib/relationship.mjs. INTERESTED,
  -- NO_TO_THIS_OFFER, NO_TO_US, BUDGET_CONCERN, DEFERRED, RECONSIDERED,
  -- ACCEPTED_OFFER, WON, LOST, AMBIGUOUS.
  state TEXT NOT NULL,

  -- 'classifier' | 'human' | 'legacy'. A guess and a decision are different
  -- facts and must never be stored as though they were the same.
  source TEXT NOT NULL DEFAULT 'classifier',
  confidence TEXT,

  -- When it actually happened, which is the message time rather than the write
  -- time. Ordering the story by when rows were inserted would put a backfilled
  -- event after a live one.
  occurred_at TEXT NOT NULL,

  -- A pointer to the message, never a copy of it. The body already lives in
  -- Gmail and its snippet in reply_events; a third copy would be a third thing
  -- to keep in step and a third place for a stranger's words to leak.
  message_id TEXT,
  thread_id TEXT,

  -- One short sentence a person can read. Shown in the timeline.
  reason TEXT,

  -- Only for DEFERRED, and only when they actually gave a date. An invented one
  -- is worse than none.
  defer_until TEXT,

  created_at TEXT DEFAULT (datetime('now'))
);

-- The two questions asked: this prospect's story in order, and recently across
-- everyone. Both must stay cheap as this grows.
CREATE INDEX IF NOT EXISTS relationship_events_prospect
  ON relationship_events (workspace, prospect_id, occurred_at);

-- One event per message per state, so a re-sync or a retried classification
-- cannot write the same moment twice. Corrections are a different source, so
-- they are still allowed alongside the classifier's original.
CREATE UNIQUE INDEX IF NOT EXISTS relationship_events_once
  ON relationship_events (workspace, prospect_id, message_id, state, source)
  WHERE message_id IS NOT NULL;

-- Deliberately no backfill.
--
-- Old prospects have one stage and nothing else. That single fact is read as a
-- legacy state at display time and marked as such; inventing a sequence of
-- events to make their history look richer would be fabricating a conversation
-- that never happened.
