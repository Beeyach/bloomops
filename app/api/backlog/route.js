import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized, forbidden } from '@/lib/workspace.mjs';
import { summarise, preparationAllowance, BUCKET, BAND } from '@/lib/backlog.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// What is in the unworked pile, and where the money should go first.
//
// Free by construction. Only columns that already exist are read, no probe is
// run and no model is called, because the entire point is deciding where to
// spend and a breakdown that costs money to produce has defeated itself.
export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') return forbidden();

  const db = getDb();
  const ws = ctx.workspace;

  // Unworked: never emailed and never rated as done with. Deliberately not
  // "everything", because the question is about the backlog rather than the
  // database.
  const { results } = await db
    .prepare(
      `SELECT id, email, domain, stage, rating, source, source_provider, site_intel,
              own_findings, audit_notes, qualification, replied, call_booked, proposal_sent,
              do_not_contact, unsubscribed
         FROM prospects
        WHERE workspace = ? AND deleted_at IS NULL
          AND COALESCE(emails_sent, 0) = 0`
    )
    .bind(ws)
    .all();

  const summary = summarise(results || []);

  const waiting = await db
    .prepare(`SELECT COUNT(*) n FROM outreach_packages WHERE workspace = ? AND status = 'READY_FOR_APPROVAL'`)
    .bind(ws).first().catch(() => ({ n: 0 }));

  const limitsRow = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'limits'`)
    .bind(ws).first();
  let limits = {};
  if (limitsRow?.value) { try { limits = JSON.parse(limitsRow.value); } catch {} }

  const allowance = preparationAllowance({
    readyForApproval: Number(waiting?.n) || 0,
    dailyDraftCap: Number(limits.maxDraftsPerDay) || 10,
  });

  return NextResponse.json({
    ...summary,
    readyForApproval: Number(waiting?.n) || 0,
    allowance,
    buckets: BUCKET,
    bands: BAND,
  });
}
