// Circuit breakers for anything the app does without being asked.
//
// A human clicking a button is its own rate limit. Automation is not, and the
// failure mode is specific and expensive: import 20,000 prospects, have
// something decide each one deserves a site probe, and that is 400,000 credits
// and two weeks of Cloud Run before anybody notices.
//
// So every automatic path asks this module first, and it can say no for four
// separate reasons. None of them is a global "automation off" switch, because
// one giant toggle is how people end up turning the useful parts off to stop
// the dangerous ones.

import { PRICES, scanPrice } from './credits.mjs';

// Defaults chosen to be obviously safe rather than optimal. A workspace that
// wants more raises them deliberately.
export const DEFAULT_AUTO_LIMITS = {
  // Off until somebody turns it on. Automation that arrives switched on is
  // automation nobody agreed to.
  autoVet: false,
  // Ceiling on what unattended work may spend in a day, in credits. 600 is
  // thirty site probes: a real day's research, and nowhere near a runaway.
  autoCreditsPerDay: 600,
  // No single prospect is worth more than this without a human. Stops one
  // pathological row (a site that fails and retries) eating the day's budget.
  maxCreditsPerProspect: 120,
  // Automation stops entirely below this balance, leaving room for the things
  // Ary actually clicks. Nothing is more annoying than a background job
  // spending the credits you were about to use on a reply.
  reserveCredits: 500,
  // How many prospects one automatic run may touch. A guard against a single
  // trigger fanning out across an entire import.
  maxProspectsPerRun: 25,
  // How many follow-ups may be written ahead of being asked for. Separate from
  // the number above and much smaller, because a draft costs attention as well
  // as money: 87 prospects are due on an ordinary day and 87 drafts waiting
  // for approval is not a worklist, it is a wall. Ten is roughly a morning.
  maxDraftsPerDay: 10,

  // Asset preparation, as three independent switches rather than one autopilot.
  //
  // One giant toggle is how people end up turning the useful parts off to stop
  // the dangerous ones: preparing an email costs a fraction of a cent, and a
  // video costs a couple of hundred credits. They should never be the same
  // decision.
  //
  // Eligibility is always calculated. These control generation only, which is
  // what makes "7 videos recommended" possible without spending on 7 videos.
  autoPrepareEmail: true,
  // off | recommended-only | on. Never `on` by default: an asset that
  // generates itself for every Strong lead is a bill, not a feature.
  autoGeneratePdf: 'off',
  autoGenerateVideo: 'off',
  // A separate ceiling from the research allowance. Research money must not
  // silently authorise render and narration money.
  maxAssetCreditsPerDay: 0,
};

export const ASSET_MODES = ['off', 'recommended-only', 'on'];

// Anything unrecognised becomes `off`. A typo in a setting that spends money
// must never be read as permission.
const mode = (v) => (ASSET_MODES.includes(v) ? v : 'off');

export function sanitizeAutoLimits(raw) {
  const l = { ...DEFAULT_AUTO_LIMITS, ...(raw && typeof raw === 'object' ? raw : {}) };
  const n = (v, d, max) => {
    const x = Number(v);
    return Number.isFinite(x) && x >= 0 ? Math.min(Math.round(x), max) : d;
  };
  return {
    autoVet: l.autoVet === true,
    autoCreditsPerDay: n(l.autoCreditsPerDay, DEFAULT_AUTO_LIMITS.autoCreditsPerDay, 100_000),
    maxCreditsPerProspect: n(l.maxCreditsPerProspect, DEFAULT_AUTO_LIMITS.maxCreditsPerProspect, 5_000),
    reserveCredits: n(l.reserveCredits, DEFAULT_AUTO_LIMITS.reserveCredits, 1_000_000),
    maxProspectsPerRun: n(l.maxProspectsPerRun, DEFAULT_AUTO_LIMITS.maxProspectsPerRun, 500),
    maxDraftsPerDay: n(l.maxDraftsPerDay, DEFAULT_AUTO_LIMITS.maxDraftsPerDay, 200),
    autoPrepareEmail: l.autoPrepareEmail !== false,
    autoGeneratePdf: mode(l.autoGeneratePdf),
    autoGenerateVideo: mode(l.autoGenerateVideo),
    maxAssetCreditsPerDay: n(l.maxAssetCreditsPerDay, DEFAULT_AUTO_LIMITS.maxAssetCreditsPerDay, 50_000),
  };
}

