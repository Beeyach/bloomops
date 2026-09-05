// The outreach package: one coherent object rather than several disconnected
// AI outputs Ary had to trigger one at a time.
//
// The order matters and is deliberate. Eligibility, then evidence, then
// contact, then angle, then email — each step is allowed to stop the whole
// thing, and stopping is a result rather than a failure. The generator is the
// last and least important part: by the time it runs, every decision it could
// have got wrong has already been made from facts.

import { canProgressOutbound } from './outbound.mjs';
import { outcomeClaims } from './outcome-claims.mjs';
import { collectEvidence, evidenceStrength, evidenceBlock, knownUnknowns, SUFFICIENCY, TIER } from './evidence.mjs';
import { partitionClaims, EVIDENCE } from './visual-evidence.mjs';
import { selectPlaybook, PLAYBOOK } from './playbooks.mjs';
import { pdfDecision, videoDecision, assetCostEstimate, PDF, VIDEO } from './assets.mjs';
import { fitForPlaybook, audienceFit, capabilitiesOf } from './workspace-fit.mjs';
import { identity, contextFor, contextHash, TASK } from './hive-context.mjs';
import { PLAYBOOK_VERSION } from './playbooks.mjs';
import { strongGate, priorityFor } from './priority.mjs';

// Bumped when the prompt, the validator or the assembly order changes in a way
// that could plausibly change what a reviewer sees. Not for typos.
//
// The point is that "this generator writes bad emails" and "this generator
// used to write bad emails" must be different sentences six months from now.
export const GENERATOR_VERSION = 'outreach-2026-08-09.3';

// A short stable fingerprint. Enough to tell two versions apart, not enough to
// reconstruct the input, which is the correct amount for a traceability field.
export function shortHash(input) {
  const s = typeof input === 'string' ? input : JSON.stringify(input ?? '');
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 12);
}

export const STATUS = {
  PREPARING: 'PREPARING',
  READY: 'READY_FOR_APPROVAL',
  NEEDS_DECISION: 'NEEDS_DECISION',
  BLOCKED: 'BLOCKED',
  APPROVED: 'APPROVED',
  // Written by the send runner when a package's first email goes out. It had
  // no name here while four other places compared against it as a literal,
  // which is how `STATUS.SENT` came to be typed out and silently be undefined.
  SENT: 'SENT',
  STALE: 'STALE',
  SKIPPED: 'SKIPPED',
};

// Statuses a package can still be acted on from. Anything else is history.
export const LIVE = new Set([STATUS.PREPARING, STATUS.READY, STATUS.NEEDS_DECISION, STATUS.APPROVED]);

export const REVIEW = {
  APPROVED_UNCHANGED: 'APPROVED_UNCHANGED',
  EDITED: 'EDITED',
  REJECTED: 'REJECTED',
  SKIPPED_PROSPECT: 'SKIPPED_PROSPECT',
  RESEARCHED_MORE: 'RESEARCHED_MORE',
};

export const EDIT_REASON = ['TOO_GENERIC', 'WRONG_ANGLE', 'TOO_LONG', 'SOUNDS_AI', 'UNSAFE_CLAIM', 'BAD_CTA', 'TONE', 'OTHER'];

