// The workspace's own qualification rules, made consequential without being
// guessed at.
//
// Ary wrote ten green rules and ten red rules months ago. Until now only the
// social lead scorer read them, and the obvious-sounding fix was to feed them
// into prescreen and Vet as well. Reading them first shows why that would have
// been wrong.
//
// Every one of the twenty describes what somebody WROTE. "Inquiries going cold
// before they book" is a sentence in a post. "Ends on a call to action instead
// of a question" is the shape of a post. None of them is a property of a
// business that a site probe could observe. So for a prospect scraped from a
// map or an ad library there is no post, no text, and therefore no honest way
// to evaluate any of them. The correct output there is UNKNOWN, not a guess.
//
// Where the text DOES exist — a prospect promoted from a scored lead — the
// qualification already happened and the product was throwing the structure
// away at promotion. That is the real gap this file closes.
//
// Two hard rules, both enforced by tests:
//   1. A green rule may raise fit or priority. It may never create evidence,
//      and it may never turn "nothing verified" into a reason to write.
//   2. A red rule is not automatically a permanent skip. Half of Ary's are
//      about the shape of one post, and a business that wrote a salesy post on
//      Tuesday is not disqualified forever.

import { capabilitiesOf } from './workspace-fit.mjs';
import { SOURCE, PROVIDER, possibleSources, availableSources, parseQualification } from './sources.mjs';

const PROVIDER_UNKNOWN = PROVIDER.UNKNOWN;

// What a rule evaluation can conclude. Four answers, not two, and the two
// added ones carry most of the weight.
//
// NOT_MATCHED and UNKNOWN were the same thing before, and NOT_APPLICABLE did
// not exist. That collapse had a direction: every Google Maps prospect looked
// weaker than every social lead, forever, because the twenty rules ask about a
// post and a map listing has never had one. Nothing about the business.
export const RESULT = {
  // The rule fired, and we can say what justified it.
  MATCHED: 'MATCHED',
  // Checked against real evidence of the right kind. It is not true here.
  NOT_MATCHED: 'NOT_MATCHED',
  // The right kind of evidence could exist for this prospect and does not, or
  // exists and needs a judgement nothing here can make.
  UNKNOWN: 'UNKNOWN',
  // This prospect's origin cannot ever supply what the rule asks about. Not a
  // gap to fill: asking a map listing what somebody posted is a category
  // error, and recording it as a gap makes the prospect look researched-badly
  // rather than differently-sourced.
  NOT_APPLICABLE: 'NOT_APPLICABLE',
};

// What a red rule actually means. The nuance the single green/red verdict
// destroyed: these are five different instructions, not one.
export const RED = {
  // Outside the intended market, permanently. Nothing later changes it.
  HARD_SKIP: 'HARD_SKIP',
  // A negative signal about this post or this moment. Other strong evidence
  // may still justify a look.
  LEAN_SKIP: 'LEAN_SKIP',
  // Do not spend deep research automatically. Says nothing about quality.
  COST_GUARD: 'COST_GUARD',
  // Needs a person. The rule is real and a machine cannot call it.
  HUMAN_REVIEW: 'HUMAN_REVIEW',
  // A valid business the current offer is wrong for.
  OUTREACH_EXCLUSION: 'OUTREACH_EXCLUSION',
};

// What a green rule improves. Never evidence, in any of these cases.
export const GREEN = {
  // They asked out loud for a thing this workspace sells.
  STATED_NEED: 'STATED_NEED',
  // They described a problem this workspace fixes.
  STATED_PAIN: 'STATED_PAIN',
  // Looks like the right kind of business. Weakest of the three.
  FIT_SIGNAL: 'FIT_SIGNAL',
};

// Where the fact a rule needs actually lives.
export const NEEDS = {
  // Only knowable from something the prospect wrote.
  POST_TEXT: 'post-text',
  // Knowable from the prospect record itself.
  RECORD: 'record',
};

