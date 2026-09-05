// Vet Bee: is this prospect worth spending research effort on?
//
// The old Vet Bee had one move — run the full browser probe on everybody, 20
// credits and about a minute each. So a prospect with no website, or one
// already marked Rejected, cost exactly as much to dismiss as a promising one
// cost to confirm. The point of a gatekeeper is that it is cheaper than what
// it guards.
//
// Three stages:
//
//   A  Prescreen. Free. Deterministic rules over what the row already holds.
//      Answers SKIP with a reason, or lets the prospect through.
//   B  Evidence. Reuses fresh site_intel; only pays for a probe when there is
//      nothing usable, it has gone stale, or the caller asked for a refresh.
//   C  Verdict. Fit, opportunity, evidence quality, timing, confidence — each
//      a named level with a stated reason, never a number pretending to be a
//      measurement.
//
// Stage A is pure and lives here. Stage B is I/O and lives in the route.

import { evidenceSummary, TIER, CONFIDENCE } from './evidence.mjs';
import { isFresh, isThorough, ageInDays, FRESH_DAYS } from './site-intel.mjs';
import { platformVerdict, schedulingStance } from './qualify.mjs';
import { qualificationFlags, RED } from './qual-rules.mjs';

export const VERDICT = { STRONG: 'STRONG', MAYBE: 'MAYBE', SKIP: 'SKIP' };

// Stages where the answer is already known and no amount of research changes
// it. Vetting a client is not a mistake worth paying for.
const CLOSED = new Set(['Client', 'Rejected', 'Not This Offer', 'Lost', 'Invalid Email', 'Finished']);

