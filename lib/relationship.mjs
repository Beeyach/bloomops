// What this person and Ary are to each other right now, and how they got there.
//
// The app remembered every message and none of the story. `reply_events` keeps
// each reply with its label, but the label is about a *message* — "decline",
// "price", "not-now" — and the prospect's actual standing was one overwritten
// column, `stage`.
//
// That lost the case this module exists for. Somebody replied interested, said
// the specific thing offered was not what she needed, raised budget, explored
// something else, appeared to decline because she had found another person, and
// then three minutes later reconsidered and accepted a £297 one-time cleanup.
//
// Under the old model the decline-shaped message set stage to Rejected with
// `needsHuman: false`, so it did not even ask anybody to look. A won deal read
// as a dead lead.
//
// Two ideas, kept apart on purpose:
//
//   a timeline event   what happened at one moment, never edited, never deleted
//   the current state  what the newest meaningful evidence says today
//
// The state is a summary. The timeline is the truth. A newer explicit human
// decision may supersede an older classifier conclusion; it may never erase it.

// ── The vocabulary ───────────────────────────────────────────────────────
//
// Small on purpose. Every one of these changes what Ary should do next; a label
// that changes nothing is a label nobody maintains.
export const REL = {
  // Somebody replied and we could not tell what they meant. A person decides.
  AMBIGUOUS: 'AMBIGUOUS',
  // They want to talk.
  INTERESTED: 'INTERESTED',
  // Money is the constraint. Not a no.
  BUDGET_CONCERN: 'BUDGET_CONCERN',
  // "This specific thing is not what I need." The relationship is intact.
  NO_TO_THIS_OFFER: 'NO_TO_THIS_OFFER',
  // "I do not want to work with you." Materially stronger.
  NO_TO_US: 'NO_TO_US',
  // Not now. Ask again later, and there may be a date.
  DEFERRED: 'DEFERRED',
  // A newer message explicitly reverses an earlier no or defer.
  RECONSIDERED: 'RECONSIDERED',
  // Yes to the concrete thing on the table.
  ACCEPTED_OFFER: 'ACCEPTED_OFFER',
  // A client, by the app's own rule, which is not the same as saying yes.
  WON: 'WON',
  // Over, and not because of one bad-sounding message.
  LOST: 'LOST',
};

// Who decided. A classifier guess and Ary's judgement are not the same fact and
// must never be stored as though they were.
export const SOURCE = {
  CLASSIFIER: 'classifier',
  HUMAN: 'human',
  // Imported from the old single-status world. Marked so nobody mistakes a
  // migration for something somebody said.
  LEGACY: 'legacy',
  // Written after the fact from a stored reply the live path dropped. The
  // classifier's conclusion is real and so is the timestamp; only the row is
  // late. Distinct from CLASSIFIER so an audit can tell which rows were
  // written as they happened.
  BACKFILL: 'backfill',
};

// States that mean this person is not to be cold-emailed again by machine.
//
// Note what is NOT here: NO_TO_THIS_OFFER. Turning down one offer is not
// turning down the relationship, and the whole point of separating those two is
// that the first one used to bury people.
export const CLOSED_TO_OUTREACH = new Set([REL.WON, REL.NO_TO_US, REL.LOST]);

// States that should be in front of Ary today.
export const WANTS_A_PERSON = new Set([
  REL.INTERESTED, REL.RECONSIDERED, REL.ACCEPTED_OFFER, REL.AMBIGUOUS, REL.BUDGET_CONCERN,
]);

// How strongly a piece of evidence speaks.
//
// Used only to break ties between things that happened at the same moment, and
// to stop an autoresponder outranking a person. Recency does the real work.
const WEIGHT = {
  [REL.AMBIGUOUS]: 1,
  [REL.DEFERRED]: 2,
  [REL.BUDGET_CONCERN]: 2,
  [REL.NO_TO_THIS_OFFER]: 3,
  [REL.INTERESTED]: 3,
  [REL.RECONSIDERED]: 4,
  [REL.NO_TO_US]: 5,
  [REL.ACCEPTED_OFFER]: 5,
  [REL.LOST]: 5,
  [REL.WON]: 6,
};

