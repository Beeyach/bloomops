// Can this workspace actually help with the problem we found?
//
// A verified problem is not automatically a reason to email somebody. If the
// site check finds a broken image gallery and the workspace sells booking and
// follow-up systems, then the finding is real, the outreach angle is not, and
// the honest answer is "real issue, not our offer".
//
// Before this existed the product would have written that email, because
// "verified finding" and "reason to make contact" were the same thing in code.
// They are two different questions and this file holds the second one.
//
// The rule that keeps it safe: fit NEVER creates eligibility. Wanting to work
// with therapists cannot turn "no evidence" into Strong, and preferring video
// cannot turn a cosmetic finding into something worth recording. Fit can only
// ever narrow, or break a tie between angles that already qualified.

import { PLAYBOOK } from './playbooks.mjs';

export const FIT = {
  IN_SCOPE: 'IN_SCOPE',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  // No offer configured. Everything is allowed through rather than nothing:
  // a workspace that has not told us what it sells should not silently stop
  // producing outreach.
  UNKNOWN: 'UNKNOWN',
};

// What a workspace can help with, as capability tags. Deliberately a small
// closed vocabulary: this is matched against an offer written in prose, and a
// long list of near-synonyms produces confident nonsense.
export const CAPABILITY = {
  LEAD_CAPTURE: 'lead-capture',   // forms, enquiries, contact paths
  BOOKING: 'booking',             // calendars, appointments, scheduling
  FOLLOW_UP: 'follow-up',         // reminders, nurture, reactivation
  WEBSITE_BUILD: 'website-build', // pages, layout, mobile, broken things
  SEO: 'seo',                     // search visibility
  ECOMMERCE: 'ecommerce',         // carts, checkout, payments
};

// Which capability each angle draws on. An angle whose capability the
// workspace does not have is a real problem somebody else should fix.
export const PLAYBOOK_NEEDS = {
  [PLAYBOOK.LEAD_CAPTURE_GAP]: CAPABILITY.LEAD_CAPTURE,
  [PLAYBOOK.FORM_FRICTION]: CAPABILITY.LEAD_CAPTURE,
  [PLAYBOOK.BOOKING_FRICTION]: CAPABILITY.BOOKING,
  [PLAYBOOK.BROKEN_PATH]: CAPABILITY.WEBSITE_BUILD,
  [PLAYBOOK.MOBILE_FRICTION]: CAPABILITY.WEBSITE_BUILD,
  [PLAYBOOK.TRUST_GAP]: CAPABILITY.WEBSITE_BUILD,
  // Ary saw it herself and knows whether it is her kind of problem. Second
  // -guessing her judgement from a prose offer would be the tail wagging.
  [PLAYBOOK.OWN_FINDING]: null,
  // Engagement is about them, not about a service.
  [PLAYBOOK.RECENT_SIGNAL]: null,
};

const PATTERNS = [
  [CAPABILITY.LEAD_CAPTURE, /\b(form|forms|enquir|inquir|lead capture|leads?|contact path|intake|capture)\b/i],
  [CAPABILITY.BOOKING, /\b(book|booking|bookings|calendar|appointment|schedul|reservation)\b/i],
  [CAPABILITY.FOLLOW_UP, /\b(follow[- ]?up|reminder|nurture|reactivat|re-?engag|drip|sequence)\b/i],
  [CAPABILITY.WEBSITE_BUILD, /\b(website build|web design|redesign|landing page|site build|rebuild|web ?site design)\b/i],
  [CAPABILITY.SEO, /\b(seo|search engine|ranking|google ranking|search visibility)\b/i],
  [CAPABILITY.ECOMMERCE, /\b(ecommerce|e-commerce|checkout|cart|online store|shopify|payments?)\b/i],
];

// Reads the capabilities out of what the workspace says it sells.
//
// Prose in, tags out. Ary's offer reads "fixes the form, booking, reminders,
// and follow-up path so every inquiry gets answered, booked, or brought back",
// which yields lead-capture, booking and follow-up, and notably not website
// rebuilds or SEO.
export function capabilitiesOf(settings = {}) {
  const text = [settings.offer, settings.positioning, settings.audience]
    .filter(Boolean).join(' ');
  if (!text.trim()) return { known: false, capabilities: new Set() };
  const caps = new Set();
  for (const [cap, re] of PATTERNS) {
    if (re.test(text)) caps.add(cap);
  }
  return { known: caps.size > 0, capabilities: caps, from: text.slice(0, 200) };
}

// Is this angle something the workspace can legitimately help with?
export function fitForPlaybook(playbookId, settings = {}) {
  const needed = PLAYBOOK_NEEDS[playbookId];
  // Angles that do not depend on a service are always in scope.
  if (needed === null || needed === undefined) {
    return { fit: FIT.IN_SCOPE, reason: null, capability: null };
  }
  const { known, capabilities } = capabilitiesOf(settings);
  if (!known) {
    // Nothing configured. Allowing everything through is the safer default:
    // a workspace that has not filled in its offer should still get outreach,
    // and the alternative is a product that silently stops working.
    return { fit: FIT.UNKNOWN, reason: 'No offer is configured, so nothing was filtered out.', capability: needed };
  }
  if (capabilities.has(needed)) {
    return { fit: FIT.IN_SCOPE, reason: null, capability: needed };
  }
  return {
    fit: FIT.OUT_OF_SCOPE,
    capability: needed,
    reason: `Real problem, but it is a ${needed.replace('-', ' ')} job and this workspace does not sell that.`,
  };
}

// Does Ary work with businesses like this one?
//
// Advisory only, and deliberately so. It is returned alongside the verdict for
// a person to read; it is never allowed to change whether evidence exists.
// "Ary wants therapists" must never turn "nothing verified" into Strong.
export function audienceFit(p = {}, settings = {}) {
  const audience = String(settings.audience || '').trim();
  if (!audience) return { known: false };
  const terms = audience.toLowerCase().split(/[,;/]|\band\b/).map((s) => s.trim()).filter((s) => s.length > 2);
  const hay = [p.niche, p.business_name, p.info, p.audit_notes].filter(Boolean).join(' ').toLowerCase();
  if (!hay) return { known: true, match: null, note: 'Nothing on the record says what they do.' };
  // Singular/plural tolerance, nothing cleverer. A stemmer here would produce
  // confident matches on words that merely rhyme.
  const hit = terms.find((t) => hay.includes(t) || hay.includes(t.replace(/s$/, '')) || hay.includes(`${t}s`));
  return hit
    ? { known: true, match: hit, note: `Looks like ${hit}, which is who this workspace works with.` }
    : { known: true, match: null, note: 'Not obviously the kind of business this workspace named.' };
}
