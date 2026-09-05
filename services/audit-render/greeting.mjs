// Who the video says hello to.
//
// Kept in its own file with no imports at all, because the Cloudflare edge
// route needs it too and narrate.mjs pulls in node:crypto, node:fs and
// node:child_process. Shared rather than copied, so the app and the render
// service can never greet the same prospect differently.

// Is this a person's name, or the business in the name field? A quarter of the
// prospect list has the latter, and "Hey Total" is worse than no name at all.
//
// Confident only, and biased towards not using a first name: business markers,
// an ampersand, digits, an all-caps token that reads as an acronym, or more
// than three words all mean we are not sure. A personal brand where the name
// and the business match, like Krystyna Kidson, is still a person and still
// gets greeted properly.
const BIZ_WORD =
  /\b(clinic|studio|spa|salon|group|ltd|llc|inc|corp|pty|co|services?|roofing|plumbing|hvac|heating|cooling|electric|solutions|centre|center|academy|team|company|contractors?|construction|gym|massage|physio|dental|law|realty|agency|training|fitness|wellness|therapies|medical|med)\b/i;
const TITLE = /^(dr|drs|mr|mrs|ms|miss|prof|rev)\.?\s+/i;

// Said out loud, so trimmed for the ear. "ACE GC CORP. - Roofing" becomes
// "ACE GC", because nobody says their own legal name when answering the phone.
function speakableBusiness(raw) {
  return String(raw || '')
    .split(/\s+[-–]\s+/)[0]
    .replace(/,.*$/, '')
    .replace(/\s*\b(corp|corporation|inc|llc|l\.l\.c|ltd|pty\s+ltd|pty|co)\.?\s*$/i, '')
    .trim();
}

export function greetingFor(rawName, rawBusiness) {
  const raw = String(rawName || '').trim();
  // The title is taken off for the checks below, which are about whether this
  // is a person's name at all, and a leading "Dr." would only get in their way.
  // It is kept, though. Stripping it and then greeting by the first name left
  // Dr. Shawn McKown as "Hey Shawn", which is both wrong and far too familiar
  // for somebody who wrote their title on their own website.
  const title = (raw.match(TITLE) || [null])[0];
  const name = raw.replace(TITLE, '');
  const business = speakableBusiness(rawBusiness);
  const words = name.split(/\s+/).filter(Boolean);
  const confident =
    !!name &&
    words.length >= 1 &&
    words.length <= 3 &&
    !BIZ_WORD.test(name) &&
    !/[&0-9]/.test(name) &&
    !/\b(and|the|of)\b/i.test(name) &&
    // ACE, MAKO, J.S. read as a company, not a first name.
    !words.some((w) => w.length >= 2 && w === w.toUpperCase() && /[A-Z]/.test(w)) &&
    // "Mirage" reads as a first name on its own, and only the business name
    // gives it away. If the name is how the business name starts AND that
    // business name carries a trade word, it is the company, not a person.
    // "Krystyna" against "Krystyna Kidson" has no trade word, so she stays a
    // person and still gets greeted by name.
    !(
      business &&
      business.toLowerCase().startsWith(name.toLowerCase()) &&
      BIZ_WORD.test(business)
    );
  // Titled people are greeted the way the title is used: Dr. McKown, never
  // Dr. Shawn. The surname when there is one, and whatever single name follows
  // the title when there is not, so "Dr. Clark" stays "Dr. Clark".
  //
  // `formal` rides along so the greeting can say Hi rather than Hey. "Hey Dr.
  // McKown" puts a casual opener against a formal address and lands somewhere
  // between the two.
  if (confident && title) {
    const clean = title.trim().replace(/\.?$/, '.');
    return { name: `${clean} ${words[words.length - 1]}`, formal: true };
  }
  if (confident) return { name: words[0] };
  if (business && !/^(the )?(team|staff)$/i.test(business)) return { team: business };
  return {};
}
