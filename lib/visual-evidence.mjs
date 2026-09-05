// What kind of looking proved this, and what kind of looking a claim needs.
//
// LTB already had an evidence model, and it answers a different question.
// lib/evidence.mjs sorts by WHO learned something — Ary, a probe, or a guess
// parsed out of prose. That is the right axis for trust. It is the wrong axis
// for this, because a headless browser measuring `getBoundingClientRect()` and
// a person seeing the page are both "verified" under it, and they are not the
// same kind of knowledge at all.
//
// Three kinds of looking:
//
//   TECHNICAL  the source, the markup, the headers, the network. Proves what
//              a page CONTAINS.
//   RENDERED   a browser ran the scripts and then measured the result. Proves
//              what EXISTS after hydration, and what a widget did.
//   VISUAL     somebody or something looked at a picture of the page. The only
//              thing that proves what a visitor SEES.
//
// The rule, and the whole reason this file exists:
//
//   > A claim about what a visitor sees cannot be proved by measuring the DOM.
//
// This is not theoretical. `actionAboveFold` counts elements whose bounding box
// sits above the fold and whose text matches a list of call-to-action words,
// and the audit says "there is nothing up there to click" when that count is
// zero. findings.mjs records what that cost: "three separate videos told owners
// there was nothing up there to click while a Book button sat on screen."
// Rendered geometry is a good place to look. It is not proof of what was seen.

import { FRESH_DAYS } from './site-intel.mjs';

export const EVIDENCE = {
  TECHNICAL: 'technical',
  RENDERED: 'rendered',
  VISUAL: 'visual',
};

// Strength, for "is this at least as good as required". Deliberately ordered
// rather than compared by name, so a new tier slots in without touching every
// caller.
export const EVIDENCE_RANK = {
  [EVIDENCE.TECHNICAL]: 0,
  [EVIDENCE.RENDERED]: 1,
  [EVIDENCE.VISUAL]: 2,
};

export const CLAIM = {
  // "The page has no contact form." Provable from markup.
  TECHNICAL_FACT: 'technical-fact',
  // "The booking widget never loads." Needs a browser, not a picture.
  RENDERED_FACT: 'rendered-fact',
  // "The booking button is buried." Needs a picture.
  VISUAL_UX: 'visual-ux',
  // The same, where the claim is specifically about a phone.
  MOBILE_VISUAL_UX: 'mobile-visual-ux',
};

export const REQUIRES = {
  [CLAIM.TECHNICAL_FACT]: EVIDENCE.TECHNICAL,
  [CLAIM.RENDERED_FACT]: EVIDENCE.RENDERED,
  [CLAIM.VISUAL_UX]: EVIDENCE.VISUAL,
  [CLAIM.MOBILE_VISUAL_UX]: EVIDENCE.VISUAL,
};

export const VIEWPORT = { DESKTOP: 'desktop', MOBILE: 'mobile' };

// How old a picture may be and still support fresh outreach.
//
// This is the product's existing answer to "how long is a look at a website
// worth trusting", not a new one. `FRESH_DAYS` has been 14 since site-intel was
// written and ten callers already read it through `isFresh`.
//
// The first version of this file said 10, with a plausible-sounding argument
// that a redesign invalidates a screenshot more completely than it invalidates
// "the form posts to /contact". That argument was made up on the spot to
// justify a number nobody had chosen. Worse, it was incoherent: a screenshot is
// captured in the same probe run as the findings, so at 10 days the proof would
// expire four days before the finding it proves, and a claim would go quietly
// unsupported while still reading fresh everywhere else.
//
// One threshold, one place. If it should be shorter for pictures, that is a
// product decision with a reason, and it belongs in site-intel where the rest
// of the freshness policy lives.
export { FRESH_DAYS as VISUAL_FRESH_DAYS } from './site-intel.mjs';

