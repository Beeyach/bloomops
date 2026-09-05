// May we contact this person, and how hard do we pursue them.
//
// Two questions that V1 answered with one number, which is why "good prospect"
// and "worth spending on" kept getting confused.
//
//   STRONG   is a gate. Four tests, all required, evaluated after verification.
//   BAND     is an ordering. P1 / P2 / P3, assigned only once Strong is true.
//
// A prospect can be Strong and P3. A prospect can be rated 💚 and never reach
// Strong at all. Keeping them apart is what stops a rating from becoming
// evidence, which is the one thing a rating must never be.

import { SUFFICIENCY } from './evidence.mjs';

export const PRIORITY = { P1: 'P1', P2: 'P2', P3: 'P3' };

export const RATING = { GREEN: '💚', BLUE: '💙', WILT: '🥀', CROSS: '✖️' };

// Strategy V3 (2026-08-28). Each touch a DIFFERENT angle built from the
// prospect's audit facts. The top band earns four touches, the middle three,
// and a prospect already judged a no gets one email and an answer.
//
// Rotation: E1 pain + micro-offer, E2 specific fix sketch, E3 video,
// E4 short breakup. See lib/email-angles.mjs for the angle constants.
export const TOUCHES = { [PRIORITY.P1]: 4, [PRIORITY.P2]: 3, [PRIORITY.P3]: 1 };

// Days after the FIRST send. P1 widens to 16 days total, P2 to 12.
export const SPACING = { [PRIORITY.P1]: [0, 4, 9, 16], [PRIORITY.P2]: [0, 5, 12], [PRIORITY.P3]: [0] };

export const STRONG_TEST = {
  FIT: 'FIT',
  CONTACT_REASON: 'LEGITIMATE_CONTACT_REASON',
  IN_SCOPE: 'IN_SCOPE_OPPORTUNITY',
  EVIDENCE: 'SUFFICIENT_EVIDENCE',
};

const ENOUGH = new Set([SUFFICIENCY.SUFFICIENT, SUFFICIENCY.STRONG]);

// The four-part gate.
//
// FIT is business fit, and deliberately not "can they pay".
//
// The website-audit skill phrases its tie-breaker that way and the first draft
// of this copied it. That phrasing invites the system to guess at somebody's
// finances from their website, their prices or their neighbourhood, which is
// both wrong and none of our business. Ability to pay disqualifies only when
// somebody said so, or when the entity structurally is not a buyer, and that
// arrives here as an explicit flag rather than as an inference.
export function strongGate({
  fit = null,
  contactReason = null,
  inScope = null,
  sufficiency = null,
  explicitCannotPay = false,
} = {}) {
  const failed = [];
  const passed = [];

  const check = (name, ok) => (ok ? passed.push(name) : failed.push(name));

  check(STRONG_TEST.FIT, Boolean(fit) && !explicitCannotPay);
  check(STRONG_TEST.CONTACT_REASON, Boolean(contactReason));
  check(STRONG_TEST.IN_SCOPE, Boolean(inScope));
  check(STRONG_TEST.EVIDENCE, ENOUGH.has(String(sufficiency || '')));

  return {
    strong: failed.length === 0,
    passed,
    failed,
    reason: failed.length === 0
      ? 'Fit, a real reason to write, something we can help with, and evidence that holds.'
      : `Not Strong: ${failed.join(', ')}.`,
  };
}

// The band, which only exists once Strong is true.
//
// `provisional` is the honest part. Preparation runs overnight and Ary rates at
// approval, so most packages are written before anybody has judged the
// prospect. That is fine, but a P2 nobody looked at and a P2 Ary deliberately
// left neutral are different facts, and analysis six months from now needs to
// tell them apart.
export function bandFor(p = {}, { strong = null } = {}) {
  if (strong === false) return { band: null, provisional: false, reason: 'Not Strong, so there is no band.' };

  const rating = String(p.rating || '').trim();
  if (rating === RATING.GREEN) {
    return { band: PRIORITY.P1, provisional: false, reason: 'Rated 💚, which carries 19 of 21 interested replies.' };
  }
  if (rating === RATING.CROSS) {
    return { band: PRIORITY.P3, provisional: false, reason: 'Rated ✖️, which predicts a decline 14 times more often than interest.' };
  }
  if (!rating) {
    return { band: PRIORITY.P2, provisional: true, reason: 'Not rated yet, so the default applies until somebody looks.' };
  }
  return { band: PRIORITY.P2, provisional: false, reason: `Rated ${rating}, which is neither a push nor a stop.` };
}

