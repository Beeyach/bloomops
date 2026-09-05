// Whose email is this, actually?
//
// The pilot answered a question nobody had asked. Running the existing
// extractor over fifty real prospects found fourteen addresses, and about half
// of them belonged to somebody else:
//
//   hi@mystore.com              a Square template placeholder, twice
//   info@indiantypefoundry.com  the foundry that made the site's font
//   info@starroofersdallas.com  a roofer in Dallas, on a San Jose roofer's site
//   contact@sansoxygen.com      a different business entirely
//
// The extractor took the first plausible address on the page. That is correct
// for a mailto on a small business's own footer and completely wrong for a
// template's leftovers, a font licence comment, or the previous client of the
// web designer who reused the layout.
//
// An address is not a contact. An address plus a reason to believe it reaches
// THIS business is a contact, and this file is the reason.

// Where an address sits relative to the site it was found on.
export const ASSOCIATION = {
  // hello@example.com found on example.com. As certain as this gets.
  SAME_DOMAIN: 'SAME_DOMAIN',
  // jane@gmail.com published on the business's own site. Extremely common for
  // solo practitioners, and legitimate: they chose to put it there.
  OWNER_EXTERNAL: 'OWNER_EXTERNAL',
  // An address at some other company's domain. A web designer, a font vendor,
  // a booking platform, a directory, or the template's previous owner.
  THIRD_PARTY: 'THIRD_PARTY',
  // The site is on a platform subdomain, so there is no domain to compare
  // against and the answer is genuinely unknown.
  UNKNOWN: 'UNKNOWN',
};

export const CONFIDENCE = {
  // Read off a page the business controls, in a place that implies ownership.
  SOURCE_CONFIRMED: 'SOURCE_CONFIRMED',
  // Found, and something about it does not line up.
  FOUND: 'FOUND',
  // Deliverability actually checked. Nothing here ever sets this: native
  // extraction proves publication, not that a mailbox exists.
  VERIFIED: 'VERIFIED',
};

// Free mail providers. An address here on a business's own site is usually the
// owner: small operators run the business from a personal inbox, and treating
// that as third-party would discard the most contactable prospects there are.
const FREE_PROVIDER = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.com.au', 'icloud.com', 'me.com', 'aol.com',
  'protonmail.com', 'proton.me', 'gmx.com', 'mail.com', 'bigpond.com', 'optusnet.com.au',
]);

// Site builders and booking platforms. A prospect on one of these has no
// domain of their own to compare an address against, so SAME_DOMAIN cannot be
// computed and pretending otherwise would be the whole bug again.
const PLATFORM_HOST = /(^|\.)(square\.site|glossgenius\.com|wixsite\.com|squarespace\.com|weebly\.com|godaddysites\.com|business\.site|myshopify\.com|setmore\.com|booksy\.com|vagaro\.com|janeapp\.com|simplybook\.me|carrd\.co|notion\.site|linktr\.ee)$/i;

// Addresses that are never anybody's contact. Every one of these came out of
// the pilot on a real prospect's page.
const TEMPLATE_JUNK = new Set([
  'hi@mystore.com', 'hello@mystore.com', 'info@mystore.com',
  'you@example.com', 'hello@example.com', 'info@yourcompany.com',
  'hello@yourdomain.com', 'email@example.com',
]);

// Vendors whose addresses turn up inside licence comments, embedded fonts,
// analytics snippets and platform boilerplate.
const VENDOR_DOMAIN = /(typefoundry|fonts?\.|fontawesome|typekit|adobe\.com|wix\.com|squarespace\.com|shopify\.com|godaddy|wordpress\.(com|org)|automattic|elementor|woocommerce|cloudflare|sentry\.io|google\.com|gstatic|jquery|bootstrap)/i;

const hostOf = (urlOrDomain) => {
  const s = String(urlOrDomain || '').trim();
  if (!s) return '';
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return s.replace(/^www\./i, '').toLowerCase();
  }
};

// example.co.uk from shop.example.co.uk. Deliberately simple: a two-label
// suffix list would be a maintenance burden for a marginal gain here.
const registrable = (host) => {
  const parts = String(host || '').split('.').filter(Boolean);
  return parts.length <= 2 ? parts.join('.') : parts.slice(-2).join('.');
};

// Classify one address against the site it was found on.
export function associate(email, siteDomain) {
  const addr = String(email || '').trim().toLowerCase();
  const at = addr.lastIndexOf('@');
  if (at < 1) return { association: ASSOCIATION.UNKNOWN, why: 'Not an address.' };
  const emailDomain = addr.slice(at + 1);
  const host = hostOf(siteDomain);

  if (TEMPLATE_JUNK.has(addr)) {
    return { association: ASSOCIATION.THIRD_PARTY, why: 'A template placeholder, not a real inbox.', junk: true };
  }
  if (VENDOR_DOMAIN.test(emailDomain)) {
    return { association: ASSOCIATION.THIRD_PARTY, why: 'Belongs to a tool or vendor used by the site.', junk: true };
  }

  if (FREE_PROVIDER.has(emailDomain)) {
    return {
      association: ASSOCIATION.OWNER_EXTERNAL,
      why: `A personal inbox published on their own site. Common for small operators, and they chose to put it there.`,
    };
  }

  if (PLATFORM_HOST.test(host)) {
    // Their site lives on somebody else's domain, so there is nothing to
    // compare against. The address may well be theirs; nothing here proves it.
    return {
      association: ASSOCIATION.UNKNOWN,
      why: `Their site is on ${host}, so there is no domain of their own to check this against.`,
    };
  }

  if (emailDomain === host || registrable(emailDomain) === registrable(host)) {
    return { association: ASSOCIATION.SAME_DOMAIN, why: 'At the same domain as their website.' };
  }

  return {
    association: ASSOCIATION.THIRD_PARTY,
    why: `At ${emailDomain}, which is not their website's domain. Often a designer, a platform, or a template's previous owner.`,
  };
}

