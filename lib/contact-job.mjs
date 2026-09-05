// Finding a way to contact a business, from its own public website.
//
// The pilot that preceded this found addresses for 14 of 50 prospects and half
// of them belonged to somebody else. The fix was ownership classification, and
// this file is the second half of it: a bounded crawl, and the context rule
// that decides whether an address on a page is actually THEIRS.
//
// The rule that does most of the work: a free-provider address is only the
// owner's when the page says so. `jane@gmail.com` inside a stylesheet comment
// and `jane@gmail.com` under "Email me:" are the same string and completely
// different facts, and the first version of this treated them identically.
//
// Nothing here is paid. One page fetch, up to three more if the first does not
// answer, and a hard stop either way.

import { associate, adoptable, ASSOCIATION, CONFIDENCE } from './contact-discovery.mjs';

export const PAGE_BUDGET = 4;          // homepage plus three
export const FETCH_TIMEOUT_MS = 8000;
export const JOB_TIMEOUT_MS = 30_000;

// What the search concluded. "We looked and there is nothing" and "we could
// not look" are different facts and must never collapse.
export const RESULT = {
  SAFE_EMAIL: 'SAFE_EMAIL',
  UNKNOWN_EMAIL: 'UNKNOWN_EMAIL',        // found, ownership unproven, reviewable
  OTHER_CONTACT_ONLY: 'OTHER_CONTACT_ONLY',
  NO_CONTACT_FOUND: 'NO_CONTACT_FOUND',
  FETCH_FAILED: 'FETCH_FAILED',
  SITE_DEAD: 'SITE_DEAD',
  BLOCKED: 'BLOCKED',
  TIMEOUT: 'TIMEOUT',
};

// A finished search that found nothing is worth remembering for a long time; a
// technical failure is worth retrying soon. The site has to change before the
// first answer changes, and the network only has to behave before the second.
export const REFRESH_DAYS = { found: 180, none: 90, failed: 3 };

export const CONTACT_TYPE = {
  EMAIL: 'EMAIL', PHONE: 'PHONE', FORM: 'FORM',
  LINKEDIN: 'LINKEDIN', INSTAGRAM: 'INSTAGRAM', FACEBOOK: 'FACEBOOK',
};

// ── Page content ─────────────────────────────────────────────────────────

// Everything that is not visible page content. An address inside a script, a
// stylesheet or an HTML comment was not published to a visitor, and the whole
// third-party problem lives in exactly these three places.
export function visibleHtml(html) {
  return String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
}

// Words that mean "this is how you reach this business". Checked in the text
// around an address, not on the page as a whole: every page has the word
// "contact" somewhere.
// The trailing words are optional AND so is the space before them: "Contact:"
// is the most common contact heading there is, and requiring "contact us"
// missed every page that used a colon.
const OWNER_CONTEXT = /\b(e-?mail(?:\s+(?:me|us|her|him|at))?|contact(?:\s+(?:me|us|details?|info))?|reach(?:\s+(?:me|us|out))?|get in touch|enquir|inquir|book|owner|founder|director|principal|practitioner|therapist|coach|proprietor|say hello|drop (?:me|us) a line)\b/i;

// Words that mean somebody else's address is nearby.
const THIRD_PARTY_CONTEXT = /\b(designed|developed|built|powered|hosted|template|theme|licen[cs]e|copyright|all rights reserved|web ?design|web ?development|photography by|font|typeface|agency|credits?)\b/i;

const PERSON_NEAR = /\b([A-Z][a-z]{2,}\s+[A-Z][a-z]{2,})\b/;

// The text around a match, with tags removed, for judging context.
export function contextAround(text, index, radius = 260) {
  const start = Math.max(0, index - radius);
  const raw = text.slice(start, Math.min(text.length, index + radius));
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Does the page actually associate this address with this business?
//
// Required before a free-provider address is adopted. Without it, a designer's
// personal Gmail in a footer credit is indistinguishable from the owner's.
export function ownerContext(snippet) {
  if (THIRD_PARTY_CONTEXT.test(snippet)) {
    return { strong: false, why: 'The words around it credit a designer, a licence or a vendor.' };
  }
  if (OWNER_CONTEXT.test(snippet)) {
    const person = snippet.match(PERSON_NEAR);
    return {
      strong: true,
      why: person ? `Published beside ${person[1]} as a contact.` : 'Published as the way to contact them.',
      personName: person ? person[1] : null,
    };
  }
  return { strong: false, why: 'Nothing on the page ties it to this business.' };
}


// schema.org contact data, which lives inside a <script> tag and is the one
// kind of script content that IS published contact information.
//
// Stripping every script was right for the third-party problem and wrong here:
// a business that puts its address in JSON-LD is asserting ownership of it as
// deliberately as printing it in the footer. The pilot lost a good address
// this way before the gap was noticed.
export function structuredEmails(html) {
  const out = [];
  for (const m of String(html || '').matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    walk(data, out);
  }
  return [...new Set(out)];
}

function walk(node, out, depth = 0) {
  if (!node || depth > 6) return;
  if (Array.isArray(node)) { for (const n of node) walk(n, out, depth + 1); return; }
  if (typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (/^email$/i.test(k) && typeof v === 'string') out.push(v.replace(/^mailto:/i, '').trim());
    else walk(v, out, depth + 1);
  }
}

const DEOBFUSCATE = (s) => String(s || '')
  .replace(/\s*[[(]\s*at\s*[\])]\s*/gi, '@')
  .replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, '.');

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

