// What they actually said, in a form worth putting on a row.
//
// The text was always there. `reply_events.snippet` has held the first ~200
// characters of every inbound message since the Gmail sync started, and not
// one screen has ever shown it — Today asked the database for "direction,
// when, and what it was. No bodies." So Replies could tell Ary that somebody
// wrote back, and never what they wrote, which is the one thing she needed.
//
// Three things stand between the stored snippet and a readable line.
//
// ENTITIES. Gmail's snippet field is HTML-escaped. Stored verbatim, a reply
// reads "It&#39;s gotten to the point" — the apostrophe arrives as five
// characters of markup. Every stored snippet in the mailbox has this.
//
// QUOTED THREAD. A reply carries the message it answers. "Interested — test
// reply On Tue, Aug 11, 2026 at 10:12 AM Ary at Bloomwired <hello@...> wrote:"
// is two words from them and forty from us. The two words are the point.
//
// SIGNATURES. "Yes, I prefer it this way. --- Cynthia A. Criss, LPC, CSAT
// Open Hearts Open Minds Counseling" — the name is already on the row.

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&nbsp;': ' ', '&#39;': "'", '&#34;': '"', '&#160;': ' ',
};

export function decodeEntities(text) {
  if (!text) return '';
  return String(text)
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39|#34|#160);/g, (m) => ENTITIES[m] || m)
    // Numeric escapes Gmail uses for anything it did not have a name for.
    .replace(/&#(\d+);/g, (_, d) => {
      const code = Number(d);
      return Number.isFinite(code) && code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : _;
    });
}

// Where the quoted conversation starts. Each of these is the beginning of the
// thread being repeated back, not of anything the person wrote.
const QUOTE_MARKERS = [
  // The Gmail attribution line, matched on the DATE rather than on "wrote:".
  //
  // Snippets are cut at ~200 characters, so the quote header is usually
  // truncated before "wrote:" ever appears — the canary reply stores as
  // "Interested — test reply On Tue, Aug 11, 2026 at 10:12 AM Ary at
  // Bloomwired <hello@bloom" and stops. Keying on "wrote:" matched nothing
  // and left the whole header on the row.
  //
  // "at HH:MM" is required so this cannot swallow ordinary prose that happens
  // to mention a date. Both shapes in the mailbox are covered: with a weekday
  // ("On Tue, Aug 11, 2026 at 10:12 AM") and without ("On Aug 10, 2026, at
  // 7:35 AM,").
  /\bOn\s+(?:\w{3,9},\s+)?\w{3,9}\s+\d{1,2},\s+\d{4},?\s+at\s+\d{1,2}:\d{2}/i,
  // "On Tue, Aug 11, 2026 at 10:12 AM Someone <a@b.com> wrote:"
  /\bOn\s+\w{3},?\s+\w{3}\s+\d{1,2},?\s+\d{4}[\s\S]*?\bwrote:/i,
  // "On 11/08/2026 10:12, Someone wrote:"
  /\bOn\s+\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}[\s\S]*?\bwrote:/i,
  /^\s*-{2,}\s*Original Message\s*-{2,}/im,
  /^\s*_{5,}\s*$/m,
  /^\s*From:\s.+\bSent:\s/im,
  /\bSent from my i(?:Phone|Pad)\b/i,
  /\bGet Outlook for i(?:OS|Android)\b/i,
];

// A signature start, once there is already something worth keeping in front
// of it. Deliberately conservative: cutting a real sentence is worse than
// leaving a name on the end.
const SIGNATURE_MARKERS = [
  /\s-{2,3}\s/,            // "text --- Name"
  /\s—{2,}\s/,        // em-dash rule
  /\bBest regards,\s/i,
  /\bKind regards,\s/i,
  /\bWarm regards,\s/i,
  /\bThanks,\s+\w+\s+\w+\s+\w+/i,  // "Thanks, First Last Title" — not bare "Thanks,"
];

function cutAt(text, markers, { minKeep = 0 } = {}) {
  let cut = text.length;
  for (const re of markers) {
    const m = text.match(re);
    if (m && m.index != null && m.index < cut && m.index >= minKeep) cut = m.index;
  }
  return text.slice(0, cut);
}

/**
 * Turn a stored snippet into the line a person reads.
 *
 * Returns '' when nothing survives, so callers can say "not synced yet"
 * rather than printing an empty quote — an empty pair of quotation marks
 * reads as "they sent nothing", which is a claim the record cannot support.
 */
export function replyExcerpt(snippet, { maxChars = 180 } = {}) {
  if (!snippet) return '';
  let s = decodeEntities(snippet);

  // Drop lines that are purely quoted material.
  s = s.split(/\r?\n/).filter((line) => !/^\s*>/.test(line)).join('\n');

  s = cutAt(s, QUOTE_MARKERS);
  // Only trim a signature when real text precedes it.
  s = cutAt(s, SIGNATURE_MARKERS, { minKeep: 25 });

  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return '';

  if (s.length <= maxChars) return s;
  // Cut on a word, and only add the ellipsis when something was actually lost.
  const clipped = s.slice(0, maxChars);
  const lastSpace = clipped.lastIndexOf(' ');
  return (lastSpace > maxChars * 0.6 ? clipped.slice(0, lastSpace) : clipped).trimEnd() + '…';
}

// Is this a reply to something we sent, or mail that merely arrived from a
// domain we know?
//
// Every genuine reply in the mailbox carries In-Reply-To and References and
// was matched on the thread. Every newsletter blast from a prospect's own
// marketing list carries neither and was matched on the domain. Three of
// those newsletters sit in the queue right now flagged as needing a personal
// answer, addressed to "Hey Audit" — the name that address signed up under.
//
// Sitting in Replies, they are not a small annoyance: they are three of the
// eight rows, and each one is a person Ary does not owe anything.
// "Thank you!" is the end of an exchange, not a question in it.
//
// Sarah's whole latest message is those two words. Classified `interested`,
// flagged for a human, and drawn as somebody waiting on an answer — so a tab
// that promised "people who wrote back and are waiting on you" spent a slot on
// a thank-you note.
//
// Kept deliberately tight: short, no question mark, and nothing after the
// courtesy. "Thanks — can you send the invoice?" has a question mark and real
// content after the comma, so it stays. The cost of being wrong here is
// missing a reply, so the rule only fires when there is plainly nothing to
// answer.
const ACK = /^(thanks?|thank you|ta|cheers|great|perfect|ok|okay|got it|sounds good|much appreciated|appreciate it|will do|noted)[\s!.,]*$/i;

export function isBareAcknowledgment(text) {
  const s = String(text || '').trim();
  if (!s || s.length > 40) return false;
  if (s.includes('?')) return false;
  return ACK.test(s);
}

export function isRealReply(event) {
  if (!event) return false;
  if (event.direction && event.direction !== 'inbound') return false;

  const threaded = Boolean(event.in_reply_to || event.refs) || event.matched_by === 'thread';
  if (threaded) return true;

  // Not threaded. Only the weakest match is rejected on that basis.
  //
  // Matching on the DOMAIN means "somebody at a company we know mailed us",
  // which is exactly what a marketing blast is. Matching on the exact address
  // means a specific person we are talking to wrote — and people do sometimes
  // answer by composing a fresh email rather than hitting reply, so treating
  // an untracked address match as noise would hide a genuine reply.
  //
  // Erring this way costs an occasional stray row. Erring the other way loses
  // somebody who actually wrote back, which is the failure that matters.
  return event.matched_by !== 'domain';
}
