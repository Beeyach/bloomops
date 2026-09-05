// May we spend money looking at this prospect's site, and is there any left?
//
// These are two questions and an early draft asked them as one. That version
// put "budget allows it" inside the eligibility test and then parked whatever
// failed the test, which would have permanently buried good prospects on the
// days the daily allowance happened to run out.
//
// The same mistake had a second form, caught in stabilization: a missing email
// address was being answered with NOT_ELIGIBLE, which reads as a judgement
// about the prospect. It is not. It is a prerequisite nobody has satisfied yet.
//
// So this module answers with three separable facts:
//
//   mayRun   may verification spend money right now
//   parks    is this a decision ABOUT THE PROSPECT that stops the pipeline
//   waits    will this resolve on its own, without anybody doing anything
//
// Only genuine semantic refusals park. Everything else is a prerequisite, and
// prerequisites are recoverable by definition.
//
// The other thing this module fixes is a circular dependency. Strong requires
// sufficient evidence, verification is what produces sufficient evidence, and
// an earlier draft only allowed verification for prospects that were already
// Strong. Nothing could ever qualify. Verification is gated on eligibility,
// never on Strong, and Strong is evaluated afterwards.

import { CONTACT_STATE, contactStateOf } from './contact-state.mjs';
import { parseSiteIntel, isFresh } from './site-intel.mjs';

export const VERIFICATION = {
  ELIGIBLE: 'ELIGIBLE',
  // A decision about the prospect. This is the only state that parks.
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  // Prerequisites. Recoverable, and never a judgement.
  WAITING_FOR_CONTACT: 'WAITING_FOR_CONTACT',
  WAITING_FOR_BUDGET: 'WAITING_FOR_BUDGET',
  // Allowed to continue, just never with paid research behind it.
  RESEARCH_PROHIBITED: 'RESEARCH_PROHIBITED',
  VERIFIED: 'VERIFIED',
  REUSED: 'REUSED',                 // fresh intel already answered the question
};

export const INELIGIBLE = {
  PRESCREEN_FAILED: 'prescreen-failed',
  NO_FIT: 'no-fit',
  NOTHING_TO_VERIFY: 'nothing-to-verify',
  NO_SITE: 'no-site',
};

// Reasons that are NOT judgements. Kept in their own object so a caller
// reaching for INELIGIBLE.NO_CONTACT finds nothing and has to notice.
export const BLOCKED = {
  NO_CONTACT: 'no-contact',
  CONTACT_BROKEN: 'contact-broken',
  PAID_RESEARCH_PROHIBITED: 'paid-research-prohibited',
};

// States where the prospect is waiting on something rather than being refused.
export const RECOVERABLE = new Set([
  VERIFICATION.WAITING_FOR_CONTACT,
  VERIFICATION.WAITING_FOR_BUDGET,
  VERIFICATION.RESEARCH_PROHIBITED,
]);

const CROSS = '✖️';

// A rating known BEFORE preparation, which is the only kind that can govern
// spend. A rating applied at approval arrives after the money is gone.
export const knownRating = (p = {}) => String(p.rating || '').trim() || null;

// Is paid verification permitted for this prospect under policy?
//
// One rule today: a prospect Ary has already marked with a cross never earns
// paid research. Population evidence is that they reply at 23% and 14 of 21 of
// those replies are declines. Buying research to write a better email to
// somebody who will say no is the clearest waste in the funnel.
//
// This does not stop them being pursued. They still get their one touch, and
// they can still reach Strong on evidence somebody already has.
export function paidResearchPermitted(p = {}) {
  return knownRating(p) !== CROSS;
}

// The semantic test: is this prospect, on the merits, worth verifying.
//
// Contactability is deliberately NOT here. A prospect with no address may be
// perfectly worth verifying; we simply cannot act on it yet, which is a
// different sentence and belongs in `verificationDecision`.
export function eligibleForVerification(p = {}, { prescreenOk = true, fitPlausible = true, hasCandidateReason = null } = {}) {
  const no = (reason, detail) => ({ eligible: false, state: VERIFICATION.NOT_ELIGIBLE, reason, detail });

  if (!prescreenOk) return no(INELIGIBLE.PRESCREEN_FAILED, 'Prescreen disqualified them, so there is nothing to verify.');
  if (!fitPlausible) return no(INELIGIBLE.NO_FIT, 'Not plausibly the kind of business this workspace serves.');
  if (!p.domain && !p.website) return no(INELIGIBLE.NO_SITE, 'No site to verify.');

  // Something worth checking. `hasCandidateReason` is supplied by the caller
  // from signals or thin evidence; null means "the caller did not look", which
  // is treated as worth a look rather than as an absence.
  if (hasCandidateReason === false) {
    return no(INELIGIBLE.NOTHING_TO_VERIFY, 'Nothing was found that a probe could confirm or refute.');
  }

  return { eligible: true, state: VERIFICATION.ELIGIBLE, reason: null, detail: 'Allowed and appropriate to verify.' };
}

