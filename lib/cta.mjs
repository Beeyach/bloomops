// What the last line of a cold email asks for.
//
// This is the largest verified effect in the whole database. Across 625 stored
// emails, a close that offers a specific thing produced 4.0% interested replies
// and a close that asked an open question produced 0.4%. The one attributable
// client replied to two emails that both closed on a concrete offer.
//
// The trap this module exists to avoid: the difference is NOT punctuation.
//
//   "Want me to send you what I mean?"      ← a question, and the best close
//   "How are those going for you right now?" ← a question, and the worst
//
// A validator that rejected a final sentence containing a question mark would
// reject the highest-performing CTA in the database. So this classifies what
// the sentence *asks for*, and never how it is punctuated.

export const CTA_CLASS = {
  // Names a specific thing and asks for a yes or no on receiving it. The
  // reader's whole job is to say yes.
  MICRO_OFFER: 'MICRO_OFFER',
  // Asks them to describe, explain or reflect. The reader's job is to write
  // something, which is why almost nobody does.
  OPEN_QUESTION: 'OPEN_QUESTION',
  OTHER: 'OTHER',
};

// Sign-offs, so the closer is the last thing that asks for something rather
// than the word "Ary".
const SIGNOFF = /^(thanks|thank you|cheers|best|regards|kind regards|warmly|talk soon|speak soon|all the best|sincerely|ary|bloomwired|[-–]{1,2}\s*\w+)\b/i;

// First-person delivery. "I will send", "I can put together", "happy to share".
const OFFER_VERB = /\b(send|share|show|put together|write up|pull together|sketch|draft|record|map out|walk you through|point (?:them |it )?out|flag|list|note down|screenshot)\b/i;

// The shapes an offer takes. Each one hands the reader a yes/no.
const OFFER_LEAD = [
  /\bwant me to\b/i,
  /\bwould you (?:like|want) me to\b/i,
  /\bshall i\b/i,
  /\bshould i\b/i,
  /\bcan i\b/i,
  /\bhappy to\b/i,
  /\bglad to\b/i,
  /\bi(?:'ll| will| can| could)\b/i,
  /\bjust say (?:the word|yes)\b/i,
  /\breply (?:and|with)\b/i,
  /\blet me know (?:and|if you)\b/i,
  /\bsay the word\b/i,
];

// Interrogatives that ask about the reader's situation. Only counted when they
// actually open a question, not when they appear mid-sentence.
const OPEN_LEAD = /(?:^|[.!?]\s+|\bbut\s+|\band\s+|,\s*)(how|what|why|when|where|who|which)\b/i;

// Nouns that make an offer concrete. "I'll send something over" is an offer;
// "I'll send a two-line rundown of the three I found" is a specific one.
const DELIVERABLE = /\b(rundown|breakdown|list|example|examples|screenshot|screenshots|note|notes|summary|walkthrough|version|draft|outline|snapshot|checklist|clip|recording|the (?:three|two|four|five|couple)|what i (?:mean|found|noticed|saw|would do))\b/i;

const ESCAPE_HATCH = /\b(if (?:that|this|it)(?:'s| is| has been)? (?:already )?(?:handled|sorted|covered|in place|done)|ignore (?:me|this)|no (?:worries|problem) if not|feel free to ignore|if not,? no)\b/i;

// The closing ask, which is not always the last line.
//
// Real emails end with a sign-off and a name, and one of the earliest bugs in
// reading these was scoring "Thanks, Ary" as the call to action.
export function closingLine(body = '') {
  const lines = String(body || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i];
    if (SIGNOFF.test(line)) continue;
    // A bare name on its own line.
    if (/^[A-Z][a-z]+(\s+[A-Z][a-z]+)?$/.test(line) && line.split(/\s+/).length <= 2) continue;
    return line;
  }
  return '';
}

// Classify one closing line.
//
// Order matters. An offer wins over an open question when both shapes are
// present, because "I noticed X, what's your setup? Want me to send the fix?"
// is asking for a yes, and the yes is what gets answered.
export function classifyCta(text = '') {
  const closer = String(text || '').trim();
  if (!closer) return { cls: CTA_CLASS.OTHER, closer: '', specific: false, escapeHatch: false, reason: 'No closing line.' };

  const offering = OFFER_LEAD.some((re) => re.test(closer)) && OFFER_VERB.test(closer);
  const specific = DELIVERABLE.test(closer);
  const escapeHatch = ESCAPE_HATCH.test(closer);

  if (offering) {
    return {
      cls: CTA_CLASS.MICRO_OFFER,
      closer,
      specific,
      escapeHatch,
      reason: specific
        ? 'Offers a specific thing and asks for a yes.'
        : 'Offers to do something, but does not name what they get.',
    };
  }

  // Only an open question if it actually opens one AND there is no offer.
  const asksThem = OPEN_LEAD.test(closer) && closer.includes('?');
  if (asksThem) {
    return {
      cls: CTA_CLASS.OPEN_QUESTION,
      closer,
      specific: false,
      escapeHatch,
      reason: 'Asks them to describe something. This is the 0.4% close.',
    };
  }

  return { cls: CTA_CLASS.OTHER, closer, specific, escapeHatch, reason: 'Neither an offer nor an open question.' };
}

// Classify a whole email body by its close.
export function classifyEmail(body = '') {
  return classifyCta(closingLine(body));
}

// What the reader was actually promised, for fulfilment later.
//
// Recorded at send time so that answering "yes" is a lookup rather than a
// guess three weeks later about which of five things we offered.
export function promiseFrom(text = '') {
  const closer = String(text || '').trim();
  const m = closer.match(DELIVERABLE);
  if (!m) return null;
  // Keep the clause the deliverable sits in, trimmed, rather than one word.
  const idx = closer.toLowerCase().indexOf(m[0].toLowerCase());
  const from = closer.lastIndexOf(' ', Math.max(0, idx - 25));
  return closer.slice(from < 0 ? 0 : from, Math.min(closer.length, idx + m[0].length + 40)).trim().replace(/[?.]+$/, '');
}

// The house rule, as a check rather than a sentence to paste.
//
// Deliberately not a hard block on OPEN_QUESTION: an open question is a fine
// sentence in the middle of an email, and Ary can knowingly choose one. It is
// simply never the default.
export function ctaCheck(body = '') {
  const r = classifyEmail(body);
  const problems = [];
  if (r.cls === CTA_CLASS.OPEN_QUESTION) {
    problems.push('The email closes on an open question. Offering a specific thing converted ten times better.');
  }
  if (r.cls === CTA_CLASS.MICRO_OFFER && !r.specific) {
    problems.push('The offer does not name what they get. "Want me to send a rundown of the three I found" beats "want me to take a look".');
  }
  if (r.cls === CTA_CLASS.OTHER) {
    problems.push('The email does not close on a clear next step.');
  }
  if (!r.escapeHatch) {
    problems.push('No escape hatch. "If that is already handled, ignore me" belongs in every cold email.');
  }
  return { ...r, ok: problems.length === 0, problems, promise: promiseFrom(r.closer) };
}
