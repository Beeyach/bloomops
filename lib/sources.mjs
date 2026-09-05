// Where a fact came from, and what that origin can honestly support.
//
// The discovery that forced this file: Ary's twenty qualification rules were
// written for social posts, and a prospect scraped from Google Maps has no post
// and never will. Evaluating a post rule against a map listing does not produce
// "no". It produces nothing, and the product was recording that nothing as a
// weaker prospect.
//
// Left alone, every Maps prospect would score below every social lead forever,
// for a reason that has nothing to do with the business: the source never
// carried the evidence the rule needed.
//
// Two concepts, kept apart on purpose:
//
//   PROVIDER is where a record came in from. Apify, a pasted post, a CSV.
//   SOURCE is the kind of evidence a fact is. Post text, a website measurement,
//   something a person said in a reply.
//
// One provider yields several source types, and the same source type arrives
// from several providers. Collapsing them would mean "we added Apify" required
// touching qualification, which is the coupling this exists to prevent.

// The kinds of evidence a fact can be.
export const SOURCE = {
  // Words the prospect wrote themselves, in public.
  POST_TEXT: 'POST_TEXT',
  // Measured from their site by a browser.
  WEBSITE: 'WEBSITE',
  // Structured facts a directory or profile asserts: category, hours, rating.
  BUSINESS_PROFILE: 'BUSINESS_PROFILE',
  // A map listing. A profile with a location, and usually little else.
  MAP_LISTING: 'MAP_LISTING',
  // They are paying to run this. The spend is the signal, not the copy.
  AD: 'AD',
  // An address, a phone number, a form. How to reach them.
  CONTACT: 'CONTACT',
  // Something they said to us, in a reply or a call.
  CONVERSATION: 'CONVERSATION',
  // A person looked and wrote down what they saw.
  MANUAL: 'MANUAL',
  // What this workspace sells, wants, and refuses. Never about the prospect.
  WORKSPACE: 'WORKSPACE',
  // Computed from the above. Carries the confidence of its weakest input.
  DERIVED: 'DERIVED',
  // Genuinely not known. Never a default for convenience.
  UNKNOWN: 'UNKNOWN',
};

// Where a record entered the product.
export const PROVIDER = {
  SOCIAL_POST: 'SOCIAL_POST',
  AD_LIBRARY: 'AD_LIBRARY',
  APIFY_GOOGLE_MAPS: 'APIFY_GOOGLE_MAPS',
  MANUAL_IMPORT: 'MANUAL_IMPORT',
  CSV: 'CSV',
  REFERRAL: 'REFERRAL',
  WEBSITE_PROBE: 'WEBSITE_PROBE',
  GMAIL: 'GMAIL',
  OTHER: 'OTHER',
  UNKNOWN: 'UNKNOWN',
};

// What each provider can produce. Capability, not a promise: a social post
// lead CAN carry post text, and one pasted with an empty body does not.
//
// This is what makes NOT_APPLICABLE decidable. A map listing cannot ever yield
// post text, so a post rule against a map prospect is not unanswered, it is
// inapplicable, and those are different facts about the prospect.
export const PROVIDER_YIELDS = {
  [PROVIDER.SOCIAL_POST]: [SOURCE.POST_TEXT, SOURCE.BUSINESS_PROFILE, SOURCE.CONTACT],
  [PROVIDER.AD_LIBRARY]: [SOURCE.AD, SOURCE.BUSINESS_PROFILE, SOURCE.CONTACT],
  [PROVIDER.APIFY_GOOGLE_MAPS]: [SOURCE.MAP_LISTING, SOURCE.BUSINESS_PROFILE, SOURCE.CONTACT],
  [PROVIDER.MANUAL_IMPORT]: [SOURCE.BUSINESS_PROFILE, SOURCE.CONTACT, SOURCE.MANUAL],
  [PROVIDER.CSV]: [SOURCE.BUSINESS_PROFILE, SOURCE.CONTACT],
  [PROVIDER.REFERRAL]: [SOURCE.BUSINESS_PROFILE, SOURCE.CONTACT, SOURCE.MANUAL],
  [PROVIDER.WEBSITE_PROBE]: [SOURCE.WEBSITE, SOURCE.CONTACT],
  [PROVIDER.GMAIL]: [SOURCE.CONVERSATION, SOURCE.CONTACT],
  [PROVIDER.OTHER]: [],
  // The honest answer for 4,787 rows that predate any of this. UNKNOWN yields
  // nothing, so nothing is ever declared inapplicable on its behalf: an unknown
  // origin gets UNKNOWN answers rather than confident ones.
  [PROVIDER.UNKNOWN]: [],
};

