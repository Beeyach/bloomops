// Should this prospect get an expensive asset?
//
// Two separate questions, deliberately. A PDF and a video are not two sizes of
// the same thing: the prospect-pdf skill is explicit that the video shows what
// is broken and the PDF is the offer page, that they ride different emails,
// and that neither mentions the other. Stacking both on a Strong lead because
// both generators exist is how a 200-credit video goes to somebody who has not
// answered an email yet.
//
// Deterministic on purpose. Every input below is a fact already on the record,
// so the answer can be explained in a sentence and argued with. An opaque
// score cannot be either.

import { evidenceStrength, collectEvidence, SUFFICIENCY } from './evidence.mjs';
import { parseSiteIntel, isFresh } from './site-intel.mjs';
import { PLAYBOOK } from './playbooks.mjs';

export const PDF = { RECOMMENDED: 'PDF_RECOMMENDED', OPTIONAL: 'PDF_OPTIONAL', NO: 'NO_PDF' };
export const VIDEO = { RECOMMENDED: 'VIDEO_RECOMMENDED', OPTIONAL: 'VIDEO_OPTIONAL', NONE: 'EMAIL_ONLY' };

// Reason codes, so a decision can be counted and argued with rather than only
// read. The sentence is for a person; the code is for us.
export const WHY = {
  MULTIPLE_VISUAL_FINDINGS: 'MULTIPLE_VISUAL_FINDINGS',
  SUPPORTING_CONTEXT_USEFUL: 'SUPPORTING_CONTEXT_USEFUL',
  EMAIL_ALREADY_SUFFICIENT: 'EMAIL_ALREADY_SUFFICIENT',
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT_EVIDENCE',
  CURRENT_ASSET_EXISTS: 'CURRENT_ASSET_EXISTS',
  NO_VERIFIED_ANGLE: 'NO_VERIFIED_ANGLE',
  NOT_PRICEABLE: 'NOT_PRICEABLE',
  DEMONSTRATION_ADDS_VALUE: 'DEMONSTRATION_ADDS_VALUE',
  NOTHING_TO_SHOW: 'NOTHING_TO_SHOW',
  SITE_UNREADABLE: 'SITE_UNREADABLE',
  ONE_VISUAL_ONLY: 'ONE_VISUAL_ONLY',
  EVIDENCE_STALE: 'EVIDENCE_STALE',
};

// Findings a person can be shown rather than told about. The distinction the
// video decision turns on: "your booking is a request form" is worth ninety
// seconds of screen; "no meta description" is worth half a sentence.
const VISUAL_KEYS = new Set([
  'form-broken', 'captcha-broken', 'booking-is-a-form', 'calendar-not-loading',
  'two-schedulers', 'dead-links', 'nav-dead-link', 'broken-images',
  'dead-image-host', 'dead-feed', 'mobile-overflow', 'long-form', 'quote-form-thin',
]);

// Playbooks whose whole argument is visual. From the skill's own angle notes.
const VISUAL_PLAYBOOKS = new Set([
  PLAYBOOK.LEAD_CAPTURE_GAP, PLAYBOOK.BOOKING_FRICTION,
  PLAYBOOK.BROKEN_PATH, PLAYBOOK.MOBILE_FRICTION,
]);

// The ratings that mean "worth something", as the table actually stores them:
// emoji, not numbers. Green is her strong yes, blue a softer keep. Everything
// else is a rejection and must never earn the most expensive asset.
export const RATED_GOOD = new Set(['💚', '💙']);

const say = (decision, why, reason, extra = {}) => ({ decision, why, reason, ...extra });

// "1 things worth showing" is what a person reads before deciding whether to
// spend two hundred credits.
const count = (n) => `${n} thing${n === 1 ? '' : 's'}`;

// The PDF is the Email 5 offer page: proof we looked, one step worth fixing,
// one best-fit starting point. Its eligibility follows from that job.
export function pdfDecision(p = {}, { now = new Date(), evidence = null, playbookId = null } = {}) {
  const ev = evidence || collectEvidence(p, { now });
  const strength = evidenceStrength(ev);

  // Already has one. Regenerating costs money and replaces a link that may
  // already be in an email somebody received.
  // OUR asset, not theirs. `review_url` is the page this product generated and
  // may already have emailed, at file.gobloomwired.com/review/{slug}. The
  // reason used to read "they already have a review page", which sounds like
  // their testimonials and made the rule look like it was treating a
  // prospect's own reviews as a substitute for our note. It never was, but a
  // reason nobody can read is a reason nobody can check.
  if (p.review_url) {
    return say(PDF.NO, WHY.CURRENT_ASSET_EXISTS, 'We have already made them one, and the link may already be in an email.');
  }
  if (playbookId === PLAYBOOK.NONE) {
    return say(PDF.NO, WHY.NO_VERIFIED_ANGLE, 'There is no verified angle, so there is nothing to put on a page.');
  }
  // The skill's job list starts with "name the one public-facing step worth
  // fixing". Without a material finding there is no step to name.
  if (strength.level === SUFFICIENCY.NONE || strength.level === SUFFICIENCY.THIN) {
    return say(PDF.NO, WHY.INSUFFICIENT_EVIDENCE, 'Not enough verified material for a page that says anything.');
  }
  // A one-page note needs more than the email already carries, or it is the
  // email again with a border.
  if (strength.strong === 1) {
    return say(PDF.OPTIONAL, WHY.EMAIL_ALREADY_SUFFICIENT, 'One finding. The email already explains it, so a page would mostly repeat it.', { findings: strength.strong });
  }
  // Country drives the currency, and the skill forbids unpriced offers.
  if (!p.country) {
    return say(PDF.OPTIONAL, WHY.NOT_PRICEABLE, 'Enough to say, but no country on the record, so the offer cannot be priced correctly.', { findings: strength.strong });
  }
  return say(PDF.RECOMMENDED, WHY.SUPPORTING_CONTEXT_USEFUL, `${strength.strong} verified findings and a country to price against, which is enough for a page that adds something.`, { findings: strength.strong });
}