// Which claim each of the probe's finding keys is making.
//
// Anything absent from this map is treated as VISUAL_UX — the strictest
// reading. A new check added to the render service therefore cannot quietly
// become an outreach claim without somebody deciding what proves it, which is
// the failure mode this whole file exists to prevent.
export const CLAIM_FOR_KEY = {
  // ── Provable from the markup or the response ────────────────────────────
  'insecure': CLAIM.TECHNICAL_FACT,
  'mixed-content': CLAIM.TECHNICAL_FACT,
  'noindex': CLAIM.TECHNICAL_FACT,
  'no-title': CLAIM.TECHNICAL_FACT,
  'default-title': CLAIM.TECHNICAL_FACT,
  'no-meta-description': CLAIM.TECHNICAL_FACT,
  'no-h1': CLAIM.TECHNICAL_FACT,
  'no-link-preview': CLAIM.TECHNICAL_FACT,
  'no-local-schema': CLAIM.TECHNICAL_FACT,
  'viewport': CLAIM.TECHNICAL_FACT,
  'mailto-form': CLAIM.TECHNICAL_FACT,
  'form': CLAIM.TECHNICAL_FACT,
  'form-on-contact-page': CLAIM.TECHNICAL_FACT,
  'form-email-only': CLAIM.TECHNICAL_FACT,
  'form-offpage': CLAIM.TECHNICAL_FACT,
  'contact-page-email-only': CLAIM.TECHNICAL_FACT,
  'contact-page-no-form': CLAIM.TECHNICAL_FACT,
  'no-contact': CLAIM.TECHNICAL_FACT,
  'no-address': CLAIM.TECHNICAL_FACT,
  'no-hours': CLAIM.TECHNICAL_FACT,
  'phone': CLAIM.TECHNICAL_FACT,
  'phone-only': CLAIM.TECHNICAL_FACT,
  'phone-not-tappable': CLAIM.TECHNICAL_FACT,
  'phone-mismatch': CLAIM.TECHNICAL_FACT,
  'bad-email': CLAIM.TECHNICAL_FACT,
  'stale-copyright': CLAIM.TECHNICAL_FACT,
  'expired-date': CLAIM.TECHNICAL_FACT,
  'ancient-markup': CLAIM.TECHNICAL_FACT,
  'stale-stack': CLAIM.TECHNICAL_FACT,
  'on-ghl': CLAIM.TECHNICAL_FACT,
  'followup-tool': CLAIM.TECHNICAL_FACT,
  'no-reply-promise': CLAIM.TECHNICAL_FACT,
  'no-reviews': CLAIM.TECHNICAL_FACT,
  'lead-magnet-open': CLAIM.TECHNICAL_FACT,
  'two-schedulers': CLAIM.TECHNICAL_FACT,
  'booking': CLAIM.TECHNICAL_FACT,
  'booking-behind-login': CLAIM.TECHNICAL_FACT,
  // Keys the app's playbooks and evidence rules use, which the render service
  // emits from its own push sites rather than through add(). Missing these was
  // caught by the outreach tests: the conservative default sent `form-broken`
  // to VISUAL and a genuinely technical finding lost its angle.
  'form-broken': CLAIM.TECHNICAL_FACT,
  'captcha-broken': CLAIM.TECHNICAL_FACT,
  'booking-is-a-form': CLAIM.TECHNICAL_FACT,
  'quote-form-thin': CLAIM.TECHNICAL_FACT,

  // ── Needs the scripts to have run ───────────────────────────────────────
  'dead-links': CLAIM.RENDERED_FACT,
  'dead-link-one': CLAIM.RENDERED_FACT,
  'nav-dead-link': CLAIM.RENDERED_FACT,
  'dead-image-host': CLAIM.RENDERED_FACT,
  'broken-images': CLAIM.RENDERED_FACT,
  'calendar-not-loading': CLAIM.RENDERED_FACT,
  'map-not-loading': CLAIM.RENDERED_FACT,
  'social-feed-dead': CLAIM.RENDERED_FACT,
  'social-stub': CLAIM.RENDERED_FACT,
  'console-errors': CLAIM.RENDERED_FACT,
  'booking-unknown': CLAIM.RENDERED_FACT,
  'slow': CLAIM.RENDERED_FACT,
  'sluggish': CLAIM.RENDERED_FACT,
  'placeholder-text': CLAIM.RENDERED_FACT,
  'dead-feed': CLAIM.RENDERED_FACT,

  // ── Claims about what a visitor sees ────────────────────────────────────
  //
  // `cta` is the one that has actually misfired. It is measured from geometry
  // and it asserts prominence, which geometry cannot settle.
  'cta': CLAIM.VISUAL_UX,
  'ctas-collapse': CLAIM.VISUAL_UX,
  'long-form': CLAIM.VISUAL_UX,
  'mobile-overflow': CLAIM.MOBILE_VISUAL_UX,
};

export const claimFor = (key) => CLAIM_FOR_KEY[String(key || '')] || CLAIM.VISUAL_UX;

// Words that make a claim a statement about a phone, whatever its key says.
const MOBILE_WORDS = /\b(mobile|phone|tap|tappable|thumb|small screen|handset|portrait)\b/i;
export const soundsMobile = (text) => MOBILE_WORDS.test(String(text || ''));

const day = (v) => String(v || '').slice(0, 10);

function samePage(a, b) {
  try {
    const x = new URL(String(a));
    const y = new URL(String(b));
    // Host and path. A query string is not a different page for this purpose,
    // and a trailing slash is not either.
    const strip = (p) => p.replace(/\/+$/, '') || '/';
    return x.host.toLowerCase() === y.host.toLowerCase() && strip(x.pathname) === strip(y.pathname);
  } catch {
    return false;
  }
}

