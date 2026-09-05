import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { enqueue, KIND, PRIORITY } from '@/lib/queue.mjs';
import { COHORT_SQL } from '@/lib/contact-save.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Feeding the free contact search.
//
// Discovery itself has run inside the durable queue for a while, but nothing
// put work into it except the pipeline, so the standing backlog of prospects
// with a website and no address sat still. Two callers need this: the held
// bucket's "look again" on one prospect, and draining the backlog in batches.
//
// Free throughout. There is no paid provider here and adding one is a separate
// decision that needs a measured yield first.

const MAX_BATCH = 50;

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const ws = ctx.workspace;

  // The standing cohort: rated worth chasing, has a website, has no address.
  const { results: cohort } = await db.prepare(COHORT_SQL).bind(ws).all().catch(() => ({ results: [] }));

  // Everyone in that shape, whether or not they are due for another look, so
  // "how many are left" is answerable rather than "how many are due today".
  const total = await db.prepare(
    `SELECT COUNT(*) n FROM prospects
      WHERE workspace = ? AND deleted_at IS NULL AND rating = '💚'
        AND domain IS NOT NULL AND domain <> ''
        AND (email IS NULL OR email = '')
        AND stage NOT IN ('Client','Rejected','Not This Offer','Lost','Invalid Email','Finished')
        AND COALESCE(do_not_contact,0) = 0 AND COALESCE(unsubscribed,0) = 0`
  ).bind(ws).first().catch(() => ({ n: 0 }));

  const searched = await db.prepare(
    `SELECT COUNT(*) n FROM prospects
      WHERE workspace = ? AND deleted_at IS NULL AND rating = '💚'
        AND contact_searched_at IS NOT NULL`
  ).bind(ws).first().catch(() => ({ n: 0 }));

  const queued = await db.prepare(
    `SELECT COUNT(*) n FROM jobs WHERE workspace = ? AND kind = ? AND status IN ('queued','running')`
  ).bind(ws, KIND.DISCOVER_CONTACT).first().catch(() => ({ n: 0 }));

  const found = await db.prepare(
    `SELECT contact_search_result r, COUNT(*) n FROM prospects
      WHERE workspace = ? AND deleted_at IS NULL AND contact_search_result IS NOT NULL
      GROUP BY contact_search_result ORDER BY n DESC`
  ).bind(ws).all().catch(() => ({ results: [] }));

  return NextResponse.json({
    cohort: Number(total?.n ?? 0),
    searched: Number(searched?.n ?? 0),
    remaining: Math.max(0, Number(total?.n ?? 0) - Number(searched?.n ?? 0)),
    eligibleNow: (cohort || []).length,
    queued: Number(queued?.n ?? 0),
    results: (found.results || []).map((r) => ({ result: r.r, n: Number(r.n) })),
    paidProvider: false,
  });
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const ws = ctx.workspace;
  const body = await req.json().catch(() => ({}));

  const ids = Array.isArray(body.prospectIds)
    ? body.prospectIds.map(Number).filter(Number.isFinite).slice(0, MAX_BATCH)
    : null;
  const limit = Math.min(Math.max(Number(body.limit) || 25, 1), MAX_BATCH);

  let targets = [];
  if (ids?.length) {
    // Named prospects. `force` clears the refresh window, because "look again"
    // pressed by a person means now rather than in fourteen days.
    if (body.force === true) {
      await db.prepare(
        `UPDATE prospects SET contact_refresh_after = NULL
          WHERE workspace = ? AND id IN (${ids.map(() => '?').join(',')})`
      ).bind(ws, ...ids).run().catch(() => {});
    }
    const { results } = await db.prepare(
      `SELECT id FROM prospects
        WHERE workspace = ? AND deleted_at IS NULL AND domain IS NOT NULL AND domain <> ''
          AND id IN (${ids.map(() => '?').join(',')})`
    ).bind(ws, ...ids).all().catch(() => ({ results: [] }));
    targets = (results || []).map((r) => r.id);
  } else {
    const { results } = await db.prepare(COHORT_SQL).bind(ws).all().catch(() => ({ results: [] }));
    targets = (results || []).slice(0, limit).map((r) => r.id);
  }

  let queued = 0;
  for (const id of targets) {
    const r = await enqueue(db, {
      workspace: ws,
      kind: KIND.DISCOVER_CONTACT,
      prospectId: id,
      priority: PRIORITY.SIGNALS,
    }).catch(() => ({ queued: false }));
    if (r.queued) queued += 1;
  }

  return NextResponse.json({
    requested: targets.length,
    queued,
    // Already in flight from an earlier run. Not a failure.
    alreadyQueued: targets.length - queued,
    paidProvider: false,
  });
}