// How many cold emails this prospect may ever receive.
//
// The single source of truth. Everything that sends reads this rather than
// carrying its own idea of a sequence, which is how V1 ended up sending six
// emails from a five-email template.
export function allowedTouches(band) {
  return TOUCHES[band] ?? 0;
}

// The most cold emails anybody may ever receive, whatever their band. Derived
// from the band table rather than typed again, so raising a ceiling raises this
// with it.
export const HARD_TOUCH_CEILING = Math.max(...Object.values(TOUCHES));

// The band that actually governs this prospect right now.
//
// `priority_band` is only ever written when an outreach package is approved
// (see approval.mjs), and almost nothing has been through that path: the column
// was empty on all 5,813 production rows. Reading it alone meant the P1/P2/P3
// ceilings governed nobody, while the rating that decides the band was sitting
// on the same row the whole time.
//
// So the stored value is used when it exists, and otherwise the band is derived
// from the rating. Same answer either way: approval derives the stored band
// from the rating too.
export function effectiveBand(p = {}, { strong = null } = {}) {
  const stored = String(p?.priority_band || '').trim();
  if (stored && TOUCHES[stored] != null) {
    return {
      band: stored,
      provisional: Boolean(p?.band_was_provisional),
      source: 'stored',
      reason: `Set to ${stored} when the outreach was approved.`,
    };
  }
  return { ...bandFor(p, { strong }), source: 'rating' };
}

// How many cold emails this prospect may receive, all things considered.
//
// A real rating gives a real ceiling. Anything else falls back to the hard
// ceiling, and the provisional case is the one that matters: an unrated
// prospect is defaulted to P2, and P2 allows two. Ending somebody's sequence a
// touch early on a placeholder that means "nobody has looked yet" is a decision
// made from an absence of information, so it is not made.
export function effectiveCeiling(p = {}, opts = {}) {
  const { band, provisional } = effectiveBand(p, opts);
  return band && !provisional ? allowedTouches(band) : HARD_TOUCH_CEILING;
}

// The whole answer for one prospect, in one call.
export function priorityFor(p = {}, gate = {}) {
  const strong = strongGate(gate);
  const band = bandFor(p, { strong: strong.strong });
  return {
    ...strong,
    band: band.band,
    bandProvisional: band.provisional,
    bandReason: band.reason,
    allowedTouches: allowedTouches(band.band),
    spacing: SPACING[band.band] || [],
  };
}

// May this prospect receive a cold email at step N?
//
// Step is 1-indexed, matching send_events.sequence_step. Step 5 and beyond are
// never routine automation. They remain available as a deliberate manual
// override on a named prospect, which is what `manualOverride` is.
export function maySendStep(band, step, { manualOverride = false } = {}) {
  const n = Number(step);
  if (!Number.isFinite(n) || n < 1) return { ok: false, reason: 'Not a sequence step.' };
  if (!band) return { ok: false, reason: 'No band, so nothing is allowed.' };
  const max = allowedTouches(band);
  if (n <= max) return { ok: true, max };
  if (manualOverride) return { ok: true, max, override: true, reason: 'Allowed as a manual override on this prospect.' };
  return {
    ok: false,
    max,
    reason: `${band} allows ${max} cold ${max === 1 ? 'email' : 'emails'}. Step ${n} would be past that.`,
  };
}

// The date a step is due, from the band's spacing and the first send.
export function dueDateFor(band, step, firstSentAt) {
  const gaps = SPACING[band];
  const n = Number(step);
  if (!gaps || !Number.isFinite(n) || n < 1 || n > gaps.length) return null;
  const t = Date.parse(String(firstSentAt || '').replace(' ', 'T'));
  if (!Number.isFinite(t)) return null;
  return new Date(t + gaps[n - 1] * 86400000).toISOString().slice(0, 10);
}
