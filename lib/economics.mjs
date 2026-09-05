// What the product costs to run, next to what it charges, for a period.
//
// Operational rather than analytical. The question it answers is "is anything
// bleeding", and the two ways to get that wrong are equally bad: hiding a cost
// nobody has measured, and inventing one.
//
// So UNKNOWN is a first-class answer here and never rounds to zero. An action
// whose vendor cost has not been measured on the current pipeline appears with
// its credits, its revenue, and an explicit gap where the cost would be. The
// alternative — a blank, or worse a zero — reads as free, and free is the one
// thing it is definitely not.
//
// Prices come from the credit catalog. Nothing here restates a number that
// lives there, because two copies of a price is how a margin ends up computed
// against a figure the product stopped charging months ago.

import { USD_PER_CREDIT } from './ai-cost.mjs';
import { byId, economicsFor, health, CONFIDENCE, catalogSummary } from './credit-catalog.mjs';

export const PERIODS = {
  today: { label: 'Today', sql: "date(created_at) = date('now')" },
  '7d': { label: 'Last 7 days', sql: "created_at >= datetime('now', '-7 days')" },
  '30d': { label: 'Last 30 days', sql: "created_at >= datetime('now', '-30 days')" },
};

export const periodSql = (key) => (PERIODS[key] || PERIODS['7d']).sql;

// Roll the two ledgers into one picture, by action.
//
// `aiRows`   from ai_usage:      real measured vendor cost, per call.
// `creditRows` from credit_events: what the workspace was charged, per action.
//
// They overlap deliberately: an AI task appears in both, and the credit side
// is authoritative for revenue while the AI side is authoritative for cost.
export function summarise({ aiRows = [], creditRows = [] } = {}) {
  const byAction = new Map();
  const take = (action) => {
    if (!byAction.has(action)) {
      byAction.set(action, {
        action,
        credits: 0, refunded: 0, charges: 0, refunds: 0,
        autoCredits: 0, humanCredits: 0,
        knownCostUsd: 0, calls: 0, failures: 0,
        // Operations we know happened and cannot price. Counted, never costed.
        unmeasured: 0,
      });
    }
    return byAction.get(action);
  };

  for (const r of creditRows) {
    const a = take(String(r.action || 'unknown'));
    const credits = Number(r.credits) || 0;
    if (credits >= 0) { a.credits += credits; a.charges += 1; } else { a.refunded += -credits; a.refunds += 1; }
    if (r.actor === 'auto') a.autoCredits += Math.max(0, credits);
    else a.humanCredits += Math.max(0, credits);
  }

  for (const r of aiRows) {
    const a = take(String(r.task || 'unknown'));
    a.calls += 1;
    if (!r.ok) a.failures += 1;
    a.knownCostUsd += Number(r.cost_usd) || 0;
    // ai_usage carries its own credit figure for tasks charged through the AI
    // route. Only counted when the credit ledger has nothing for this action,
    // which is the case for rows written before credit_events existed.
    if (!creditRows.some((c) => c.action === r.task)) {
      a.credits += Number(r.credits_charged) || 0;
    }
  }

  // Cost the non-AI actions from the catalog, and be explicit where it cannot.
  const rows = [];
  for (const a of byAction.values()) {
    const cat = byId(a.action);
    const netCredits = a.credits - a.refunded;
    const revenue = netCredits * USD_PER_CREDIT;

    let cost = a.knownCostUsd;
    let costKnown = a.calls > 0;
    let gap = null;

    if (cat && !cat.internal?.length && cat.costUsd === 0) {
      // Catalogued as genuinely free. Zero is a measurement here, not a hole.
      costKnown = true;
    } else if (cat && cat.costUsd === null) {
      // Catalogued and deliberately unpriced.
      costKnown = false;
      gap = cat.note || 'Vendor cost has not been measured on the current pipeline.';
      a.unmeasured = a.charges;
    } else if (cat && typeof cat.costUsd === 'number' && !a.calls) {
      // Per-unit cost known from the catalog; multiply by how many happened.
      cost = cat.costUsd * a.charges;
      costKnown = true;
    } else if (!cat && !a.calls) {
      costKnown = false;
      gap = 'Not in the credit catalog, so nothing is known about what it costs.';
      a.unmeasured = a.charges;
    }

    rows.push({
      ...a,
      netCredits,
      revenueUsd: revenue,
      costUsd: costKnown ? cost : null,
      marginUsd: costKnown ? revenue - cost : null,
      multiple: costKnown && cost > 0 ? +(revenue / cost).toFixed(1) : null,
      confidence: cat?.confidence || (a.calls ? CONFIDENCE.MEASURED : CONFIDENCE.UNKNOWN),
      gap,
      label: cat?.action || a.action,
      freeByDesign: cat?.free || null,
    });
  }

  rows.sort((x, y) => (y.costUsd ?? 0) - (x.costUsd ?? 0) || y.netCredits - x.netCredits);

  const known = rows.filter((r) => r.costUsd !== null);
  const unknown = rows.filter((r) => r.costUsd === null);
  const totalCost = known.reduce((n, r) => n + r.costUsd, 0);
  const totalRevenue = rows.reduce((n, r) => n + r.revenueUsd, 0);

  return {
    rows,
    totals: {
      credits: rows.reduce((n, r) => n + r.netCredits, 0),
      refundedCredits: rows.reduce((n, r) => n + r.refunded, 0),
      revenueUsd: totalRevenue,
      // Costed from what is measurable. Named so nobody reads it as the whole
      // bill: the unmeasured actions below are real spend with no number yet.
      knownCostUsd: totalCost,
      knownMarginUsd: totalRevenue - totalCost,
      calls: rows.reduce((n, r) => n + r.calls, 0),
      failures: rows.reduce((n, r) => n + r.failures, 0),
      autoCredits: rows.reduce((n, r) => n + r.autoCredits, 0),
      humanCredits: rows.reduce((n, r) => n + r.humanCredits, 0),
    },
    // The honest caveat, carried as data rather than a footnote somebody can
    // fail to render.
    unmeasured: unknown.map((r) => ({ action: r.action, label: r.label, operations: r.charges, gap: r.gap })),
    complete: unknown.length === 0,
  };
}

