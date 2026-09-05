// The prospect record, translated into things a person can read.
//
// This module has one job and one prohibition.
//
// The job: take the canonical answers the app already computes and say them in
// words. Where a prospect is, why outreach is or is not justified, what was
// actually checked, how they can be reached, where they came from, and the one
// thing that happens next.
//
// The prohibition: it does not decide any of that. Every state here is read
// from the modules that own it — contactStateOf, isParked, isRecoverable,
// isDeferred, buildVetResult, strongGate, evidenceStrength, contactStateOf.
// A second Strong rule written in a component is how two screens start
// disagreeing about whether somebody is worth writing to, and the screen is
// always the one people believe.
//
// So: translation, never adjudication. If the app does not store an answer,
// this says nothing rather than inferring one. An absent evidence row means
// nobody looked; it does not mean the thing is false, and turning silence into
// a claim is the exact failure this product exists to avoid.

import { contactStateOf, CONTACT_STATE } from './contact-state.mjs';
import { VERIFICATION, isParked, isRecoverable } from './verification.mjs';
import { isDeferred, isDue } from './deferral.mjs';
import { buildVetResult, prescreen, VERDICT } from './vet.mjs';
import { collectEvidence, groupEvidence, evidenceStrength, knownUnknowns, SUFFICIENCY } from './evidence.mjs';
import { parseSiteIntel, freshnessLabel, ageInDays } from './site-intel.mjs';
import { strongGate, STRONG_TEST, allowedTouches } from './priority.mjs';
import { ORIGIN } from './origin.mjs';
import { SEND_DEFAULTS } from './send-policy.mjs';
import { CONCEPT } from './concepts.mjs';

// ── Identity ─────────────────────────────────────────────────────────────

// Who this is, without saying it twice.
//
// The CSV importer copied `name` into `business_name` for a large part of the
// pipeline, so printing both renders the same words on two lines. When a person
// has no name the business is promoted rather than leaving a blank where the
// heading should be.
export function identityOf(p = {}) {
  const name = String(p.name || '').trim();
  const business = String(p.business_name || '').trim();
  const sameThing = business && business.toLowerCase() === name.toLowerCase();

  return {
    title: name || business || `Prospect #${p.id ?? ''}`.trim(),
    // Null rather than a repeat. A caller that renders `subtitle || ''` then
    // prints nothing instead of an echo.
    subtitle: name && business && !sameThing ? business : null,
    // Flagged rather than hidden: it is worth knowing the importer did this,
    // because the real business name is still missing.
    businessMirrorsName: Boolean(sameThing),
    domain: String(p.domain || '').trim() || null,
    // Absent is absent. "Unknown" in a header is a word taking up space where
    // there is nothing to say.
    location: String(p.country || '').trim() || null,
    email: String(p.email || '').trim() || null,
  };
}

// ── Where they are now ───────────────────────────────────────────────────

// Every state a person can be in, with the two things that decide how it looks:
// whether it is about the prospect, and whether it can change on its own.
export const SITUATION = {
  DO_NOT_CONTACT: 'DO_NOT_CONTACT',
  UNSUBSCRIBED: 'UNSUBSCRIBED',
  CLIENT: 'CLIENT',
  REPLIED: 'REPLIED',
  DEFERRED: 'DEFERRED',
  DEFERRAL_DUE: 'DEFERRAL_DUE',
  CONTACT_BROKEN: 'CONTACT_BROKEN',
  NO_CONTACT: 'NO_CONTACT',
  PARKED: 'PARKED',
  WAITING_FOR_BUDGET: 'WAITING_FOR_BUDGET',
  RESEARCH_PROHIBITED: 'RESEARCH_PROHIBITED',
  WORTH_CONTACTING: 'WORTH_CONTACTING',
  NEEDS_DECISION: 'NEEDS_DECISION',
  NOT_A_FIT: 'NOT_A_FIT',
  MISSING_INPUT: 'MISSING_INPUT',
  NOT_CHECKED: 'NOT_CHECKED',
};

