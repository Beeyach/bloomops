// "Not right now, try me in September."
//
// In V1 that lived in a free-text note and a date, so by the time the date
// arrived nobody could remember what had actually been agreed. Four prospects
// are sitting in exactly that state today: Kori Burkholder, Greg Lock, Irina
// Ertel and Jane Lee.
//
// A deferral is a small contract. Their words, our promise, and a date. All
// three are needed, because a reactivation email that has forgotten what was
// said is a cold email pretending to be a warm one, and that is worse than
// being late.

import { STOP } from './outbound.mjs';

export const DEFERRAL_SOURCE = {
  REPLY: 'reply-classification',
  ARY: 'ary',
};

const iso = (v) => String(v || '').slice(0, 10);
const stamp = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// The shape check alone let "2026-13-45" through, and this date is written to
// next_action_date, which the outbound guard reads. A month that does not exist
// is not a promise anybody made.
function isRealDay(when) {
  const d = new Date(`${when}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === when;
}

// Record one.
//
// `next_action_date` is written alongside `deferred_until` on purpose, and they
// are not duplicates. `next_action_date` is the operational date the outbound
// guard already reads and will keep reading; `deferred_until` is the structured
// record of what they actually asked for. They can legitimately differ, because
// Ary can snooze a row for her own reasons without anybody having deferred it.
export function defer({
  until,
  reason = null,
  promise = null,
  context = null,
  source = DEFERRAL_SOURCE.ARY,
} = {}) {
  const when = iso(until);
  if (!when || !/^\d{4}-\d{2}-\d{2}$/.test(when) || !isRealDay(when)) {
    return { ok: false, error: 'A deferral needs a real date.' };
  }
  return {
    ok: true,
    patch: {
      deferred_until: when,
      next_action_date: when,
      // Quoted, never paraphrased. The paraphrase is where the meaning goes.
      deferral_reason: reason ? String(reason).slice(0, 500) : null,
      deferral_promise: promise ? String(promise).slice(0, 500) : null,
      deferral_context: context ? String(context).slice(0, 2000) : null,
      deferral_source: source,
    },
  };
}

export const isDeferred = (p = {}) => Boolean(p.deferred_until);

export function isDue(p = {}, { now = new Date() } = {}) {
  if (!isDeferred(p)) return false;
  return iso(p.deferred_until) <= now.toISOString().slice(0, 10);
}

// Terminal stages. A deferral on somebody who later became a client or said no
// is history, not a task, and resurfacing it would be noise.
const CLOSED = new Set(['Client', 'Rejected', 'Not This Offer', 'Lost', 'Finished', 'Invalid Email']);

export function shouldResurface(p = {}, { now = new Date() } = {}) {
  if (!isDue(p, { now })) return false;
  if (CLOSED.has(String(p.stage || ''))) return false;
  if (p.do_not_contact || p.unsubscribed) return false;
  return true;
}

// What Ary sees when one comes due.
//
// Everything she needs to write the next message without opening the thread:
// the date, their words, and what she said she would do.
export function dueToday(prospects = [], { now = new Date() } = {}) {
  return prospects
    .filter((p) => shouldResurface(p, { now }))
    .map((p) => ({
      id: p.id,
      name: p.name || p.business_name || p.email,
      deferredUntil: iso(p.deferred_until),
      since: iso(p.deferral_context ? p.updated_at : p.deferred_until),
      reason: p.deferral_reason || null,
      promise: p.deferral_promise || null,
      source: p.deferral_source || null,
      // Never a send. A reactivation refers to a specific past conversation,
      // and getting that wrong is worse than being late, so this is the one
      // deliberate exception to Stage B automation.
      suggested: p.deferral_promise
        ? `Pick up what was promised: ${p.deferral_promise}`
        : 'Open the thread and answer what they actually asked for.',
      autoSend: false,
    }))
    .sort((a, b) => a.deferredUntil.localeCompare(b.deferredUntil));
}

// A deferral does not rejoin the cold sequence when it wakes up. It is not
// cold: somebody spoke. This is asserted here so the sweep cannot treat a woken
// deferral as step N of anything.
export function rejoinsColdSequence() {
  return false;
}

// Why the outbound guard stops on a live deferral, using the guard's own
// vocabulary rather than a second one.
export const DEFERRAL_STOP = STOP.DEFERRED_UNTIL;

// Clear it. Used when the conversation genuinely restarts.
export function clearDeferral() {
  return {
    deferred_until: null,
    deferral_reason: null,
    deferral_promise: null,
    deferral_context: null,
    deferral_source: null,
  };
}
