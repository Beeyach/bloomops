// What each user-visible action really costs us, next to what it charges.
//
// The distinction this file exists to hold, because getting it wrong is how a
// product ends up nickel-and-diming people for its own implementation:
//
//   INTERNAL COST is per vendor operation. Claude calls, Cloud Run seconds,
//   ElevenLabs characters. Measured, never estimated when it can be counted.
//
//   USER CREDITS are per PRODUCT ACTION. "Check their website" is one action
//   a person understands and can decide about. That it contains a browser
//   launch, five page loads and no model call at all is our business, not
//   theirs.
//
// One action may contain several internal operations, and several internal
// operations may be free. A deterministic check that costs nothing to run
// should cost nothing to use: credits exist to constrain real resource
// consumption, not to bill for usefulness.

import { PRICES } from './credits.mjs';
import { USD_PER_CREDIT } from './ai-cost.mjs';

// Cloud Run, us-east1, from the service's own configuration: 4 vCPU, 8 GiB,
// scale-to-zero so there is no idle charge.
//
// The per-second rates are Google's published list prices. The DURATIONS are
// measured from production request logs, which is the half that actually
// varies. If the invoice ever disagrees with this, the invoice is right and
// this constant is what to change.
export const CLOUD_RUN = {
  vcpu: 4,
  gib: 8,
  usdPerVcpuSecond: 0.000024,
  usdPerGibSecond: 0.0000025,
  usdPerRequest: 0.0000004,
};

export function cloudRunUsd(seconds, { vcpu = CLOUD_RUN.vcpu, gib = CLOUD_RUN.gib } = {}) {
  const s = Math.max(0, Number(seconds) || 0);
  return s * (vcpu * CLOUD_RUN.usdPerVcpuSecond + gib * CLOUD_RUN.usdPerGibSecond) + CLOUD_RUN.usdPerRequest;
}

// Measured from Cloud Run request logs on 2026-08-09. Successful /precheck
// calls only; the 422s (a site that blocked us, or one not worth a video) are
// tracked separately because they cost real compute and return no evidence.
export const MEASURED = {
  precheck: { n: 7, p50Seconds: 41.6, p90Seconds: 58, maxSeconds: 61.4, source: 'Cloud Run request logs, 2026-08-09' },
  precheckRefused: { n: 5, p50Seconds: 40.0, p90Seconds: 60, note: '422: blocked or nothing worth recording. Costs compute, returns no evidence.' },
};

export const CONFIDENCE = { MEASURED: 'measured', LIST_PRICE: 'list-price', UNKNOWN: 'unknown' };

