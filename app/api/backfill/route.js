import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized, forbidden } from '@/lib/workspace.mjs';
import { getAccount, accessTokenFor } from '@/lib/gmail-store.mjs';
import { backfillProspect, RESULT } from '@/lib/gmail-backfill.mjs';
import { getCloudflareContext } from '@opennextjs/cloudflare';

export const dynamic = 'force-dynamic';

function env() {
  try { const { env: e } = getCloudflareContext(); if (e) return e; } catch {}
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

// Highest value first, so the analysis can start before the backlog finishes.
// A client's thread is worth more than a thousand silent ones.
const PRIORITY = `
  CASE
    WHEN stage = 'Client' THEN 0
    WHEN reply_type = 'interested' THEN 1
    WHEN reply_type = 'defer' THEN 2
    WHEN reply_type = 'decline' THEN 3
    WHEN replied = 1 THEN 4
    ELSE 5
  END`;

// Read-only recovery of historical chronology. Admin only, and it writes to
// legacy_messages, which nothing in the live pipeline reads.
export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') return forbidden();

  const db = getDb();
  const ws = ctx.workspace;
  const body = await req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(body.limit) || 5, 1), 12);
  const ids = Array.isArray(body.prospectIds) ? body.prospectIds.map(Number).filter(Number.isFinite) : null;

  const account = await getAccount(db, ws);
  if (!account) return NextResponse.json({ error: 'No mailbox connected.' }, { status: 400 });
  const token = await accessTokenFor(db, env(), account);
  if (token?.needsReconnect) return NextResponse.json({ error: 'The mailbox needs reconnecting.' }, { status: 400 });
  const accessToken = token.accessToken || token;

  // An explicit id list re-runs even a finished prospect: that is how a
  // corrected search strategy gets applied to work the old one got wrong.
  const where = ids?.length
    ? `AND p.id IN (${ids.map(() => '?').join(',')})`
    : `AND p.legacy_backfill_at IS NULL
       AND (COALESCE(p.emails_sent,0) > 0 OR p.replied = 1 OR p.stage IN ('Engaged','Replied','Interested','Client'))`;

  const { results: rows } = await db
    .prepare(
      `SELECT p.id, p.name, p.business_name, p.email, p.stage, p.reply_type, p.replied, p.emails_sent,
              p.created_at, p.updated_at, p.reply_date, p.last_contact_date
         FROM prospects p
        WHERE p.workspace = ? AND p.deleted_at IS NULL ${where}
        ORDER BY ${PRIORITY}, p.id ASC
        LIMIT ?`
    )
    .bind(ws, ...(ids?.length ? ids : []), limit)
    .all();

  const out = [];
  for (const p of rows || []) {
    const { results: cands } = await db
      .prepare(`SELECT contact_type, value FROM contact_candidates WHERE workspace = ? AND prospect_id = ?`)
      .bind(ws, p.id).all().catch(() => ({ results: [] }));

    const r = await backfillProspect(accessToken, p, {
      candidates: cands || [],
      accountEmail: account.email_address,
    });

    for (const m of r.messages) {
      await db.prepare(
        `INSERT OR IGNORE INTO legacy_messages
           (workspace, prospect_id, message_id, thread_id, rfc_message_id, direction,
            occurred_at, from_address, to_address, subject, match_rule, match_confidence)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'high')`
      ).bind(
        ws, p.id, m.messageId, m.threadId, m.rfcMessageId, m.direction,
        m.occurredAt, m.fromAddress, m.toAddress, (m.subject || '').slice(0, 300), m.matchRule
      ).run().catch(() => {});
    }

    await db.prepare(
      `UPDATE prospects SET legacy_backfill_at = datetime('now'), legacy_backfill_result = ?, legacy_message_count = ?
        WHERE id = ? AND workspace = ?`
    ).bind(r.result, r.messages.length, p.id, ws).run().catch(() => {});

    out.push({
      id: p.id,
      name: p.name || p.business_name,
      result: r.result,
      messages: r.messages.length,
      inbound: r.messages.filter((m) => m.direction === 'inbound').length,
      outbound: r.messages.filter((m) => m.direction === 'outbound').length,
      threads: r.threads || 0,
      capped: Boolean(r.capped),
      window: r.window || null,
      earliest: r.messages[0]?.occurredAt || null,
    });
  }

  const remaining = await db
    .prepare(
      `SELECT COUNT(*) n FROM prospects
        WHERE workspace = ? AND deleted_at IS NULL AND legacy_backfill_at IS NULL
          AND (COALESCE(emails_sent,0) > 0 OR replied = 1 OR stage IN ('Engaged','Replied','Interested','Client'))`
    ).bind(ws).first().catch(() => ({ n: null }));

  return NextResponse.json({ processed: out, remaining: Number(remaining?.n ?? 0) });
}
