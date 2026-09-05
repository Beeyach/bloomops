// A design condition is not a business outcome.
//
// "Your contact page has no form" is something a camera saw. "Where the enquiry
// path breaks" is a claim that enquiries are failing, and nothing in the site
// check knows that. Email and a phone number are real ways to reach somebody;
// a therapist who takes every first contact by phone has no broken path, and
// telling her she does is the fastest way to be told so.
//
// This existed as a rule about the words "losing" and "missing", which caught
// "you are losing leads" and let "where the enquiry path breaks" through. The
// difference between them is only vocabulary, so the rule is about the move:
// converting an observed structure into a downstream failure nobody measured.
//
// The exception is real and matters. When the evidence IS the failure — a form
// that does not submit, a captcha with a bad key, a dead link — the email may
// say so, because then it is describing the finding rather than extrapolating
// from one.

// Findings that verify something is actually broken, rather than merely
// absent. Only these license outcome language.
export const BREAKAGE_KEYS = new Set([
  'form-broken', 'captcha-broken', 'calendar-not-loading', 'mailto-form',
  'dead-links', 'nav-dead-link', 'dead-link-one', 'broken-images',
  'dead-image-host', 'dead-feed',
]);

export const OUTCOME_INFERENCE = [
  // The path itself failing.
  /\b(enquir\w+|contact|booking|lead|signup|sign[- ]up|intake|form|message)\s+(path|flow|process|journey)\b[^.?!]{0,30}\b(break|breaks|breaking|broken|fail|fails|failing)\b/i,
  /\bwhere\s+(it|that|the\s+\w+(\s+\w+)?)\s+(break|breaks|breaking|falls? apart|goes wrong)\b/i,
  // Things going missing on the way.
  /\b(enquir\w+|leads?|messages?|requests?|clients?|customers?|people|visitors)\b[^.?!]{0,40}\b(get|gets|getting|are|end up|ends up)\s+(stuck|lost|missed|dropped|ignored)\b/i,
  /\b(missed|missing|lost|losing)\s+(enquir\w+|leads?|clients?|customers?|bookings?|business|revenue|messages?)\b/i,
  /\b(fall|falls|falling|slip|slips|slipping)\s+(through|between|away)\b/i,
  // People failing to get through.
  /\b(people|visitors|clients?|customers?|they|someone|somebody)\b[^.?!]{0,30}\b(give up|gives up|giving up|abandon|abandons|drop off|drops off|walk away|never hear back|cannot reach|can'?t reach|are unable to reach)\b/i,
  /\b(contact|enquiry|booking)\s+attempts?\b[^.?!]{0,20}\b(fail|fails|failing|go nowhere)\b/i,
  // The business consequence, stated outright.
  /\b(conversions?|enquir\w+|leads?|bookings?)\b[^.?!]{0,30}\b(suffer|suffers|are hurt|is hurt|are down|drop off)\b/i,
  /\b(costing|cost)\s+(you|them|her|him)\b[^.?!]{0,30}\b(business|clients?|customers?|leads?|enquir\w+|money|revenue)\b/i,
  /\b(hurting|damaging)\s+(your|their)\b[^.?!]{0,25}\b(enquir\w+|leads?|conversions?|business)\b/i,
];

// ── The second jump ──────────────────────────────────────────────────────
//
// The rules above are about failure: the path breaks, leads are lost, people
// give up. Package 20 made a different move and walked straight past all of
// them. From "the booking buttons go to a contact form" it wrote:
//
//   "it means each booking needs a reply back and forth before a time is set"
//   "get people onto a set time faster, no back and forth needed"
//
// Nothing fails in either sentence. They are claims about what happens AFTER
// somebody submits the form — who replies, how many rounds it takes, how long
// it feels — and a browser standing outside the building cannot see any of it.
// She might phone every enquiry back within the hour. She might send a
// scheduling link on reply. She might screen requests deliberately.
//
// So these are about the move rather than the vocabulary. Blacklisting "back
// and forth" would catch one sentence and let "someone has to write back"
// through, which is the same claim wearing different words.

// What happens to a request after it is sent. No finding observes this: there
// is no key for "we watched how they answer their email", so nothing licenses
// it and there is no stand-down.
export const PROCESS_INFERENCE = [
  // Rounds of correspondence, however phrased.
  /\bback[- ]and[- ]forth\b/i,
  /\bgo(es|ing)?\s+back\s+and\s+forth\b/i,
  // A request needing a human step before it resolves.
  /\b(booking|bookings|request|requests|enquir\w+|appointment|appointments|message|messages|submission|submissions|each one|every one)\b[^.?!]{0,40}\b(needs?|requires?|takes?|involves?|waits? for)\b[^.?!]{0,30}\b(repl\w+|response|answer|email back|write back|message back|follow[- ]up|confirmation)\b/i,
  // Somebody on their side having to act.
  /\b(you|they|someone|somebody|staff|the team|she|he|your team|reception)\b\s+(have to|has to|need to|needs to|must|end up|ends up|then)\b[^.?!]{0,20}\b(repl\w*|respond\w*|answer\w*|writ\w+ back|email\w* back|chas\w+|coordinat\w+|arrang\w+|confirm\w*|sort out)/i,
  // Somebody waiting on the other end.
  /\b(wait|waits|waiting)\b[^.?!]{0,30}\b(for a repl\w+|for a response|for an answer|for confirmation|to hear back|on you|on them)\b/i,
  // Work done by hand behind the scenes.
  /\b(manual|manually|by hand)\b[^.?!]{0,30}\b(book\w*|schedul\w*|arrang\w*|confirm\w*|coordinat\w*)/i,
  /\b(you|they|staff|the team|she|he|your team)\b[^.?!]{0,25}\bspend\w*\s+time\b/i,
];

// A benefit nobody measured. Covers the booking path and the page itself: a
// load-time claim is the same unmeasured assertion, and scoping this to booking
// alone let "the page loads faster once those images are sized" through on a
// layout finding. A real timing finding stands it down.
export const BENEFIT_INFERENCE = [
  /\b(faster|quicker|sooner|speedier|more quickly|less time|fewer steps|easier)\b[^.?!]{0,45}\b(book\w*|schedul\w*|enquir\w+|contact\w*|appointment\w*|time|slot|them|people|clients?|page|site|load\w*)\b/i,
  /\b(book\w*|schedul\w*|enquir\w+|contact\w*|appointment\w*|time|slot|them|people|clients?|page|site|load\w*)\b[^.?!]{0,45}\b(faster|quicker|sooner|more quickly|in less time|with fewer steps)\b/i,
  /\b(saves?|saving|cuts? down on|reduces?|shortens?)\b[^.?!]{0,25}\b(time|steps|effort|admin|hassle|work)\b/i,
  /\bno\s+(more\s+)?(back[- ]and[- ]forth|waiting|chasing|delay)\b/i,
  /\b(more|extra|additional)\s+(bookings?|enquir\w+|clients?|leads?)\b/i,
];

// Findings that actually timed something. Only these license a speed claim,
// and no layout observation is among them.
export const SPEED_KEYS = new Set(['slow', 'slow-site', 'slow-load']);

// Does this text claim an outcome the evidence has not established?
//
// `keys` are the finding keys actually supporting the email. When one of them
// is a verified breakage the failure check stands down, because the outcome is
// then the finding rather than a guess about it.
export function outcomeClaims(text, keys = []) {
  const body = String(text || '');
  if (!body.trim()) return [];
  const supporting = keys || [];
  const hits = [];

  const verified = supporting.some((k) => BREAKAGE_KEYS.has(String(k)));
  if (!verified) {
    for (const re of OUTCOME_INFERENCE) {
      const m = body.match(re);
      if (m) hits.push(m[0].trim());
    }
  }

  // Never licensed by a layout finding, so no stand-down.
  for (const re of PROCESS_INFERENCE) {
    const m = body.match(re);
    if (m) hits.push(m[0].trim());
  }

  const timed = supporting.some((k) => SPEED_KEYS.has(String(k)));
  if (!timed) {
    for (const re of BENEFIT_INFERENCE) {
      const m = body.match(re);
      if (m) hits.push(m[0].trim());
    }
  }

  return hits;
}