// ── Reading a message ────────────────────────────────────────────────────

// The existing reply classifier's labels, translated into relationship terms.
//
// Deliberately a translation rather than a replacement: the classifier already
// works, is tested, and stops outbound correctly. This only reinterprets what
// its answer means for the relationship, and it is where the one genuinely
// wrong mapping gets fixed.
export function relationshipFromReply(classification, { text = '' } = {}) {
  switch (classification) {
    case 'interested':
    case 'question':
      return { state: REL.INTERESTED };

    // Asking about price is interest with a question attached, unless the words
    // are about not affording it.
    case 'price':
      return { state: soundsLikeMoneyTrouble(text) ? REL.BUDGET_CONCERN : REL.INTERESTED };

    case 'objection':
      return { state: soundsLikeMoneyTrouble(text) ? REL.BUDGET_CONCERN : REL.NO_TO_THIS_OFFER };

    case 'not-now':
      return { state: REL.DEFERRED };

    // The mapping that was wrong. `decline` covered both "not this thing" and
    // "not you", and both became Rejected with nobody asked to look. They are
    // now told apart by whether the words reject US or the OFFER, and only the
    // first closes the relationship.
    case 'decline':
      return { state: rejectsUs(text) ? REL.NO_TO_US : REL.NO_TO_THIS_OFFER };

    case 'unsubscribe':
      return { state: REL.NO_TO_US };

    // Not the person's opinion about anything.
    case 'out-of-office':
    case 'bounce':
    case 'wrong-person':
    case 'referral':
      return { state: null };

    default:
      return { state: REL.AMBIGUOUS };
  }
}

// Does this say no to US, or no to the THING?
//
// Deterministic and deliberately narrow. When the words do not clearly reject
// the relationship, the softer reading wins, because the cost of being wrong in
// that direction is a prospect Ary looks at again, and the cost the other way is
// somebody quietly buried.
function rejectsUs(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return false;
  return [
    'stop contacting', 'stop emailing', 'do not contact', "don't contact",
    'remove me', 'take me off', 'unsubscribe', 'not interested in your',
    'no longer wish', 'lose my email', 'leave me alone', 'stop reaching out',
  ].some((p) => s.includes(p));
}

function soundsLikeMoneyTrouble(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return false;
  return [
    'budget', 'too expensive', 'cannot afford', "can't afford", 'out of my price',
    'too much money', 'tight on money', 'no money', 'cost is a', 'costs are a',
    'retired', 'not making money', 'expensive for me',
  ].some((p) => s.includes(p));
}

// Does this newer message reverse an earlier no or defer?
//
// Only ever asked when there IS an earlier negative, because reconsidering is a
// relationship between two events rather than a property of one message.
// Ordinary interest is not reconsideration.
export function isReconsideration(previousState, nextState) {
  const wasNegative = previousState === REL.NO_TO_THIS_OFFER
    || previousState === REL.NO_TO_US
    || previousState === REL.DEFERRED
    || previousState === REL.LOST;
  const nowPositive = nextState === REL.INTERESTED || nextState === REL.ACCEPTED_OFFER;
  return wasNegative && nowPositive;
}

// ── Deriving where things stand ──────────────────────────────────────────