// May we prepare an outreach package for this prospect right now?
//
// A Strong qualification verdict says the business is worth writing to. It says
// nothing about whether a conversation is already happening, and the outbound
// engine remains authoritative over both.
export function canPrepare(p = {}, { now = new Date(), events = null, visualEvidence = [] } = {}) {
  const gate = canProgressOutbound(p, { now, events });
  // `NOT_DUE` is the one stop that does not apply here: preparing is not
  // sending, and preparing ahead of the date is the entire point.
  if (!gate.ok && gate.stop !== 'not-due') {
    return { ok: false, status: STATUS.BLOCKED, reason: gate.reason, stop: gate.stop };
  }
  if (!p.email) {
    return { ok: false, status: STATUS.BLOCKED, reason: 'There is no address to write to.', stop: 'no-contact' };
  }

  // Screened before strength is measured, not after.
  //
  // How much there is to say has to be counted from what can actually be said.
  // A prospect whose findings are three unprovable claims about how the page
  // looks has nothing to write about, and measuring strength on the unscreened
  // list would report it as well-evidenced and then hand the writer an empty
  // block.
  const screened = screenEvidence(collectEvidence(p, { now }), visualEvidence, { now, site: siteFor(p) });
  const evidence = screened.kept;
  const unsupported = screened.dropped;
  const strength = evidenceStrength(evidence);
  if (!strength.canPersonalise) {
    return {
      ok: false,
      status: STATUS.NEEDS_DECISION,
      reason: unsupported.length && !evidence.some((e) => e.key)
        ? 'Everything found about their site depends on how it looks, and no screenshot supports any of it.'
        : strength.cosmeticOnly
          ? 'Everything verified about them is cosmetic, which is not worth an email on its own.'
          : 'Nothing has been verified about them yet, so there is nothing true to say.',
      evidence,
      unsupported,
      strength,
    };
  }
  return { ok: true, evidence, unsupported, strength };
}

// Everything decided before a word is generated.
// Which page a finding is about.
//
// The probe records findings against the site it crawled, and evidence items
// carry that as their source. Without a page a visual claim cannot be validated
// at all, which is correct: a picture has to be OF something.
function siteFor(p = {}) {
  const d = String(p.domain || '').trim();
  if (!d) return null;
  return d.startsWith('http') ? d : `https://${d}`;
}

// Evidence, split into what can be proved and what cannot.
//
// Only findings that carry a probe key are screened. Ary's own manual notes and
// the inferred lines have no key and are left alone: she looked at the page
// herself, which is the strongest evidence in the system and the one thing a
// screenshot requirement should never override.
export function screenEvidence(evidence = [], visualEvidence = [], { now = new Date(), site = null } = {}) {
  const keyed = [];
  const unkeyed = [];
  for (const e of evidence) (e && e.key ? keyed : unkeyed).push(e);

  // The probe run is its own evidence, and forgetting that broke everything.
  //
  // A finding like "the contact form is broken" was learned by a browser
  // opening that page, so the run IS the rendered evidence for it. The first
  // version of this only supplied screenshots, so nothing of technical or
  // rendered tier existed in the list and every claim was rejected — including
  // the ones that need no picture at all. Caught by the outreach tests, which
  // is exactly what they are for.
  //
  // What this does NOT do is let the run stand in for a photograph. Rendered
  // tops out below visual, so a claim about what a visitor sees still finds
  // nothing here strong enough and still needs the picture.
  const fromRun = keyed.map((e) => ({
    tier: EVIDENCE.RENDERED,
    url: e.source || site,
    capturedAt: e.observedAt || null,
    blocked: false,
  }));

  const { allowed, rejected } = partitionClaims(
    keyed.map((e) => ({ key: e.key, text: e.text, url: e.source || site })),
    [...fromRun, ...visualEvidence],
    { now }
  );

  const ok = new Set(allowed.map((c) => c.key));
  return {
    kept: [...unkeyed, ...keyed.filter((e) => ok.has(e.key))],
    dropped: rejected.map((r) => ({ key: r.key, text: r.text, category: r.category, required: r.required, why: r.why })),
  };
}