// Read top to bottom. The order is a claim: a relationship fact always beats a
// pipeline fact, because somebody who wrote back is not "waiting on evidence"
// however thin the evidence is.
function situationKey(p, { now }) {
  if (p.do_not_contact === 1 || p.do_not_contact === true) return SITUATION.DO_NOT_CONTACT;
  if (p.unsubscribed === 1 || p.unsubscribed === true) return SITUATION.UNSUBSCRIBED;
  if (String(p.stage || '') === 'Client') return SITUATION.CLIENT;
  if (p.replied === 1 || p.replied === true) return SITUATION.REPLIED;

  if (isDeferred(p)) return isDue(p, { now }) ? SITUATION.DEFERRAL_DUE : SITUATION.DEFERRED;

  const contact = contactStateOf(p);
  if (contact === CONTACT_STATE.NEEDS_CONTACT_RECOVERY) return SITUATION.CONTACT_BROKEN;
  if (contact === CONTACT_STATE.NONE) return SITUATION.NO_CONTACT;

  const verification = String(p.verification_state || '');
  if (isParked(verification)) return SITUATION.PARKED;
  if (verification === VERIFICATION.WAITING_FOR_BUDGET) return SITUATION.WAITING_FOR_BUDGET;
  if (verification === VERIFICATION.RESEARCH_PROHIBITED) return SITUATION.RESEARCH_PROHIBITED;

  const vet = buildVetResult(p, { now });
  if (vet.verdict === VERDICT.STRONG) return SITUATION.WORTH_CONTACTING;

  if (vet.verdict === VERDICT.SKIP) {
    // Not every stop is a verdict about the business, and the rules already
    // know the difference: a stop that can be undone by supplying something
    // carries a `fixable` line, and a real refusal does not.
    //
    // Flattening the two would have been the worst bug in this pass. Most of
    // the pipeline has no domain on the record, so every one of those rows
    // would have opened saying "Not a fit" about a business nobody has looked
    // at, and thousands of them read as a graveyard.
    const pre = prescreen(p, { now });
    if (pre.fixable) return SITUATION.MISSING_INPUT;
    return SITUATION.NOT_A_FIT;
  }

  // MAYBE with nothing checked is a different sentence from MAYBE after a
  // check came back ambiguous, and only one of them is a question for a person.
  const checked = parseSiteIntel(p.site_intel) || p.own_findings;
  return checked ? SITUATION.NEEDS_DECISION : SITUATION.NOT_CHECKED;
}