// Merits, then prerequisites, then money. Never merged.
//
// Returns `mayRun` (may we spend), `parks` (is this a judgement that stops the
// pipeline) and `waits` (will it resolve by itself). Only NOT_ELIGIBLE parks.
export function verificationDecision(p = {}, {
  prescreenOk = true,
  fitPlausible = true,
  hasCandidateReason = null,
  budgetRemaining = Infinity,
  cost = 1,
  now = new Date(),
} = {}) {
  // 1. Merits. A refusal here is a real judgement and it parks.
  const sem = eligibleForVerification(p, { prescreenOk, fitPlausible, hasCandidateReason });
  if (!sem.eligible) {
    return { ...sem, mayRun: false, shouldVerify: false, parks: true, waits: false, needsContact: false, recoverable: false };
  }

  // 2. Contactability. A prerequisite, recoverable, and never a judgement.
  //
  // Verifying a site we cannot follow up on buys nothing, so this still stops
  // the spend. What it must never do is read as "this prospect is bad".
  const contact = contactStateOf(p);
  if (contact === CONTACT_STATE.NONE || contact === CONTACT_STATE.NEEDS_CONTACT_RECOVERY) {
    return {
      eligible: true,
      state: VERIFICATION.WAITING_FOR_CONTACT,
      reason: contact === CONTACT_STATE.NONE ? BLOCKED.NO_CONTACT : BLOCKED.CONTACT_BROKEN,
      detail: contact === CONTACT_STATE.NONE
        ? 'No safe address yet. Worth verifying, but there is nobody to follow up with, so nothing is bought until discovery finds one.'
        : 'The address stopped working. Everything already established about them stands; outbound waits for a new safe contact.',
      mayRun: false,
      shouldVerify: false,
      // The whole point of this pass. A missing address is not a verdict.
      parks: false,
      waits: false,
      needsContact: true,
      recoverable: true,
      contactState: contact,
    };
  }

  // 3. Policy on paid research. Continues the prospect, just without spending.
  if (!paidResearchPermitted(p)) {
    return {
      eligible: true,
      state: VERIFICATION.RESEARCH_PROHIBITED,
      reason: BLOCKED.PAID_RESEARCH_PROHIBITED,
      detail: 'Rated as a no, so no money goes into researching them. They can still reach Strong on evidence we already have.',
      mayRun: false,
      shouldVerify: false,
      parks: false,
      waits: false,
      needsContact: false,
      recoverable: true,
    };
  }

  // 4. Free before paid: intel inside the freshness window answers the same
  // question for nothing.
  const intel = parseSiteIntel(p.site_intel);
  if (intel && isFresh(intel, { now })) {
    return {
      eligible: true,
      state: VERIFICATION.REUSED,
      reason: null,
      detail: 'Recent site intel already covers this. No spend needed.',
      mayRun: false,
      shouldVerify: false,
      parks: false,
      waits: false,
      needsContact: false,
      recoverable: false,
    };
  }

  // 5. Money. A decision about today, not about them.
  if (Number(budgetRemaining) < Number(cost)) {
    return {
      eligible: true,
      state: VERIFICATION.WAITING_FOR_BUDGET,
      reason: null,
      detail: 'Eligible and wanted, but today’s allowance is spent. This waits, it is not parked.',
      mayRun: false,
      shouldVerify: false,
      parks: false,
      waits: true,
      needsContact: false,
      recoverable: true,
    };
  }

  return { ...sem, mayRun: true, shouldVerify: true, parks: false, waits: false, needsContact: false, recoverable: false };
}

// The patch a decision writes back.
export function verificationPatch(decision, { at = null } = {}) {
  return {
    verification_state: decision.state,
    verification_reason: decision.reason || null,
    verification_state_at: at || new Date().toISOString().replace('T', ' ').slice(0, 19),
  };
}

// Prospects waiting only on money, oldest first, for the next run to pick up.
export function waitingForBudget(prospects = []) {
  return prospects
    .filter((p) => String(p.verification_state || '') === VERIFICATION.WAITING_FOR_BUDGET)
    .sort((a, b) => String(a.verification_state_at || '').localeCompare(String(b.verification_state_at || '')));
}

// Prospects waiting only on an address. These are the held bucket.
export function waitingForContact(prospects = []) {
  return prospects.filter((p) => {
    const c = contactStateOf(p);
    return c === CONTACT_STATE.NONE || c === CONTACT_STATE.NEEDS_CONTACT_RECOVERY;
  });
}

// Is this prospect parked because of a judgement, or merely waiting?
//
// Exposed so a UI never has to work it out from a reason string, which is how
// "no address" becomes "skipped" in somebody's head.
export const isParked = (state) => String(state || '') === VERIFICATION.NOT_ELIGIBLE;
export const isRecoverable = (state) => RECOVERABLE.has(String(state || ''));