// What one prospect consumed on its way to wherever it got to.
//
// The point of this, later: whether the expensive prospects actually perform
// better. It is not asked yet, and the numbers are not weighted or ranked here.
export function perProspect({ aiRows = [], creditRows = [], prospect = {}, sends = 0, pkg = null } = {}) {
  const lines = new Map();
  const add = (action, { credits = 0, costUsd = null, ops = 1 }) => {
    const cur = lines.get(action) || { action, label: byId(action)?.action || action, credits: 0, costUsd: 0, costKnown: false, ops: 0 };
    cur.credits += credits;
    cur.ops += ops;
    if (costUsd !== null) { cur.costUsd += costUsd; cur.costKnown = true; }
    lines.set(action, cur);
  };

  for (const r of creditRows) {
    const action = String(r.action || 'unknown');
    const cat = byId(action);
    const credits = Number(r.credits) || 0;
    // A catalogued per-unit cost, or nothing. Never a guess.
    const unit = cat && typeof cat.costUsd === 'number' ? cat.costUsd : null;
    add(action, { credits, costUsd: credits > 0 ? unit : null });
  }
  for (const r of aiRows) {
    add(String(r.task || 'unknown'), { credits: 0, costUsd: Number(r.cost_usd) || 0 });
  }

  const rows = [...lines.values()].sort((a, b) => b.credits - a.credits);
  const unknownActions = rows.filter((r) => !r.costKnown && r.credits > 0);

  return {
    prospectId: prospect.id ?? null,
    name: prospect.name || null,
    stage: prospect.stage || null,
    // Where they actually got to. Approved and sent are different answers.
    outcome: {
      packageStatus: pkg?.status || null,
      playbook: pkg?.playbook || null,
      approvedAt: pkg?.reviewed_at || null,
      sends,
      replied: Boolean(prospect.replied),
      replyType: prospect.reply_type || null,
      firstClientAt: prospect.first_client_at || null,
    },
    rows,
    credits: rows.reduce((n, r) => n + r.credits, 0),
    knownCostUsd: rows.reduce((n, r) => n + (r.costKnown ? r.costUsd : 0), 0),
    // Named, so a small total is not mistaken for a cheap prospect.
    unmeasured: unknownActions.map((r) => r.label),
    complete: unknownActions.length === 0,
  };
}

// Re-exported rather than duplicated. The view renders prices straight from
// the catalog: a display constant here would be a second copy of a price, and
// the first thing to go stale.
export { economicsFor, health, catalogSummary };