// What each situation says, and how it is drawn.
//
// `concept` names the shared entry in lib/concepts.mjs where one exists, and the
// judgement flag is read from there rather than written again here. Start here
// explains the same words to somebody who has not opened a prospect yet, and
// the two screens disagreeing about whether Held is a rejection is the failure
// worth engineering against. There is a test.
//
// A situation only this page has a name for carries its own flag.
const SITUATION_COPY = {
  [SITUATION.DO_NOT_CONTACT]: { tone: 'stop', judgement: true, headline: 'Do not contact', body: 'You marked this one off limits. Nothing will ever be sent to them.' },
  [SITUATION.UNSUBSCRIBED]: { tone: 'stop', judgement: true, headline: 'They unsubscribed', body: 'They asked to be left alone, and nothing overrides that.' },
  [SITUATION.CLIENT]: { tone: 'good', judgement: false, headline: 'A client', body: 'Cold outreach stopped when they became one.' },
  [SITUATION.REPLIED]: { tone: 'good', judgement: false, headline: 'They wrote back', body: 'Everything automatic has stopped for this person. The next move is yours.' },
  [SITUATION.DEFERRED]: { tone: 'quiet', concept: 'DEFERRED', headline: 'Waiting to reconsider', body: 'You chose to come back to them later. Nothing happens until then.' },
  [SITUATION.DEFERRAL_DUE]: { tone: 'action', judgement: false, headline: 'Ready to reconsider', body: 'The date you picked has arrived.' },
  [SITUATION.CONTACT_BROKEN]: { tone: 'quiet', concept: 'HELD', headline: 'The address stopped working', body: 'Everything already established about them is still true. What is missing is a way in, and that is recoverable.' },
  [SITUATION.NO_CONTACT]: { tone: 'quiet', concept: 'HELD', headline: 'Waiting for a safe contact', body: 'Still worth contacting. There is just no address yet that can be used safely, so nothing is being spent on them until there is.' },
  [SITUATION.PARKED]: { tone: 'stop', concept: 'PARKED', headline: 'Parked', body: 'A decision was reached about this business rather than something being missing. It takes new information to change it.' },
  [SITUATION.WAITING_FOR_BUDGET]: { tone: 'quiet', judgement: false, headline: 'Waiting for the day’s budget', body: 'The checking budget ran out. They pick up again on their own.' },
  [SITUATION.RESEARCH_PROHIBITED]: { tone: 'quiet', judgement: false, headline: 'No paid checks on this one', body: 'Your rating keeps the effort low. They can still be contacted on evidence already gathered.' },
  [SITUATION.WORTH_CONTACTING]: { tone: 'good', concept: 'STRONG', headline: 'Worth contacting', body: 'There is enough checked and true to write a real reason for getting in touch.' },
  [SITUATION.NEEDS_DECISION]: { tone: 'action', judgement: false, headline: 'Needs your decision', body: 'The check ran and came back ambiguous, so this asks rather than guesses.' },
  [SITUATION.NOT_A_FIT]: { tone: 'stop', judgement: true, headline: 'Not a fit', body: 'The free rules ruled them out before anything was spent.' },
  [SITUATION.MISSING_INPUT]: { tone: 'quiet', judgement: false, headline: 'Missing something we need', body: 'Nothing can be checked until this is filled in. It is a gap in the record, not a decision about the business.' },
  // One sentence for the whole unchecked state. The card used to say
  // "nothing" six different ways down its length; caveatInBody tells the
  // card the not-a-judgement caveat is already inside this body, so the
  // separate caveat line and the empty-prose repeats stay quiet.
  [SITUATION.NOT_CHECKED]: { tone: 'quiet', judgement: false, caveatInBody: true, headline: 'Site not checked yet', body: 'Run the site check to see whether there is a real reason to contact them. Nothing so far says anything about the business.' },
};

export function situationOf(p = {}, { now = new Date() } = {}) {
  const key = situationKey(p, { now });
  const copy = SITUATION_COPY[key];
  // One classification, wherever the word appears. A situation naming a shared
  // concept takes its judgement from lib/concepts.mjs; one that does not
  // carries its own.
  const judgement = copy.concept ? CONCEPT[copy.concept].judgement : copy.judgement;
  // The rules' own sentences, where they wrote one. Only ever added to the
  // states that come from a rule, and never generated.
  let detail = null;
  if (key === SITUATION.MISSING_INPUT || key === SITUATION.NOT_A_FIT) {
    const pre = prescreen(p, { now });
    detail = [pre.reasons?.[0], pre.fixable].filter(Boolean).join(' ') || null;
  } else if (key === SITUATION.PARKED) {
    detail = p.verification_reason || null;
  }
  return {
    key,
    detail,
    ...copy,
    judgement,
    // A state can be a judgement and still be reversible, and it can be
    // recoverable without anybody doing anything. Both facts are read from the
    // modules that own them rather than restated here.
    recoverable: !judgement,
    verificationRecoverable: isRecoverable(p.verification_state),
  };
}

// ── Why, or what is missing ──────────────────────────────────────────────

const TEST_LABEL = {
  [STRONG_TEST.FIT]: 'The kind of business you can help',
  [STRONG_TEST.CONTACT_REASON]: 'A specific reason to write',
  [STRONG_TEST.IN_SCOPE]: 'Something you actually fix',
  [STRONG_TEST.EVIDENCE]: 'Evidence that holds up',
};

