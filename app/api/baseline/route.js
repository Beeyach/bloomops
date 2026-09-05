import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized, forbidden } from '@/lib/workspace.mjs';
import { summarise, POSITIVE_REPLY } from '@/lib/baseline.mjs';
import { STRUCTURED_FROM } from '@/lib/cohort.mjs';
import { needingReconciliation } from '@/lib/send-events.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Counts for the structured cohort, and nothing else.
//
// Every query below is bounded by the boundary date. That is not a filter that
// could be relaxed later for a bigger number: records from before it have no
// playbook, no generator version and no send event, so adding them makes a
// denominator larger and an answer less true.
export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') return forbidden();

  const db = getDb();
  const ws = ctx.workspace;
  const since = STRUCTURED_FROM;
  const positive = [...POSITIVE_REPLY].map((s) => `'${s}'`).join(',');

  const one = async (sql, ...bind) => Number((await db.prepare(sql).bind(...bind).first())?.n) || 0;

  const [
    added, prescreened, paidVerification, strong, maybe, skip,
    prepared, approvedUnchanged, edited, rejected, sent, replied, positiveReplies, clients,
  ] = await Promise.all([
    one(`SELECT COUNT(*) n FROM prospects WHERE workspace = ? AND deleted_at IS NULL AND date(created_at) >= ?`, ws, since),
    one(`SELECT COUNT(DISTINCT prospect_id) n FROM outcome_events WHERE workspace = ? AND kind = 'vet' AND value LIKE 'prescreen:%' AND date(created_at) >= ?`, ws, since),
    one(`SELECT COUNT(*) n FROM credit_events WHERE workspace = ? AND action = 'precheck' AND credits > 0 AND date(created_at) >= ?`, ws, since),
    one(`SELECT COUNT(DISTINCT prospect_id) n FROM outcome_events WHERE workspace = ? AND kind = 'vet' AND value = 'STRONG' AND date(created_at) >= ?`, ws, since),
    one(`SELECT COUNT(DISTINCT prospect_id) n FROM outcome_events WHERE workspace = ? AND kind = 'vet' AND value = 'MAYBE' AND date(created_at) >= ?`, ws, since),
    one(`SELECT COUNT(DISTINCT prospect_id) n FROM outcome_events WHERE workspace = ? AND kind = 'vet' AND value = 'SKIP' AND date(created_at) >= ?`, ws, since),
    one(`SELECT COUNT(*) n FROM outreach_packages WHERE workspace = ? AND generator_version IS NOT NULL AND date(created_at) >= ?`, ws, since),
    one(`SELECT COUNT(*) n FROM outreach_packages WHERE workspace = ? AND review_outcome = 'APPROVED_UNCHANGED' AND date(created_at) >= ?`, ws, since),
    one(`SELECT COUNT(*) n FROM outreach_packages WHERE workspace = ? AND review_outcome = 'EDITED' AND date(created_at) >= ?`, ws, since),
    one(`SELECT COUNT(*) n FROM outreach_packages WHERE workspace = ? AND review_outcome = 'REJECTED' AND date(created_at) >= ?`, ws, since),
    one(`SELECT COUNT(*) n FROM send_events WHERE workspace = ? AND date(sent_at) >= ?`, ws, since),
    // Restricted to prospects that were actually sent to, and only after the
    // send. The first version counted every inbound reply in the period, so
    // the reply rate had a numerator from one population and a denominator
    // from another: it read "1 of 1" when the reply and the send belonged to
    // two different prospects.
    one(
      `SELECT COUNT(DISTINCT r.prospect_id) n FROM reply_events r
        WHERE r.workspace = ? AND r.direction = 'inbound' AND date(r.occurred_at) >= ?
          AND EXISTS (SELECT 1 FROM send_events s
                       WHERE s.workspace = r.workspace AND s.prospect_id = r.prospect_id
                         AND s.sent_at <= r.occurred_at)`,
      ws, since
    ),
    one(
      `SELECT COUNT(DISTINCT r.prospect_id) n FROM reply_events r
        WHERE r.workspace = ? AND r.direction = 'inbound' AND r.classification IN (${positive})
          AND date(r.occurred_at) >= ?
          AND EXISTS (SELECT 1 FROM send_events s
                       WHERE s.workspace = r.workspace AND s.prospect_id = r.prospect_id
                         AND s.sent_at <= r.occurred_at)`,
      ws, since
    ),
    one(`SELECT COUNT(*) n FROM prospects WHERE workspace = ? AND first_client_at IS NOT NULL AND date(first_client_at) >= ?`, ws, since),
  ]);

  // Where the structured prospects came from. Unknown stays unknown: inferring
  // a provider for a row whose origin was never recorded would put a made-up
  // channel into the one table meant to compare channels.
  const { results: sourceRows } = await db
    .prepare(
      `SELECT COALESCE(source_provider, 'UNKNOWN') AS provider, COUNT(*) AS n
         FROM prospects
        WHERE workspace = ? AND deleted_at IS NULL AND date(created_at) >= ?
        GROUP BY provider ORDER BY n DESC`
    )
    .bind(ws, since)
    .all();

  const legacyTotal = await one(
    `SELECT COUNT(*) n FROM prospects WHERE workspace = ? AND deleted_at IS NULL AND date(created_at) < ?`, ws, since
  );
  const legacyClients = await one(
    `SELECT COUNT(*) n FROM prospects WHERE workspace = ? AND deleted_at IS NULL AND stage = 'Client' AND date(created_at) < ?`, ws, since
  );

  const unreconciled = await needingReconciliation(db, ws);

  return NextResponse.json({
    ...summarise({
      counts: {
        added, prescreened, paidVerification, strong, maybe, skip,
        prepared, approvedUnchanged, edited, rejected, sent, replied, positiveReplies, clients,
      },
      legacy: { prospects: legacyTotal, clients: legacyClients },
      sources: (sourceRows || []).map((r) => ({ provider: r.provider, n: Number(r.n) })),
    }),
    // Real sends whose identity nobody could establish. Surfaced here because
    // an unreconciled send is a hole in the very cohort this page counts.
    needsReconciliation: unreconciled.map((s) => ({
      sendId: s.id, prospectId: s.prospect_id, name: s.name, step: s.sequence_step, sentAt: s.sent_at,
    })),
  });
}