// Rule families a regex can decide from post text with enough precision to be
// trusted. Everything outside this list needs the model, and outside a scored
// lead there is nothing to run the model on.
const FAMILIES = [
  {
    family: 'procurement',
    inRule: /\brfp\b|\btender\b|procurement|purchasing department|vendor onboarding/i,
    // "Tender" alone is a trap: a pet groomer advertising tender loving care
    // is not running a procurement process. The word only counts with the
    // process around it.
    inText: /\brfps?\b|request for proposals?|(invitation to|submit(ting)? a|open|public) tenders?\b|\btender (process|document|submission|notice)\b|vendor onboarding|procurement (process|portal|team)|purchasing department|supplier registration/i,
  },
  {
    family: 'scam',
    inRule: /\bscam\b|\bfraud\b|too good to be true|pay to apply|clout bait/i,
    inText: /pay to apply|application fee|registration fee|processing fee|no experience (needed|required)|wire transfer|western union|\bcrypto (payment|only)\b|dm me on telegram/i,
  },
  {
    family: 'free-work',
    inRule: /free work|spec build|\bfavou?r\b|unpaid|pro ?bono/i,
    inText: /\bfor free\b|free of charge|\bunpaid\b|spec work|test task|sample (work|project) first|quick favou?r|pro ?bono|\bfor exposure\b/i,
  },
  {
    family: 'employee',
    inRule: /full[- ]time (employee|hire|staff)|salaried|\bsalary\b|job[- ]seeker/i,
    inText: /full[- ]?time (employee|position|role|hire)|salaried|annual salary|benefits package|\bpayroll\b|40 hours a week/i,
  },
];

// Services a rule can name. Used only on red rules: if a red rule is about
// somebody wanting a service this workspace does not sell, that is an offer
// mismatch rather than a bad prospect.
const SERVICES = [
  ['ads', /\bads?\b|advertis|paid media|\bppc\b|media buying/i],
  ['content', /\bcontent\b|copywriting|video editing|social media (management|posts|manager)/i],
  ['seo', /\bseo\b|search rankings?/i],
  ['website', /website (build|rebuild|design)|web design|landing page build/i],
];

// The shape of a post rather than a fact about the business.
const POST_SHAPE = /\bpost\b|call to action|\bcta\b|testimonial|screenshot|scarcity|\bspots? (left|open)\b|link in bio|\bdm me\b|engagement|\bpoll\b|hot take|\bhook\b|comment a word/i;

// Bumped when the classifier's reading of a rule could change. Stored on a
// qualification snapshot so a verdict reached under old semantics is not
// silently compared against one reached under new.
export const RULES_VERSION = 1;

// Somebody describing their own situation. The giveaway that a rule needs
// words rather than observation.
//
// This is what keeps "running ads but the inquiries are not converting" scoped
// to POST_TEXT. That they run ads is observable from an ad library; that the
// inquiries are not converting is only ever something they say. Letting the
// observable half stand in for the whole rule is exactly the impersonation
// this file exists to stop.
const IS_A_STATEMENT = /losing|missing|\bmissed\b|not converting|going cold|never book|cannot keep up|can't keep up|asking for|looking for|\bwants?\b|\bhiring\b|\bno[- ]shows?\b|slammed|\bgaps?\b|\bsays?\b|\btold\b/i;

// Which evidence types could legitimately support this rule.
export function scopeOf(text) {
  const t = String(text || '');
  if (/\breplied\b|\bsaid\b|told (me|us)|not right now|responded|answered/i.test(t) && !IS_A_STATEMENT.test(t)) {
    return [SOURCE.CONVERSATION];
  }
  // Anything about the thing itself rather than about somebody's experience of
  // it. The statement guard does the heavy lifting: "asking for a booking
  // system" mentions booking and is plainly a person talking, so it stays where
  // it belongs.
  if (/website|\bsite\b|homepage|landing page|booking page|\bform\b|\bbooking\b|scheduling|checkout|calendar/i.test(t) && !IS_A_STATEMENT.test(t)) {
    return [SOURCE.WEBSITE];
  }
  if (/\bcategory\b|\bindustry\b|\bniche\b|located|\bcountry\b|\bcity\b|reviews?\b|star rating/i.test(t) && !IS_A_STATEMENT.test(t)) {
    return [SOURCE.BUSINESS_PROFILE, SOURCE.MAP_LISTING];
  }
  if (/running ads|paying to run|ad library|currently advertis/i.test(t) && !IS_A_STATEMENT.test(t)) {
    return [SOURCE.AD];
  }
  // Everything else is somebody talking. That is what all twenty of the rules
  // in this workspace turn out to be.
  return [SOURCE.POST_TEXT];
}

// A stable identifier for a rule, derived from its words. Editing a rule
// produces a new id on purpose: a package traced to "green-inquiries-going-
// cold" must not silently start meaning something else because the sentence
// was rewritten.
export function ruleId(type, text) {
  const slug = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .slice(0, 4)
    .join('-');
  return `${type}-${slug || 'unnamed'}`;
}

