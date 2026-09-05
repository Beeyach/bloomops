// Facebook post-search triage.
//
// A scan for "looking for someone to manage my calendar and client intake"
// returned 42 posts and 41 became leads. Reading them, essentially none were
// buyers. They were three things:
//
//   1. Virtual assistants advertising themselves. The phrase a buyer would
//      type is almost word-for-word the phrase a supplier uses to describe
//      what they do, so keyword search returns the supply side.
//   2. AI-written engagement-bait fiction. Long narrative posts that happen
//      to contain "calendar", "client" or "office".
//   3. Ordinary promos and personal updates.
//
// Facebook's post search cannot tell "I need this" from "I do this" — both
// contain the same nouns. So the filtering has to happen here, before a post
// becomes a lead you pay attention to (and before Guard Bee spends an API
// call scoring it).

// Someone describing their own service. The single biggest junk category.
const SUPPLIER = [
  /\bi(?:'m| am)\s+(?:a|an)\s+(?:skilled\s+|professional\s+|freelance\s+|certified\s+)?(?:virtual assistant|va\b|executive assistant|social media manager|appointment setter|copywriter|designer)/i,
  /\bmy name is\b[^.!?]{0,60}\b(?:i'?m|i am)\b/i,
  /\bi specialize in\b/i,
  /\bi (?:offer|provide|deliver|handle)\b[^.!?]{0,40}\b(?:services?|support|assistance)\b/i,
  // "DM me" is unambiguously a call to action. "message me" is not — a buyer
  // writes "people message me and I lose track", which is the exact problem
  // this product solves. So the softer verb only counts as a pitch when it
  // opens a sentence or follows an invitation.
  /\b(?:dm|pm) me\b/i,
  /(?:^|[.!?]\s+)(?:just |please |feel free to )?message me\b/i,
  /\b(?:hire me|work with me|let me help you|book a call with me)\b/i,
  /\bi'?m (?:currently )?(?:partnering|working) with (?:businesses|entrepreneurs|clients)\b/i,
  /\b(?:my|our) services\b/i,
  /\bavailable for (?:work|hire|projects|clients)\b/i,
  /\bportfolio\b/i,
  /\b(?:slots?|spots?) (?:are )?(?:open|available|left)\b/i,
];

// Sales promotions — real businesses, but they are selling, not buying.
const PROMO = [
  /\b\d{1,3}%\s*off\b/i,
  /\b(?:sale|discount|promo|book now|limited time|early bird)\b/i,
];

// Serialised engagement bait, redefined here with intact word boundaries.
// (The original block was written through a shell heredoc, which turned every
// \b into a literal backspace character — the regex became /<BS>part \d+<BS>/
// and silently matched nothing. Worth remembering: regexes go in through the
// editor, never through a heredoc.)
const STORY_BAIT_PATTERNS = [
  /\bpart \d+\b/i,
  /\b(?:to be continued|continued in the comments|full story (?:in|below))\b/i,
];

// A genuine ask. At least one of these must be present for a post to survive.
const BUYER = [
  // "anyone/anybody", not "someone" — narrative prose is full of "someone
  // knew" and "someone used to". And used(?! to), because "someone used to
  // being the gate between important people" is a novel, not a question.
  // That exact sentence let a 2,000-character AI story through as the only
  // survivor of a 41-post batch.
  /\b(?:anyone|anybody) (?:knows?|has|have|used(?! to)|recommends?|tried)\b/i,
  /\bdoes anyone\b/i,
  /\bcan anyone\b/i,
  /\bany (?:recommendations|suggestions|advice|tips)\b/i,
  /\brecommendations? for\b/i,
  /\bwho (?:do|did) you use\b/i,
  /\blooking (?:to hire|for help|for someone to help)\b/i,
  /\bneed (?:help|advice|someone) (?:with|to)\b/i,
  /\bstruggling (?:with|to)\b/i,
  /\bhow (?:do|did) (?:you|i|we) (?:handle|manage|deal with|stop|fix)\b/i,
  /\b(?:i|we) (?:keep|can'?t stop|am) losing\b/i,
  /\b(?:i|we) (?:can'?t|cannot) keep up\b/i,
  /\bany one know\b/i,
];

// Long with no question is the signature of the AI story posts. A real person
// asking for help is short and ends in a question mark; nobody writes 1,200
// words of narrative to ask who does their scheduling.
const LONG_POST = 900;

function anyMatch(text, patterns) {
  return patterns.some((re) => re.test(text));
}

export function classifyPost(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return { keep: false, reason: 'empty' };

  if (anyMatch(text, SUPPLIER)) return { keep: false, reason: 'supplier advertising their own services' };
  if (anyMatch(text, PROMO)) return { keep: false, reason: 'a promotion, not a request' };
  if (anyMatch(text, STORY_BAIT_PATTERNS)) return { keep: false, reason: 'serialised story bait' };

  const asks = anyMatch(text, BUYER);
  const hasQuestion = text.includes('?');

  if (text.length > LONG_POST && !asks) {
    return { keep: false, reason: 'long narrative post, no actual request' };
  }
  if (!asks && !hasQuestion) return { keep: false, reason: 'no request in it' };
  // A question mark alone is weak — "Are you next? 🥰" is a promo. Require a
  // real asking phrase unless the post is short and clearly first-person.
  if (!asks && !/\b(?:my|our|i|we)\b/i.test(text)) {
    return { keep: false, reason: 'no request in it' };
  }
  if (!asks) return { keep: false, reason: 'no request in it' };

  return { keep: true, reason: 'asks for help' };
}

// Triage a batch and report what was dropped and why, so a thin result set is
// explainable rather than mysterious.
export function filterPosts(posts, getText = (p) => p?.message) {
  const kept = [];
  const dropped = {};
  for (const p of posts || []) {
    const { keep, reason } = classifyPost(getText(p));
    if (keep) kept.push(p);
    else dropped[reason] = (dropped[reason] || 0) + 1;
  }
  return { kept, dropped };
}
