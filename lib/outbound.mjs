// May automated outreach progress for this prospect right now?
//
// One function, one answer, one reason. These conditions used to be scattered
// across the sweep skill, the Today view and the due-date helpers, which meant
// each of them could be right on its own and the system could still do the
// wrong thing.
//
// The rule this exists to enforce is the sharpest one in any of the skills:
//
//   A follow-up sent on top of an unanswered reply is the worst email we can
//   send.
//
// It is deterministic on purpose. Nothing here asks a model to notice that
// somebody wrote back. A missed reply is not a quality problem, it is the kind
// of mistake that ends a conversation, and it must fail closed.

export const STOP = {
  UNANSWERED_REPLY: 'unanswered-reply',
  UNSUBSCRIBED: 'unsubscribed',
  DECLINED: 'declined',
  CLIENT: 'client',
  DO_NOT_CONTACT: 'do-not-contact',
  ACTIVE_CONVERSATION: 'active-conversation',
  DEFERRED_UNTIL: 'deferred-until',
  INVALID_CONTACT: 'invalid-contact',
  TERMINAL_STAGE: 'terminal-stage',
  NO_CONTACT: 'no-contact',
  NOT_DUE: 'not-due',
  MISSING_EVIDENCE: 'missing-evidence',
};

// Stages that end the relationship one way or another. Nothing automated ever
// writes to somebody in one of these.
const TERMINAL_STAGES = new Set(['Client', 'Rejected', 'Lost', 'Invalid Email', 'Finished']);

// Stages where a person is mid-conversation. The machine's job here is to get
// out of the way.
const CONVERSATION_STAGES = new Set(['Interested', 'Proposal Sent', 'Setup Check']);

const day = (v) => String(v || '').slice(0, 10);

// Did they write back after our last outbound, and has nothing gone out since?
//
// Deliberately generous about what counts as a reply: `replied` is the flag the
// reply sync sets, and `reply_date` is when. If either says they spoke more
// recently than we did, automation stops. Ambiguity resolves towards silence.
// `events` is the prospect's reply_events, newest ordering irrelevant. When
// they are supplied the answer comes from real message timestamps, which can
// resolve ordering that the date columns cannot. When they are not, it falls
// back to the conservative date comparison below.
//
// The fallback is deliberately never weakened by this: with no outbound
// recorded after a reply, the answer is still unanswered.
export function hasUnansweredReply(p = {}, { events = null } = {}) {
  if (Array.isArray(events) && events.length) {
    const sorted = [...events].sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
    const lastInbound = [...sorted].reverse().find(
      (e) => e.direction === 'inbound' && e.classification !== 'out-of-office' && e.classification !== 'bounce'
    );
    if (!lastInbound) return false;
    if (lastInbound.classification === 'decline' || lastInbound.classification === 'unsubscribe') return false;
    const answered = sorted.some(
      (e) => e.direction === 'outbound' && String(e.occurred_at) > String(lastInbound.occurred_at)
    );
    return !answered;
  }
  if (!p.replied) return false;
  // A decline is answered by definition: there is nothing to reply to.
  if (p.reply_type === 'decline') return false;
  const replied = day(p.reply_date);
  const contacted = day(p.last_contact_date);
  if (!replied) {
    // Flagged as replied with no date. Treat it as unanswered: the cost of
    // pausing wrongly is a delay, the cost of sending wrongly is the thread.
    return true;
  }
  if (!contacted) return true;
  // Same-day is unanswered. Both stamps are dates, not times, so "she replied
  // and I answered" and "she replied after my send" look identical, and the
  // safe reading is that she is still waiting.
  return contacted <= replied;
}