export async function loadAutoLimits(db, workspace) {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'auto_limits'`)
    .bind(workspace)
    .first();
  let stored = {};
  if (row?.value) {
    try { stored = JSON.parse(row.value); } catch { stored = {}; }
  }
  return sanitizeAutoLimits(stored);
}

// What unattended work has already spent today. Read off the same ledger that
// records every AI call, plus the automatic probes, so there is one number
// rather than two that disagree.
export async function autoSpentToday(db, workspace) {
  const row = await db
    .prepare(
      `SELECT COALESCE(SUM(credits), 0) AS spent
         FROM auto_spend
        WHERE workspace = ? AND day = date('now')`
    )
    .bind(workspace)
    .first()
    .catch(() => null);
  return Number(row?.spent) || 0;
}

// Records credits an automatic path spent. Separate from the credit balance
// itself: that is the money, this is the answer to "how much of today's
// automation allowance is gone".
export async function recordAutoSpend(db, workspace, credits, kind = 'auto') {
  if (!credits) return;
  try {
    await db
      .prepare(
        `INSERT INTO auto_spend (workspace, day, kind, credits)
         VALUES (?, date('now'), ?, ?)`
      )
      .bind(workspace, kind, Math.round(credits))
      .run();
  } catch {
    // Ledger only.
  }
}

// The gate. Returns { ok } or { ok: false, reason } with a sentence a person
// can read, because "automation stopped" with no explanation is worse than
// automation that never ran.
export async function canSpendAutomatically(db, workspace, { credits, balance, limits = null, prospectSpend = 0 }) {
  const l = limits || (await loadAutoLimits(db, workspace));
  const want = Math.round(Number(credits) || 0);

  if (!l.autoVet) {
    return { ok: false, reason: 'Automatic research is switched off for this workspace.', code: 'disabled' };
  }
  if (want <= 0) return { ok: true, limits: l, spentToday: 0 };

  if (prospectSpend + want > l.maxCreditsPerProspect) {
    return {
      ok: false,
      code: 'per-prospect',
      reason: `That would take this one prospect past ${l.maxCreditsPerProspect} credits of automatic work. Something is wrong with it, so it needs a person.`,
      limits: l,
    };
  }

  const bal = Number(balance) || 0;
  if (bal - want < l.reserveCredits) {
    return {
      ok: false,
      code: 'reserve',
      reason: `Stopping so the balance stays above ${l.reserveCredits.toLocaleString()} credits. Background work never spends the last of it.`,
      limits: l,
    };
  }

  const spent = await autoSpentToday(db, workspace);
  if (spent + want > l.autoCreditsPerDay) {
    return {
      ok: false,
      code: 'daily',
      reason: `Today's automatic allowance (${l.autoCreditsPerDay.toLocaleString()} credits) is used up. It resets tomorrow, and anything you run by hand is unaffected.`,
      limits: l,
      spentToday: spent,
    };
  }

  return { ok: true, limits: l, spentToday: spent };
}

// What a job would cost before it runs, so the gate above has a real number
// rather than an optimistic one.
export function estimateCost(job, { count = 1 } = {}) {
  switch (job) {
    case 'precheck': return PRICES.precheck * count;
    case 'video': return PRICES.video * count;
    case 'scan': return scanPrice(count);
    case 'score': return PRICES['lead-score'] * count;
    // An unknown job is costed high rather than free: a job nobody priced must
    // not slip past the budget because of it.
    default: return (PRICES[job] || 100) * count;
  }
}
