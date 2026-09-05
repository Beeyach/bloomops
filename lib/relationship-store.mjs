// Reading and writing the relationship timeline.
//
// Kept apart from lib/relationship.mjs so the rules stay pure and testable
// without a database, and so there is exactly one place that touches the table.

import { REL, SOURCE, currentState, relationshipFromReply, isReconsideration } from './relationship.mjs';

// Everything that has happened, oldest first.
//
// Bounded. A conversation with more than fifty meaningful turns is not a
// conversation, and the page shows a timeline rather than an archive.
export async function timelineFor(db, { workspace, prospectId, limit = 50 }) {
  const { results } = await db
    .prepare(
      `SELECT id, state, source, confidence, occurred_at, message_id, thread_id, reason, defer_until
         FROM relationship_events
        WHERE workspace = ? AND prospect_id = ?
        ORDER BY occurred_at ASC, id ASC
        LIMIT ?`
    )
    .bind(workspace, prospectId, limit)
    .all()
    .catch(() => ({ results: [] }));

  return (results || []).map((r) => ({
    id: r.id,
    state: r.state,
    source: r.source,
    confidence: r.confidence,
    occurredAt: r.occurred_at,
    messageId: r.message_id,
    threadId: r.thread_id,
    reason: r.reason,
    deferUntil: r.defer_until,
  }));
}

// Where this prospect stands, with the story behind it.
//
// One call, so no caller has to remember the precedence or which prospect
// columns override which events.
export async function standingOf(db, { workspace, prospect, legacyDeferUntil = null, now = new Date() }) {
  if (!prospect) return { current: { state: null }, timeline: [] };
  const timeline = await timelineFor(db, { workspace, prospectId: prospect.id });
  const current = currentState({
    events: timeline,
    doNotContact: Boolean(prospect.do_not_contact),
    unsubscribed: Boolean(prospect.unsubscribed),
    isClient: String(prospect.stage || '') === 'Client' || Boolean(prospect.first_client_at),
    legacyStage: prospect.stage,
    // Where an old record's wait was written down, for prospects whose only
    // history is the stage they were parked at.
    legacyDeferUntil: legacyDeferUntil || prospect.deferred_until || prospect.next_action_date || null,
    now,
  });
  return { current, timeline };
}

// Write one moment down.
//
// INSERT OR IGNORE against the unique index, so a re-synced message or a retried
// classification records the same moment once. Never updates: a correction is a
// new row from a different source.
export async function recordEvent(db, {
  workspace, prospectId, state, source = SOURCE.CLASSIFIER,
  occurredAt = null, messageId = null, threadId = null,
  reason = null, confidence = null, deferUntil = null,
}) {
  if (!workspace || !prospectId || !state) return { written: false };
  const when = occurredAt || new Date().toISOString().replace('T', ' ').slice(0, 19);
  const res = await db
    .prepare(
      `INSERT OR IGNORE INTO relationship_events
         (workspace, prospect_id, state, source, confidence, occurred_at, message_id, thread_id, reason, defer_until)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(workspace, prospectId, state, source, confidence, when, messageId, threadId,
      reason ? String(reason).slice(0, 300) : null, deferUntil)
    .run()
    .catch(() => ({ meta: { changes: 0 } }));
  return { written: Boolean(res?.meta?.changes) };
}

// Turn one classified reply into a relationship event, if it means anything.
//
// Called from the reply path after the existing classifier has done its work.
// It does not touch stopping outbound, stages, or anything else the reply path
// already does correctly — it only adds the meaning to the timeline.
export async function recordReply(db, {
  workspace, prospectId, classification, text = '', occurredAt = null,
  messageId = null, threadId = null, confidence = null, deferUntil = null, isRealReply = true,
  // A backfill runs the same mapping over a stored reply the live path missed.
  // Same logic, same words, same timestamp — only the provenance differs, so an
  // audit can tell a row written as it happened from one written afterwards.
  source = SOURCE.CLASSIFIER,
}) {
  // An autoresponder or a bounce is not somebody's opinion. Letting one write a
  // relationship state is how "Yes, send it over" gets overruled by an
  // out-of-office an hour later.
  if (!isRealReply) return { written: false, reason: 'not a human reply' };

  const { state } = relationshipFromReply(classification, { text });
  if (!state) return { written: false, reason: 'nothing about the relationship' };

  // Reconsidering is a relationship between two events, so it needs the one
  // before. Only an explicit reversal counts; ordinary interest does not.
  const prior = await timelineFor(db, { workspace, prospectId });
  const previous = prior.length ? prior[prior.length - 1].state : null;
  const finalState = isReconsideration(previous, state) ? REL.RECONSIDERED : state;

  const written = await recordEvent(db, {
    workspace, prospectId, state: finalState, source,
    occurredAt, messageId, threadId, confidence, deferUntil,
    reason: reasonFor(finalState, previous),
  });

  // A reconsideration also records what they actually said yes to, so the
  // timeline shows both the turn and the destination.
  if (finalState === REL.RECONSIDERED && state !== REL.RECONSIDERED) {
    await recordEvent(db, {
      workspace, prospectId, state, source,
      occurredAt, messageId, threadId, confidence, deferUntil,
      reason: reasonFor(state, null),
    });
  }

  return { ...written, state: finalState };
}

function reasonFor(state, previous) {
  switch (state) {
    case REL.RECONSIDERED:
      return previous ? `Changed their mind after saying ${previous.replace(/_/g, ' ').toLowerCase()}.` : 'Changed their mind.';
    case REL.NO_TO_THIS_OFFER: return 'Said this particular offer was not what they needed.';
    case REL.NO_TO_US: return 'Asked not to be contacted about working together.';
    case REL.BUDGET_CONCERN: return 'Raised cost as the constraint.';
    case REL.DEFERRED: return 'Asked to be contacted later.';
    case REL.INTERESTED: return 'Replied wanting to talk.';
    case REL.ACCEPTED_OFFER: return 'Said yes to what was on the table.';
    case REL.AMBIGUOUS: return 'Replied, but the meaning was not clear.';
    default: return null;
  }
}

// Ary disagreeing with the classifier.
//
// Stored as its own event rather than editing the old one, because a correction
// is a fact about what somebody decided and when. The classifier's original
// stays in the timeline; the correction wins by being newer, and the next real
// reply from the prospect wins over both.
export async function correctTo(db, { workspace, prospectId, state, note = null, deferUntil = null, now = new Date() }) {
  return recordEvent(db, {
    workspace, prospectId, state, source: SOURCE.HUMAN,
    occurredAt: now.toISOString().replace('T', ' ').slice(0, 19),
    reason: note || 'You set this by hand.',
    // A deferral without its date is the thing that got three prospects stuck
    // on Today for ever. When Ary says "come back on the 24th", the date rides
    // with the event that says it.
    deferUntil,
  });
}