export function planPackage(p = {}, {
  now = new Date(), events = null, prices = {}, settings = {},
  // Screenshots taken of this prospect's pages, already checked against the
  // findings they are meant to prove. Empty is the safe default and the honest
  // one: with no pictures, nothing that depends on appearance survives below.
  visualEvidence = [],
} = {}) {
  const eligible = canPrepare(p, { now, events, visualEvidence });
  if (!eligible.ok) return { ...eligible, playbook: null };

  // Already screened by canPrepare: what can be proved, and what was thrown
  // away with the reason. The ordering is the whole enforcement — a finding
  // that cannot be proved must never be selectable, because the chosen angle
  // is written into the system prompt as a sentence of its own and filtering
  // afterwards would leave it there with no evidence line underneath.
  const { evidence, strength } = eligible;
  const screened = { dropped: eligible.unsupported || [] };

  // Workspace capability is consulted here and nowhere earlier: a prospect is
  // eligible or not on evidence alone, and only then does it matter whether we
  // sell a fix for what was found.
  const chosen = selectPlaybook(p, { now, evidence, settings, fitForPlaybook });

  if (chosen.playbook.id === PLAYBOOK.NONE || chosen.playbook.id === PLAYBOOK.NOT_OUR_OFFER) {
    return {
      ok: false,
      status: STATUS.NEEDS_DECISION,
      reason: chosen.why,
      evidence, strength, playbook: chosen.playbook,
      fit: chosen.fit || null,
      alsoEligible: chosen.alsoConsidered || [],
      unsupported: screened.dropped,
    };
  }

  // Strategy V2: cold packages carry no asset.
  //
  // 465 prospects received a cold video and produced no attributed client; 607
  // received a cold PDF and produced no attributed client. Both comparisons are
  // confounded, so neither proves harm, but nothing supports the default
  // either, and both were being made for people who had already ignored two
  // emails. Assets are now fulfilment of an accepted offer, decided by
  // lib/asset-ladder.mjs after somebody says yes.
  //
  // The old decisions are still calculated, because "what would V1 have done"
  // is worth keeping visible while this beds in, but they are reported rather
  // than acted on.
  const wouldHavePdf = pdfDecision(p, { now, evidence, playbookId: chosen.playbook.id });
  const wouldHaveVideo = videoDecision(p, { now, evidence, playbookId: chosen.playbook.id });
  const COLD_ASSET = { decision: 'none', reason: 'Assets are fulfilment now. Nothing is made until they accept the offer.' };
  const pdf = COLD_ASSET;
  const video = COLD_ASSET;

  // The four-part gate, then the band, then how many emails that band allows.
  //
  // FIT here is workspace fit and playbook scope, never an inference about
  // whether somebody can afford us.
  const gate = strongGate({
    fit: chosen.fit !== 'NOT_OUR_OFFER',
    contactReason: Boolean(chosen.why),
    inScope: chosen.playbook.id !== PLAYBOOK.NOT_OUR_OFFER,
    sufficiency: strength.level,
    explicitCannotPay: p.cannot_pay === 1 || p.cannot_pay === true,
  });
  const priority = priorityFor(p, {
    fit: chosen.fit !== 'NOT_OUR_OFFER',
    contactReason: Boolean(chosen.why),
    inScope: chosen.playbook.id !== PLAYBOOK.NOT_OUR_OFFER,
    sufficiency: strength.level,
    explicitCannotPay: p.cannot_pay === 1 || p.cannot_pay === true,
  });

  return {
    ok: true,
    status: STATUS.PREPARING,
    evidence,
    // What could not be proved, and why. Never handed to the writer; carried so
    // the decision can be explained afterwards, and so a claim that was thrown
    // away is distinguishable from one nobody ever made.
    unsupported: screened.dropped,
    strength,
    strong: gate.strong,
    strongFailed: gate.failed,
    band: priority.band,
    bandProvisional: priority.bandProvisional,
    bandReason: priority.bandReason,
    allowedLength: priority.allowedTouches,
    spacing: priority.spacing,
    // Kept for the record, not acted on.
    wouldHaveSent: { pdf: wouldHavePdf.decision, video: wouldHaveVideo.decision },
    playbook: chosen.playbook,
    supporting: chosen.supporting,
    whyContact: chosen.why,
    contact: {
      email: p.email,
      // Where the address came from decides how much to trust it. A discovered
      // one is not a typed one.
      source: evidence.some((e) => e.tier === TIER.MANUAL && /address/i.test(e.text || ''))
        ? 'on the record'
        : 'read from their site or imported',
    },
    pdf,
    video,
    estimate: assetCostEstimate({ pdf: pdf.decision, video: video.decision }, prices),
    // Advisory. Read by a person, never allowed to change whether evidence
    // exists: wanting to work with therapists cannot make a stranger Strong.
    audience: audienceFit(p, settings),
    // Traceability. Identifiers, not copies.
    version: {
      generator: GENERATOR_VERSION,
      playbook: PLAYBOOK_VERSION,
      // Defined in one place, in hive-context.mjs, along with what is
      // deliberately excluded and why. Rotating an API key must not invalidate
      // every package in the database; editing the offer must.
      workspaceContext: contextHash(settings, shortHash),
      evidence: shortHash(evidence.map((e) => `${e.key || ''}:${e.text}`).sort()),
    },
    selectionReason: `${chosen.playbook.label}: ${chosen.why}`,
    fit: chosen.fit || 'IN_SCOPE',
  };
}