// May this address be adopted as the prospect's contact without a person
// looking at it?
//
// Only the two that carry a reason. THIRD_PARTY is never adopted: the pilot's
// San Jose roofer would have been emailed at a Dallas roofer's address, and
// nothing downstream could have noticed.
export function adoptable(association) {
  return association === ASSOCIATION.SAME_DOMAIN || association === ASSOCIATION.OWNER_EXTERNAL;
}

// May a person be shown this route in?
//
// A wider question than adoptable, and a different one. Adopting an address
// without anybody looking demands the two associations that carry a reason;
// putting a candidate in front of a person who will decide for themselves only
// has to exclude the ones that belong to somebody else. A designer's inbox is
// never offered under either rule.
//
// Written here, once, because the held bucket already applied this test inline
// and the prospect page needed the same one. Two inline copies of a contact
// rule is exactly how the wrong studio gets emailed.
export function showable(association) {
  return association !== ASSOCIATION.THIRD_PARTY;
}

// Every candidate on a page, classified and ordered, rather than the first one
// that matched a regex.
export function candidatesFrom(html, siteDomain, { sourceUrl = null, at = null } = {}) {
  // De-obfuscate before scanning, not after. "jane [at] example [dot] com"
  // contains no @ at all, so the address pattern never sees it and normalising
  // the match afterwards is too late. Only these two spellings: a general
  // de-obfuscator invents addresses that were never on the page.
  const text = String(html || '')
    .replace(/\s*[\[(]\s*at\s*[\])]\s*/gi, '@')
    .replace(/\s*[\[(]\s*dot\s*[\])]\s*/gi, '.');
  const seen = new Set();
  const out = [];
  const add = (raw, method) => {
    const e = normalise(raw);
    if (!e || seen.has(e)) return;
    seen.add(e);
    const a = associate(e, siteDomain);
    if (a.junk) return;
    out.push({
      value: e,
      method,
      association: a.association,
      why: a.why,
      confidence: adoptable(a.association) ? CONFIDENCE.SOURCE_CONFIRMED : CONFIDENCE.FOUND,
      sourceUrl,
      discoveredAt: at || new Date().toISOString(),
    });
  };

  for (const m of text.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    let v = m[1];
    try { v = decodeURIComponent(v); } catch {}
    add(v, 'mailto link');
  }
  for (const m of text.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    add(m[0], 'page text');
  }

  // A mailto beats page text, and a same-domain address beats anything else.
  const rank = { [ASSOCIATION.SAME_DOMAIN]: 0, [ASSOCIATION.OWNER_EXTERNAL]: 1, [ASSOCIATION.UNKNOWN]: 2, [ASSOCIATION.THIRD_PARTY]: 3 };
  return out.sort((a, b) =>
    (rank[a.association] - rank[b.association])
    || ((a.method === 'mailto link' ? 0 : 1) - (b.method === 'mailto link' ? 0 : 1)));
}

function normalise(raw) {
  let e = String(raw || '').trim().toLowerCase();
  // "name [at] domain [dot] com" and friends. Only these two, because a
  // general de-obfuscator invents addresses that were never on the page.
  e = e.replace(/\s*\[\s*at\s*\]\s*/g, '@').replace(/\s*\[\s*dot\s*\]\s*/g, '.');
  e = e.replace(/[.,;:)>\]]+$/, '');
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e)) return null;
  if (e.length > 100) return null;
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(e)) return null;
  if (/^[0-9a-f]{16,}@/.test(e)) return null;
  if (/^(your-?email|email|name|user|someone|noreply|no-reply|donotreply|do-not-reply|postmaster|abuse|privacy|dpo|webmaster)@/i.test(e)) return null;
  return e;
}

// The one to write to, and why. Null when nothing on the page can be adopted
// without a person confirming it, which is a real and useful answer.
export function choosePrimary(candidates = []) {
  const safe = candidates.filter((c) => adoptable(c.association));
  if (!safe.length) {
    return {
      primary: null,
      reason: candidates.length
        ? 'Addresses were found, but none of them can be shown to belong to this business.'
        : 'No address on the page.',
      needsHuman: candidates.length > 0,
    };
  }
  const first = safe[0];
  return {
    primary: first,
    reason: first.association === ASSOCIATION.SAME_DOMAIN
      ? `At their own domain, found as a ${first.method}.`
      : `A personal inbox they published on their own site, found as a ${first.method}.`,
    needsHuman: false,
  };
}
