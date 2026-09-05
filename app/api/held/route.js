import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { CONTACT_STATE, contactStateOf } from '@/lib/contact-state.mjs';
import { showable } from '@/lib/contact-discovery.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Prospects we cannot write to yet.
//
// These are not skips and the interface must never let them read as one. A
// missing address is a prerequisite nobody has satisfied, and an address that
// bounced is a fact about an inbox. Both are recoverable, and in the second
// case everything already established about the business still stands.

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();

  const db = getDb();
  const ws = ctx.workspace;
  const url = new URL(req.url);
  // A page, not the whole pile. 702 cards is not a screen.
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 25, 1), 100);
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  const state = String(url.searchParams.get('state') || '').trim();
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase();

  // The predicate, written once so the count and the page can never disagree
  // about what "held" means.
  const HELD = `p.workspace = ? AND p.deleted_at IS NULL
          AND COALESCE(p.do_not_contact, 0) = 0
          AND COALESCE(p.unsubscribed, 0) = 0
          AND p.stage NOT IN ('Client','Rejected','Not This Offer','Lost','Finished')
          AND (
            p.contact_state IN ('NONE','NEEDS_CONTACT_RECOVERY')
            OR (p.contact_state IS NULL AND (p.email IS NULL OR p.email = ''))
          )`;

  // Real totals, from a count over the same predicate. The section header says
  // 702 even while 25 are on screen, because the size of the job is a fact
  // about the job and not about the page.
  const totals = await db.prepare(
    `SELECT COUNT(*) total,
            SUM(CASE WHEN p.contact_state = 'NEEDS_CONTACT_RECOVERY' THEN 1 ELSE 0 END) bounced
       FROM prospects p WHERE ${HELD}`
  ).bind(ws).first().catch(() => ({ total: 0, bounced: 0 }));

  const filters = [];
  const binds = [ws];
  if (state === 'NONE' || state === 'NEEDS_CONTACT_RECOVERY') {
    filters.push(state === 'NONE'
      ? `AND (p.contact_state = 'NONE' OR p.contact_state IS NULL)`
      : `AND p.contact_state = 'NEEDS_CONTACT_RECOVERY'`);
  }
  if (q) {
    filters.push(`AND (LOWER(COALESCE(p.name,'')) LIKE ?2 OR LOWER(COALESCE(p.business_name,'')) LIKE ?2 OR LOWER(COALESCE(p.domain,'')) LIKE ?2)`);
  }

  const where = `${HELD} ${filters.join(' ')}`;
  const args = q ? [ws, `%${q}%`] : [ws];

  const filtered = await db.prepare(`SELECT COUNT(*) n FROM prospects p WHERE ${where}`)
    .bind(...args).first().catch(() => ({ n: 0 }));

  const { results: rows } = await db
    .prepare(
      `SELECT p.id, p.name, p.business_name, p.email, p.domain, p.rating, p.stage,
              p.contact_state, p.contact_state_at, p.contact_state_reason,
              p.contact_searched_at, p.contact_search_result, p.contact_search_pages,
              p.contact_refresh_after, p.verification_state, p.priority_band,
              p.site_intel_at, p.own_findings
         FROM prospects p
        WHERE ${where}
        ORDER BY (p.rating = '💚') DESC, (p.own_findings IS NOT NULL) DESC, p.updated_at DESC
        LIMIT ${limit} OFFSET ${offset}`
    ).bind(...args).all().catch(() => ({ results: [] }));

  const ids = (rows || []).map((r) => r.id);

  // Everything else we found on their site. A form, a phone number or an
  // Instagram handle is a real way to reach somebody, and burying it because it
  // is not an email address is how a contactable business looks unreachable.
  const otherBy = new Map();
  if (ids.length) {
    const { results: cands } = await db
      .prepare(
        `SELECT prospect_id, contact_type, value, relationship, source_url
           FROM contact_candidates
          WHERE workspace = ? AND prospect_id IN (${ids.map(() => '?').join(',')})
            AND contact_type <> 'EMAIL'`
      ).bind(ws, ...ids).all().catch(() => ({ results: [] }));
    for (const c of cands || []) {
      const list = otherBy.get(c.prospect_id) || [];
      list.push({ type: c.contact_type, value: c.value, association: c.relationship, source: c.source_url });
      otherBy.set(c.prospect_id, list);
    }
  }

  const items = (rows || []).map((r) => {
    const state = contactStateOf(r);
    return {
      id: r.id,
      name: r.name || r.business_name || `#${r.id}`,
      business: r.business_name && r.business_name !== r.name ? r.business_name : null,
      website: r.domain || null,
      rating: r.rating || null,
      stage: r.stage,
      state,
      // Said in words, so nobody has to decode a constant.
      why: state === CONTACT_STATE.NEEDS_CONTACT_RECOVERY
        ? (r.contact_state_reason || 'The address stopped working.')
        : (r.contact_state_reason || 'No safe address found on their own site yet.'),
      // The half that matters most on a bounce: everything already established
      // about the business is still true and is shown, so this never reads as
      // starting again.
      keeps: {
        band: r.priority_band || null,
        verification: r.verification_state || null,
        hasFindings: Boolean(r.own_findings),
        siteCheckedAt: r.site_intel_at || null,
      },
      lastTried: r.contact_searched_at || null,
      lastResult: r.contact_search_result || null,
      pagesChecked: r.contact_search_pages ?? null,
      retryAfter: r.contact_refresh_after || null,
      otherWays: (otherBy.get(r.id) || []).filter((c) => showable(c.association)),
      recoverable: true,
    };
  });

  const total = Number(totals?.total ?? 0);
  const matched = Number(filtered?.n ?? total);
  return NextResponse.json({
    items,
    // The size of the job, not the size of the page.
    total,
    matched,
    returned: items.length,
    offset,
    limit,
    hasMore: offset + items.length < matched,
    nextOffset: offset + items.length < matched ? offset + items.length : null,
    bounced: Number(totals?.bounced ?? 0),
    none: Math.max(0, total - Number(totals?.bounced ?? 0)),
    // Stated in the payload so no interface has to infer it.
    skipped: false,
  });
}
