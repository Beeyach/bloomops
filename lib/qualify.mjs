// Qualification rules recovered from the website-audit skill.
//
// These were learned by doing the work, some of them the hard way, and the app
// did not know any of them. They lived only in a prompt that a model read at
// audit time, which meant the tracker could reach a completely different
// conclusion about the same prospect and nothing would notice.
//
// What is here is PRODUCT-GENERAL: rules about evidence, about what a platform
// implies, about what may not be asserted. What is deliberately NOT here is
// Ary's voice, her prices, her offer names and her niche preferences. Those
// are workspace configuration, and hardcoding them is the thing that would
// make this impossible to sell to anybody else later.
//
// Source of truth: this file, for anything a machine decides. The skill keeps
// the parts that need a model's judgement and should read these rules rather
// than restating them. See SKILLS-PRODUCT-MAP.md.

// ── DEAD vs SKIP ─────────────────────────────────────────────────────────
// The distinction the app never had. A skip is a judgement about the
// prospect: looked at them, they do not fit. DEAD says only that this address
// is not their site, so the business may be perfectly good somewhere else and
// the row is worth revisiting by hand rather than burying.
//
// This runs before anything scores, and the reason is written in the skill in
// blood: a blank page has no form, no booking, no CTA and no contact details,
// so it scores as the most gap-ridden site in the batch and comes out STRONG.
// milesstovall.com got a ninety-second video narrating an empty page that way.
export const PARKING_MARKERS = [
  'lander_system', 'ap:"parking"', 'sedoparking', 'parkingcrew', 'bodis',
  'afternic', 'dan.com', 'hugedomains', 'domain is for sale',
  'this domain is for sale', 'future home of', 'buy this domain',
];

export const PLACEHOLDER_MARKERS = [
  'coming soon', 'under construction', 'site is under construction',
  'welcome to nginx', 'apache2 ubuntu default page', 'it works!',
  'default web site page', 'account suspended', 'this site is temporarily unavailable',
];

// Returns { dead: true, reason, marker } or { dead: false }.
// `html` may be a fetched page body; `status` the HTTP status if known.
export function deadAddressCheck({ html = '', status = null, resolved = true } = {}) {
  if (!resolved) return { dead: true, reason: 'The domain does not resolve.', marker: 'dns' };
  if (status != null && status >= 400) {
    return { dead: true, reason: `The address answers HTTP ${status}.`, marker: `http-${status}` };
  }
  const hay = String(html || '').toLowerCase();
  for (const m of PARKING_MARKERS) {
    if (hay.includes(m)) return { dead: true, reason: 'That domain is parked or for sale.', marker: m };
  }
  for (const m of PLACEHOLDER_MARKERS) {
    if (hay.includes(m)) return { dead: true, reason: 'That is a placeholder or default page, not their site.', marker: m };
  }
  // A page with almost no text and no navigation.
  const text = hay.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (hay && text.length < 200 && !/<nav|<header|role="navigation"/.test(hay)) {
    return { dead: true, reason: 'That page has essentially nothing on it.', marker: 'empty' };
  }
  return { dead: false };
}

// ── Platform implications ────────────────────────────────────────────────
// What a detected platform says about whether there is anything to sell.
// Recovered from the skill's platform skip rules, which the app had none of.
//
// Three outcomes, and the middle one is the important one: a platform is a
// reason to look harder, never an automatic answer.
export const PLATFORM_VERDICT = {
  // Full practice-management suites. The owner already feels covered, and
  // usually is. Lean skip unless something verifiable says otherwise.
  'simplepractice': 'covered', 'therapynotes': 'covered', 'clientsecure': 'covered',
  'dentrix': 'covered', 'open dental': 'covered', 'eaglesoft': 'covered',
  'chirotouch': 'covered', 'jane': 'covered', 'janeapp': 'covered',
  'boulevard': 'covered',
  // Booking tools that do booking well and nothing around it. Never a skip:
  // the whole offer is what is missing around them.
  'calendly': 'build-around', 'acuity': 'build-around', 'square': 'build-around',
  'massagebook': 'build-around', 'vagaro': 'build-around', 'mindbody': 'build-around',
  'momence': 'build-around', 'mangomint': 'build-around',
  // Site builders. Say nothing either way about fit.
  'wix': 'neutral', 'squarespace': 'neutral', 'wordpress': 'neutral',
  'webflow': 'neutral', 'kajabi': 'neutral', 'shopify': 'neutral',
  // The one that needs the work/doesn't-work check rather than a verdict.
  'gohighlevel': 'inspect', 'ghl': 'inspect',
};

// Longest key first, because these are substring matches and the short ones
// are inside the long ones. "Squarespace" contains "square", so an unsorted
// pass classified a site builder as a booking tool and told the operator not
// to pitch against a product the prospect does not use.
const PLATFORM_KEYS = Object.keys(PLATFORM_VERDICT).sort((a, b) => b.length - a.length);

