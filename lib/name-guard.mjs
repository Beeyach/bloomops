// Is this email greeting the right person?
//
// An approved email addressed to Mary Ann Johnson opened "Hi Heidi,". It was
// caught by a human reading it, which is not a control.
//
// Deliberately not a classifier. A model asked "does this look right" will one
// day say yes to the wrong name, and there is no cheaper way to be sure than
// comparing two strings. This compares the greeting to the recipient and
// refuses to guess: it blocks on a clear mismatch, and stays quiet about
// everything it cannot be certain of.
//
// The asymmetry is on purpose. A false block costs Ary ten seconds. A false pass
// costs a stranger's first impression and cannot be taken back.

// Greetings that address nobody in particular. Never a mismatch.
const IMPERSONAL = new Set([
  'there', 'all', 'team', 'folks', 'everyone', 'hello', 'hi', 'hey',
  'morning', 'afternoon', 'evening', 'sir', 'madam', 'friend', 'y-all', "y'all",
]);

// The opening line, if it names somebody.
//
// Only looks at the first line or two: a name further down is a mention, not a
// greeting, and treating it as one is how false blocks start.
export function greetingName(body) {
  // The greeting line itself, and only it. The name has to be on the same line
  // as the "Hi": letting the match run past the newline turns "Hello,\n\nI had
  // a look" into a greeting addressed to somebody called "I".
  const firstLine = String(body || '').replace(/\r/g, '').split('\n').find((l) => l.trim());
  if (!firstLine) return null;

  // "Hi Mary Ann," / "Hello Dr. Chen -" / "Hey Jon"
  const m = firstLine.match(
    /^[ \t]*(?:hi|hello|hey|dear|good\s+(?:morning|afternoon|evening))\b[ \t]*,?[ \t]*(.*)$/i
  );
  if (!m) return null;

  // Everything after the greeting word, cut at the first thing that ends an
  // address: a comma, a dash, or the end of the sentence.
  let name = (m[1] || '').split(/[,!—–]|\s+-\s+/)[0].trim();
  if (!name) return null;

  // Drop a title. The dot is optional and may be absent: "Dr Chen" and
  // "Dr. Chen" are the same greeting.
  name = name.replace(/^(?:dr|mr|mrs|ms|miss|prof)\.?\s+/i, '');
  const words = [];
  for (const w of name.split(/\s+/)) {
    if (!/^[\p{L}'’.-]+$/u.test(w)) break;
    if (/^(?:at|from|of|the|and|with|in|for)$/i.test(w)) break;
    words.push(w);
    if (words.length === 3) break;
  }
  if (!words.length) return null;

  const first = normalise(words[0]);
  if (!first || IMPERSONAL.has(first)) return null;
  // A single letter is an initial, not evidence of anything.
  if (first.length < 2) return null;

  return { raw: words.join(' '), first, parts: words.map(normalise).filter(Boolean) };
}

// Lowercase, unaccented, punctuation-free. So Renée, RENEE and Renee are one
// name, and O'Brien matches OBrien.
function normalise(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

// Short forms that are the same person. Only pairs where being wrong is
// implausible; anything debatable is left out so it falls through to "unsure"
// rather than to a wrong answer either way.
const SHORT_FORMS = [
  ['robert', 'rob', 'bob', 'bobby'], ['william', 'will', 'bill', 'billy'],
  ['richard', 'rick', 'dick', 'rich'], ['michael', 'mike', 'mick'],
  ['james', 'jim', 'jimmy'], ['john', 'jon', 'johnny'], ['joseph', 'joe', 'joey'],
  ['thomas', 'tom', 'tommy'], ['christopher', 'chris'], ['daniel', 'dan', 'danny'],
  ['matthew', 'matt'], ['anthony', 'tony'], ['charles', 'charlie', 'chuck'],
  ['steven', 'stephen', 'steve'], ['andrew', 'andy', 'drew'],
  ['edward', 'ed', 'eddie', 'ted'], ['benjamin', 'ben'], ['nicholas', 'nick'],
  ['alexander', 'alex'], ['samuel', 'sam'], ['patricia', 'pat', 'patty', 'trish'],
  ['jennifer', 'jen', 'jenny'], ['elizabeth', 'liz', 'beth', 'lizzie', 'eliza'],
  ['susan', 'sue', 'susie'], ['margaret', 'maggie', 'meg', 'peggy'],
  ['catherine', 'katherine', 'kate', 'katie', 'kathy', 'cathy'],
  ['deborah', 'deb', 'debbie'], ['rebecca', 'becky', 'becca'],
  ['kimberly', 'kim'], ['stephanie', 'steph'], ['jessica', 'jess'],
  ['victoria', 'vicky', 'vicki'], ['christina', 'christine', 'chris', 'tina'],
  ['pamela', 'pam'], ['sandra', 'sandy'], ['barbara', 'barb'],
  ['theodore', 'ted', 'teddy'], ['timothy', 'tim'], ['ronald', 'ron'],
  ['donald', 'don'], ['kenneth', 'ken'], ['lawrence', 'larry'],
  ['gregory', 'greg'], ['joshua', 'josh'], ['zachary', 'zach'],
  ['maryann', 'mary'], ['annmarie', 'ann', 'anne'],
];

function sameName(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  // A clear prefix, both reasonably long: "chris" and "christina".
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return true;
  return SHORT_FORMS.some((group) => group.includes(a) && group.includes(b));
}

export const NAME_CHECK = {
  OK: 'OK',
  // Nothing to compare, or not confident enough to say. Never blocks.
  UNSURE: 'UNSURE',
  MISMATCH: 'MISMATCH',
};

// Compare the greeting against who this is actually going to.
//
// `expected` is whatever canonical name the prospect record holds — contact
// name first, then the business's own person field. A business name is not a
// person and is never treated as one.
export function checkGreeting({ body = '', expectedName = '', businessName = '' } = {}) {
  const greeting = greetingName(body);

  // No greeting, or one that addresses nobody. Both fine.
  if (!greeting) return { result: NAME_CHECK.OK, reason: 'No personal greeting to check.' };

  const expectedParts = String(expectedName || '')
    .split(/\s+/).map(normalise).filter((w) => w && w.length > 1);

  // We do not know who they are, so we cannot say the greeting is wrong. This
  // is the case a business-name-only record lands in.
  if (!expectedParts.length) {
    return {
      result: NAME_CHECK.UNSURE,
      greeted: greeting.raw,
      reason: 'This email greets someone by name, but there is no contact name on the prospect to check it against.',
    };
  }

  // Any part of the expected name matching any part of the greeting is enough.
  // "Hi Mary Ann" against "Mary Ann Johnson", "Hi Johnson" against the same, and
  // "Hi Mary" all pass.
  const hit = greeting.parts.some((g) => expectedParts.some((e) => sameName(g, e)));
  if (hit) return { result: NAME_CHECK.OK, greeted: greeting.raw, reason: 'The greeting matches the contact.' };

  // The greeting might be the business rather than a person.
  const businessParts = String(businessName || '').split(/\s+/).map(normalise).filter(Boolean);
  if (businessParts.length && greeting.parts.some((g) => businessParts.includes(g))) {
    return { result: NAME_CHECK.OK, greeted: greeting.raw, reason: 'The greeting uses the business name.' };
  }

  return {
    result: NAME_CHECK.MISMATCH,
    greeted: greeting.raw,
    expected: String(expectedName || '').trim(),
    // The whole message, in Ary's words, with both names in it so the problem is
    // obvious without opening anything.
    reason: `This email starts with “Hi ${greeting.raw}”, but it is going to ${String(expectedName || '').trim()}.`,
  };
}

// The one question the send path asks.
//
// Blocks only on a clear mismatch. UNSURE is reported so it can be shown, and
// deliberately does not stop the send: refusing to send every email to a
// prospect whose contact name we never captured would block most of the list to
// prevent a problem we have no evidence of.
export function blocksSend(check) {
  return check?.result === NAME_CHECK.MISMATCH;
}
