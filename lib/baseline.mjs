// Do we actually have enough data to learn anything yet?
//
// That is the only question this file answers. It is not a performance
// dashboard and must not become one before there is something to see: the
// measurement infrastructure shipping is not itself a result, and the strongest
// temptation once counting works is to start explaining the counts.
//
// So: counts for the structured cohort, a sample-size verdict beside every one,
// and no comparisons at all. "Playbook A is doing better" off three sends is
// not a finding, it is two coin flips and a story.

import { COHORT, STRUCTURED_FROM } from './cohort.mjs';

// How much is enough, per kind of question. Written down rather than left to
// whoever writes the first analysis, because that is the moment the threshold
// gets chosen to fit the answer somebody already wants.
export const GATE = {
  INSUFFICIENT: 'INSUFFICIENT',
  EARLY_SIGNAL: 'EARLY_SIGNAL',
  USABLE: 'USABLE',
  STRONGER_EVIDENCE: 'STRONGER_EVIDENCE',
};

// A plain count: how many prospects reached a stage. Cheap to trust, because
// nothing is being divided.
export const COUNT_THRESHOLDS = { EARLY_SIGNAL: 10, USABLE: 50, STRONGER_EVIDENCE: 200 };

// A rate: replies per send, approvals per package. Needs far more, because the
// denominator is what people quote and the numerator is what moves.
export const RATE_THRESHOLDS = { EARLY_SIGNAL: 30, USABLE: 100, STRONGER_EVIDENCE: 300 };

// A comparison between two arms, a playbook against a playbook. Every arm has
// to clear USABLE on its own; a big total hiding one arm of four is the
// classic way to publish noise.
export const COMPARISON_MIN_PER_ARM = RATE_THRESHOLDS.USABLE;

export function gateFor(n, kind = 'count') {
  const t = kind === 'rate' ? RATE_THRESHOLDS : COUNT_THRESHOLDS;
  const v = Number(n) || 0;
  if (v >= t.STRONGER_EVIDENCE) return GATE.STRONGER_EVIDENCE;
  if (v >= t.USABLE) return GATE.USABLE;
  if (v >= t.EARLY_SIGNAL) return GATE.EARLY_SIGNAL;
  return GATE.INSUFFICIENT;
}

// May a comparison be shown at all?
//
// Returns a refusal with its reason rather than a boolean, so the refusal is
// something a caller can display instead of something it has to phrase.
export function canCompare(arms = []) {
  const named = arms.map((a) => ({ name: a.name, n: Number(a.n) || 0 }));
  const short = named.filter((a) => a.n < COMPARISON_MIN_PER_ARM);
  if (named.length < 2) {
    return { ok: false, why: 'A comparison needs at least two things to compare.' };
  }
  if (short.length) {
    return {
      ok: false,
      why: `Not enough yet: ${short.map((a) => `${a.name} has ${a.n}`).join(', ')}. Each side needs ${COMPARISON_MIN_PER_ARM} before a difference means anything.`,
      short,
    };
  }
  return { ok: true };
}

// A rate, or an honest refusal to state one.
//
// Never returns a bare percentage. The n travels with it, and below the gate
// the percentage is withheld rather than shown with a caveat, because a
// caveated number gets quoted without its caveat.
export function rate(numerator, denominator, label = '') {
  const d = Number(denominator) || 0;
  const n = Number(numerator) || 0;
  const gate = gateFor(d, 'rate');
  if (gate === GATE.INSUFFICIENT) {
    return { n, d, gate, pct: null, readable: `${n} of ${d}. Too few to put a percentage on${label ? ` ${label}` : ''}.` };
  }
  const pct = d ? Math.round((n / d) * 100) : 0;
  return { n, d, gate, pct, readable: `${n} of ${d} (${pct}%)` };
}

// ── The baseline itself ──────────────────────────────────────────────────

// The funnel, in order, with what each step means.
//
// Every count is of the STRUCTURED cohort only. Legacy is reported separately
// and never added in: 4,787 records with no playbook cannot make a playbook
// question answerable, they can only make its denominator look respectable.
export const STEPS = [
  ['added', 'Prospects added'],
  ['prescreened', 'Prescreened'],
  ['paidVerification', 'Paid site checks'],
  ['strong', 'Vet said Strong'],
  ['maybe', 'Vet said Maybe'],
  ['skip', 'Vet said Skip'],
  ['prepared', 'Packages prepared'],
  ['approvedUnchanged', 'Approved as written'],
  ['edited', 'Approved with edits'],
  ['rejected', 'Rejected'],
  ['sent', 'Actually sent'],
  ['replied', 'Replied'],
  ['positiveReplies', 'Positive replies'],
  ['clients', 'Became clients'],
];

// A reply that means the conversation is alive. Defined here, once, so
// "positive reply" is not re-invented by each thing that counts one.
//
// Deliberately narrow. A question is positive: somebody engaged enough to ask.
// An out-of-office is not, a bounce is not, and "not right now" is not, however
// politely it was worded.
export const POSITIVE_REPLY = new Set(['interested', 'question', 'referral']);

export function summarise({ counts = {}, legacy = {}, sources = [] } = {}) {
  const steps = STEPS.map(([key, label]) => {
    const n = Number(counts[key]) || 0;
    return { key, label, n, gate: gateFor(n) };
  });

  const sent = Number(counts.sent) || 0;
  const prepared = Number(counts.prepared) || 0;

  return {
    cohort: COHORT.STRUCTURED,
    from: STRUCTURED_FROM,
    steps,
    // The two rates worth watching first, both gated. Both will read
    // "too few" for a while, and that is the point of showing them now.
    rates: {
      approvalToSend: rate(sent, prepared, 'on getting prepared work out'),
      replyPerSend: rate(Number(counts.replied) || 0, sent, 'on replies'),
    },
    // Can anything be compared yet? Almost certainly not, and saying so is the
    // whole output of this pass.
    readiness: readiness(counts),
    sources,
    legacy: {
      ...legacy,
      note: `Counted separately and never added in. Records before ${STRUCTURED_FROM} have stages and reply flags but no playbook, generator or send event, so they cannot answer a question about any of those.`,
    },
  };
}

// One sentence on whether outcome learning may begin.
function readiness(counts = {}) {
  const sent = Number(counts.sent) || 0;
  const replied = Number(counts.replied) || 0;
  if (sent < RATE_THRESHOLDS.EARLY_SIGNAL) {
    return {
      ok: false,
      gate: gateFor(sent, 'rate'),
      why: `${sent} structured sends. Nothing can be learned from outcomes until there are at least ${RATE_THRESHOLDS.EARLY_SIGNAL}, and comparing anything needs ${COMPARISON_MIN_PER_ARM} per side.`,
    };
  }
  if (replied < COUNT_THRESHOLDS.EARLY_SIGNAL) {
    return {
      ok: false,
      gate: gateFor(replied),
      why: `${sent} sends but only ${replied} replies. A rate off that numerator moves by whole percentage points on one more reply.`,
    };
  }
  return {
    ok: true,
    gate: gateFor(sent, 'rate'),
    why: `${sent} sends and ${replied} replies. Enough to look, not necessarily enough to conclude.`,
  };
}
