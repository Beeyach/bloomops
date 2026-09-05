// What the model is allowed to know before it writes a reply.
//
// The whole risk in drafting a reply from a database is that the model fills
// the gaps. Ary's business runs on not doing that: a made-up diagnosis, a
// price nobody agreed, or a promise she never made all cost more than a blank
// textarea would. So this file is deliberately a NARROWING, not a gathering.
//
// Two rules govern everything below.
//
//   1. Every fact handed over is one somebody actually wrote down — in the
//      Gmail thread, or in a field Ary filled in. Nothing is inferred.
//   2. Absence is stated, not hidden. "No price has been agreed in writing"
//      is a useful instruction. Silence invites invention.

import { replyExcerpt, isRealReply } from './reply-excerpt.mjs';

// How much thread to carry. Enough to answer, not enough to drown the point.
const MAX_MESSAGES = 8;
const MAX_CHARS_PER_MESSAGE = 600;

const clean = (s, max = MAX_CHARS_PER_MESSAGE) => {
  const out = replyExcerpt(s, { maxChars: max });
  return out || '';
};

/**
 * The conversation, oldest first, as a person would read it.
 *
 * Newsletters are dropped: they arrived from the prospect's domain but are
 * not part of the conversation, and three of them in Sarah's thread would
 * otherwise become "context" for a reply to her.
 */
export function buildThread(events = [], { max = MAX_MESSAGES } = {}) {
  const usable = (events || [])
    .filter((e) => e && e.occurred_at)
    // Outbound is ours and always belongs. Inbound has to be a real reply.
    .filter((e) => e.direction === 'outbound' || isRealReply(e))
    .sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));

  // The tail, because a reply answers the recent conversation.
  return usable.slice(-max).map((e) => ({
    from: e.direction === 'outbound' ? 'Ary' : 'them',
    at: String(e.occurred_at).slice(0, 10),
    subject: e.subject || null,
    text: clean(e.snippet),
  }));
}

/**
 * Facts about the relationship, only where a field actually holds one.
 *
 * Every entry is omitted rather than guessed. A missing offer is not "no
 * offer", it is "we do not know", and the prompt says which.
 */
export function buildFacts(prospect = {}, { isClient = false } = {}) {
  const facts = [];
  const add = (label, value) => { if (value != null && value !== '') facts.push(`${label}: ${value}`); };

  add('Business', prospect.business_name);
  add('Person', prospect.name);
  add('Website', prospect.domain);
  add('Country', prospect.country);

  if (isClient) {
    facts.push('Relationship: CLIENT. This is client service, not prospecting.');
  } else {
    add('Stage', prospect.stage);
    if (prospect.reply_type) add('How their last reply was read', prospect.reply_type);
  }

  // Money, only where Ary recorded that it was agreed. Never derived from a
  // stage, a rating, or the fact that a conversation sounds positive.
  if (prospect.offer_accepted_at) {
    facts.push(`They accepted an offer on ${String(prospect.offer_accepted_at).slice(0, 10)}. Honour what was agreed; do not restate or change a price.`);
  } else {
    facts.push('No agreed price or offer is recorded. Do not name a price, a scope or a delivery date.');
  }

  if (prospect.deferral_promise) add('They asked to be contacted later about', prospect.deferral_promise);

  // What LTB actually knows about their website. Present evidence is quoted
  // with its date; absent evidence is stated out loud. The failure this
  // prevents is real and happened: a draft told a prospect her site had not
  // been looked at while the workspace was holding audit notes about it —
  // and the opposite failure, claiming a check that never happened, is worse.
  const clip = (v, n) => String(v).replace(/\s+/g, ' ').trim().slice(0, n);
  const auditBits = [];
  if (prospect.audit_notes) auditBits.push(`Audit notes: ${clip(prospect.audit_notes, 400)}`);
  if (prospect.site_intel) {
    const when = prospect.site_intel_at ? ` (${String(prospect.site_intel_at).slice(0, 10)})` : '';
    auditBits.push(`Site intelligence${when}: ${clip(prospect.site_intel, 300)}`);
  }
  if (prospect.own_findings) auditBits.push(`Ary's own findings: ${clip(prospect.own_findings, 300)}`);
  if (auditBits.length) {
    facts.push(`Website evidence on file — use it, do not claim the site was never looked at. ${auditBits.join(' | ')}`);
  } else {
    facts.push('No website audit is stored for this prospect. Do not claim their site was reviewed; if a site question comes up, say what you would check.');
  }

  if (prospect.info) facts.push(`Ary's notes on this person: ${clip(prospect.info, 320)}`);

  return facts;
}

// Which sources the draft is actually standing on, for the line Ary reads
// next to the button. Only what is really present — an empty boast teaches
// her to ignore the label.
export function contextSources(prospect = {}, { hasGmailThread = false, isClient = false } = {}) {
  const out = [];
  if (hasGmailThread) out.push('Gmail conversation');
  if (prospect.audit_notes || prospect.site_intel || prospect.own_findings) out.push('Website audit');
  if (prospect.info) out.push('Prospect notes');
  if (prospect.offer_accepted_at) out.push('Accepted offer');
  if (isClient) out.push('Client record');
  return out;
}