// The `source` column as it has actually been written, mapped to a provider.
//
// Prospects carry a free-text source, and "Google Maps" was never in the
// vocabulary the app validates against; it arrived from an import. Reading the
// real strings rather than the intended ones is the difference between a model
// that describes this database and one that describes a tidier imaginary one.
const SOURCE_STRING = [
  [/google maps|gmaps|maps/i, PROVIDER.APIFY_GOOGLE_MAPS],
  [/instagram|facebook|threads|linkedin|reddit|twitter|\bx\b/i, PROVIDER.SOCIAL_POST],
  [/\bad\b|ad library|ads/i, PROVIDER.AD_LIBRARY],
  [/referral/i, PROVIDER.REFERRAL],
  [/csv/i, PROVIDER.CSV],
  [/contact form|personal email|cold email/i, PROVIDER.MANUAL_IMPORT],
];

export function providerFor(sourceString) {
  const s = String(sourceString || '').trim();
  if (!s) return PROVIDER.UNKNOWN;
  for (const [re, provider] of SOURCE_STRING) {
    if (re.test(s)) return provider;
  }
  return PROVIDER.OTHER;
}

// Which evidence types this prospect's origin COULD supply.
//
// Explicit provenance wins. `source_provider` is set at import from now on;
// the string mapping is the fallback for everything already in the database.
export function possibleSources(p = {}) {
  const explicit = String(p.source_provider || '').trim();
  const provider = explicit && PROVIDER_YIELDS[explicit] ? explicit : providerFor(p.source);
  const yields = new Set(PROVIDER_YIELDS[provider] || []);
  // Three sources are reachable for any prospect regardless of where they came
  // from, because the product itself produces them.
  yields.add(SOURCE.WEBSITE);      // a site probe can be run on anybody
  yields.add(SOURCE.MANUAL);       // a person can always look
  yields.add(SOURCE.CONVERSATION); // anybody can reply

  // Anything the record actually holds is possible by definition, whatever the
  // provider table says. Without this a prospect whose post text is sitting
  // right there would have post rules declared inapplicable because the
  // `source` column was never filled in, which is the provider mapping
  // overruling the evidence in front of it.
  for (const s of availableSources(p)) yields.add(s);

  return { provider, possible: yields };
}

// Which evidence types this prospect's record ACTUALLY holds right now.
//
// Deliberately separate from `possible`. "Could have a website finding" and
// "has one" are different, and a rule needs the second.
export function availableSources(p = {}, { qualification = null } = {}) {
  const have = new Set();
  const q = qualification || parseQualification(p);

  if (q?.sourceType && SOURCE[q.sourceType]) have.add(q.sourceType);
  if (q?.postText) have.add(SOURCE.POST_TEXT);
  // A snapshot carrying scorer reasons and no declared source type predates
  // the source model. The lead scorer only ever ran on something somebody
  // wrote, so those reasons are post evidence; reading them as nothing would
  // retroactively make every already-promoted lead unqualifiable.
  if (!q?.sourceType && (q?.from === 'lead' || (q?.reasons || []).length)) have.add(SOURCE.POST_TEXT);

  if (p.site_intel) have.add(SOURCE.WEBSITE);
  if (p.own_findings || p.audit_notes) have.add(SOURCE.MANUAL);
  if (p.email || p.domain) have.add(SOURCE.CONTACT);
  if (p.niche || p.business_name || p.country) have.add(SOURCE.BUSINESS_PROFILE);
  if (p.replied || p.reply_type) have.add(SOURCE.CONVERSATION);

  return have;
}

// The stored qualification snapshot, parsed. Null when there is none, which is
// the correct answer for every prospect that did not come from a scored lead.
export function parseQualification(p = {}) {
  if (!p.qualification) return null;
  try {
    const q = JSON.parse(p.qualification);
    return q && typeof q === 'object' ? q : null;
  } catch {
    return null;
  }
}

// A one-line provenance summary, for a person reading a verdict.
export function describeProvenance(p = {}) {
  const { provider } = possibleSources(p);
  const q = parseQualification(p);
  if (provider === PROVIDER.UNKNOWN) {
    return 'Where this prospect came from was never recorded, so nothing is assumed about it.';
  }
  const label = {
    [PROVIDER.SOCIAL_POST]: 'a post they wrote',
    [PROVIDER.AD_LIBRARY]: 'an ad they are paying to run',
    [PROVIDER.APIFY_GOOGLE_MAPS]: 'a map listing',
    [PROVIDER.MANUAL_IMPORT]: 'an import',
    [PROVIDER.CSV]: 'a spreadsheet',
    [PROVIDER.REFERRAL]: 'a referral',
    [PROVIDER.WEBSITE_PROBE]: 'a site check',
    [PROVIDER.GMAIL]: 'the mailbox',
    [PROVIDER.OTHER]: 'somewhere else',
  }[provider] || 'an unknown origin';
  const when = q?.sourceAt ? ` on ${String(q.sourceAt).slice(0, 10)}` : '';
  return `Came from ${label}${when}.`;
}
