// Checking one prospect's website.
//
// This is the work a Hive precheck run does, once per prospect: ask the render
// service to open the site the way the recorder would, apply the same rule, and
// write the answer back. It used to live inside an API route, which was fine
// while the only caller was a browser loop calling that route in a for-loop.
//
// It is a function now because the loop moved to the server, and there must not
// be two implementations of it. One would drift from the other, and the one
// that drifted would be the one spending money.
//
// Deliberately not a decision-maker. It does not choose which prospects to
// check, does not judge fit, and does not touch qualification, Strong or
// priority. It checks the site it is given and records what came back.

import { spendCredits, refundCredits, OUT_OF_CREDITS } from './credits.mjs';
import { buildSiteIntel, parseSiteIntel, isFresh, freshnessLabel } from './site-intel.mjs';

export const PRECHECK_OUTCOME = {
  // A stored answer was still fresh, so nothing was bought.
  CACHED: 'CACHED',
  CHECKED: 'CHECKED',
  // Their site refused to load. A fact about them, and it goes on the record.
  BLOCKED: 'BLOCKED',
  // Our problem, not theirs. Nothing is written to the prospect.
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
};

// Run one check.
//
// `actor` decides which budget this belongs to and is the one thing a caller
// must get right. A Hive run is Ary pressing a button, so it spends the credit
// balance as 'human' and does not touch the daily automatic allowance; the
// unattended sweep passes 'auto' and is gated separately by its own caller.
// Moving Hive work to the server must not quietly reclassify it, or a manual
// run would exhaust the sweep's budget and then park itself.
export async function runPrecheck(db, {
  workspace, prospectId, service, secret, force = false, actor = 'human',
}) {
  const row = await db
    .prepare('SELECT id, domain, own_findings, site_intel FROM prospects WHERE id = ? AND workspace = ? AND deleted_at IS NULL')
    .bind(prospectId, workspace)
    .first()
    .catch(() => null);

  if (!row) return { outcome: PRECHECK_OUTCOME.SKIPPED, permanent: true, error: 'That prospect is not here any more.' };
  if (!row.domain) {
    return { outcome: PRECHECK_OUTCOME.SKIPPED, permanent: true, error: 'No website on this prospect, so there is nothing to check.' };
  }
  if (!service || !secret) {
    return { outcome: PRECHECK_OUTCOME.FAILED, permanent: true, error: 'Site checking is not configured on this deployment.' };
  }

  let ownFindings = [];
  try {
    const v = JSON.parse(row.own_findings || '[]');
    if (Array.isArray(v)) ownFindings = v.filter((x) => x && String(x.text || '').trim());
  } catch {}

  // A site checked recently does not need checking again, and this is checked
  // before any money moves. It is also what makes a run cheap to re-run and a
  // retry free.
  const stored = parseSiteIntel(row.site_intel);
  if (stored && isFresh(stored) && !force) {
    return {
      outcome: PRECHECK_OUTCOME.CACHED,
      charged: 0,
      prospectId,
      tier: stored.worth ? 'SEND' : 'NO_VIDEO',
      worth: stored.worth,
      score: stored.score,
      why: stored.why,
      reasons: stored.reasons || [],
      checkedAt: stored.checkedAt,
      freshness: freshnessLabel(stored),
    };
  }

  const charge = await spendCredits(db, workspace, 'precheck', 1, { actor, prospectId });
  if (!charge.ok) return { outcome: PRECHECK_OUTCOME.FAILED, outOfCredits: true, error: OUT_OF_CREDITS };

  let res;
  try {
    res = await fetch(`${service}/precheck`, {
      method: 'POST',
      headers: { 'x-render-secret': secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: row.domain, ownFindings }),
    });
  } catch (err) {
    // The work did not happen, so the credits go back before anything else.
    // This is the line that makes a retry free.
    // With the prospect id, or the ledger cannot say what was given back. A
    // refund with a null prospect is why a ten-site run looked like it had lost
    // 20 credits until somebody read every row in the window by hand.
    await refundCredits(db, workspace, charge.price, { action: 'precheck-refund', prospectId }).catch(() => {});
    return { outcome: PRECHECK_OUTCOME.FAILED, error: String(err?.message || err) };
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // With the prospect id, or the ledger cannot say what was given back. A
    // refund with a null prospect is why a ten-site run looked like it had lost
    // 20 credits until somebody read every row in the window by hand.
    await refundCredits(db, workspace, charge.price, { action: 'precheck-refund', prospectId }).catch(() => {});

    // Their site refusing to load is a fact about them and belongs on the
    // record. Anything else is our problem and must not be written there.
    if (res.status === 422 && data.blocked) {
      const intel = buildSiteIntel(
        { worth: false, score: 0, why: String(data.error || '').slice(0, 300), blocked: data.blocked },
        { source: 'precheck' }
      );
      const at = new Date().toISOString();
      await db
        .prepare(
          `UPDATE prospects SET video_tier = 'BLOCKED', video_reasons = ?,
                  site_intel = ?, site_intel_at = ?, site_intel_source = 'precheck', updated_at = ?
             WHERE id = ? AND workspace = ?`
        )
        .bind(
          JSON.stringify([String(data.error || 'That site could not be read.').slice(0, 300)]),
          JSON.stringify(intel), at, at, prospectId, workspace
        )
        .run()
        .catch(() => {});
      return {
        outcome: PRECHECK_OUTCOME.BLOCKED,
        charged: 0,
        prospectId,
        tier: 'BLOCKED',
        worth: false,
        why: data.error || 'Their site could not be read.',
      };
    }

    return { outcome: PRECHECK_OUTCOME.FAILED, error: data.error || `The checker answered ${res.status}.` };
  }

  const tier = data.worth ? 'SEND' : 'NO_VIDEO';
  const intel = buildSiteIntel(data, { source: 'precheck' });
  const at = new Date().toISOString();
  await db
    .prepare(
      `UPDATE prospects SET video_tier = ?, video_score = ?, video_reasons = ?,
              site_intel = ?, site_intel_at = ?, site_intel_source = 'precheck', updated_at = ?
       WHERE id = ? AND workspace = ?`
    )
    .bind(
      tier,
      Math.round(Number(data.score) || 0),
      JSON.stringify(data.reasons || []),
      JSON.stringify(intel), at, at, prospectId, workspace
    )
    .run();

  return {
    outcome: PRECHECK_OUTCOME.CHECKED,
    charged: charge.price,
    prospectId,
    tier,
    worth: Boolean(data.worth),
    score: data.score,
    why: data.why,
    reasons: data.reasons || [],
    pagesChecked: data.pagesChecked,
    checkedAt: at,
  };
}
