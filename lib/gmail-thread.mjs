// The real conversation, from Gmail, with whole messages.
//
// Everything the app stored per message was a ~200 character snippet — enough
// to recognise a reply, nowhere near enough to read one. So the Conversation
// view could name the thread and never show it, and Ary ended up pasting a
// message into a box that Gmail was holding in full the entire time.
//
// This module fetches the thread through the SAME Gmail integration the sync
// uses — same account row, same token refresh, same API — and returns whole
// messages, cleaned for reading. Nothing here writes: not to Gmail, not to
// the database. Fetched when a conversation is opened, because Ary opens a
// handful of conversations a day and a fresh read beats a second store that
// can drift stale.

import { threadMessages, messageFull, normalise } from './gmail.mjs';
import { getAccount, accessTokenFor } from './gmail-store.mjs';
import { isRealReply } from './reply-excerpt.mjs';

// How much conversation is worth carrying. Two threads covers "we spoke in
// June and she wrote again in August" without feeding the model every email
// ever exchanged with the domain.
const MAX_THREADS = 2;
const MAX_BODY_CHARS = 2400;

const b64url = (s) => {
  try {
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
  } catch { return ''; }
};

// Walk the MIME tree for the text/plain part; fall back to stripped HTML.
export function bodyText(message) {
  const parts = [];
  (function walk(p) {
    if (!p) return;
    if (p.mimeType === 'text/plain' && p.body?.data) parts.push({ kind: 'plain', data: p.body.data });
    else if (p.mimeType === 'text/html' && p.body?.data) parts.push({ kind: 'html', data: p.body.data });
    for (const child of p.parts || []) walk(child);
  })(message?.payload);

  const plain = parts.find((x) => x.kind === 'plain');
  if (plain) return b64url(plain.data);
  const html = parts.find((x) => x.kind === 'html');
  if (html) {
    return b64url(html.data)
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/[ \t]+/g, ' ');
  }
  return String(message?.snippet || '');
}

// Cut the quoted chain and the tail signature, but keep paragraphs: this text
// is read by a person, not squeezed onto a row.
const BODY_QUOTE_MARKERS = [
  /\r?\nOn\s+(?:\w{3,9},\s+)?\w{3,9}\s+\d{1,2},?\s+\d{4},?\s+at\s+\d{1,2}:\d{2}[\s\S]*$/i,
  /\r?\n>{1,}[\s\S]*$/,
  /\r?\n-{2,}\s*Original Message[\s\S]*$/i,
  /\r?\n_{5,}\s*\r?\n[\s\S]*$/,
  // The generic reply header: a line starting "On" and ending "wrote:". Mail
  // clients disagree wildly about the date in the middle — Cynthia's webmail
  // writes "On 2026-08-12 9:35 am, Ary at Bloomwired wrote:" and the dated
  // pattern above never matched it — but every variant ends the same way.
  /\r?\nOn [^\n]{0,120}wrote:\s*\r?\n[\s\S]*$/,
];

// A sign-off line: "Here's to a well-lived day," / "Thanks," / "Best," and
// friends. Used to find where a person stopped and their signature began.
const SIGNOFF_LINE = /^(here'?s to [^\n]{0,60},|thanks[,!]?|thank you[,!]?|many thanks,|best( regards| wishes)?,|warm(ly| regards| wishes)?,|cheers,|regards,|kind regards,|sincerely,|blessings,|take care,)$/i;

/**
 * Drop the promo tail after a sign-off: the scripture quote, the book links,
 * the "Join me on Facebook" block. The sign-off and the name under it STAY —
 * they are a person talking. Deliberately conservative: the tail is only cut
 * when it is clearly a tail (has a link or runs three-plus lines) and clearly
 * not content (no question in it, no PS). Erring toward keeping noise beats
 * ever eating a real sentence.
 */
export function stripSignatureTail(text) {
  const lines = String(text || '').split('\n');
  let cutFrom = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    // A line of only dashes is the classic signature delimiter (Cynthia's
    // webmail writes "---" before a full clinic block). The dashes go too.
    if (/^-{2,}$/.test(t)) { cutFrom = i; break; }
    if (SIGNOFF_LINE.test(t)) {
      // Keep the sign-off plus one short name line under it, blank lines
      // between them allowed ("Cheers,\n\nPablo").
      let keep = i + 1;
      while (keep < lines.length && !lines[keep].trim()) keep += 1;
      const next = (lines[keep] || '').trim();
      if (next && next.length <= 40 && !/https?:\/\/|www\./i.test(next)) keep += 1;
      cutFrom = keep;
      break;
    }
  }
  if (cutFrom === -1 || cutFrom >= lines.length) return String(text || '');

  const dropped = lines.slice(cutFrom).join('\n').trim();
  if (!dropped) return String(text || '');
  const linky = /https?:\/\/|www\./i.test(dropped);
  const longish = dropped.split('\n').filter((l) => l.trim()).length >= 3;
  const looksLikeContent = /\?|\bp\.?\s?s\b/i.test(dropped);
  if ((linky || longish) && !looksLikeContent) return lines.slice(0, cutFrom).join('\n');
  return String(text || '');
}

export function cleanBodyForReading(text, { max = MAX_BODY_CHARS } = {}) {
  let s = String(text || '').replace(/\r\n/g, '\n');
  for (const re of BODY_QUOTE_MARKERS) s = s.replace(re, '');
  s = stripSignatureTail(s);
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > max) s = s.slice(0, max).trimEnd() + '…';
  return s;
}

/**
 * The threads this prospect and Ary are actually IN together.
 *
 * Candidate thread ids come from stored events, but only threads we take part
 * in: an outbound from us, or an inbound that is a genuine reply. A domain's
 * marketing list has thread ids too, and without this rule Sarah's newsletter
 * blasts would render as "the conversation".
 */
export function conversationThreadIds(events = [], { max = MAX_THREADS } = {}) {
  const ranked = (events || [])
    .filter((e) => e.thread_id)
    .filter((e) => e.direction === 'outbound' || isRealReply(e))
    .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
  return [...new Set(ranked.map((e) => e.thread_id))].slice(0, max);
}

/**
 * Fetch the full conversation. Returns { messages, unavailable? }.
 * Messages are chronological, deduped, attributed, and cleaned for reading.
 */
export async function fetchGmailConversation(db, env, { workspace, events = [] } = {}) {
  const threadIds = conversationThreadIds(events);
  if (!threadIds.length) return { messages: [], unavailable: 'no-thread' };

  let account;
  try { account = await getAccount(db, workspace); } catch { account = null; }
  if (!account) return { messages: [], unavailable: 'no-account' };

  let token;
  try { token = await accessTokenFor(db, env, account); } catch { return { messages: [], unavailable: 'no-token' }; }

  const seen = new Set();
  const out = [];
  for (const tid of threadIds) {
    let thread;
    try { thread = await threadMessages(token, tid); } catch { continue; }
    for (const meta of thread?.messages || []) {
      if (!meta?.id || seen.has(meta.id)) continue;
      seen.add(meta.id);
      let full;
      try { full = await messageFull(token, meta.id); } catch { continue; }
      const n = normalise(full, { accountEmail: account.email_address });
      out.push({
        messageId: n.messageId,
        threadId: n.threadId,
        from: n.direction === 'outbound' ? 'Ary' : 'them',
        fromAddress: n.fromAddress,
        at: n.occurredAt,
        subject: n.subject,
        text: cleanBodyForReading(bodyText(full)),
      });
    }
  }
  out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return { messages: out };
}