export function platformVerdict(platform) {
  const p = String(platform || '').toLowerCase().trim();
  if (!p) return { verdict: 'unknown', reason: 'No platform detected.' };
  for (const key of PLATFORM_KEYS) {
    const verdict = PLATFORM_VERDICT[key];
    if (p.includes(key)) {
      return {
        verdict,
        platform: key,
        reason: {
          covered: `They are on ${key}, which handles most of this already. Lean skip unless something verifiable says otherwise.`,
          'build-around': `They are on ${key}. That is a booking tool, not a system, so the opportunity is whatever is missing around it. Never pitch against the tool.`,
          neutral: `Built on ${key}. That says nothing about whether they need anything.`,
          inspect: `They are on ${key}. Never skip on sight: if it is broken or half-finished they are the strongest kind of prospect, because they already bought the platform.`,
        }[verdict],
      };
    }
  }
  return { verdict: 'unknown', platform: p, reason: `${platform} is not a platform with a known implication.` };
}

// ── Manual scheduling control ────────────────────────────────────────────
// The rule that contradicted what this app was doing.
//
// The tracker treated "no booking system" as a straightforward fit signal.
// The skill is explicit that it often is not: plenty of practitioners skip
// online booking deliberately, to screen clients before committing time. For
// them a missing calendar is a decision, not a gap, and pitching it as a
// problem tells them immediately that nobody actually looked.
export function schedulingStance({ hasBooking, hasForm, html = '' } = {}) {
  if (hasBooking === true) {
    return { stance: 'has-booking', deliberate: false, note: 'They already take bookings online.' };
  }
  if (hasBooking !== false) {
    return { stance: 'unknown', deliberate: false, note: 'Nobody has checked whether they take bookings.' };
  }
  const hay = String(html || '').toLowerCase();
  const screening = /request an appointment|request a consultation|enquiry form|inquiry form|application|screening|intake form|see if we.{0,15}a good fit|book a discovery/i.test(hay);
  if (screening || hasForm === true) {
    return {
      stance: 'manual-by-choice',
      deliberate: true,
      note: 'No online calendar, but the site asks people to request an appointment. That is usually a choice: they screen before committing time.',
      // How to talk about it without insulting the decision.
      angle: 'Not "you are missing booking". The angle is tidying the request-to-approval loop while they keep control: an instant acknowledgement, a faster notification, approve or decline from a phone, confirmations and reminders once approved.',
    };
  }
  return {
    stance: 'no-booking',
    deliberate: false,
    note: 'No booking and no obvious request path.',
  };
}

// ── The tie-breaker ──────────────────────────────────────────────────────
// The skill's whole qualification, in one sentence: can they pay, and is
// there a real gap you can verify from the public site? Both yes → strong.
// Reaching to justify it → skip.
export function tieBreaker({ canPay, verifiableGap } = {}) {
  if (canPay && verifiableGap) return { verdict: 'STRONG', why: 'They can pay and there is a gap that was actually verified.' };
  if (!canPay && !verifiableGap) return { verdict: 'SKIP', why: 'No sign they can pay, and nothing verified to point at.' };
  if (!canPay) return { verdict: 'SKIP', why: 'There is a gap, but nothing suggests they can pay for the fix.' };
  return { verdict: 'SKIP', why: 'They could probably pay, but nothing has been verified to raise with them. Reaching to justify it is a skip.' };
}

// ── Claims that may never be made ────────────────────────────────────────
// Learned twice from real pushback: two owners had the invisible part handled
// and both corrected the same sentence. Anything invisible from outside the
// site is never a finding, only a question, and the question puts the limit on
// us rather than the fault on them.
export const NEVER_ASSERT = [
  'what a visitor sees after submitting a form',
  'whether an auto-reply exists',
  'whether the owner is notified',
  'how fast they respond',
  'who reads the inbox',
  'whether anybody follows up',
  'what their visitors think, feel or expect',
];

export const UNVERIFIED_ABSENCE_RULES = `UNVERIFIED ABSENCE (learned from two owners who pushed back on exactly this):
- Anything invisible from outside the site is NEVER a finding. Not a defect, not a warning, not a headline. It may only appear as a question, and the sentence puts the limit on us: "From the outside I can't see what someone gets after submitting. You'd know in ten seconds."
- Every question about what happens after a form carries the already-handled out, early and not buried: "If you already have an instant reply set up, this part's done."
- No invented visitor moments. Never "most people filling out a form at night expect something back by morning", never "requests that never hear back". We never observed their visitors.
- Benefit copy may not smuggle the accusation. "You get a notification with their details on your phone" is fine. "Requests stop sitting in the inbox" asserts they currently do, and is not.`;