// ── Stage A: prescreen ────────────────────────────────────────────────────
// Free, deterministic, and allowed to say no on its own. Every SKIP names the
// rule that fired, because "SKIP" with no reason is indistinguishable from a
// bug.
export function prescreen(p = {}, { now = new Date(), settings = null } = {}) {
  const reasons = [];
  const stage = p.stage || 'New';

  if (CLOSED.has(stage)) {
    return {
      pass: false,
      verdict: VERDICT.SKIP,
      reasons: [`Already ${stage}. Nothing to research.`],
      needsProbe: false,
      rule: 'closed-stage',
    };
  }

  if (p.reply_type === 'decline') {
    return {
      pass: false,
      verdict: VERDICT.SKIP,
      reasons: ['They said no. Researching them again does not change that.'],
      needsProbe: false,
      rule: 'declined',
    };
  }

  // The workspace's own red rules, but only where the fact they need is
  // actually on the record. For a scraped prospect there is no post text and
  // every rule comes back UNKNOWN, which is why this is a lookup and not an
  // evaluation: prescreen is not judging anything, it is remembering what was
  // already decided when the lead was scored.
  //
  // Only the two strongest semantics stop anything here. A LEAN_SKIP is a
  // judgement about one post, and a business that wrote a salesy post is not
  // disqualified from ever being researched.
  const qual = settings ? qualificationFlags(p, settings) : null;
  if (qual?.action && (qual.action.semantic === RED.HARD_SKIP || qual.action.semantic === RED.OUTREACH_EXCLUSION)) {
    return {
      pass: false,
      verdict: VERDICT.SKIP,
      reasons: [`Your own rule: ${qual.action.text}. ${qual.action.why}`],
      needsProbe: false,
      rule: `qualification:${qual.action.semantic}`,
      qualification: qual,
    };
  }
  if (qual?.action?.semantic === RED.COST_GUARD) {
    // Not a skip. Research just stops being automatic.
    reasons.push(`Your own rule says not to spend on this automatically: ${qual.action.text}`);
  }

  const domain = String(p.domain || '').trim();
  if (!domain) {
    return {
      pass: false,
      verdict: VERDICT.SKIP,
      reasons: ['No website on the record, so there is nothing to audit and nothing to point at.'],
      needsProbe: false,
      rule: 'no-domain',
      // Actionable rather than final: find the site and this becomes vettable.
      fixable: 'Add their domain and run this again.',
    };
  }

  // A domain that is plainly not their own site. Auditing a linktree tells you
  // about linktree.
  if (/^(www\.)?(linktr\.ee|linkin\.bio|beacons\.ai|bio\.link|solo\.to|campsite\.bio|facebook\.com|instagram\.com|m\.me)/i.test(domain)) {
    return {
      pass: false,
      verdict: VERDICT.SKIP,
      reasons: [`${domain} is a links page, not their own site. Anything wrong with it belongs to the platform.`],
      needsProbe: false,
      rule: 'not-their-site',
      fixable: 'Find their real website first.',
    };
  }

  const sum = evidenceSummary(p, { now });

  // Ary already looked. Her findings ARE the research; buying a probe to
  // confirm what she saw is paying to be told something twice.
  if (sum.manual.length > 0) {
    reasons.push(`${sum.manual.length} finding${sum.manual.length === 1 ? '' : 's'} Ary recorded herself.`);
    return {
      pass: true,
      verdict: VERDICT.STRONG,
      reasons,
      needsProbe: false,
      rule: 'manual-evidence',
    };
  }

  // Fresh probe already on file AND enough in it to decide on.
  //
  // Freshness alone used to be the whole test, and that was the bug. A probe
  // that ran an hour ago and found nothing but a stale copyright line is
  // perfectly fresh and still gives nobody a reason to write, so skipping the
  // paid check on that basis handed back an empty prospect labelled as
  // researched. The evidence has to be fresh AND sufficient.
  if (sum.intel && sum.intelFresh && sum.intel.blocked) {
    reasons.push(`Checked ${Math.round(ageInDays(sum.intel, now))} days ago: site could not be read (${sum.intel.blocked.reason}).`);
    return { pass: false, verdict: VERDICT.SKIP, reasons, needsProbe: false, rule: 'blocked' };
  }
  // Fresh AND thorough. Two different tests, and keeping them apart is the
  // point: "did we look properly" decides whether to pay again, "is there
  // enough to say" decides whether to write. A thorough probe that found
  // nothing has answered the question and must not be re-bought; a shallow
  // record that only knows the homepage exists has not, however recent it is.
  if (sum.intel && sum.intelFresh && isThorough(sum.intel)) {
    const n = (sum.intel.reasons || []).length;
    reasons.push(
      sum.intel.blocked
        ? `Checked ${Math.round(ageInDays(sum.intel, now))} days ago: site could not be read (${sum.intel.blocked.reason}).`
        : `Checked ${Math.round(ageInDays(sum.intel, now))} days ago: ${n} verified problem${n === 1 ? '' : 's'}.`
    );
    return {
      pass: true,
      verdict: sum.intel.blocked ? VERDICT.SKIP : (sum.intel.worth ? VERDICT.STRONG : VERDICT.MAYBE),
      reasons,
      needsProbe: false,
      rule: 'fresh-intel',
    };
  }

  // Past this point a probe is the only way to learn anything, so the question
  // becomes whether this prospect is worth one.
  if (sum.intel && !sum.intelFresh) {
    reasons.push(`Last checked ${Math.round(ageInDays(sum.intel, now))} days ago, past the ${FRESH_DAYS}-day window.`);
  } else if (sum.intel && !isThorough(sum.intel)) {
    // Recent, but shallow. Saying "checked 2 days ago" would be true and
    // misleading: it never actually looked at anything.
    reasons.push('There is a recent record, but it never got past the front page. Nothing was really checked.');
  } else {
    reasons.push('Never checked.');
  }

  if (p.replied) {
    reasons.push(`They already replied (${p.reply_type || 'yes'}), which is a better signal than any audit.`);
    return { pass: true, verdict: VERDICT.STRONG, reasons, needsProbe: true, rule: 'replied', qualification: qual };
  }

  return {
    pass: true,
    verdict: VERDICT.MAYBE,
    reasons,
    needsProbe: true,
    rule: 'needs-evidence',
    qualification: qual,
    // A cost guard does not say the prospect is bad, only that the unattended
    // sweep should not spend on them. Asking for the check by hand still works.
    autoResearch: qual?.action?.semantic === RED.COST_GUARD ? false : true,
  };
}