// Every address on one page, each with where it was and what surrounded it.
export function candidatesOnPage(html, { domain, url, pageType = 'homepage' }) {
  const text = DEOBFUSCATE(visibleHtml(html));
  const out = [];
  const seen = new Set();

  const add = (value, method, index) => {
    const e = String(value || '').trim().toLowerCase().replace(/[.,;:)>\]]+$/, '');
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e) || e.length > 100) return;
    if (/^[0-9a-f]{16,}@/.test(e)) return;
    if (/^(your-?email|email|name|user|someone|noreply|no-reply|donotreply|do-not-reply|postmaster|abuse|privacy|dpo|webmaster|sentry)@/i.test(e)) return;
    if (seen.has(e)) return;
    seen.add(e);

    const rel = associate(e, domain);
    if (rel.junk) {
      out.push({ value: e, contactType: CONTACT_TYPE.EMAIL, relationship: ASSOCIATION.THIRD_PARTY, adopted: false, rejectionReason: rel.why, method, sourceUrl: url, sourcePageType: pageType });
      return;
    }

    // A structured-data address carries its own context: the business declared
    // it as its own email in machine-readable form.
    const structured = index < 0;
    const snippet = structured
      ? 'Published as the contact for this business in structured data.'
      : contextAround(text, index);
    const ctx = structured
      ? { strong: true, why: 'Declared as their contact in the structured data on their page.', personName: null }
      : ownerContext(snippet);

    // Same-domain needs no context: an address at their own domain is theirs
    // by construction. Everything else has to be earned from the page.
    let relationship = rel.association;
    let why = rel.why;
    if (relationship === ASSOCIATION.OWNER_EXTERNAL && !ctx.strong) {
      relationship = ASSOCIATION.UNKNOWN;
      why = `A personal address, but ${ctx.why.toLowerCase()}`;
    } else if (relationship === ASSOCIATION.UNKNOWN && ctx.strong) {
      // A platform-hosted site that clearly presents this as its contact.
      relationship = ASSOCIATION.OWNER_EXTERNAL;
      why = ctx.why;
    } else if (relationship === ASSOCIATION.OWNER_EXTERNAL) {
      why = ctx.why;
    }

    out.push({
      value: e,
      contactType: CONTACT_TYPE.EMAIL,
      relationship,
      personName: ctx.personName || null,
      method,
      sourceUrl: url,
      sourcePageType: pageType,
      contextSnippet: snippet.slice(0, 200),
      confidence: adoptable(relationship) ? CONFIDENCE.SOURCE_CONFIRMED : CONFIDENCE.FOUND,
      adopted: false,
      why,
    });
  };

  // Structured data first: it is the strongest ownership claim a page can
  // make, and it needs no surrounding prose to be believed.
  for (const e of structuredEmails(html)) add(e, 'structured data', -1);
  for (const m of text.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    let v = m[1];
    try { v = decodeURIComponent(v); } catch {}
    add(v, 'mailto link', m.index);
  }
  for (const m of text.matchAll(EMAIL_RE)) add(m[0], 'page text', m.index);

  return out;
}

// Phone, form and social. A prospect with no email and a working contact form
// is not uncontactable, and filing them as such is how a real business gets
// dropped for a formatting decision.
export function otherContactsOnPage(html, { url, pageType = 'homepage' }) {
  const text = visibleHtml(html);
  const out = [];
  const push = (contactType, value, method) =>
    out.push({ value, contactType, method, sourceUrl: url, sourcePageType: pageType, relationship: ASSOCIATION.SAME_DOMAIN, adopted: false });

  for (const m of text.matchAll(/tel:([+\d][\d\s().-]{6,20})/gi)) {
    push(CONTACT_TYPE.PHONE, m[1].replace(/[\s().-]/g, ''), 'tel link');
  }
  if (/<form[^>]*>[\s\S]{0,4000}?(<input|<textarea)/i.test(text)) {
    push(CONTACT_TYPE.FORM, url, 'form on page');
  }
  const socials = [
    [CONTACT_TYPE.LINKEDIN, /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(?:company|in)\/[a-z0-9_%-]+/gi],
    [CONTACT_TYPE.INSTAGRAM, /https?:\/\/(?:www\.)?instagram\.com\/[a-z0-9_.]{2,30}/gi],
    [CONTACT_TYPE.FACEBOOK, /https?:\/\/(?:www\.)?facebook\.com\/[a-z0-9_.-]{3,50}/gi],
  ];
  for (const [type, re] of socials) {
    const first = text.match(re);
    if (first) push(type, first[0].split('?')[0], 'link on page');
  }
  return out;
}

