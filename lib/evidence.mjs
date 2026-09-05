// One evidence record per prospect, assembled from everything the tracker
// holds, with each item carrying how it was learned and when.
//
// The rule this file exists to enforce: inferred context must never read like
// evidence. Before this, a bee was handed audit notes, video reasons and Ary's
// own observations as one undifferentiated wall of prose, so a guess written
// months ago and a problem verified in a browser this morning looked the same
// on the way into a prompt. That is how an outreach email ends up asserting
// something nobody checked.
//
// Three tiers, in order of trust:
//
//   MANUAL   — Ary looked at the site herself and wrote down what she saw.
//              The strongest evidence in the system: a person with the page
//              open beats a headless browser, and she can see things a probe
//              structurally cannot (a video that does not play, a form that
//              looks fine and feels wrong).
//   VERIFIED — a headless browser loaded the page and measured it. Carries the
//              date it was measured and the probe that did it.
//   INFERRED — parsed out of free text, or derived from stage and dates.
//              Useful for judgement, never quotable as fact.
//
// Nothing here writes. Automated research can add VERIFIED items; it can never
// remove or overwrite a MANUAL one.

import { parseSiteIntel, intelLines, freshnessLabel, isFresh, ageInDays } from './site-intel.mjs';
import { parseAuditNotes } from './audit-profile.mjs';
import { lastVideoView, videoSeen } from './watch-url.mjs';

export const TIER = {
  MANUAL: 'manual',
  VERIFIED: 'verified',
  INFERRED: 'inferred',
};

// Ordering used everywhere a list of evidence is presented or trimmed. Manual
// first, always: if only three things fit in a prompt, they are hers.
export const TIER_RANK = { manual: 0, verified: 1, inferred: 2 };

// Confidence is a word, not a number. "87/100" invites arithmetic on a value
// that was never measured; three named levels can be reasoned about honestly.
export const CONFIDENCE = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

function item({ tier, text, source = null, observedAt = null, confidence, method, key = null }) {
  return {
    tier,
    text: String(text || '').trim().slice(0, 400),
    // Where a reader could go and see it for themselves. Null is honest when
    // there is nowhere to point.
    source,
    observedAt,
    confidence,
    // How it came to be known, in plain words, for the "what we verified" line.
    method,
    // Machine-readable finding key where one exists (site probe findings).
    key,
  };
}

export function parseOwnFindings(raw) {
  if (!raw) return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.filter((x) => x && String(x.text || '').trim()) : [];
  } catch {
    return [];
  }
}

// Everything known about a prospect, sorted by how much it can be trusted.
//
// `domain` is used to build source URLs: a probe finding about the contact
// page should point at the contact page, not at nothing.
export function collectEvidence(p = {}, { now = new Date() } = {}) {
  const out = [];
  const domain = String(p.domain || '').trim();
  const siteUrl = domain ? (/^https?:\/\//i.test(domain) ? domain : `https://${domain}`) : null;

  // ── MANUAL ─────────────────────────────────────────────────────────────
  // No date is stored against her findings today, so `observedAt` is null
  // rather than invented. A missing date is a smaller lie than a wrong one.
  for (const own of parseOwnFindings(p.own_findings)) {
    out.push(item({
      tier: TIER.MANUAL,
      text: own.text,
      source: own.where && own.where !== 'contact' ? siteUrl : (own.where === 'contact' ? `${siteUrl || ''}/contact` : siteUrl),
      observedAt: own.at || null,
      confidence: CONFIDENCE.HIGH,
      method: 'Seen by a person',
    }));
  }

  // ── VERIFIED ───────────────────────────────────────────────────────────
  const intel = parseSiteIntel(p.site_intel);
  if (intel && !intel.blocked) {
    for (let i = 0; i < (intel.reasons || []).length; i += 1) {
      out.push(item({
        tier: TIER.VERIFIED,
        text: intel.reasons[i],
        key: (intel.keys || [])[i] || null,
        source: siteUrl,
        observedAt: intel.checkedAt,
        // A measurement that has gone stale is still a measurement, but it
        // stops being something to assert in an email.
        confidence: isFresh(intel, { now }) ? CONFIDENCE.HIGH : CONFIDENCE.MEDIUM,
        method: `browser check, ${intel.source || 'probe'}`,
      }));
    }
  }
  if (intel?.blocked) {
    out.push(item({
      tier: TIER.VERIFIED,
      text: `Their site could not be read: ${intel.blocked.reason}`,
      source: siteUrl,
      observedAt: intel.checkedAt,
      confidence: CONFIDENCE.HIGH,
      method: 'browser check',
    }));
  }

  // Watching the video is the one behaviour we observe directly rather than
  // infer. It is evidence about interest, not about their website.
  const view = lastVideoView(p.activity_log);
  if (view) {
    const seen = videoSeen(p.activity_log);
    out.push(item({
      tier: TIER.VERIFIED,
      text: `They opened the audit video (${seen ? seen.label : view.text})`,
      observedAt: view.ts,
      confidence: CONFIDENCE.HIGH,
      method: 'watch page beacon',
    }));
  }

  // ── INFERRED ───────────────────────────────────────────────────────────
  // The audit skill's notes. Parsed, useful, and written by a human reading a
  // site — but with no date, no source and no way to tell an observation from
  // an impression, so it does not get to be evidence.
  const prof = parseAuditNotes(p.audit_notes);
  for (const f of prof.fields || []) {
    if (!f.value) continue;
    out.push(item({
      tier: TIER.INFERRED,
      text: `${f.label}: ${f.value}`,
      confidence: CONFIDENCE.LOW,
      method: 'parsed from audit notes',
    }));
  }
  for (const sec of prof.sections || []) {
    for (const line of (sec.items || []).slice(0, 6)) {
      out.push(item({
        tier: TIER.INFERRED,
        text: `${sec.title}: ${typeof line === 'string' ? line : line.text || ''}`,
        confidence: CONFIDENCE.LOW,
        method: 'parsed from audit notes',
      }));
    }
  }

  out.sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier]);
  return out;
}