// The four Strong dimensions, each passed or not, with the app's own reason.
//
// Only what is stored. Where the backend keeps no sentence for a dimension the
// status stands on its own: inventing prose to fill a row is how a help screen
// starts making claims nobody checked.
export function qualificationOf(p = {}, { now = new Date() } = {}) {
  const vet = buildVetResult(p, { now });
  const evidence = collectEvidence(p, { now });
  const strength = evidenceStrength(evidence);

  // The playbook decides fit and scope, and neither is on the prospect row for
  // an unprepared prospect. Reported as unknown rather than as a failure: a
  // question nobody has asked is not a question answered no.
  const known = {
    fit: vet.verdict !== VERDICT.SKIP,
    contactReason: strength.level !== SUFFICIENCY.NONE && Boolean(vet.why?.[0]),
    inScope: vet.verdict !== VERDICT.SKIP,
    sufficiency: strength.level,
  };
  const gate = strongGate({
    ...known,
    explicitCannotPay: p.cannot_pay === 1 || p.cannot_pay === true,
  });

  return {
    strong: gate.strong,
    verdict: vet.verdict,
    // The app's own sentence, never a generated one.
    why: vet.why?.[0] || null,
    dimensions: [STRONG_TEST.FIT, STRONG_TEST.CONTACT_REASON, STRONG_TEST.IN_SCOPE, STRONG_TEST.EVIDENCE].map((t) => ({
      test: t,
      label: TEST_LABEL[t],
      passed: gate.passed.includes(t),
    })),
    // Said once, and said as a ceiling. A band is the most they may ever
    // receive, not a plan to send that many.
    band: p.priority_band || null,
    bandProvisional: p.band_was_provisional === 1 || p.band_was_provisional === true,
    maxTouches: p.priority_band ? allowedTouches(p.priority_band) : null,
    sufficiency: strength.level,
  };
}

// ── What LTB knows ───────────────────────────────────────────────────────

// Evidence, grouped the way somebody reads it rather than the way it is stored.
//
// The tier is the second thing said, not the first. "MANUAL" as a headline
// tells a person nothing; "You confirmed this" tells them whose word it rests
// on, which is the actual question.
const TIER_COPY = {
  verified: { heading: 'Checked and confirmed', note: 'Read off their own pages.' },
  manual: { heading: 'You confirmed', note: 'Something you saw and recorded.' },
  inferred: { heading: 'Worked out, not confirmed', note: 'Derived from other facts. Nobody looked directly.' },
};

export function knowledgeOf(p = {}, { now = new Date(), staleDays = SEND_DEFAULTS.evidenceStaleDays } = {}) {
  const evidence = collectEvidence(p, { now });
  const groups = groupEvidence(evidence);
  const intel = parseSiteIntel(p.site_intel);
  const age = intel ? ageInDays(intel, now) : null;

  const section = (tier) => ({
    tier,
    ...TIER_COPY[tier],
    items: (groups[tier] || []).map((e) => ({
      text: e.text,
      source: e.source || null,
      method: e.method || null,
      confidence: e.confidence || null,
      observedAt: e.observedAt || null,
      tier,
    })),
  });

  return {
    sections: [section('verified'), section('manual'), section('inferred')].filter((s) => s.items.length > 0),
    total: evidence.length,
    strength: evidenceStrength(evidence),
    // Only what the app explicitly tracks as an open question. It never turns
    // "no row for X" into "they do not have X".
    unknowns: knownUnknowns(p, evidence, { now }),
    checked: Boolean(intel),
    // The existing wording, not a second vocabulary for the same idea.
    freshness: intel ? freshnessLabel(intel, now) : null,
    ageDays: age,
    // The send policy's threshold, read from configuration rather than typed
    // in here as a number.
    stale: age != null && age >= staleDays,
    staleDays,
  };
}

// ── How to reach them ────────────────────────────────────────────────────

// Where an address came from, in words.
//
// The stored classification stays exactly as it is; this only decides how to
// say it. SAME_DOMAIN and OWNER_EXTERNAL are precise and mean nothing to
// anybody who has not read the discovery module.
const ASSOCIATION_COPY = {
  SAME_DOMAIN: 'A business address on their own website',
  OWNER_EXTERNAL: 'The owner’s address, linked from their website',
  UNKNOWN: 'Found on their website',
  THIRD_PARTY: 'Belongs to somebody else, so it is not used',
};

const WAY_COPY = {
  FORM: 'Contact form',
  PHONE: 'Phone',
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  LINKEDIN: 'LinkedIn',
  TWITTER: 'X',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
};