// The one place that decides a prospect's current standing.
//
// Everything else reads this. Precedence scattered across a route, a component
// and a job is precedence that will disagree with itself, and the disagreement
// will be invisible because each one looks right on its own.
//
// Order, and why:
//
//   1. do-not-contact — a boundary somebody set. Nothing outranks it.
//   2. client/won     — the app's own business fact, not a reading of an email.
//   3. the newest meaningful event — including Ary's corrections, which are
//      events like any other and win by being newer.
//   4. the legacy stage — for prospects who predate all of this.
//
// The invariant that matters: newer explicit human evidence supersedes older
// classifier conclusions, and the older ones stay in the timeline.
export function currentState({
  events = [],
  doNotContact = false,
  unsubscribed = false,
  isClient = false,
  legacyStage = null,
  // The date an old record was parked until, where the prospect row has one.
  // A legacy DEFERRED has no event carrying `deferUntil`, and without a date
  // there is no way to ask whether the wait is over — so the answer defaulted
  // to "no", and a snooze that came due last month stayed silent.
  legacyDeferUntil = null,
  now = new Date(),
} = {}) {
  if (doNotContact || unsubscribed) {
    return {
      state: REL.NO_TO_US, because: 'They asked not to be contacted.',
      source: SOURCE.HUMAN, closed: true, needsPerson: false,
    };
  }
  if (isClient) {
    return {
      state: REL.WON, because: 'They are a client.',
      source: SOURCE.HUMAN, closed: true, needsPerson: false,
    };
  }

  const meaningful = [...events]
    .filter((e) => e && e.state && WEIGHT[e.state] != null)
    .sort(byWhenThenWeight);

  // Nothing was written down, so the old single stage is all there is.
  //
  // This branch used to answer `state` and stop. Every caller asking the next
  // question — does a person need to do something about this — got `undefined`,
  // which reads as no. Four prospects sitting at "Interested" were therefore
  // filed as wanting nothing, and six snoozes could never come due, because
  // an old record cannot answer a question it is never asked.
  //
  // It answers all three now, from the same two sets and the same clock the
  // event branch below uses. One policy, asked twice.
  if (!meaningful.length) {
    const fromStage = legacyStateFor(legacyStage);
    if (!fromStage) {
      return { state: null, because: 'Nothing has happened yet.', source: null, closed: false, needsPerson: false };
    }
    const deferredUntil = fromStage === REL.DEFERRED ? legacyDeferUntil || null : null;
    return {
      state: fromStage,
      because: 'From this prospect’s status before conversations were tracked.',
      source: SOURCE.LEGACY,
      legacy: true,
      deferredUntil,
      closed: CLOSED_TO_OUTREACH.has(fromStage),
      needsPerson: wantsAPerson(fromStage, deferredUntil, now),
    };
  }

  const latest = meaningful[meaningful.length - 1];
  const earlier = meaningful.slice(0, -1);

  // What this actually reversed, rather than merely what came before it.
  //
  // "The latest reply changed the earlier reconsidered" is not a sentence about
  // anything: reconsidering and then accepting is one movement, not a change of
  // mind. Only a contrary state — a no, or a wait — is something a positive
  // reply can be said to have changed.
  const contrary = new Set([REL.NO_TO_THIS_OFFER, REL.NO_TO_US, REL.DEFERRED, REL.LOST]);
  const positive = latest.state === REL.ACCEPTED_OFFER
    || latest.state === REL.INTERESTED
    || latest.state === REL.RECONSIDERED
    || latest.state === REL.WON;
  const superseded = positive
    ? earlier.filter((e) => contrary.has(e.state)).map((e) => e.state)
    : earlier.filter((e) => e.state !== latest.state && contrary.has(latest.state) === false).map((e) => e.state);

  return {
    state: latest.state,
    at: latest.occurredAt || null,
    source: latest.source || SOURCE.CLASSIFIER,
    because: latest.reason || null,
    // Only true when something genuinely changed, so the UI can say "the latest
    // reply changed the earlier one" and be telling the truth.
    supersedes: superseded.length ? superseded[superseded.length - 1] : null,
    deferredUntil: latest.state === REL.DEFERRED ? latest.deferUntil || null : null,
    closed: CLOSED_TO_OUTREACH.has(latest.state),
    needsPerson: wantsAPerson(latest.state, latest.deferUntil, now),
  };
}

// Oldest first. Ties broken by how strongly the evidence speaks, and then by
// insertion order, so a run of events written in one go stays in the order it
// was written rather than shuffling.
function byWhenThenWeight(a, b) {
  const ta = Date.parse(String(a.occurredAt || '').replace(' ', 'T')) || 0;
  const tb = Date.parse(String(b.occurredAt || '').replace(' ', 'T')) || 0;
  if (ta !== tb) return ta - tb;
  const wa = WEIGHT[a.state] || 0;
  const wb = WEIGHT[b.state] || 0;
  if (wa !== wb) return wa - wb;
  return (a.id || 0) - (b.id || 0);
}

function isDue(until, now) {
  if (!until) return false;
  const t = Date.parse(String(until).replace(' ', 'T'));
  return Number.isFinite(t) && t <= now.getTime();
}

