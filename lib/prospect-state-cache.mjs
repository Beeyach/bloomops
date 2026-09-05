// The same answer, not computed six thousand times a keystroke.
//
// prospectActionState runs the whole follow-up schedule for one person: the
// relationship, the band, the ceiling, the anchor, the clock. That is a
// fraction of a millisecond, and 5,814 of them is half a second — fine once on
// load, and not fine on every optimistic edit, because the store rebuilds the
// array each time somebody changes a rating.
//
// So the answer is cached against the prospect OBJECT. The store's update path
// replaces exactly one row and keeps the identity of the rest, which means
// editing one prospect recomputes one prospect. A WeakMap because a row that
// leaves the list should take its cached answer with it.
//
// The cache is dropped when the workspace's day rolls over, since "due today"
// is a claim about a date. Nothing else invalidates it: a changed row is a new
// object, and a new object is a miss.

import { prospectActionState } from './prospect-action.mjs';
import { currentState } from './relationship.mjs';
import { tzToday } from './tz.mjs';

// What Ary said by hand about this conversation, if she has said anything.
//
// The list carries only her own corrections (see the prospects route), so this
// is never a classifier guess. Run through currentState rather than assembled
// here, because what a state implies — closed, needs a person, waiting until
// when — is that model's answer and nobody else's.
function correctionFor(prospect, now) {
  if (!prospect?.corrected_state) return null;
  return currentState({
    events: [{
      id: 0,
      state: prospect.corrected_state,
      occurredAt: prospect.corrected_at || null,
      deferUntil: prospect.corrected_defer_until || null,
    }],
    now,
  });
}

let day = null;
let cache = new WeakMap();

export function cachedActionState(prospect, { now = new Date() } = {}) {
  if (!prospect || typeof prospect !== 'object') return prospectActionState(prospect || {}, { now });

  const today = tzToday(now);
  if (today !== day) { day = today; cache = new WeakMap(); }

  const hit = cache.get(prospect);
  if (hit) return hit;

  const state = prospectActionState(prospect, { relationship: correctionFor(prospect, now), now });
  cache.set(prospect, state);
  return state;
}