const STOP = new Set([
  'the', 'and', 'for', 'that', 'this', 'with', 'not', 'but', 'into', 'instead',
  'they', 'their', 'them', 'you', 'your', 'has', 'have', 'had', 'are', 'was',
  'from', 'what', 'when', 'who', 'while', 'then', 'than', 'about', 'over',
  'post', 'rule', 'matched', 'matches', 'signal', 'flag',
]);

function familyOf(text) {
  const f = FAMILIES.find((x) => x.inRule.test(text));
  return f ? f.family : null;
}

function mismatchedService(text, caps) {
  if (!caps.known) return null;
  for (const [name, re] of SERVICES) {
    if (!re.test(text)) continue;
    // The capability vocabulary does not carry ads/content/seo separately for
    // most workspaces, so the test is simply whether the offer mentions it.
    if (!new RegExp(name, 'i').test(caps.from || '')) return name;
  }
  return null;
}

// What does this red rule instruct us to do? Keyword families, deliberately
// generic: these rules are user-editable free text, and a classifier keyed to
// Ary's exact sentences would be the workspace leak this pass exists to remove.
export function classifyRed(text, settings = {}) {
  const t = String(text || '');
  const caps = capabilitiesOf(settings);

  if (/\bscam\b|\bfraud\b|too good to be true|pay to apply|clout bait/i.test(t)) {
    return { semantic: RED.HARD_SKIP, why: 'Not a real buyer in any circumstance.' };
  }
  if (/another (provider|agency|freelancer)|competitor|advertising their (own )?service/i.test(t)) {
    return { semantic: RED.HARD_SKIP, why: 'A competitor is never a customer.' };
  }
  if (FAMILIES[0].inRule.test(t)) {
    return { semantic: RED.OUTREACH_EXCLUSION, why: 'A real organisation, buying through a process a solo operator cannot enter.' };
  }
  if (FAMILIES[3].inRule.test(t)) {
    return { semantic: RED.OUTREACH_EXCLUSION, why: 'They want to hire a person, not buy a setup. Different purchase entirely.' };
  }
  const service = mismatchedService(t, caps);
  if (service) {
    return { semantic: RED.OUTREACH_EXCLUSION, why: `They want ${service}, which this workspace does not sell.` };
  }
  if (FAMILIES[2].inRule.test(t)) {
    return { semantic: RED.LEAN_SKIP, why: 'No sign of a budget in this ask. It does not disqualify the business.' };
  }
  if (/older than|\bstale\b|expired|out of date|\bdays? old\b/i.test(t)) {
    return { semantic: RED.COST_GUARD, why: 'Too old to chase. Not a judgement about the business.' };
  }
  if (POST_SHAPE.test(t)) {
    return { semantic: RED.LEAN_SKIP, why: 'A judgement about this post, not about the business behind it.' };
  }
  return { semantic: RED.HUMAN_REVIEW, why: 'Real rule, and nothing here can decide it mechanically.' };
}

export function classifyGreen(text) {
  const t = String(text || '');
  if (/\basking for\b|\blooking for\b|\bneed(s|ing)? (a|an|help)\b|\bwants?\b|\bhiring\b/i.test(t)) {
    return { effect: GREEN.STATED_NEED, why: 'They asked out loud.' };
  }
  if (/losing|missing|\bmissed\b|\blost\b|cannot keep up|can't keep up|not converting|going cold|never book|no[- ]shows?|gaps?\b/i.test(t)) {
    return { effect: GREEN.STATED_PAIN, why: 'They described the problem themselves.' };
  }
  return { effect: GREEN.FIT_SIGNAL, why: 'Suggests the right kind of business.' };
}

// Semantics that stop something. Everything else is advisory, and the
// difference is what a caller needs to know before acting on a flag.
const HARD = new Set([RED.HARD_SKIP, RED.OUTREACH_EXCLUSION]);

// Read the stored rules and classify each one. Pure: no database, no model.
//
// Each rule comes back as a record product logic can reason about, rather than
// a sentence to paste into a prompt. The question "can this rule even be
// evaluated from what we have" has to be answerable in code, and prose cannot
// answer it.
export function readRules(settings = {}) {
  const green = (settings.greenRules || []).filter(Boolean).map((text) => {
    const c = classifyGreen(text);
    return {
      id: ruleId('green', text),
      type: 'GREEN',
      text,
      appliesTo: scopeOf(text),
      family: familyOf(text),
      hard: false,
      version: RULES_VERSION,
      ...c,
    };
  });
  const red = (settings.redRules || []).filter(Boolean).map((text) => {
    const c = classifyRed(text, settings);
    return {
      id: ruleId('red', text),
      type: 'RED',
      text,
      appliesTo: scopeOf(text),
      family: familyOf(text),
      hard: HARD.has(c.semantic),
      version: RULES_VERSION,
      ...c,
    };
  });
  return { green, red, all: [...green, ...red], version: RULES_VERSION };
}