// What the last discovery run actually returned, said plainly. Only ever
// rendered when a run is on the record.
const SEARCH_RESULT_COPY = {
  FOUND: 'Found an address on their site.',
  NONE: 'Read their site and found no address that could be used safely.',
  NO_SITE: 'There is no website to read.',
  ERROR: 'The search could not finish.',
  SKIPPED: 'Not searched.',
};

export function contactabilityOf(p = {}, candidates = []) {
  const state = contactStateOf(p);
  const email = String(p.email || '').trim() || null;

  // One entry per kind of route, not one per URL. A contact form linked from
  // three pages is one way in.
  const seen = new Set();
  const alternates = [];
  for (const c of candidates || []) {
    const type = String(c?.type || c?.contact_type || '').toUpperCase();
    if (!type || type === 'EMAIL') continue;
    if (seen.has(type)) continue;
    seen.add(type);
    alternates.push({ type, label: WAY_COPY[type] || type.toLowerCase(), value: c.value || null });
  }

  const tried = p.contact_searched_at
    ? {
      at: p.contact_searched_at,
      result: p.contact_search_result || null,
      // Only the sentence the stored result supports.
      text: SEARCH_RESULT_COPY[String(p.contact_search_result || '').toUpperCase()] || null,
      pages: Number.isFinite(Number(p.contact_search_pages)) ? Number(p.contact_search_pages) : null,
    }
    : null;

  return {
    state,
    usable: state === CONTACT_STATE.OK,
    email,
    // The reason is stored per prospect when discovery adopted the address.
    // A typed-in address has none, and saying nothing is correct there.
    emailOrigin: p.primary_contact_reason
      ? (ASSOCIATION_COPY[String(p.primary_contact_reason).toUpperCase()] || String(p.primary_contact_reason))
      : null,
    alternates,
    tried,
    // Why it is not usable, in the app's own words where it recorded them.
    blockedReason: state === CONTACT_STATE.OK
      ? null
      : (p.contact_state_reason
        || (state === CONTACT_STATE.NEEDS_CONTACT_RECOVERY
          ? 'The address stopped working.'
          : 'No safe contact method found yet.')),
  };
}

// ── Where they came from ─────────────────────────────────────────────────

const ORIGIN_COPY = {
  [ORIGIN.MAP_LISTING]: 'Map listing',
  [ORIGIN.SOCIAL_POST]: 'Social post',
  [ORIGIN.DIRECTORY]: 'Directory',
  [ORIGIN.MANUAL]: 'Found manually',
  [ORIGIN.REFERRAL]: 'Referral',
  [ORIGIN.REACTIVATION]: 'Reactivation',
  [ORIGIN.OTHER]: 'Other',
};

// Acquisition provenance, and nothing else pretending to be it.
//
// Three different things in this codebase get called "source": what a claim
// rests on, how the record entered the database, and where the business was
// found. Only the third one is an origin, and a legacy row that never recorded
// it says so instead of borrowing one of the other two.
export function originOf(p = {}) {
  const cls = String(p.origin_class || '').trim().toUpperCase();
  const label = ORIGIN_COPY[cls] || null;
  // The pre-V2 column, free text that people typed: "Google Maps", "Instagram".
  //
  // Shown, and shown as what it is. Reporting "Source not recorded" on a row
  // whose own field says Google Maps would be a false claim of ignorance, and
  // quietly promoting it to a structured origin would be the backfill that
  // lib/origin.mjs refuses on purpose. So it appears, labelled legacy, and it
  // never becomes an origin_class.
  const legacy = String(p.source || '').trim() || null;

  return {
    recorded: Boolean(label),
    label: label || (legacy ? `${legacy} (older record)` : 'Source not recorded'),
    // True only for the structured field, so a caller can tell a cohort-worthy
    // origin from a note somebody typed two years ago.
    structured: Boolean(label),
    legacy: label ? null : legacy,
    subtype: String(p.origin_subtype || '').trim() || null,
    batch: String(p.origin_batch || '').trim() || null,
    query: String(p.origin_query || '').trim() || null,
    at: p.origin_at || null,
  };
}

// ── What has been done ───────────────────────────────────────────────────