// Does a person have to do something about this, now?
//
// The five states in WANTS_A_PERSON always do. A wait does when the date has
// come round — and also when there is no date at all, which is the case worth
// spelling out: "come back to me later" with nothing written down is not a
// wait, because nothing will ever bring it back. Three prospects in production
// sit exactly there. Treating them as parked leaves them parked for ever, and
// this app's rule is to say when the record does not know rather than to file
// the unknown as a no.
function wantsAPerson(state, deferredUntil, now) {
  if (WANTS_A_PERSON.has(state)) return true;
  if (state !== REL.DEFERRED) return false;
  return !deferredUntil || isDue(deferredUntil, now);
}

// Old prospects, read honestly.
//
// A single stage is all these records ever had. It is mapped cautiously and
// marked as legacy, and no event sequence is invented to make the history look
// richer than it was.
function legacyStateFor(stage) {
  switch (String(stage || '')) {
    case 'Client': return REL.WON;
    case 'Interested': return REL.INTERESTED;
    case 'Snoozed': return REL.DEFERRED;
    // Deliberately the softer reading. The old Rejected bucket holds both kinds
    // of no, and guessing the harsher one would re-bury exactly the people this
    // work exists to find.
    case 'Rejected': return REL.NO_TO_THIS_OFFER;
    // The same reading, now said out loud by the stage itself.
    case 'Not This Offer': return REL.NO_TO_THIS_OFFER;
    case 'Lost': return REL.LOST;
    default: return null;
  }
}

// ── Words ────────────────────────────────────────────────────────────────

// What each state is called on screen. No enum ever reaches Ary.
export const LABEL = {
  [REL.AMBIGUOUS]: 'Replied, needs you',
  [REL.INTERESTED]: 'Interested',
  [REL.BUDGET_CONCERN]: 'Budget concern',
  [REL.NO_TO_THIS_OFFER]: 'Not interested',
  [REL.NO_TO_US]: 'Declined working together',
  [REL.DEFERRED]: 'Deferred',
  [REL.RECONSIDERED]: 'Reconsidered',
  [REL.ACCEPTED_OFFER]: 'Accepted offer',
  [REL.WON]: 'Client',
  [REL.LOST]: 'Lost',
};

// The sentence under the label on the prospect's card.
export function explain(current) {
  if (!current?.state) return 'No reply yet.';
  const changed = current.supersedes ? ` The latest reply changed the earlier ${LABEL[current.supersedes].toLowerCase()}.` : '';
  switch (current.state) {
    case REL.NO_TO_THIS_OFFER:
      return `They turned down this particular offer. Keep the relationship open unless something else says otherwise.${changed}`;
    case REL.NO_TO_US:
      return 'They asked not to be contacted about working together.';
    case REL.BUDGET_CONCERN:
      return `Money is the sticking point, not the idea.${changed}`;
    case REL.DEFERRED:
      return current.deferredUntil
        ? `Asked to be contacted again around ${String(current.deferredUntil).slice(0, 10)}.`
        : `Asked for later, with no date given.${changed}`;
    case REL.ACCEPTED_OFFER:
      return `They said yes to what was on the table.${changed}`;
    case REL.RECONSIDERED:
      return `They changed their mind.${changed}`;
    case REL.WON:
      return 'A client.';
    case REL.INTERESTED:
      return `They want to talk.${changed}`;
    case REL.AMBIGUOUS:
      return 'A reply came in that could not be read confidently. Worth a look.';
    default:
      return '';
  }
}

// How an event reads in the timeline.
export function describeEvent(e) {
  // Reconstructed history reads as an older record, not as something LTB
  // decided today. No classifier ran for these; they were rebuilt from labels
  // the old system stored at the time, and saying "LTB" would claim a judgement
  // that was never made.
  const who = e.source === SOURCE.HUMAN ? 'You'
    : (e.source === SOURCE.LEGACY || e.source === 'legacy-reconstruction') ? 'Older record'
      : e.source === SOURCE.BACKFILL ? 'LTB, recorded later'
        : 'LTB';
  return {
    label: LABEL[e.state] || e.state,
    who,
    detail: e.reason || '',
    at: e.occurredAt,
  };
}