/**
 * The full context object handed to the model.
 *
 * `owed` matters: if Ary already answered, the draft is a follow-up rather
 * than a reply, and the two read very differently.
 */
export function buildReplyContext({ prospect = {}, events = [], isClient = false, fullMessages = null } = {}) {
  // Whole messages from Gmail when the caller fetched them; the stored
  // snippets only as the fallback. A 200-character snippet is enough to
  // recognise a reply and not nearly enough to answer one.
  const hasFull = Array.isArray(fullMessages) && fullMessages.length > 0;
  const thread = hasFull
    ? fullMessages.slice(-MAX_MESSAGES).map((m) => ({
        from: m.from === 'Ary' ? 'Ary' : 'them',
        at: String(m.at || '').slice(0, 10),
        subject: m.subject || null,
        text: String(m.text || '').replace(/\s+/g, ' ').trim().slice(0, 900),
      }))
    : buildThread(events);
  const inbound = (events || [])
    .filter((e) => e.direction === 'inbound' && isRealReply(e))
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
  const latest = inbound[0] || null;

  // The message to answer, in full where Gmail gave it to us.
  const latestFullInbound = hasFull
    ? [...fullMessages].reverse().find((m) => m.from !== 'Ary') || null
    : null;

  const lastOutbound = (events || [])
    .filter((e) => e.direction === 'outbound')
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))[0] || null;

  const owed = Boolean(
    latest && (!lastOutbound || String(lastOutbound.occurred_at) < String(latest.occurred_at))
  );

  return {
    facts: buildFacts(prospect, { isClient }),
    thread,
    latestInbound: latestFullInbound
      ? { at: String(latestFullInbound.at || '').slice(0, 10), text: String(latestFullInbound.text || '').replace(/\s+/g, ' ').trim().slice(0, 1200) }
      : latest ? { at: String(latest.occurred_at).slice(0, 10), text: clean(latest.snippet, 900) } : null,
    subject: latest?.subject || lastOutbound?.subject || null,
    owed,
    isClient,
  };
}

// The instructions. Kept here rather than in the route so a test can read them
// and so the voice rules live next to the evidence rules they depend on.
export const REPLY_SYSTEM = [
  'You are drafting a short email reply that Ary will read, edit and send herself.',
  'She runs Bloomwired, a two-person studio that fixes the steps between somebody reaching out and that request getting answered, booked, reminded or followed up.',
  '',
  'HOW SHE WRITES',
  '- Short. Usually three or four sentences.',
  '- Plain English, warm, and like a person, not a company.',
  '- Open with "Hi [their first name]." and go straight to the point.',
  '- Answer what they actually wrote, first, before anything else.',
  '- If their message asks no question, do not answer one. Never open with "Good question" or "Great question" in any situation. That filler is banned.',
  '- The thread shows who raised each point. When Ary flagged something first and they are echoing it, say so plainly, like "I saw the same thing". Never write as if they discovered it.',
  '- Never "circling back", "closing the loop", "touching base", "bumping this", "reaching out again", "per my last email", "I hope this finds you well", or anything in that family. Ary read a draft that opened "Circling back on this one" and said she does not talk like that.',
  '- When the thread is quiet and this is a nudge, open the way she really does: "Just checking in regarding..." or "Just want to follow up about...", then the thing itself.',
  '- Never use an em dash. No exclamation marks, no emojis, no semicolons, no numbered lists.',
  '- Her verbs: fix, clean up, set up, work on, check, follow up. Never: streamline, elevate, optimize, unlock, empower.',
  '- Do not mirror their niche vocabulary. Ary keeps her own plain words with everyone.',
  '- Use "just" at most twice and "honestly" at most once. No metaphors. Name the concrete thing instead.',
  '- Move the conversation one step forward. Do not pitch again unless they asked.',
  '',
  'WHAT YOU MAY NOT DO',
  '- Do not invent a technical cause, a price, a scope, a delivery date, a meeting or a past agreement.',
  '- If a technical answer is not certain from the thread, say plainly that you want to check, and name what you would look at.',
  '- Do not restart cold outreach. This is a live conversation.',
  '- Use only what is in the CONTEXT and THREAD below. If something is not there, it is not a fact.',
  '',
  'END WITH EXACTLY:',
  'Thanks,',
  'Ary',
].join('\n');

export function buildReplyPrompt(ctx) {
  const lines = [];
  lines.push('CONTEXT');
  for (const f of ctx.facts) lines.push(`- ${f}`);
  if (ctx.isClient) lines.push('- Write this as a reply to a client you already work with.');
  lines.push('');
  lines.push('THREAD, oldest first');
  for (const m of ctx.thread) {
    lines.push(`[${m.at}] ${m.from === 'Ary' ? 'Ary' : 'Them'}: ${m.text || '(no text stored)'}`);
  }
  lines.push('');
  if (ctx.latestInbound) {
    lines.push('THE MESSAGE TO ANSWER');
    lines.push(ctx.latestInbound.text);
  } else {
    lines.push('There is no stored inbound message. Write a short, natural nudge instead, and do not pretend to answer anything.');
  }
  lines.push('');
  lines.push('Write only the reply body. No subject line, no preamble, no quotes around it.');
  return lines.join('\n');
}