// ── Stage C: the verdict ──────────────────────────────────────────────────
// Named levels with reasons. No composite score: a single number invites
// arithmetic on something nobody measured, and hides which part is weak.

const level = (v) => (v ? 'strong' : 'weak');

export function buildVetResult(p = {}, { prescreenResult = null, now = new Date(), settings = null } = {}) {
  const pre = prescreenResult || prescreen(p, { now, settings });
  const sum = evidenceSummary(p, { now });
  const intel = sum.intel;
  // A dimension of its own, kept beside the others rather than folded in.
  //
  // The temptation is to add green matches to fit and red matches to
  // opportunity and be done. That collapse is exactly what the five separate
  // dimensions exist to prevent: "excellent fit, no opportunity" and "weak fit,
  // real problem on their site" are different decisions, and a prospect who
  // told the world their front desk cannot keep up is the first kind. Wanting
  // them badly is not the same as having something true to say to them.
  const qual = pre.qualification || (settings ? qualificationFlags(p, settings) : null);

  // FIT — do they look like somebody who could buy this? Deliberately coarse:
  // the tracker holds a niche and a country, not firmographics, and pretending
  // otherwise would be the fake precision this file exists to avoid.
  const fitReasons = [];
  let fit = 'unknown';
  if (String(p.domain || '').trim()) {
    fit = 'plausible';
    fitReasons.push('They have their own website.');
  }
  if (p.niche) fitReasons.push(`Niche on record: ${p.niche}.`);

  // Green rules raise fit and nothing else. This is the one place they are
  // allowed to move a level, and the level they move is the one that means
  // "looks like our kind of business", never the one that means "there is
  // something wrong with their site".
  if (qual?.matchedGreen?.length) {
    if (fit !== 'poor') fit = 'good';
    fitReasons.push(
      `${qual.matchedGreen.length} of your own green rules matched what they wrote: ${qual.matchedGreen.map((r) => r.text).join('; ')}.`
    );
  }

  // What the platform implies. Recovered from the website-audit skill, which
  // the app had none of: a full practice-management suite means the owner
  // already feels covered, a booking tool means the opportunity is whatever is
  // missing around it, and GoHighLevel means look before deciding either way.
  if (intel?.platform) {
    const pv = platformVerdict(intel.platform);
    fitReasons.push(pv.reason);
    if (pv.verdict === 'covered') fit = 'poor';
    else if (pv.verdict === 'build-around' || pv.verdict === 'inspect') fit = 'good';
  }

  // No booking used to read here as a straightforward fit signal: "no booking
  // system, which is the thing Bloomwired sells". The audit skill is explicit
  // that it often is not. Plenty of practitioners skip online booking on
  // purpose, to screen people before committing time, and telling one of them
  // they are missing booking says immediately that nobody looked.
  const sched = schedulingStance({ hasBooking: intel?.hasBooking, hasForm: intel?.hasForm });
  if (sched.stance === 'manual-by-choice') {
    fit = fit === 'poor' ? 'poor' : 'good';
    fitReasons.push(sched.note);
    fitReasons.push(sched.angle);
  } else if (sched.stance === 'no-booking') {
    fit = fit === 'poor' ? 'poor' : 'good';
    fitReasons.push('No booking and no obvious request path on the site.');
  } else if (sched.stance === 'has-booking') {
    fitReasons.push(sched.note);
  }
  if (!fitReasons.length) fitReasons.push('Nothing on record says whether they fit.');

  // OPPORTUNITY — is there a real problem worth raising?
  const solid = [...sum.manual, ...sum.verified.filter((e) => e.confidence === CONFIDENCE.HIGH)];
  const problems = solid.filter((e) => !e.text.startsWith('They opened'));
  let opportunity = 'none';
  const oppReasons = [];
  if (sum.strength.level === 'strong') {
    opportunity = 'clear';
    oppReasons.push(`${sum.strength.strong} verified problems worth raising.`);
  } else if (sum.strength.level === 'sufficient') {
    opportunity = 'thin';
    oppReasons.push('One thing worth raising. Enough to mention, not enough to build a video around.');
  } else if (sum.strength.cosmeticOnly) {
    oppReasons.push(`${sum.strength.solid} things verified, all cosmetic. None of them costs them anything.`);
  } else if (intel && !intel.blocked) {
    oppReasons.push('The probe checked their site and found nothing worth raising.');
  } else {
    oppReasons.push('Nothing verified yet.');
  }

  // EVIDENCE QUALITY — how well we know what we know. This is about the
  // method, not the yield.
  //
  // The distinction that matters: "a browser checked the site and found
  // nothing" is not the same as "nobody has looked". The first is a real
  // answer and a reason to move on; the second is a gap. Collapsing them into
  // 'none' made a properly-checked clean site look identical to a prospect
  // nobody had opened, and both came back MAYBE.
  const probed = Boolean(intel && !intel.blocked);
  const evidenceQuality = sum.manual.length
    ? 'manual'
    : sum.verified.some((e) => e.confidence === CONFIDENCE.HIGH)
      ? 'verified'
      : probed && sum.intelFresh
        ? 'verified' // checked recently, nothing found. Still knowledge.
        : sum.verified.length || probed
          ? 'stale'
          : 'none';

  // TIMING — is there a reason this matters now, rather than any week?
  const timingReasons = [];
  let timing = 'neutral';
  const watched = sum.verified.find((e) => e.text.startsWith('They opened'));
  if (watched) {
    timing = 'now';
    timingReasons.push(`They watched the audit video${watched.observedAt ? ` on ${String(watched.observedAt).slice(0, 10)}` : ''}.`);
  } else if (p.replied && !p.last_contact_date) {
    timing = 'now';
    timingReasons.push('They replied and nothing has gone back yet.');
  } else if (p.next_action_date && p.next_action_date <= toIso(now)) {
    timing = 'now';
    timingReasons.push('Their follow-up date has arrived.');
  } else if (p.video_url && !p.video_sent_at) {
    timing = 'now';
    timingReasons.push('A recorded video is sitting unsent.');
  } else {
    timingReasons.push('No particular reason this week rather than next.');
  }

  // CONFIDENCE in the verdict itself, which is a different question from how
  // good the prospect is.
  let confidence = CONFIDENCE.LOW;
  if (evidenceQuality === 'manual') confidence = CONFIDENCE.HIGH;
  else if (evidenceQuality === 'verified') confidence = CONFIDENCE.HIGH;
  else if (evidenceQuality === 'stale') confidence = CONFIDENCE.MEDIUM;

  // The call.
  let verdict;
  if (!pre.pass) {
    verdict = VERDICT.SKIP;
  } else if (opportunity === 'clear' && evidenceQuality !== 'none') {
    verdict = VERDICT.STRONG;
  } else if (timing === 'now' && evidenceQuality !== 'none') {
    verdict = VERDICT.STRONG;
  } else if (opportunity === 'none' && evidenceQuality === 'verified') {
    // We looked properly and there is nothing to say. That is a real answer.
    verdict = VERDICT.SKIP;
  } else {
    verdict = VERDICT.MAYBE;
  }

  const next = recommendNext({ verdict, pre, opportunity, timing, evidenceQuality, p });

  return {
    verdict,
    fit: { level: fit, reasons: fitReasons },
    opportunity: { level: opportunity, reasons: oppReasons },
    evidenceQuality: { level: evidenceQuality, reasons: qualityReasons(sum) },
    timing: { level: timing, reasons: timingReasons },
    // The fifth dimension. Which of the workspace's own rules fired, which
    // could not be evaluated, and which could never apply here at all.
    qualification: qual
      ? {
        configured: qual.configured,
        known: qual.known,
        provider: qual.provider,
        green: qual.matchedGreen.map((r) => ({ id: r.id, text: r.text, effect: r.effect, source: r.source })),
        red: qual.matchedRed.map((r) => ({ id: r.id, text: r.text, semantic: r.semantic, source: r.source })),
        unknown: qual.unknown.length,
        // Reported separately from unknown on purpose. A Maps prospect with
        // twenty inapplicable rules has not been researched badly; it came
        // from somewhere that cannot produce what those rules ask about.
        notApplicable: qual.notApplicable.length,
        action: qual.action,
      }
      : { configured: false, known: false, green: [], red: [], unknown: 0, notApplicable: 0, action: null },
    // Every channel that contributed, named and kept apart.
    //
    // The alternative is a single confident sentence, and a single sentence is
    // where "they said their inquiries go cold" and "their booking is a form"
    // become the same undifferentiated reason to be optimistic. They are two
    // independent pieces of evidence, and the combination is worth more than
    // either precisely because they came from different places.
    provenance: provenanceOf(p, { qual, sum, fitReasons }),
    confidence,
    why: pre.reasons.concat(oppReasons).slice(0, 4),
    verified: solid.map((e) => ({ text: e.text, method: e.method, at: e.observedAt, tier: e.tier })),
    unknown: sum.gaps,
    next,
    // What Stage B would cost if the caller goes ahead. Zero when the answer
    // is already on file.
    probeNeeded: Boolean(pre.needsProbe),
  };
}