function ageDays(at, now) {
  const t = Date.parse(String(at || '').replace(' ', 'T'));
  if (!Number.isFinite(t)) return Infinity;
  return Math.max(0, (now.getTime() - t) / 86400000);
}

// Can this claim be said out loud?
//
// Deterministic, and it never falls back to yes. Every rejection names itself
// so the shadow report can say what was thrown away and why, rather than a
// claim quietly vanishing between the audit and the email.
export function validateClaim(claim = {}, evidence = [], { now = new Date() } = {}) {
  const category = claim.category || claimFor(claim.key);
  const wantsMobile = category === CLAIM.MOBILE_VISUAL_UX || soundsMobile(claim.text);
  const required = REQUIRES[category] || EVIDENCE.VISUAL;
  const no = (reason) => ({ ok: false, category, required, reason });

  if (!claim.url) return no('the claim does not say which page it is about');

  const candidates = (evidence || []).filter((e) => e && EVIDENCE_RANK[e.tier] >= EVIDENCE_RANK[required]);
  if (!candidates.length) {
    return no(required === EVIDENCE.VISUAL
      ? 'a claim about what a visitor sees needs a picture of the page, and there is none'
      : `nothing of tier ${required} or better supports it`);
  }

  // The picture has to be of the page the claim is about. A screenshot of the
  // home page does not prove anything about /contact.
  const onPage = candidates.filter((e) => samePage(e.url, claim.url));
  if (!onPage.length) return no('the evidence is from a different page than the claim');

  // A page that showed a consent wall or a bot challenge was never seen, so
  // nothing about its appearance can be asserted from it.
  const usable = onPage.filter((e) => !e.blocked);
  if (!usable.length) return no('the page was blocked or showed a challenge, so nobody has seen it');

  const fresh = usable.filter((e) => required !== EVIDENCE.VISUAL || ageDays(e.capturedAt, now) <= FRESH_DAYS);
  if (!fresh.length) return no(`the picture is older than ${FRESH_DAYS} days`);

  let usableNow = fresh;
  if (wantsMobile) {
    usableNow = fresh.filter((e) => e.viewport === VIEWPORT.MOBILE);
    if (!usableNow.length) return no('a claim about the phone layout needs the page captured on a phone viewport');
  }

  // A picture is necessary and not sufficient.
  //
  // The screenshot proves the page was seen. Whether what the rule believes is
  // actually in it is a separate question, and it is the one that catches the
  // failure this exists for: the geometry said there was nothing to click, and
  // a Book button was on screen. So a visual claim also needs a verdict from
  // looking at that picture which supports it — never merely the existence of
  // the picture.
  if (required === EVIDENCE.VISUAL) {
    const key = claim.key || category;
    const backed = usableNow.filter((e) => Array.isArray(e.supportsKeys) && e.supportsKeys.includes(key));
    if (!backed.length) {
      // Three different failures, and they are worth telling apart. "We looked
      // and it is not there" is a refutation and the claim was wrong. "We
      // looked and could not tell" is a failed check and the claim is merely
      // unproven. "Nobody looked" is a gap in the run. Collapsing them into one
      // sentence would hide the first, which is the one worth knowing about.
      const unclear = usableNow.some((e) => Array.isArray(e.unclearKeys) && e.unclearKeys.includes(key));
      if (unclear) return no('the screenshot was looked at and could not settle it');
      const looked = usableNow.some((e) => Array.isArray(e.supportsKeys));
      return no(looked
        ? 'the screenshot was looked at and does not show what the claim says'
        : 'the screenshot has not been checked against this claim');
    }
    return { ok: true, category, required, evidence: backed };
  }

  return { ok: true, category, required, evidence: usableNow };
}

// Everything a writer is allowed to say, and everything it is not.
//
// Returns both halves on purpose. A rejected claim that simply disappears is
// indistinguishable from a claim nobody made, and the difference is the whole
// point of the exercise.
export function partitionClaims(claims = [], evidence = [], { now = new Date() } = {}) {
  const allowed = [];
  const rejected = [];
  for (const claim of claims) {
    const verdict = validateClaim(claim, evidence, { now });
    if (verdict.ok) allowed.push({ ...claim, category: verdict.category, evidence: verdict.evidence });
    else rejected.push({ ...claim, category: verdict.category, required: verdict.required, why: verdict.reason });
  }
  return { allowed, rejected };
}

// Does this prospect's reason to be contacted survive without the pictures?
//
// Used by the Strong path. A prospect may absolutely still be Strong on
// technical grounds — a lead magnet that downloads with no email capture, a
// booking page returning 404 — and may not be Strong on the strength of a
// visual claim nobody verified.
export function supportedReasons(claims = [], evidence = [], opts = {}) {
  return partitionClaims(claims, evidence, opts).allowed;
}