// ── Bounded page discovery ───────────────────────────────────────────────

const CONTACT_WORDS = /\b(contact|about|team|meet|staff|connect|get in touch|our story|who we are)\b/i;

// Real internal links whose text or href suggests contact information.
// Deliberately links the site actually has rather than guessed paths: guessing
// produces a burst of 404s on somebody's small business hosting.
export function contactLinks(html, baseUrl, limit = PAGE_BUDGET - 1) {
  let base;
  try { base = new URL(baseUrl); } catch { return []; }
  const seen = new Set();
  const scored = [];

  for (const m of visibleHtml(html).matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]{0,120}?)<\/a>/gi)) {
    const href = m[1];
    const label = m[2].replace(/<[^>]+>/g, ' ').trim();
    if (/^(mailto:|tel:|javascript:|#)/i.test(href)) continue;
    let url;
    try { url = new URL(href, base); } catch { continue; }
    if (url.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
    url.hash = '';
    const clean = url.toString();
    if (clean === base.toString() || seen.has(clean)) continue;

    const path = url.pathname.toLowerCase();
    const hitsLabel = CONTACT_WORDS.test(label);
    const hitsPath = CONTACT_WORDS.test(path);
    if (!hitsLabel && !hitsPath) continue;
    seen.add(clean);
    // A link that says "Contact" beats one that merely lives at /about.
    scored.push({ url: clean, pageType: pageTypeOf(path, label), score: (hitsLabel ? 2 : 0) + (hitsPath ? 1 : 0) + (/contact/i.test(path + label) ? 2 : 0) });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

function pageTypeOf(path, label) {
  const s = `${path} ${label}`.toLowerCase();
  if (/contact|connect|get in touch/.test(s)) return 'contact';
  if (/team|staff|meet/.test(s)) return 'team';
  if (/about|our story|who we are/.test(s)) return 'about';
  return 'other';
}

// ── The search ───────────────────────────────────────────────────────────

// One prospect, start to finish. `fetchPage` is injected so this is testable
// without a network and so the caller owns the timeout policy.
export async function discoverContact(prospect, { fetchPage, now = new Date(), pageBudget = PAGE_BUDGET } = {}) {
  const domain = String(prospect?.domain || '').trim();
  const started = Date.now();
  const base = { prospectId: prospect?.id ?? null, searchedAt: now.toISOString(), pagesChecked: 0, candidates: [], other: [] };

  if (!domain) return { ...base, result: RESULT.FETCH_FAILED, detail: 'No website on the record.' };

  const homeUrl = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  const pages = [{ url: homeUrl, pageType: 'homepage' }];
  const visited = new Set();
  const candidates = [];
  const other = [];
  let anyFetched = false;
  let firstFailure = null;

  while (pages.length && base.pagesChecked < pageBudget) {
    if (Date.now() - started > JOB_TIMEOUT_MS) break;
    const page = pages.shift();
    if (visited.has(page.url)) continue;
    visited.add(page.url);

    const res = await fetchPage(page.url).catch((e) => ({ ok: false, error: String(e?.message || e) }));
    base.pagesChecked += 1;

    if (!res?.ok || !res.html) {
      if (!firstFailure) firstFailure = classifyFailure(res);
      continue;
    }
    anyFetched = true;

    candidates.push(...candidatesOnPage(res.html, { domain, url: page.url, pageType: page.pageType }));
    other.push(...otherContactsOnPage(res.html, { url: page.url, pageType: page.pageType }));

    // Only look further if nothing safe has turned up yet. A homepage with the
    // owner's address on it does not need the contact page fetched.
    const safeYet = candidates.some((c) => adoptable(c.relationship));
    if (!safeYet && page.pageType === 'homepage') {
      for (const link of contactLinks(res.html, page.url, pageBudget - 1)) {
        if (!visited.has(link.url)) pages.push(link);
      }
    }
    if (safeYet) break;
  }

  if (!anyFetched) {
    return { ...base, candidates, other, result: firstFailure || RESULT.FETCH_FAILED, detail: 'Could not read any page on their site.' };
  }

  // Deduplicate across pages, keeping the strongest classification of each.
  const merged = dedupe(candidates);
  const safe = merged.filter((c) => adoptable(c.relationship));
  const unknown = merged.filter((c) => c.relationship === ASSOCIATION.UNKNOWN);
  const otherMerged = dedupe(other);

  const primary = pickPrimary(safe);
  if (primary) primary.adopted = true;

  const result = primary ? RESULT.SAFE_EMAIL
    : unknown.length ? RESULT.UNKNOWN_EMAIL
      : otherMerged.length ? RESULT.OTHER_CONTACT_ONLY
        : RESULT.NO_CONTACT_FOUND;

  return {
    ...base,
    candidates: merged,
    other: otherMerged,
    primary: primary || null,
    primaryReason: primary ? reasonFor(primary) : null,
    result,
    durationMs: Date.now() - started,
  };
}

function classifyFailure(res) {
  const status = res?.status;
  if (res?.error && /timeout|abort/i.test(res.error)) return RESULT.TIMEOUT;
  if (status === 403 || status === 429) return RESULT.BLOCKED;
  if (status === 404 || status === 410) return RESULT.SITE_DEAD;
  return RESULT.FETCH_FAILED;
}

function dedupe(list) {
  const rank = { [ASSOCIATION.SAME_DOMAIN]: 0, [ASSOCIATION.OWNER_EXTERNAL]: 1, [ASSOCIATION.UNKNOWN]: 2, [ASSOCIATION.THIRD_PARTY]: 3 };
  const by = new Map();
  for (const c of list) {
    const key = `${c.contactType}|${c.value}`;
    const prev = by.get(key);
    if (!prev || (rank[c.relationship] ?? 9) < (rank[prev.relationship] ?? 9)) by.set(key, c);
  }
  return [...by.values()].sort((a, b) => (rank[a.relationship] ?? 9) - (rank[b.relationship] ?? 9));
}

// Confidence first, not prestige. For one person running a massage practice,
// info@ is where they read their email, and preferring a named address on
// principle would pass over the inbox they actually check.
function pickPrimary(safe) {
  if (!safe.length) return null;
  const score = (c) => (
    (c.relationship === ASSOCIATION.SAME_DOMAIN ? 0 : 2)
    + (c.method === 'mailto link' ? 0 : 1)
    + (c.sourcePageType === 'contact' ? 0 : 1)
    + (c.personName ? 0 : 1)
  );
  return [...safe].sort((a, b) => score(a) - score(b))[0];
}

function reasonFor(c) {
  const where = c.sourcePageType === 'homepage' ? 'their homepage' : `their ${c.sourcePageType} page`;
  // "found as a structured data" is what a naive template produced. The
  // article belongs to the method, not to the sentence around it.
  const how = c.method === 'structured data' ? 'in structured data' : `as a ${c.method}`;
  return c.relationship === ASSOCIATION.SAME_DOMAIN
    ? `At their own domain, found ${how} on ${where}.`
    : `${c.why} Found ${how} on ${where}.`;
}

// When this prospect may be searched again.
export function nextRefresh(result, searchedAt) {
  const days = result === RESULT.SAFE_EMAIL ? REFRESH_DAYS.found
    : [RESULT.FETCH_FAILED, RESULT.TIMEOUT, RESULT.BLOCKED].includes(result) ? REFRESH_DAYS.failed
      : REFRESH_DAYS.none;
  const t = Date.parse(searchedAt);
  return Number.isFinite(t) ? new Date(t + days * 86400000).toISOString() : null;
}

// One short line for the activity feed. No crawler internals.
export function activityLine(r) {
  switch (r.result) {
    case RESULT.SAFE_EMAIL:
      return `Found ${r.primary.value} on ${r.primary.sourcePageType === 'homepage' ? 'their homepage' : `their ${r.primary.sourcePageType} page`}. Contact set, prospecting resumed.`;
    case RESULT.UNKNOWN_EMAIL:
      return `Found an address but could not confirm it belongs to them. Held for your review.`;
    case RESULT.OTHER_CONTACT_ONLY: {
      const kinds = [...new Set(r.other.map((o) => o.contactType.toLowerCase()))].join(' and ');
      return `No email after checking ${r.pagesChecked} page${r.pagesChecked === 1 ? '' : 's'}, but there is a ${kinds}.`;
    }
    case RESULT.NO_CONTACT_FOUND:
      return `No contact details found after checking ${r.pagesChecked} page${r.pagesChecked === 1 ? '' : 's'}.`;
    case RESULT.SITE_DEAD: return 'Contact search could not run: their site is gone.';
    case RESULT.BLOCKED: return 'Contact search could not run: their site blocked us.';
    case RESULT.TIMEOUT: return 'Contact search could not run: their site did not respond in time.';
    default: return 'Contact search could not run.';
  }
}