// Every operation a person can spend credits on, or that spends our money.
//
// `free: true` is a decision, not an oversight. Each one says why.
export const CATALOG = [
  {
    id: 'prescreen',
    action: 'Prescreen a prospect',
    credits: 0,
    free: 'Deterministic. No vendor call at all, and it exists to stop us spending on the wrong prospect. Charging for the thing that saves money is backwards.',
    internal: [],
    costUsd: 0,
    confidence: CONFIDENCE.MEASURED,
  },
  {
    id: 'signals',
    action: 'Read their own page for contacts and clues',
    credits: 0,
    free: 'One HTTP fetch on our own bandwidth. Rounds to nothing, and it is the step that decides whether the paid one is worth running.',
    internal: ['one page fetch'],
    costUsd: 0,
    confidence: CONFIDENCE.MEASURED,
  },
  {
    id: 'preflight',
    action: 'Decide whether a browser could learn anything',
    credits: 0,
    free: 'Runs on HTML the free fetch already has. Its entire job is avoiding a 20-credit charge.',
    internal: [],
    costUsd: 0,
    confidence: CONFIDENCE.MEASURED,
  },
  {
    id: 'precheck',
    action: 'Check their website properly',
    credits: PRICES.precheck,
    internal: ['Cloud Run browser probe, ~42s, 5 pages'],
    costUsd: cloudRunUsd(MEASURED.precheck.p50Seconds),
    costUsdP90: cloudRunUsd(MEASURED.precheck.p90Seconds),
    // A refusal still burns the compute. Priced in rather than pretended away.
    failureUsd: cloudRunUsd(MEASURED.precheckRefused.p50Seconds),
    confidence: CONFIDENCE.LIST_PRICE,
    note: 'Durations measured from production logs; per-second rate is Google list price.',
  },
  {
    id: 'vet',
    action: 'Decide STRONG / MAYBE / SKIP',
    credits: 0,
    free: 'Entirely deterministic. It reads what the paid steps already stored and applies rules; there is no model call to pay for.',
    internal: [],
    costUsd: 0,
    confidence: CONFIDENCE.MEASURED,
  },
  {
    id: 'outreach-package',
    action: 'Prepare the outreach package',
    // One product action. Angle selection, evidence assembly, validation and
    // asset eligibility are all deterministic; the single model call writes
    // the email. Billing those as four line items would describe our
    // architecture to somebody who did not ask.
    credits: 0,
    free: 'One AI call at roughly half a cent, on top of a 20-credit verification that has already paid for the research. Charging again for the sentence at the end would be charging twice for one piece of work.',
    internal: ['1 Claude call (draft)', 'deterministic angle, validation, eligibility'],
    costUsd: 0.0061,
    confidence: CONFIDENCE.MEASURED,
    measuredFrom: 'ai_usage, n=22, 2026-08-09',
  },
  {
    id: 'classify-reply',
    action: 'Read a reply the rules could not',
    credits: 0,
    free: 'Under a tenth of a cent, on the cheap tier, and it is a safety feature: it is how an unreadable reply stops the follow-up. Never put a price on the brakes.',
    internal: ['1 Claude call (haiku)'],
    costUsd: 0.0008,
    confidence: CONFIDENCE.MEASURED,
    measuredFrom: 'ai_usage, n=1, 2026-08-09',
  },
  {
    id: 'video',
    action: 'Record the audit video',
    credits: PRICES.video,
    internal: ['ElevenLabs narration', 'Cloud Run render and mux'],
    costUsd: null,
    confidence: CONFIDENCE.UNKNOWN,
    note: 'Not recalculated on the current pipeline yet. The old sample mixed in timeout failures and must not be reused.',
  },
  {
    id: 'pdf',
    action: 'Make the one-page review',
    credits: 0,
    free: 'Rendered locally from findings already paid for. No vendor call.',
    internal: [],
    costUsd: 0,
    confidence: CONFIDENCE.MEASURED,
  },
];

export const byId = (id) => CATALOG.find((c) => c.id === id) || null;

// Revenue, cost and margin for one catalogued action.
//
// Returns nulls rather than zeros where the cost is genuinely unknown, so a
// gap in the data never quietly reads as free.
export function economicsFor(id) {
  const c = byId(id);
  if (!c) return null;
  const revenue = (Number(c.credits) || 0) * USD_PER_CREDIT;
  if (c.costUsd === null || c.costUsd === undefined) {
    return { id, action: c.action, credits: c.credits, revenue, cost: null, margin: null, marginPct: null, confidence: c.confidence, note: c.note };
  }
  const cost = c.costUsd;
  const margin = revenue - cost;
  return {
    id, action: c.action, credits: c.credits, revenue, cost,
    costP90: c.costUsdP90 ?? null,
    failureCost: c.failureUsd ?? null,
    margin,
    // Meaningless on a free action, so it says so rather than dividing by zero.
    marginPct: revenue > 0 ? Math.round((margin / revenue) * 100) : null,
    multiple: cost > 0 ? +(revenue / cost).toFixed(1) : null,
    confidence: c.confidence,
    free: c.free || null,
    note: c.note || null,
  };
}

// Health bands, so a number turns into a decision.
export function health(e) {
  if (!e || e.cost === null) return 'UNKNOWN';
  if (e.revenue === 0) return 'FREE_BY_DESIGN';
  if (e.margin < 0) return 'LOSS_MAKING';
  if (e.multiple < 1.5) return 'THIN';
  if (e.multiple < 5) return 'HEALTHY';
  return 'HIGH_MARGIN';
}

export function catalogSummary() {
  return CATALOG.map((c) => {
    const e = economicsFor(c.id);
    return { ...e, health: health(e) };
  });
}
