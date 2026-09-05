// Getting the replies that already happened into the new model.
//
// `reply_events` has kept every message since Gmail sync went in, with the
// label the classifier gave it at the time. The relationship timeline only
// started recording last night. So a prospect who replied last month shows
// their old stage and nothing else, and the work that made LTB understand a
// conversation does not apply to the list Ary actually has.
//
// This reconstructs those events from stored facts only. It is deterministic,
// it calls nothing, it costs nothing, and it is deliberately conservative:
//
//   the classification the old classifier recorded    → used
//   a boundary somebody set (do-not-contact)          → used
//   a real stored deferral date                       → used
//   the client/won fact                               → used
//   the words in the old message                      → NOT used
//
// That last exclusion is the important one. Re-reading old bodies with today's
// rules would produce a richer, more flattering history than the app ever
// actually knew, and a timeline that says things nobody recorded is worse than
// a short one. Truth over a prettier story.

import { REL } from './relationship.mjs';

// Reconstructed events are marked as their own kind of thing.
//
// Not `classifier`, because no classifier ran today. Not `human`, because
// nobody decided this. Somebody reading the timeline in a year should be able
// to tell which entries were reconstructed from old records and which were
// witnessed live.
export const RECONSTRUCTED = 'legacy-reconstruction';

// The old classifier's vocabulary, mapped by label alone.
//
// No message text is consulted, on purpose. The live path can look at wording
// to tell a budget objection from a flat no, because it has the whole message
// and is running at the time. Here there is only a snippet stored for
// recognition, and squeezing extra meaning out of it would be inventing.
export function stateForLegacyReply(classification) {
  switch (classification) {
    case 'interested':
    case 'question':
      return REL.INTERESTED;

    // Asking about price, with no way to tell now whether the words were about
    // affording it. The live path can make that distinction; this cannot, so it
    // takes the plainer reading rather than guessing at a budget concern.
    case 'price':
      return REL.INTERESTED;

    // Both of these historically covered "not this thing" as well as "not you",
    // and the distinction was never recorded. The softer reading is mandatory:
    // guessing the harsher one would re-bury exactly the people this exists to
    // find. NO_TO_US is only ever created from a real stored boundary below.
    case 'objection':
    case 'decline':
      return REL.NO_TO_THIS_OFFER;

    case 'not-now':
      return REL.DEFERRED;

    // A person said something nobody could read. That is still worth showing.
    case 'unknown':
      return REL.AMBIGUOUS;

    // Not opinions about the relationship, then or now.
    case 'unsubscribe':      // handled as a boundary, not a message
    case 'out-of-office':
    case 'bounce':
    case 'wrong-person':
    case 'referral':
      return null;

    default:
      return null;
  }
}

// One prospect's history, worked out but not written.
//
// Returns the events that would be created and, just as importantly, what was
// deliberately left out and why. The skip reasons are the honest part: they are
// what stops this looking like a complete history when it is a partial one.
export function planFor({ prospect, replies = [], existing = [] }) {
  const events = [];
  const skipped = [];

  // Anything already recorded for this message stays untouched. A live event
  // and a human correction both outrank anything reconstructed, and a
  // reconstruction that overwrote either would be destroying the good data to
  // make room for the guesswork.
  const takenMessages = new Set(existing.map((e) => e.message_id).filter(Boolean));
  const firstLiveAt = existing.length
    ? existing.map((e) => e.occurred_at).sort()[0]
    : null;

  for (const r of replies) {
    if (r.direction !== 'inbound') { skipped.push({ id: r.id, why: 'our own message, not theirs' }); continue; }
    if (!r.occurred_at) { skipped.push({ id: r.id, why: 'no timestamp, so it cannot be placed in the story' }); continue; }
    if (r.message_id && takenMessages.has(r.message_id)) {
      skipped.push({ id: r.id, why: 'already has a relationship event' });
      continue;
    }
    // Only history. Anything at or after the first live event belongs to the
    // new system, which was watching by then.
    if (firstLiveAt && String(r.occurred_at) >= String(firstLiveAt)) {
      skipped.push({ id: r.id, why: 'the live model was already recording by then' });
      continue;
    }

    const state = stateForLegacyReply(r.classification);
    if (!state) {
      skipped.push({ id: r.id, why: `"${r.classification || 'unlabelled'}" says nothing about the relationship` });
      continue;
    }

    events.push({
      state,
      occurredAt: r.occurred_at,
      messageId: r.message_id || null,
      threadId: r.thread_id || null,
      // Derived from the label, never a paraphrase of what they wrote.
      reason: reasonFor(state, r.classification),
      confidence: r.confidence || null,
      deferUntil: state === REL.DEFERRED ? (prospect?.deferred_until || null) : null,
    });
  }

  // Boundaries and business facts, which are not messages.
  //
  // These are the only route to NO_TO_US and WON. A generic old decline can
  // never produce either.
  if (prospect?.do_not_contact || prospect?.unsubscribed) {
    events.push({
      state: REL.NO_TO_US,
      occurredAt: prospect.updated_at || prospect.reply_at || lastOf(events) || nowStamp(),
      messageId: null, threadId: null,
      reason: 'Marked do not contact on the prospect record.',
      boundary: true,
    });
  }
  if (prospect?.first_client_at) {
    events.push({
      state: REL.WON,
      occurredAt: prospect.first_client_at,
      messageId: null, threadId: null,
      reason: 'Recorded as a client.',
      boundary: true,
    });
  }

  return { events, skipped };
}

// What is NOT reconstructed, and why it matters that it is not:
//
//   RECONSIDERED   never inferred. A no followed by a yes is two events, and
//                  the timeline shows both in order; calling the second one a
//                  change of mind is a claim the old data never made.
//   ACCEPTED_OFFER never inferred from `offer_accepted_at`. That column is
//                  written for any `interested` or `question` reply, so it
//                  means "replied with interest" and not "said yes". Using it
//                  would put a sale in the record that never happened.
//   BUDGET_CONCERN never inferred, because telling it from a flat no needs the
//                  words, and the words are not reconstructable.
export const NOT_INFERRED = ['RECONSIDERED', 'ACCEPTED_OFFER', 'BUDGET_CONCERN'];

function reasonFor(state, classification) {
  switch (state) {
    case REL.INTERESTED: return `They replied, and it was read as ${classification} at the time.`;
    case REL.NO_TO_THIS_OFFER: return `They replied, and it was read as ${classification} at the time.`;
    case REL.DEFERRED: return 'They asked for later.';
    case REL.AMBIGUOUS: return 'They replied, and nobody could tell what it meant.';
    default: return null;
  }
}

const lastOf = (events) => (events.length ? events[events.length - 1].occurredAt : null);
const nowStamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