// ── Matching ─────────────────────────────────────────────────────────────
// Two honest paths to "this rule fired", and no third.

function words(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

// Did the lead scorer say this rule matched? The model was asked for "which of
// my rules matched", so its reasons restate them. Overlap has to be high:
// a miss lands in UNKNOWN, which is safe, and a false match would attach
// somebody else's qualification to this prospect forever.
function reasonMatchesRule(reason, rule) {
  const rw = words(rule.text);
  if (rw.length < 2) return false;
  const seen = new Set(words(reason));
  const hits = rw.filter((w) => seen.has(w)).length;
  return hits >= 2 && hits / rw.length >= 0.5;
}

// Evaluate the rules against what is actually known.
//
// `postText` is what they wrote, if the record carries it. `leadReasons` is
// what the lead scorer already concluded. With neither, everything comes back
// UNKNOWN, which is the correct answer for a scraped prospect and the reason
// this function will not invent one.
export function matchRules(rules, { postText = '', leadReasons = [], possible = null, available = null } = {}) {
  const text = String(postText || '');
  const reasons = (Array.isArray(leadReasons) ? leadReasons : []).map(String);
  const results = [];

  for (const rule of rules.all) {
    const base = { id: rule.id, type: rule.type, text: rule.text, appliesTo: rule.appliesTo, hard: rule.hard };

    // Can this prospect's origin ever supply what the rule asks about?
    //
    // Checked before anything else, because a map listing that has never had a
    // post is not a prospect with a gap in its research. Recording it as one
    // is how every Maps prospect ends up permanently below every social lead
    // for a reason that has nothing to do with the business.
    if (possible && !rule.appliesTo.some((s) => possible.has(s))) {
      results.push({
        ...base,
        result: RESULT.NOT_APPLICABLE,
        why: `Needs ${rule.appliesTo.join(' or ').toLowerCase().replace(/_/g, ' ')}, which this prospect's origin cannot produce.`,
      });
      continue;
    }

    const fromScoring = reasons.find((r) => reasonMatchesRule(r, rule));
    if (fromScoring) {
      results.push({ ...base, ...rule, result: RESULT.MATCHED, source: 'lead-scoring', quote: fromScoring.slice(0, 200) });
      continue;
    }

    const fam = rule.family ? FAMILIES.find((f) => f.family === rule.family) : null;
    if (fam && text) {
      const m = text.match(fam.inText);
      if (m) {
        results.push({ ...base, ...rule, result: RESULT.MATCHED, source: 'deterministic', quote: m[0].slice(0, 120) });
        continue;
      }
      // Checked against real evidence of the right kind and not found. That is
      // an answer, and a different one from never having looked.
      results.push({ ...base, result: RESULT.NOT_MATCHED, why: 'Checked against what they wrote. Not there.' });
      continue;
    }

    // The right kind of evidence is possible for this prospect. We either do
    // not have it, or have it and cannot decide mechanically.
    const haveIt = available && rule.appliesTo.some((s) => available.has(s));
    results.push({
      ...base,
      result: RESULT.UNKNOWN,
      why: haveIt
        ? 'Needs a judgement nothing here can make from the text on record.'
        : `Nothing of the right kind is on the record yet (${rule.appliesTo.join(', ').toLowerCase().replace(/_/g, ' ')}).`,
    });
  }

  const of = (r, t) => results.filter((x) => x.result === r && (!t || x.type === t));
  return {
    results,
    matchedGreen: of(RESULT.MATCHED, 'GREEN'),
    matchedRed: of(RESULT.MATCHED, 'RED'),
    notMatched: of(RESULT.NOT_MATCHED),
    unknown: of(RESULT.UNKNOWN),
    notApplicable: of(RESULT.NOT_APPLICABLE),
  };
}

// ── The product-facing answer ────────────────────────────────────────────

// The strongest instruction among the red rules that fired.
const SEVERITY = [RED.HARD_SKIP, RED.OUTREACH_EXCLUSION, RED.COST_GUARD, RED.HUMAN_REVIEW, RED.LEAN_SKIP];

// Qualification flags for one prospect: a dimension of its own, sitting beside
// evidence rather than inside it.
//
// Returns `evidence: never` as a literal field. It is there to be asserted on:
// the one thing this must never do is contribute to whether there is something
// true to say about a prospect.
export function qualificationFlags(p = {}, settings = {}) {
  const rules = readRules(settings);
  const empty = {
    configured: false, matchedGreen: [], matchedRed: [], unknown: [], notMatched: [],
    notApplicable: [], action: null, greenWeight: 0, evidence: 'never',
  };
  if (!rules.all.length) return empty;

  const { postText, leadReasons } = factsFor(p);
  const { provider, possible } = possibleSources(p);
  const available = availableSources(p, { qualification: parseQualification(p) });
  // NOT_APPLICABLE is a claim about where a prospect came from, so it may only
  // be made when that is known. For the 4,787 rows whose origin was never
  // recorded, "this could never have had post text" is not something anybody
  // can say: the rules come back UNKNOWN, which is the truth.
  const scoped = provider === PROVIDER_UNKNOWN ? null : possible;
  const m = matchRules(rules, { postText, leadReasons, possible: scoped, available });

  let action = null;
  for (const s of SEVERITY) {
    const hit = m.matchedRed.find((r) => r.semantic === s);
    if (hit) { action = { semantic: s, rule: hit.id, text: hit.text, why: hit.why }; break; }
  }

  return {
    configured: true,
    known: Boolean(postText || leadReasons.length),
    provider,
    rulesVersion: RULES_VERSION,
    matchedGreen: m.matchedGreen,
    matchedRed: m.matchedRed,
    unknown: m.unknown,
    notMatched: m.notMatched,
    // The count that stops a differently-sourced prospect from reading as a
    // badly-researched one.
    notApplicable: m.notApplicable,
    action,
    // Priority weight for Pick's tie-break. Ordered so a stated need outranks
    // a described pain outranks a general fit signal.
    greenWeight: m.matchedGreen.reduce((n, r) => n + (r.effect === GREEN.STATED_NEED ? 3 : r.effect === GREEN.STATED_PAIN ? 2 : 1), 0),
    evidence: 'never',
  };
}

// The qualification a source produced, frozen at the moment it produced it.
//
// The principle this exists to protect: a prospect who wrote "my inquiries keep
// disappearing before they book" qualified on POST_TEXT evidence, and a site
// check three weeks later finding a tidy website does not make that untrue. It
// adds a second kind of evidence. Website research must never rewrite history
// about why a source lead originally qualified.
export function buildSnapshot({ rules, matched, sourceType, provider, sourceRef = null, sourceAt = null, verdict = null, confidence = null, scorerVersion = null, postText = '' }) {
  const ids = (list) => list.map((r) => r.id);
  return {
    sourceType,
    provider,
    sourceRef,
    sourceAt,
    scorerVersion,
    rulesVersion: rules.version ?? RULES_VERSION,
    verdict,
    confidence,
    matchedGreen: matched.matchedGreen.map((r) => ({ id: r.id, effect: r.effect, source: r.source })),
    matchedRed: matched.matchedRed.map((r) => ({ id: r.id, semantic: r.semantic, source: r.source })),
    notMatched: ids(matched.notMatched),
    unknown: ids(matched.unknown),
    notApplicable: ids(matched.notApplicable),
    // Kept because the rules are re-read on every prospect and the text is the
    // only thing that can answer them. Capped: this is evidence, not an archive.
    postText: String(postText || '').slice(0, 4000),
    from: 'lead',
  };
}

// What the record actually knows about what this prospect wrote.
//
// A promoted lead carries its post and its verdict into `info` as prose, and
// `qualification` as structure once migration 041 is in. Both are read, and
// neither is invented.
export function factsFor(p = {}) {
  let stored = null;
  try { stored = p.qualification ? JSON.parse(p.qualification) : null; } catch { stored = null; }
  if (stored) {
    return {
      postText: String(stored.postText || ''),
      leadReasons: Array.isArray(stored.reasons) ? stored.reasons : [],
    };
  }
  // Fallback for rows promoted before the structure existed. The promote route
  // writes a recognisable header, so this reads a real record rather than
  // guessing at free text.
  const info = String(p.info || '');
  const post = info.match(/^Post \([^)]*\):\n([\s\S]*?)(?:\n\n|$)/m);
  const verdict = info.match(/^Verdict: \w+ — (.+)$/m);
  return {
    postText: post ? post[1] : '',
    leadReasons: verdict ? verdict[1].split(';').map((s) => s.trim()).filter(Boolean) : [],
  };
}
