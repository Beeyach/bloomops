// Whether a human reply may go out, and into which thread.
//
// This is NOT the cold guard, and the difference is the whole point.
// `lib/send-guard.mjs` protects strangers from a machine: it counts touches,
// enforces a window, and stops at a cadence cap. Every one of those rules is
// wrong here. Somebody wrote to Ary and is waiting for an answer; a reply is
// late, not risky, and a cap designed to stop cold email must never be the
// reason a real person is left hanging.
//
// So this guard is short, and it only refuses for reasons that would still be
// true if a person typed the same message in Gmail themselves.

export const BLOCK = {
  NO_PROSPECT: 'no-prospect',
  NO_RECIPIENT: 'no-recipient',
  NO_THREAD: 'no-thread',
  EMPTY: 'empty',
  DO_NOT_CONTACT: 'do-not-contact',
  UNSUBSCRIBED: 'unsubscribed',
  CLOSED: 'closed',
  STALE: 'stale',
  CAPPED: 'capped',
};

// The V2 touch ceiling, by rating. A follow-up into a silent thread is a
// cold touch by hand, so the manual path honours the same cap the machine
// does; a REPLY to somebody who wrote is never capped.
export const touchCap = (p = {}) => (p.rating === '💚' ? 3 : 2);

// The only relationship state that forbids a reply. "No to this offer" does
// not: the relationship is intact and answering is normal. "No to us" is the
// one where writing again is not wanted.
const FORBIDDEN_STATES = new Set(['NO_TO_US']);

/**
 * @param {object} p            prospect row
 * @param {object} opts.thread  { threadId, to, subject, inReplyTo, references }
 * @param {string} opts.body    the draft as Ary edited it
 * @param {string} opts.state   current relationship state, if known
 * @param {object} opts.fingerprint  what the draft was written against
 * @param {object} opts.latest  the newest inbound now
 */
export function canSendHumanReply(p = {}, {
  thread = {}, body = '', state = null, fingerprint = null, latest = null,
} = {}) {
  if (!p || !p.id) return { ok: false, block: BLOCK.NO_PROSPECT, reason: 'That person is not in the workspace any more.' };

  if (!String(body || '').trim()) {
    return { ok: false, block: BLOCK.EMPTY, reason: 'There is nothing to send.' };
  }

  // Never, on any path, for any reason.
  if (p.do_not_contact) {
    return { ok: false, block: BLOCK.DO_NOT_CONTACT, reason: 'This person is marked do not contact.' };
  }
  if (p.unsubscribed) {
    return { ok: false, block: BLOCK.UNSUBSCRIBED, reason: 'This person unsubscribed.' };
  }
  if (state && FORBIDDEN_STATES.has(state)) {
    return { ok: false, block: BLOCK.CLOSED, reason: 'They asked not to be contacted again.' };
  }

  if (!thread.to) {
    return { ok: false, block: BLOCK.NO_RECIPIENT, reason: 'There is no address to reply to.' };
  }
  // A reply belongs in the conversation it answers. Without a thread this
  // would be a fresh cold email wearing a reply's clothes, which is exactly
  // what this feature exists not to do.
  if (!thread.threadId) {
    return { ok: false, block: BLOCK.NO_THREAD, reason: 'There is no Gmail conversation to reply to yet.' };
  }

  // A follow-up into a silent thread (anchored on our own last email, nobody
  // has ever written back) is a cold touch by hand, and the V2 cap applies
  // to it exactly as it would to the machine. A reply to a person is exempt.
  if (thread.anchor === 'outbound') {
    const cap = touchCap(p);
    if (Number(p.emails_sent || 0) >= cap) {
      return {
        ok: false,
        block: BLOCK.CAPPED,
        reason: `They have had ${p.emails_sent} touches and never replied. That is the cap — this one is finished.`,
      };
    }
  }

  // The draft was written against a conversation. If they have written again
  // since, the answer may now be wrong, and sending it anyway is worse than
  // asking her to look. This includes the follow-up case: a draft written
  // against silence, with a reply arriving before Send, must stop.
  if (latest?.message_id && fingerprint && fingerprint.latestInboundId !== latest.message_id) {
    return {
      ok: false,
      block: BLOCK.STALE,
      reason: fingerprint.latestInboundId
        ? 'A newer message came in. Refresh the conversation before sending.'
        : 'They just wrote back. Read their reply before sending anything.',
    };
  }

  return { ok: true };
}

/**
 * Where the reply goes, derived from the conversation rather than the
 * prospect row: the address that actually wrote is the address to answer,
 * even when the record holds a different one.
 */
// Inbound that counts as a person: an out-of-office, an auto-ack, or a
// bounce is a machine talking, and a machine's message must not turn a
// silent thread into a "conversation" — that is exactly the hole that let
// two capped prospects receive a fourth touch on 2026-08-19.
const AUTO_INBOUND = new Set(['out-of-office', 'bounce', 'auto-reply']);

const THREAD_FRESH_DAYS = 45;

function threadAge(events) {
  const all = (events || []).filter((e) => e.occurred_at);
  if (!all.length) return null;
  const latest = all.reduce((a, b) => (String(a.occurred_at) > String(b.occurred_at) ? a : b));
  return Math.floor((Date.now() - new Date(latest.occurred_at).getTime()) / 86400000);
}

export function replyTarget(events = [], prospect = {}) {
  const inbound = (events || [])
    .filter((e) => e.direction === 'inbound' && e.thread_id && !AUTO_INBOUND.has(String(e.classification || '')))
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const newest = inbound[0] || null;
  const ageDays = threadAge(events);
  const stale = ageDays !== null && ageDays > THREAD_FRESH_DAYS;

  if (!newest) {
    const ours = (events || [])
      .filter((e) => e.direction === 'outbound' && e.thread_id && String(e.snippet || '') !== 'idempotency marker')
      .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))[0] || null;
    if (!ours) return { threadId: null, to: prospect.email || null, subject: null, inReplyTo: null, references: null, anchor: 'none', stale: false, staleDays: 0 };
    if (stale) {
      return { threadId: null, to: prospect.email || null, subject: null, inReplyTo: null, references: null, anchor: 'none', stale: true, staleDays: ageDays };
    }
    const subject = ours.subject && !/^re:/i.test(ours.subject) ? `Re: ${ours.subject}` : (ours.subject || null);
    return {
      threadId: ours.thread_id,
      to: prospect.email || null,
      subject,
      inReplyTo: ours.rfc_message_id || null,
      references: [ours.refs, ours.rfc_message_id].filter(Boolean).join(' ').trim() || null,
      latestInboundId: null,
      anchor: 'outbound',
      stale: false,
      staleDays: ageDays || 0,
    };
  }

  const subject = newest.subject && !/^re:/i.test(newest.subject)
    ? `Re: ${newest.subject}`
    : (newest.subject || null);

  // References is the chain, ending with the message being answered. Gmail is
  // forgiving, but a correct chain is what keeps other clients threading too.
  const refs = [newest.refs, newest.rfc_message_id].filter(Boolean).join(' ').trim() || null;

  return {
    threadId: newest.thread_id,
    to: newest.from_address || prospect.email || null,
    subject,
    inReplyTo: newest.rfc_message_id || null,
    references: refs,
    latestInboundId: newest.message_id || null,
    anchor: 'inbound',
    stale: stale,
    staleDays: ageDays || 0,
  };
}