// The prompt for Email 1.
//
// Handed a decision, not a prospect. The angle is already chosen, the evidence
// is already selected, and the gaps are stated, so the model's job is to write
// four sentences about a fact rather than to find something to say.
export function buildEmailParts(settings = {}, p = {}, plan, { now = new Date() } = {}) {
  const s = settings || {};
  const gaps = knownUnknowns(p, plan.evidence, { now });
  // Only what this task declared it needs. The whole Hive record is not the
  // answer to "the prompt should read the Hive": voice samples are the largest
  // thing in settings and the qualification rules have no business here.
  const ctx = contextFor(TASK.OUTREACH, s);

  const ws = identity(s);
  const system = [
    `You write one first-contact email for ${ws.who}.`,
    ws.offerLine ? `CURRENT WORKSPACE OFFER: ${ws.offerLine}` : null,
    '',
    'The voice to write in, and these are rules not suggestions:',
    '- Plain words. No metaphors, no figurative language, no decorated phrases.',
    '- Four to six sentences. Open with "Hi [name]." and go straight in.',
    '- No exclamation marks, no emojis, no em dashes, no semicolons, no links.',
    '- Never "I hope this email finds you well", "I wanted to reach out", "I came across", "no worries if", "game-changer".',
    '- One genuine human reaction before the observation, if there is an honest one to give.',
    '- Frame the observation as curiosity, never a diagnosis. "One thing I could not tell from the outside..."',
    '- Give them the way out: if it is already handled, say so and mean it.',
    // Was "end with a real question about how they handle it", and every cold
    // email this system wrote therefore closed on an open question. An open
    // question asks a stranger to do the work of explaining their own business
    // to somebody who has not offered anything yet. A small specific offer
    // costs them one word to accept and is the thing that gets replies.
    '- Close by offering the specific small thing below. Make it a yes/no offer, not an open question about how they work.',
    ws.operator ? '- Sign off on its own lines at the very end: "Thanks," then your first name.' : null,
    '',
    'Two things that will get it deleted:',
    // The old wording listed only quantitative examples, so a draft answered it
    // with a qualitative one: "for a therapy practice that first contact often
    // happens late at night". No statistic, no "most owners", and entirely
    // invented about a stranger's clients.
    '- Never describe what people in their trade do, feel or when they get in touch. No statistics, no "most owners", no "for practices like theirs", and no sentence about their clients that did not come from the evidence. You have not met their clients.',
    '- You may say only three kinds of thing: what was observed on their site, what you could not tell from outside, and the offer.',
    // Added after a real draft turned "the booking buttons go to a contact
    // form" into "each booking needs a reply back and forth before a time is
    // set". The validator now refuses that, but a rule the writer is never
    // told is a rule it breaks every time and burns its retries on.
    '- Never say what happens after somebody uses their form or contacts them. You cannot see their inbox, so you do not know who replies, how many messages it takes, or whether anybody waits. No "back and forth", no "someone has to reply", no "they end up coordinating".',
    '- Never say a change would be faster, quicker, easier, or save anyone time or effort. Nothing here measured that. Offer the change; do not promise what it does.',
    // "Where the enquiry path breaks" went to a therapist whose contact page
    // lists an email and a phone number. Nothing broke.
    '- What you saw is a design choice, not a failure. Do not say a path breaks, that enquiries get stuck or lost, that people give up or cannot reach them, or that anything is costing them business. You did not measure any of that, and an email address is a real way to reach somebody.',
    '- Offer to make something easier or clearer. Never offer to fix a problem you have only inferred.',
    '- No figures of speech. Say the plain thing.',
    '',
    `The angle has already been chosen for you: ${plan.playbook.label}.`,
    `The reason to contact them: ${plan.whyContact}`,
    `How to close: ${plan.playbook.cta}`,
    '',
    'Every specific claim must trace to a line in the evidence below. Nothing else about their site may be described, guessed at or implied.',
    '',
    'If the evidence does not support a truthful, specific email, reply with exactly: NO SAFE ANGLE',
    '',
    'Output exactly:',
    'SUBJECT: <one line, under 8 words, lowercase except names>',
    'BODY:',
    '<the email>',
  ].join('\n');

  const user = [
    // A company is not a person, so it is not a greeting.
    //
    // This read `p.name || p.business_name || 'there'`, and for a prospect with
    // no verified person on the record the model was handed the company as the
    // name. Package 20 opened "Hi AZ Therapy Quest LLC," — which is not wrong
    // about anybody, just plainly written by a machine.
    //
    // The mailbox local-part is not evidence either: `brianda@` is a strong
    // hint and still a guess, and guessing a stranger's first name wrong is
    // worse than not using one. So a real recorded name or "there", and the
    // business goes on its own line below where it belongs.
    `Their name: ${p.name || 'there'}`,
    p.business_name && p.business_name !== p.name ? `Business: ${p.business_name}` : null,
    p.niche ? `What they do: ${p.niche}` : null,
    p.country ? `Country: ${p.country}` : null,
    s.audience ? `Who this workspace works with: ${s.audience}` : null,
    '',
    'Verified about them, and the only things you may refer to:',
    evidenceBlock(p, plan.supporting.length ? plan.supporting : plan.evidence),
    '',
    gaps.length ? 'What nobody has checked, so do not claim any of it:' : null,
    gaps.length ? gaps.map((g) => `- ${g}`).join('\n') : null,
    '',
    // Real sent messages teach the pattern better than any adjective.
    ctx.voiceSamples.length
      ? `Messages this workspace actually sent, for the rhythm:\n${ctx.voiceSamples.map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : null,
  ].filter((x) => x !== null && x !== '');

  return { system, user: user.join('\n') };
}

export const NO_SAFE_ANGLE = 'NO SAFE ANGLE';

// The statuses a package can be acted on from: it is in the approvals queue, or
// somebody has already approved it.
//
// PREPARING is deliberately absent. It means a preparation that did not finish
// — a P2 whose second email could not be written — and such a package must be
// invisible: no card, no decision asked of anybody, and no protection from
// being superseded by the retry that exists to complete it.
export const ACTIONABLE_STATUSES = [STATUS.READY, STATUS.NEEDS_DECISION, STATUS.APPROVED];

// Which touches this band owes that the package does not have.
//
// Empty means the sequence is complete and may be approved as a sequence.
// Anything else means the package is not ready to be one, however good its
// first email is.
export function missingSequenceSteps(ceiling, followups = []) {
  const max = Math.max(1, Number(ceiling) || 1);
  const have = new Set((followups || []).map((f) => Number(f?.step)).filter((n) => Number.isFinite(n)));
  const missing = [];
  for (let step = 2; step <= max; step += 1) if (!have.has(step)) missing.push(step);
  return missing;
}

// The sign-off, guaranteed rather than requested.
//
// Cynthia's first email came back with no sign-off at all, because the prompt
// never asked for one and nothing checked. The stored body IS what Ary approves
// and what later goes out, so a signature that only sometimes appears is a
// signature that sometimes does not: there is no send-time layer that adds it.
//
// The prompt now asks, and this makes sure. Applied after validation, so the
// model's own words are what got judged.
export function ensureSignOff(body, settings = {}) {
  const name = String(settings?.operatorName || '').trim();
  const text = String(body || '').replace(/\s+$/, '');
  if (!name || !text) return text;
  // Already signed, however they spelled the closing word.
  const signed = new RegExp(`(^|\\n)\\s*(thanks|thank you|cheers|best|warmly|speak soon)[,!.]?\\s*\\n+\\s*${name}\\s*$`, 'i');
  if (signed.test(text)) return text;
  // Signed with the bare name and no closing word.
  if (new RegExp(`\\n\\s*${name}\\s*$`, 'i').test(text)) return text;
  return `${text}\n\nThanks,\n${name}`;
}

// Checking the email against the decision that produced it.
//
// The mechanical rules live in followup.mjs and are reused rather than copied:
// em dashes, invented statistics, placeholders, links, length, question count
// and the greeting are the same rules whichever email this is, and two copies
// would drift the first time one of them was tightened.
//
// What is added here is the part only this context knows: whether the email
// contradicts what the evidence actually says.
export function validateOutreachEmail(parsed, plan, p = {}) {
  const flags = [...(parsed.banned || [])];
  const body = String(parsed.body || '');

  // The rule the website-audit skill is most insistent about. Manual
  // scheduling is frequently deliberate, so an email that treats the absence
  // of a calendar as a fault gets a reply explaining that, and deservedly.
  const claimsNoBooking = /(no|without|do ?n[o']?t have|lack)\s+(an?\s+)?(online\s+)?(booking|calendar|scheduler)/i.test(body);
  const bookingVerified = (plan.supporting || []).some((e) => e.key && /booking-is-a-form|calendar-not-loading|two-schedulers/.test(e.key));
  if (claimsNoBooking && !bookingVerified) {
    flags.push('says they have no booking system, which was never verified and is often deliberate');
  }

  // An observed design condition is not evidence of a downstream outcome.
  //
  // This pair only ever caught the words "losing" and "missing", so "where the
  // enquiry path breaks" walked past it and into a prepared package. The shape
  // rules live in outcome-claims.mjs and stand down when the evidence is itself
  // a verified breakage.
  const inferred = outcomeClaims(body, (plan.supporting || []).map((e) => e.key));
  if (inferred.length) {
    flags.push(`claims an outcome the evidence does not support: "${inferred[0]}"`);
  }

  // Anything stated as a consequence. The evidence says what is on the page;
  // it never says what it cost them.
  if (/\b(so|which|that)\s+(means|is why)\s+(you|they)\s+(are\s+)?(losing|missing)\b/i.test(body)
    || /\b(you|they)\s+(are\s+)?(losing|missing)\s+(leads|enquiries|clients|customers|bookings)\b/i.test(body)) {
    flags.push('claims they are losing business, which no evidence here supports');
  }

  // A specific claim about their site that nothing in the evidence supports.
  //
  // Grounded in the finding KEYS rather than in the evidence prose. Comparing
  // one piece of English to another is how a validator starts rejecting good
  // emails: the probe writes "the contact form does not submit" and the email
  // says "I tried getting in touch", and a text match calls that a
  // fabrication. The key is the fact; the wording is not.
  const all = (plan.supporting || []).concat(plan.evidence || []);
  const keys = new Set(all.map((e) => e.key).filter(Boolean));
  const evidenceText = all.map((e) => String(e.text || '').toLowerCase()).join(' ');

  const TOPICS = [
    {
      name: 'contact form',
      re: /\bcontact form\b|\benquiry form\b|\bthe form\b/i,
      keys: ['form-broken', 'captcha-broken', 'mailto-form', 'contact-page-no-form', 'quote-form-thin', 'long-form', 'booking-is-a-form', 'no-contact'],
    },
    { name: 'phone layout', re: /\bon a phone\b|\bmobile (site|version|layout)\b/i, keys: ['mobile-overflow'] },
    { name: 'broken links', re: /\bbroken links?\b|\bdead links?\b/i, keys: ['dead-links', 'nav-dead-link'] },
    { name: 'images', re: /\bimages? (are |is )?(not loading|broken|missing)\b/i, keys: ['broken-images', 'dead-image-host'] },
    // Nothing measures this, so any claim about it is invented by definition.
    { name: 'speed', re: /\bloads? slowly\b|\bslow to load\b|\bpage speed\b/i, keys: [] },
  ];

  for (const t of TOPICS) {
    if (!t.re.test(body)) continue;
    const supported = t.keys.some((k) => keys.has(k)) || (t.keys.length && t.re.test(evidenceText));
    if (!supported) flags.push(`mentions their ${t.name}, which nothing verified supports`);
  }

  return { ...parsed, flags, clean: flags.length === 0 };
}
