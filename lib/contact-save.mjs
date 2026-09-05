// Writing a contact search down, and restarting the prospect if it worked.
//
// Kept separate from the extraction library so the worker has no opinions about
// parsing and the parser has no opinions about the database. The one rule that
// spans both: a search that could not run must never be stored as a search that
// found nothing.

import { RESULT, nextRefresh, activityLine } from './contact-job.mjs';
import { ASSOCIATION } from './contact-discovery.mjs';
import { appendEntry } from './activity-log.mjs';
import { enqueue, KIND, PRIORITY } from './queue.mjs';
import { canProgressOutbound } from './outbound.mjs';
import { guardView } from './prospect-view.mjs';
import { isFresh, isThorough, parseSiteIntel } from './site-intel.mjs';
import { CONTACT_STATE, contactStateOf, onContactFound, onNoContactFound } from './contact-state.mjs';

// Results where the search genuinely ran. Only these may be cached as an
// answer about the business; the rest are answers about the network.
const REAL_ANSWER = new Set([
  RESULT.SAFE_EMAIL, RESULT.UNKNOWN_EMAIL, RESULT.OTHER_CONTACT_ONLY, RESULT.NO_CONTACT_FOUND,
]);

// Save everything one search learned. Idempotent: the unique index on
// (workspace, prospect, type, value) means a retry converges rather than
// duplicating, and the primary contact is only written into an empty field.
export async function saveDiscovery(db, ws, prospect, r) {
  const pid = prospect.id;

  for (const c of [...r.candidates, ...r.other]) {
    await db.prepare(
      `INSERT OR IGNORE INTO contact_candidates
         (workspace, prospect_id, contact_type, value, relationship, person_name,
          source_url, source_page_type, context_snippet, method, confidence, adopted, rejection_reason, discovered_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      ws, pid, c.contactType, String(c.value).slice(0, 300),
      c.relationship || ASSOCIATION.UNKNOWN, c.personName || null,
      c.sourceUrl || null, c.sourcePageType || null,
      (c.contextSnippet || '').slice(0, 300), c.method || null,
      c.confidence || 'FOUND', c.adopted ? 1 : 0,
      c.rejectionReason || (c.relationship === ASSOCIATION.THIRD_PARTY ? c.why : null),
      r.searchedAt
    ).run().catch(() => {});
  }

  // Contactability, as its own axis.
  //
  // NONE is what makes a prospect HELD: viable, but nothing paid may run
  // because there is nobody to write to. Deliberately never written over a
  // prospect whose address bounced, because a failed search and a dead address
  // are different problems and the second one has qualification history behind
  // it that must not be rewound.
  const already = contactStateOf(prospect);
  const statePatch = already === CONTACT_STATE.NEEDS_CONTACT_RECOVERY && !r.primary
    ? null
    : (r.primary || String(prospect.email || '').trim())
      ? onContactFound({ at: r.searchedAt, reason: r.primaryReason || null })
      : onNoContactFound({ at: r.searchedAt });

  await db.prepare(
    `UPDATE prospects
        SET contact_searched_at = ?, contact_search_result = ?, contact_search_pages = ?,
            contact_refresh_after = ?, activity_log = ?,
            contact_state = COALESCE(?, contact_state),
            contact_state_at = COALESCE(?, contact_state_at),
            contact_state_reason = COALESCE(?, contact_state_reason),
            updated_at = datetime('now')
      WHERE id = ? AND workspace = ?`
  ).bind(
    r.searchedAt, r.result, r.pagesChecked,
    nextRefresh(r.result, r.searchedAt),
    appendEntry(prospect.activity_log, 'auto', activityLine(r)),
    statePatch?.contact_state ?? null,
    statePatch?.contact_state_at ?? null,
    statePatch?.contact_state_reason ?? null,
    pid, ws
  ).run().catch(() => {});

  // The address only fills a blank. Never overwrite one somebody typed, and
  // never overwrite one an earlier run already adopted.
  let adopted = false;
  if (r.primary && !String(prospect.email || '').trim()) {
    const res = await db.prepare(
      `UPDATE prospects SET email = ?, primary_contact_reason = ?, updated_at = datetime('now')
        WHERE id = ? AND workspace = ? AND (email IS NULL OR email = '')`
    ).bind(r.primary.value, r.primaryReason, pid, ws).run().catch(() => ({ meta: { changes: 0 } }));
    adopted = Boolean(res.meta.changes);
  }

  return { adopted, result: r.result, cached: REAL_ANSWER.has(r.result) };
}

// A prospect that just became contactable should carry on by itself.
//
// The point of the whole pass: a contact arriving late must not mean the work
// waits for somebody to notice and press something. What it must NOT do is buy
// another site check because the email showed up second.
export async function resumeLifecycle(db, ws, prospectId, { backpressure = null } = {}) {
  const p = await db.prepare(`SELECT * FROM prospects WHERE id = ? AND workspace = ? AND deleted_at IS NULL`)
    .bind(prospectId, ws).first();
  if (!p) return { resumed: false, why: 'gone' };

  const gate = canProgressOutbound(guardView(p, { where: 'contact resume' }), { now: new Date() });
  if (!gate.ok && gate.stop !== 'not-due') {
    return { resumed: false, why: gate.reason, stop: gate.stop };
  }

  // Is there already a live package? Then the contact was the only thing
  // missing and nothing needs queueing.
  const pkg = await db.prepare(
    `SELECT id, status FROM outreach_packages
      WHERE workspace = ? AND prospect_id = ? AND status IN ('PREPARING','READY_FOR_APPROVAL','NEEDS_DECISION','APPROVED')
      ORDER BY version DESC LIMIT 1`
  ).bind(ws, prospectId).first().catch(() => null);
  if (pkg) return { resumed: false, why: `A package is already ${pkg.status}.`, packageId: pkg.id };

  // Research already paid for, still good? Then go straight to preparing the
  // package. Buying a second 20-credit probe because the address arrived later
  // is paying twice for one piece of work.
  const intel = parseSiteIntel(p.site_intel);
  const haveEvidence = Boolean(p.own_findings) || (intel && isFresh(intel) && isThorough(intel));

  if (haveEvidence) {
    const q = await enqueue(db, { workspace: ws, kind: KIND.PREPARE_OUTREACH, prospectId, priority: PRIORITY.VET });
    return { resumed: Boolean(q.queued), next: KIND.PREPARE_OUTREACH, reusedResearch: true };
  }

  // Nothing to say about them yet. Prescreen is free and decides whether the
  // paid step is worth it, so it runs regardless of backpressure; the paid
  // stage behind it is what the sweep throttles.
  if (backpressure && backpressure.research === false) {
    return { resumed: false, why: 'Contact found. Research is paused while the approval queue clears.', waiting: true };
  }
  const q = await enqueue(db, { workspace: ws, kind: KIND.PRESCREEN, prospectId, priority: PRIORITY.VET });
  return { resumed: Boolean(q.queued), next: KIND.PRESCREEN, reusedResearch: false };
}

// Who is worth searching, in the order the brief asked for: what somebody
// already judged first, then what already has work attached to it.
export const COHORT_SQL = `
  SELECT id, domain, email, activity_log, rating, own_findings, site_intel, contact_refresh_after
    FROM prospects
   WHERE workspace = ? AND deleted_at IS NULL
     AND rating = '💚'
     AND domain IS NOT NULL AND domain <> ''
     AND (email IS NULL OR email = '')
     AND stage NOT IN ('Client','Rejected','Not This Offer','Lost','Invalid Email','Finished')
     AND COALESCE(do_not_contact, 0) = 0
     AND COALESCE(unsubscribed, 0) = 0
     AND COALESCE(reply_type, '') <> 'decline'
     AND (contact_refresh_after IS NULL OR contact_refresh_after <= datetime('now'))
   ORDER BY (own_findings IS NOT NULL) DESC,
            (site_intel IS NOT NULL) DESC,
            (qualification IS NOT NULL) DESC,
            id ASC
   LIMIT ?`;