// The three buckets a prompt should receive, already separated so a builder
// cannot accidentally flatten them back together.
export function groupEvidence(evidence = []) {
  return {
    manual: evidence.filter((e) => e.tier === TIER.MANUAL),
    verified: evidence.filter((e) => e.tier === TIER.VERIFIED),
    inferred: evidence.filter((e) => e.tier === TIER.INFERRED),
  };
}

// Is there enough here to write an email that says something specific and
// true? This is the gate the product is built around: it is allowed to answer
// no, and answering no is more useful than a manufactured observation.
//
// Four levels, and the distinction that matters is between the middle two.
// FRESH IS NOT THE SAME AS ENOUGH. A probe that ran an hour ago and found a
// stale copyright line is perfectly fresh and still does not give anybody a
// reason to write. Treating freshness as sufficiency is how a Vet ends up
// declining to spend twenty credits and then handing over an empty prospect
// as though it were researched.
export const SUFFICIENCY = { NONE: 'none', THIN: 'thin', SUFFICIENT: 'sufficient', STRONG: 'strong' };

// Findings that are worth an email on their own, because they cost the
// business something a person can recognise. A stale year in a footer does
// not; a contact form that does not submit does.
const MATERIAL_KEYS = new Set([
  'form-broken', 'captcha-broken', 'mailto-form', 'no-contact', 'contact-page-no-form',
  'booking-is-a-form', 'no-booking', 'calendar-not-loading', 'two-schedulers',
  'dead-links', 'nav-dead-link', 'broken-images', 'dead-image-host', 'dead-feed',
  'mobile-overflow', 'phone-mismatch', 'insecure', 'mixed-content', 'lead-magnet-open',
  'quote-form-thin', 'long-form',
]);

// Cosmetic findings. Real, verified, and not a reason to spend somebody's
// attention on their own.
const COSMETIC_KEYS = new Set(['stale-copyright', 'expired-date', 'default-title', 'no-title', 'no-meta-description', 'stale-stack', 'cta', 'no-local-schema', 'no-address']);

export function evidenceStrength(evidence = []) {
  const g = groupEvidence(evidence);
  // Watching the video says something about interest, not about their site,
  // so it never counts towards having something to point at.
  const solid = [...g.manual, ...g.verified.filter((e) => e.confidence === CONFIDENCE.HIGH)]
    .filter((e) => !e.text.startsWith('They opened') && !e.text.startsWith('Their site could not be read'));

  // Hers always count as material: she was looking at the page, and she does
  // not write down a thing she thinks is trivial.
  const material = solid.filter((e) => e.tier === TIER.MANUAL || !e.key || !COSMETIC_KEYS.has(e.key));
  const cosmeticOnly = solid.length > 0 && material.length === 0;

  let level;
  if (material.length >= 2) level = SUFFICIENCY.STRONG;
  else if (material.length === 1) level = SUFFICIENCY.SUFFICIENT;
  else if (cosmeticOnly) level = SUFFICIENCY.THIN;
  else level = SUFFICIENCY.NONE;

  return {
    level,
    strong: material.length,
    // Everything solid, material or not. The difference between the two counts
    // is what "fresh but not enough" looks like in a number.
    solid: solid.length,
    cosmeticOnly,
    // Enough to say something specific and true.
    canPersonalise: level === SUFFICIENCY.SUFFICIENT || level === SUFFICIENCY.STRONG,
    // Whether paying for more research would plausibly change the answer.
    // Nothing at all, or nothing but cosmetics, both mean the question is
    // still open.
    worthVerifying: level === SUFFICIENCY.NONE || level === SUFFICIENCY.THIN,
  };
}