// Which evidence channel said what. Order is deliberate: what they said about
// themselves first, then what was measured, then what a person saw, then
// whether this workspace can do anything about any of it.
function provenanceOf(p, { qual, sum, fitReasons }) {
  const out = [];
  if (qual?.matchedGreen?.length) {
    out.push({
      channel: 'SOURCE SIGNAL',
      from: qual.provider,
      lines: qual.matchedGreen.map((r) => r.text),
    });
  }
  if (qual?.matchedRed?.length) {
    out.push({ channel: 'SOURCE WARNING', from: qual.provider, lines: qual.matchedRed.map((r) => r.text) });
  }
  const verified = sum.verified.filter((e) => e.confidence === CONFIDENCE.HIGH).map((e) => e.text);
  if (verified.length) out.push({ channel: 'WEBSITE', from: 'site check', lines: verified.slice(0, 4) });
  if (sum.manual.length) out.push({ channel: 'SEEN BY A PERSON', from: 'manual', lines: sum.manual.map((e) => e.text).slice(0, 4) });
  if (fitReasons.length) out.push({ channel: 'WORKSPACE FIT', from: 'settings', lines: fitReasons.slice(0, 3) });
  return out;
}

function qualityReasons(sum) {
  const out = [];
  if (sum.manual.length) out.push(`${sum.manual.length} from Ary directly.`);
  const fresh = sum.verified.filter((e) => e.confidence === CONFIDENCE.HIGH).length;
  const stale = sum.verified.length - fresh;
  if (fresh) out.push(`${fresh} measured in a browser.`);
  if (stale) out.push(`${stale} measured but now stale.`);
  if (!out.length) out.push('Nothing verified.');
  return out;
}

function recommendNext({ verdict, pre, opportunity, timing, evidenceQuality, p }) {
  if (pre.fixable) return pre.fixable;
  if (verdict === VERDICT.SKIP) {
    if (evidenceQuality === 'verified' && opportunity === 'none') {
      return 'Their site is fine as far as a browser can tell. Contact them about something else, or leave them.';
    }
    return 'Leave this one. Spend the time on somebody with a reason attached.';
  }
  if (timing === 'now' && p.replied && !p.last_contact_date) return 'Answer their reply. That is the whole job today.';
  if (timing === 'now' && p.video_url && !p.video_sent_at) return 'Send the video that is already recorded.';
  if (pre.needsProbe) return 'Run the site check to find out whether there is anything to point at.';
  if (opportunity === 'clear') return 'Record the audit video. There is enough to build one around.';
  if (opportunity === 'thin') return 'Worth one email mentioning what was found. Not worth a video.';
  return 'Look at their site yourself and add what you notice.';
}

function toIso(d) {
  return new Date(d).toISOString().slice(0, 10);
}
