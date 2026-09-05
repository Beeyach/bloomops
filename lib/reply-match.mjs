// Which prospect does this reply belong to?
//
// One person's reply appearing on another person's record is a data-integrity
// failure, not a UX inconvenience: it corrupts the timeline, the metrics and
// the outbound guard all at once, and it does it silently. So this refuses to
// guess. When the evidence is thin the message goes to an unmatched list for a
// person to resolve, which is a small annoyance and a recoverable one.
//
// The ordering comes from the daily-reply-sync skill, and its reasoning is
// worth keeping: match on the address WE SENT TO, not the address it came
// from. Owners reply from personal accounts. Wellness Valeria's record is
// val@wellnessvaleria.com.au and her reply arrived from a gmail address.

export const MATCH = {
  THREAD: 'thread',            // we have seen this thread before
  IN_REPLY_TO: 'in-reply-to',  // it names one of our messages as its parent
  REFERENCES: 'references',    // one of our messages is in its ancestry
  SENT_TO: 'sent-to',          // the address we wrote to is on the record
  FROM: 'from',                // they replied from the address we hold
  DOMAIN: 'domain',            // same domain, one candidate only
  AMBIGUOUS: 'ambiguous',      // more than one candidate
  NONE: 'none',
};

const norm = (s) => String(s || '').trim().toLowerCase();

// Pulls the bare address out of "Name <a@b.com>".
export function bareAddress(v) {
  const s = String(v || '').trim();
  const m = s.match(/<([^>]+)>/);
  return norm(m ? m[1] : s);
}

export function domainOf(addr) {
  const a = bareAddress(addr);
  const i = a.lastIndexOf('@');
  return i === -1 ? '' : a.slice(i + 1);
}

// Public mailbox providers. A shared domain says nothing about who somebody
// is, so it must never be used to attach a message to a record.
const PUBLIC_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
  'outlook.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me',
  'protonmail.com', 'gmx.com', 'mail.com', 'yandex.com', 'zoho.com',
  'bigpond.com', 'optusnet.com.au', 'xtra.co.nz',
]);

export function isPublicDomain(d) {
  return PUBLIC_DOMAINS.has(norm(d));
}

// `candidates` is the workspace's prospects, or a narrowed set.
// `knownThreads` maps threadId -> prospectId from previously stored events.
//
// Returns { prospectId, how, confidence } or { prospectId: null, how, reason,
// candidates } when it will not commit.
// `knownRfcIds` maps an RFC Message-ID we sent -> prospectId. Available only on
// the Gmail path, where real headers exist.
export function matchReply(msg = {}, { candidates = [], knownThreads = new Map(), knownRfcIds = new Map() } = {}) {
  const from = bareAddress(msg.fromAddress);
  const sentTo = bareAddress(msg.sentToAddress || msg.toAddress);
  const threadId = String(msg.threadId || '');

  // 1. The thread is already ours. Strongest signal there is: it means an
  // earlier message in this exact conversation was matched and stored.
  if (threadId && knownThreads.has(threadId)) {
    return { prospectId: knownThreads.get(threadId), how: MATCH.THREAD, confidence: 'high' };
  }

  // 2. The message names one of ours as its parent. This is the RFC 5322
  // reply chain and it is proof rather than inference: a mail client writes
  // In-Reply-To by copying the Message-ID it is replying to, so a hit means
  // this message is literally an answer to something we sent. It outranks
  // every address rule because it survives the owner replying from an account
  // we have never seen, on a domain we have never seen.
  const inReplyTo = norm(msg.inReplyTo);
  if (inReplyTo && knownRfcIds.has(inReplyTo)) {
    return { prospectId: knownRfcIds.get(inReplyTo), how: MATCH.IN_REPLY_TO, confidence: 'high' };
  }

  // 3. One of ours is somewhere in the ancestry. Slightly weaker than
  // In-Reply-To only because a forwarded chain can carry it; still far
  // stronger than matching on an address.
  const refs = Array.isArray(msg.references) ? msg.references.map(norm).filter(Boolean) : [];
  for (let i = refs.length - 1; i >= 0; i -= 1) {
    if (knownRfcIds.has(refs[i])) {
      return { prospectId: knownRfcIds.get(refs[i]), how: MATCH.REFERENCES, confidence: 'high' };
    }
  }

  const byEmail = new Map();
  for (const p of candidates) {
    const e = bareAddress(p.email);
    if (e) byEmail.set(e, p);
  }

  // 2. The address we wrote to. This is the skill's rule and it is the right
  // one: it survives the owner replying from a personal account.
  if (sentTo && byEmail.has(sentTo)) {
    return { prospectId: byEmail.get(sentTo).id, how: MATCH.SENT_TO, confidence: 'high' };
  }

  // 3. They replied from the address on the record.
  if (from && byEmail.has(from)) {
    return { prospectId: byEmail.get(from).id, how: MATCH.FROM, confidence: 'high' };
  }

  // 4. Same company domain, and only one prospect there. Never on a public
  // mailbox domain, where a shared domain means nothing.
  const fromDomain = domainOf(from);
  if (fromDomain && !isPublicDomain(fromDomain)) {
    const sameDomain = candidates.filter((p) => domainOf(p.email) === fromDomain || norm(p.domain).replace(/^www\./, '') === fromDomain);
    if (sameDomain.length === 1) {
      return { prospectId: sameDomain[0].id, how: MATCH.DOMAIN, confidence: 'medium' };
    }
    if (sameDomain.length > 1) {
      return {
        prospectId: null,
        how: MATCH.AMBIGUOUS,
        reason: `${sameDomain.length} prospects share the domain ${fromDomain}. Not guessing which one replied.`,
        candidates: sameDomain.slice(0, 5).map((p) => ({ id: p.id, name: p.name || p.business_name, email: p.email })),
      };
    }
  }

  return {
    prospectId: null,
    how: MATCH.NONE,
    reason: `No prospect matches ${from || 'this sender'}.`,
    candidates: [],
  };
}

// Whether an inbound reply is still waiting on us, from the events themselves
// rather than from date-level columns.
//
// The existing guard treats same-day as unanswered because `last_contact_date`
// is a date and cannot resolve ordering. Real message timestamps can, so this
// is allowed to be more precise. It is NOT allowed to be less safe: with no
// outbound recorded after the reply, the answer is still unanswered.
export function isUnanswered(events = [], { inboundId = null } = {}) {
  const sorted = [...events].sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
  const inbound = inboundId
    ? sorted.find((e) => e.id === inboundId)
    : [...sorted].reverse().find((e) => e.direction === 'inbound');
  if (!inbound) return false;
  const after = sorted.find(
    (e) => e.direction === 'outbound' && String(e.occurred_at) > String(inbound.occurred_at)
  );
  return !after;
}