// What we do NOT know, stated. A prompt that is told only what is known will
// fill the gaps; a prompt handed the gaps explicitly has somewhere to put the
// uncertainty.
export function knownUnknowns(p = {}, evidence = [], { now = new Date() } = {}) {
  const gaps = [];
  const intel = parseSiteIntel(p.site_intel);
  if (!intel) {
    gaps.push('Nobody has run the site check. Nothing about their website has been verified.');
  } else {
    if (!isFresh(intel, { now })) {
      const age = Math.round(ageInDays(intel, now) || 0);
      gaps.push(`The site check is ${age} days old. Anything it found may have been fixed since.`);
    }
    if (intel.hasBooking == null) gaps.push('We do not know whether they have a booking system.');
    if (intel.blocked) gaps.push('The probe could not load their site, so nothing about it is known.');
  }
  if (!p.email) gaps.push('No contact email on record.');
  if (!p.name) gaps.push('No named person, only a business.');
  if (!evidence.some((e) => e.tier === TIER.MANUAL)) {
    gaps.push('Nobody has looked at this one by hand.');
  }
  if (!p.replied) gaps.push('They have never replied, so nothing is known about what they care about.');
  return gaps;
}

// The evidence block handed to any prompt that makes a claim about a prospect.
// Three labelled sections plus the gaps, in that order, because a model reads
// the top of a block hardest.
export function evidenceBlock(p = {}, evidence = null) {
  const ev = evidence || collectEvidence(p);
  const g = groupEvidence(ev);
  const parts = [];

  parts.push('== EVIDENCE ==');
  parts.push('Three tiers. You may state MANUAL and VERIFIED items as fact.');
  parts.push('You may NOT state anything in INFERRED as fact, and you may not turn a gap into a claim.');

  parts.push('', '-- MANUAL (seen by a person, highest confidence) --');
  if (g.manual.length) {
    for (const e of g.manual) parts.push(`  * ${e.text}${e.observedAt ? ` [seen ${String(e.observedAt).slice(0, 10)}]` : ''}`);
  } else {
    parts.push('  (none)');
  }

  parts.push('', '-- VERIFIED (a browser loaded the page and measured this) --');
  if (g.verified.length) {
    for (const e of g.verified) {
      parts.push(`  * ${e.text} [${e.method}${e.observedAt ? `, ${String(e.observedAt).slice(0, 10)}` : ''}${e.confidence === CONFIDENCE.MEDIUM ? ', STALE' : ''}]`);
    }
  } else {
    parts.push('  (none)');
  }

  parts.push('', '-- INFERRED (context only, NOT quotable) --');
  if (g.inferred.length) {
    for (const e of g.inferred.slice(0, 10)) parts.push(`  * ${e.text}`);
  } else {
    parts.push('  (none)');
  }

  const gaps = knownUnknowns(p, ev);
  parts.push('', '-- WHAT WE DO NOT KNOW --');
  if (gaps.length) {
    for (const gp of gaps) parts.push(`  * ${gp}`);
  } else {
    parts.push('  (nothing material)');
  }

  const strength = evidenceStrength(ev);
  parts.push('', `-- EVIDENCE: ${strength.level.toUpperCase()} (${strength.strong} finding${strength.strong === 1 ? '' : 's'} worth raising, ${strength.solid} verified in total) --`);
  if (strength.cosmeticOnly) {
    parts.push('Everything verified here is cosmetic: a stale year, a missing description, that kind of thing.');
    parts.push('None of it costs them anything, so none of it is a reason to write. Do not build an email around it.');
  }
  if (!strength.canPersonalise) {
    parts.push('There is NOTHING worth pointing at. Do not invent an observation.');
    parts.push('Say so plainly instead of manufacturing a reason to write.');
  }

  const intel = parseSiteIntel(p.site_intel);
  if (intel) parts.push('', `(${freshnessLabel(intel)})`);

  return parts.join('\n');
}

// Shorthand used by the Vet and Pick paths, which want the facts rather than
// the instructions wrapped around them.
// `now` is threaded through rather than read from the clock inside, so a Vet
// result computed for a given moment is reproducible. Without it, freshness was
// judged against the real wall clock while everything around it used an
// injected date, and the two disagreed.
export function evidenceSummary(p = {}, { now = new Date() } = {}) {
  const ev = collectEvidence(p, { now });
  const g = groupEvidence(ev);
  const strength = evidenceStrength(ev);
  const intel = parseSiteIntel(p.site_intel);
  return {
    evidence: ev,
    manual: g.manual,
    verified: g.verified,
    inferred: g.inferred,
    strength,
    intel,
    intelFresh: intel ? isFresh(intel, { now }) : false,
    intelLines: intelLines(intel),
    gaps: knownUnknowns(p, ev, { now }),
  };
}