// Video is the most expensive thing the product can make, so its rules are the
// strictest, and none of them is "the prospect looks good".
export function videoDecision(p = {}, { now = new Date(), evidence = null, playbookId = null } = {}) {
  const ev = evidence || collectEvidence(p, { now });
  const strength = evidenceStrength(ev);
  const intel = parseSiteIntel(p.site_intel);

  if (p.video_url) {
    return say(VIDEO.NONE, WHY.CURRENT_ASSET_EXISTS, 'A video already exists for them.');
  }
  if (playbookId === PLAYBOOK.NONE) {
    return say(VIDEO.NONE, WHY.NO_VERIFIED_ANGLE, 'There is no verified angle, so there is nothing to record.');
  }
  // The probe's own verdict, when it made one. It looked at the page; this
  // did not. A walkthrough of a page we could not read is guesswork.
  if (intel?.blocked) {
    return say(VIDEO.NONE, WHY.SITE_UNREADABLE, 'Their site could not be read properly, so a walkthrough would be guesswork.');
  }
  // Evidence that has aged out. Recording a video about a form that was fixed
  // three weeks ago is the most expensive way to be wrong.
  // `now` and not the wall clock. Every other check in this function reads the
  // injected time; this one defaulted to `new Date()`, so a decision replayed
  // against a past moment used that moment for the evidence and today for the
  // staleness. It also made the suite a time bomb: fixtures a day apart went
  // red once real time drifted past the freshness window.
  if (intel && !isFresh(intel, { now })) {
    return say(VIDEO.NONE, WHY.EVIDENCE_STALE, 'The site check is old enough that it should be redone before recording anything.');
  }
  if (strength.level !== SUFFICIENCY.STRONG) {
    return say(VIDEO.NONE, WHY.INSUFFICIENT_EVIDENCE, 'Ninety seconds of video needs more than one verified thing to point at.', { findings: strength.strong });
  }

  const visual = ev.filter((e) => e.key && VISUAL_KEYS.has(e.key));
  if (!visual.length) {
    return say(VIDEO.NONE, WHY.NOTHING_TO_SHOW, 'The findings are real but there is nothing to show on screen. This is an email.');
  }

  // The question this decision exists to answer is whether SEEING it beats
  // reading it. That is a property of the evidence, not of the prospect.
  //
  // An earlier version let a green rating carry a single visual finding all
  // the way to recommended, which is the rating deciding rather than
  // informing: one thing to point at is a sentence, and paying two hundred
  // credits to say it out loud is the "reaching" video the findings rules
  // were written to prevent.
  const demonstrable = visual.length >= 2 && VISUAL_PLAYBOOKS.has(playbookId);
  const liked = RATED_GOOD.has(String(p.rating || ''));

  if (demonstrable) {
    return say(
      VIDEO.RECOMMENDED, WHY.MULTIPLE_VISUAL_FINDINGS,
      `${count(visual.length)} to show, and the angle is one people understand faster on screen${liked ? `. You rated them ${p.rating}` : ''}.`,
      { visual: visual.length, rated: liked }
    );
  }

  // One visual finding, or a visual finding on a non-visual angle. Worth
  // offering, never worth spending automatically. The rating raises it to the
  // top of what she is offered; it does not decide for her.
  return say(
    VIDEO.OPTIONAL,
    visual.length === 1 ? WHY.ONE_VISUAL_ONLY : WHY.DEMONSTRATION_ADDS_VALUE,
    visual.length === 1
      ? `Only ${count(visual.length)} to show, which the email can say in a sentence${liked ? `, though you did rate them ${p.rating}` : ''}.`
      : 'Showable, but the angle does not depend on seeing it.',
    { visual: visual.length, rated: liked }
  );
}

// What the optional next asset would cost, so a person approving one is not
// guessing.
//
// Video is a range on purpose. It is narration plus render and it varies with
// the number of findings; quoting a single number would be precision the
// measurement does not support.
export function assetCostEstimate({ pdf, video }, prices = {}) {
  const out = {};
  if (pdf === PDF.RECOMMENDED || pdf === PDF.OPTIONAL) {
    // Rendered locally by the skill. No vendor cost, so no credits.
    out.pdf = { credits: 0, note: 'No credit cost. It is rendered from findings we already have.' };
  }
  if (video === VIDEO.RECOMMENDED || video === VIDEO.OPTIONAL) {
    const v = Number(prices.video) || 200;
    out.video = { credits: v, low: v, high: Math.round(v * 1.25), note: 'Narration and render. The upper end is a long one with several findings.' };
  }
  return out;
}