// The whole gate. Returns { ok: true } or { ok: false, stop, reason, surface }.
// `surface` means this belongs in front of a person rather than in a log.
export function canProgressOutbound(p = {}, { now = new Date(), events = null, isClient = false } = {}) {
  const stage = p.stage || 'New';
  const today = now.toISOString().slice(0, 10);

  // Explicit do-not-contact beats everything, including a reply.
  if (p.do_not_contact) {
    return { ok: false, stop: STOP.DO_NOT_CONTACT, reason: 'Marked do not contact.', surface: false };
  }
  if (p.unsubscribed) {
    return { ok: false, stop: STOP.UNSUBSCRIBED, reason: 'They unsubscribed.', surface: false };
  }
  if (p.reply_type === 'decline') {
    return { ok: false, stop: STOP.DECLINED, reason: 'They said no. Nothing further goes out.', surface: false };
  }
  // `isClient` comes from the clients table; the stage is the denormalised
  // copy that can drift and already has. Good Energy Coach was a client for a
  // month with a prospect row reading Interested, so this gate — the one thing
  // between a client and a cold email — was asking the field that was wrong.
  // She was protected only by accident, because she happened to have an
  // unanswered reply. Answer her and cold outreach would have resumed.
  if (isClient || stage === 'Client') {
    return { ok: false, stop: STOP.CLIENT, reason: 'They are a client. Cold follow-up would be absurd.', surface: false };
  }
  if (stage === 'Invalid Email') {
    return { ok: false, stop: STOP.INVALID_CONTACT, reason: 'The address bounced.', surface: false };
  }
  if (TERMINAL_STAGES.has(stage)) {
    return { ok: false, stop: STOP.TERMINAL_STAGE, reason: `Stage is ${stage}. The sequence is over.`, surface: false };
  }

  // THE guard. Above every cadence rule, because cadence is a schedule and
  // this is a person waiting.
  if (hasUnansweredReply(p, { events })) {
    return {
      ok: false,
      stop: STOP.UNANSWERED_REPLY,
      reason: 'They replied and nothing has gone back yet. A follow-up on top of an unanswered reply is the worst email we can send.',
      surface: true,
    };
  }

  // Mid-conversation. Automated cadence has no business here even when the
  // reply has technically been answered.
  if (CONVERSATION_STAGES.has(stage)) {
    return {
      ok: false,
      stop: STOP.ACTIVE_CONVERSATION,
      reason: `They are at ${stage}. This is a conversation, not a sequence.`,
      surface: true,
    };
  }

  // They asked for later. Later is a date, and it has not arrived.
  if (p.next_action_date && day(p.next_action_date) > today) {
    return {
      ok: false,
      stop: STOP.DEFERRED_UNTIL,
      reason: `Parked until ${day(p.next_action_date)}.`,
      surface: false,
      until: day(p.next_action_date),
    };
  }

  if (!p.email) {
    return { ok: false, stop: STOP.NO_CONTACT, reason: 'No email address on the record.', surface: true };
  }

  if (!p.next_action_date) {
    return { ok: false, stop: STOP.NOT_DUE, reason: 'No follow-up date set, so nothing is due.', surface: false };
  }

  return { ok: true, dueOn: day(p.next_action_date) };
}

// A deferred prospect whose date has arrived. Not the same as "eligible":
// waking one up means reconsidering it, not resending the old email.
export function isReadyToReconsider(p = {}, { now = new Date() } = {}) {
  const today = now.toISOString().slice(0, 10);
  if (p.reply_type !== 'defer' && p.stage !== 'Snoozed') return false;
  if (TERMINAL_STAGES.has(p.stage || '')) return false;
  if (p.do_not_contact || p.unsubscribed) return false;
  const when = day(p.next_action_date);
  return Boolean(when) && when <= today;
}

// Grouped stop reasons, for the sweep's report and for Today. Only the ones
// marked `surface` belong in front of a person; the rest are just the machine
// correctly doing nothing.
export function summariseStops(prospects = [], { now = new Date() } = {}) {
  const out = { eligible: [], blocked: new Map(), surfaced: [] };
  for (const p of prospects) {
    const r = canProgressOutbound(p, { now });
    if (r.ok) { out.eligible.push(p); continue; }
    const list = out.blocked.get(r.stop) || [];
    list.push({ id: p.id, name: p.name || p.business_name || p.email, reason: r.reason });
    out.blocked.set(r.stop, list);
    if (r.surface) out.surfaced.push({ id: p.id, name: p.name || p.business_name || p.email, stop: r.stop, reason: r.reason });
  }
  return { ...out, blocked: Object.fromEntries(out.blocked) };
}
