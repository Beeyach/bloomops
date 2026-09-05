// Who a row is about, in reading order.
//
// The rows had flattened into one strip:
//
//   Doolan Coaching | Life Coach, Sober Coach   US   36 days waiting
//
// Everything the same size, everything on one line, and nothing saying what
// was actually happening. A row that answers "who is this" needs an order, and
// the order is the business, then the person and where they are, then what
// happens next, then how long they have waited.
//
// Pure, and separate from the component, so the hierarchy is a rule with tests
// rather than a habit that drifts between six copies of some JSX.
//
// The stage chips that used to hang off these rows are gone. A row now carries
// the canonical action state instead, which is a sentence rather than an enum,
// and it comes from lib/prospect-action.mjs so every list says the same thing.

const clean = (v) => String(v ?? '').trim();

// A country code stays a code; anything longer is already human.
const COUNTRY = {
  US: 'US', CA: 'CA', GB: 'UK', AU: 'AU', NZ: 'NZ', IE: 'IE',
  DE: 'DE', FR: 'FR', NL: 'NL', ES: 'ES', IT: 'IT', PH: 'PH', SG: 'SG',
};

export function locationLabel(p = {}) {
  const c = clean(p.country);
  if (!c) return null;
  const up = c.toUpperCase();
  if (c.length <= 3) return COUNTRY[up] || up;
  return c;
}

// The identity of a row.
//
// The business leads. It is the thing Ary recognises: "Mary" means nothing on
// its own, "Peak Development Strategies · Mary · Australia" means something at
// a glance. Where there is no business the person is promoted rather than
// leaving an empty line, because a nameless row is worse than a person-first
// one.
//
// `secondary` is dropped when it would only repeat the primary. The failure
// cards were rendering "A Merry Mind · A Merry Mind", which is what happens
// when two fields are joined without asking whether they differ.
//
// The country is spelled out. A list of two-letter codes is a list you have to
// decode, and there are five of them.
export function listIdentity(p = {}, { countryLabel = null } = {}) {
  const person = clean(p.name);
  const business = clean(p.business_name || p.business);
  const email = clean(p.email);
  const same = person && business && person.toLowerCase() === business.toLowerCase();

  const code = clean(p.country);
  const place = code
    ? (countryLabel && countryLabel(code.toUpperCase())) || locationLabel(p)
    : null;

  const primary = business || person || email || (p.id ? `#${p.id}` : 'Unknown');
  // Only what the line above did not already say.
  const who = business && person && !same ? person : null;

  return {
    primary,
    // "Mary · Australia", or just one of them, or nothing at all.
    secondary: [who, place].filter(Boolean).join(' · ') || null,
    person: who,
    place,
  };
}

// How long they have been waiting, as one scannable phrase.
//
// Deliberately its own field rather than something appended to a line of text,
// so it can be styled without competing with the name.
export function waitingLabel(days) {
  // Number(null) is 0 and Number('') is 0, so without this an absent age read
  // as "waiting since today" on every row that had no date to work from.
  if (days === null || days === undefined || days === '') return null;
  const n = Number(days);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n === 0) return 'Waiting since today';
  if (n === 1) return 'Waiting 1 day';
  return `Waiting ${n} days`;
}

// Long enough to be worth noticing. Not alarm, just emphasis: the palette
// already has a quiet warning tone and this uses that rather than shouting.
export const WAITING_OLD_DAYS = 30;
export const waitingIsOld = (days) => Number(days) >= WAITING_OLD_DAYS;