// A history built only from moments that were actually written down.
//
// Every entry below is a stored timestamp, not a transition somebody inferred
// from the current state. There is no row here for "became Strong" because
// nothing records when that happened, and a date invented from today's verdict
// would be a lie with a clock on it.
export function historyOf(p = {}) {
  const at = (v) => (v ? String(v) : null);
  const rows = [
    { at: at(p.origin_at), what: 'Found', detail: originOf(p).recorded ? originOf(p).label : null },
    { at: at(p.created_at), what: 'Added to the tracker', detail: null },
    { at: at(p.contact_searched_at), what: 'Looked for a way to contact them', detail: contactabilityOf(p).tried?.text || null },
    { at: at(p.site_intel_at), what: 'Read their website', detail: p.site_intel_source ? `by ${p.site_intel_source}` : null },
    { at: at(p.contact_state_at), what: 'Contact status changed', detail: p.contact_state_reason || null },
    { at: at(p.verification_state_at), what: 'Checking status changed', detail: p.verification_reason || null },
    { at: at(p.band_at), what: 'Priority set', detail: p.priority_band || null },
    { at: at(p.video_sent_at), what: 'Video sent', detail: null },
    { at: at(p.first_client_at), what: 'Became a client', detail: null },
  ].filter((r) => r.at);

  rows.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  return rows;
}

// ── What happens next ────────────────────────────────────────────────────

// One next step, pointing only at somewhere that already exists.
//
// `view` names an existing route and nothing else. This panel deliberately owns
// no mutation: a summary that can change the record is a second way to act on a
// prospect, and two ways to do one thing is how they start disagreeing.
const NEXT = {
  [SITUATION.DO_NOT_CONTACT]: { text: 'Nothing. This one is closed.', view: null },
  [SITUATION.UNSUBSCRIBED]: { text: 'Nothing. They asked to be left alone.', view: null },
  [SITUATION.CLIENT]: { text: 'Nothing here. Client work lives in Clients.', view: 'clients' },
  [SITUATION.REPLIED]: { text: 'Write back. They are waiting on you.', view: 'today/replies' },
  [SITUATION.DEFERRED]: { text: 'Nothing until the date you chose.', view: null },
  [SITUATION.DEFERRAL_DUE]: { text: 'Decide whether to pick them back up.', view: 'today/deferrals' },
  [SITUATION.CONTACT_BROKEN]: { text: 'Find another way in. Look again searches their own pages for free.', view: 'today/held' },
  [SITUATION.NO_CONTACT]: { text: 'Find a way in. Look again searches their own pages for free.', view: 'today/held' },
  [SITUATION.PARKED]: { text: 'Nothing, unless something changes about the business.', view: null },
  [SITUATION.WAITING_FOR_BUDGET]: { text: 'Nothing. It picks up again on its own.', view: null },
  [SITUATION.RESEARCH_PROHIBITED]: { text: 'Nothing needed. Change the rating if you want more spent here.', view: null },
  [SITUATION.WORTH_CONTACTING]: { text: 'Read the draft when it appears under Ready for approval.', view: 'today/approvals' },
  [SITUATION.NEEDS_DECISION]: { text: 'Make the call. The app would rather ask than guess.', view: 'today/decisions' },
  [SITUATION.NOT_A_FIT]: { text: 'Nothing. They did not pass the free rules.', view: null },
  [SITUATION.MISSING_INPUT]: { text: 'Fill in what is missing, and the checks can run.', view: null },
  [SITUATION.NOT_CHECKED]: { text: 'Run the site check when you want them considered.', view: null },
};

export function nextActionOf(p = {}, { now = new Date() } = {}) {
  const s = situationOf(p, { now });
  const next = NEXT[s.key] || { text: 'Nothing right now.', view: null };
  return { ...next, situation: s.key };
}

// Everything, in the order it should be read.
export function prospectCard(p = {}, { now = new Date(), candidates = [], staleDays } = {}) {
  return {
    identity: identityOf(p),
    situation: situationOf(p, { now }),
    qualification: qualificationOf(p, { now }),
    knowledge: knowledgeOf(p, { now, ...(staleDays ? { staleDays } : {}) }),
    contact: contactabilityOf(p, candidates),
    origin: originOf(p),
    history: historyOf(p),
    next: nextActionOf(p, { now }),
  };
}
