import { NextResponse } from 'next/server';
import { getDb, STAGES, RATINGS, COUNTRIES, SOURCES, REPLY_TYPES } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { PROSPECT_COLUMNS } from '@/lib/columns.mjs';
import { recordTransition, SOURCE } from '@/lib/outcomes.mjs';

export const runtime = 'edge';
// Force-dynamic so PUT/DELETE survive the next-on-pages build as a real
// Function instead of being prerendered static (which 405s non-GET methods).
export const dynamic = 'force-dynamic';

// Note on what is deliberately ABSENT: site_intel, site_intel_at and
// site_intel_source are not writable here, and must never become writable.
//
// They hold VERIFIED evidence — findings a headless browser measured — and the
// whole tier system in lib/evidence.mjs rests on the difference between that
// and something a person or a model asserted. If a PUT could write site_intel,
// anything could be laundered into "a browser measured this", and every
// downstream promise the product makes about not inventing reasons would be
// worth nothing. Only the probe routes write them, server-side, from a real
// probe response. own_findings IS writable, because that is Ary's own claim
// and it is labelled as hers.
const ALLOWED_FIELDS = [
  'name',
  'business_name',
  'email',
  'domain',
  'rating',
  'stage',
  'emails_sent',
  'last_contact_date',
  // The clock time behind the date, so send-hour and time-to-reply become
  // answerable. Both ISO UTC; the prospect's local time is this plus their
  // country's offset.
  'last_contact_at',
  'reply_at',
  'claude_chat_link',
  'gmail_labels',
  'is_read',
  'country',
  // Free-text / JSON columns — no validation needed.
  'email_sequence',
  'audit_notes',
  'pdf_filename',
  'info',
  'review_url',
  'replied',
  'reply_date',
  'reply_type',
  'replied_at_email',
  'next_action_date',
  'source',
  // Cold-email tracker fields. niche is free text; call_booked/proposal_sent
  // are tri-state (NULL/0/1) and flow through the general branch below, which
  // maps '' → NULL and passes 0/1 through unchanged.
  'niche',
  'call_booked',
  'proposal_sent',
  // Qualification scoring: must_haves is 'Y'/'N', revenue_score is 0-7.
  'must_haves',
  'revenue_score',
  // Audit video: the hosted link, plus the triage verdict that decided whether
  // rendering one was worth it.
  'video_url',
  'video_tier',
  'video_score',
  // The worklist "why" (JSON array) and the sent-once stamp for the video email.
  'video_reasons',
  // Findings Ary noticed herself, spoken verbatim in the video.
  'own_findings',
  'video_sent_at',
  // The two one-off emails the sweep builds at send time, each stored as
  // { subject, body, sent_at } so what went out is on the record.
  'video_sent_email',
  'playbook_sent_email',
  // Activity log: JSON array of { ts, tag, text }, appended client-side by
  // window.bloom.addLog. Free-JSON column like the two above.
  'activity_log',
];

const SELECT_COLS =
  PROSPECT_COLUMNS;

export async function PUT(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  const db = getDb();
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Build SET fragment + positional bind values in parallel. The id goes
  // on the end (WHERE id = ?).
  const updates = [];
  const values = [];
  for (const key of ALLOWED_FIELDS) {
    if (key in body) {
      if (key === 'stage' && body.stage != null && !STAGES.includes(body.stage)) {
        return NextResponse.json({ error: 'Invalid stage' }, { status: 400 });
      }
      if (key === 'rating' && body.rating != null && body.rating !== '' && !RATINGS.includes(body.rating)) {
        return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
      }
      if (key === 'country' && body.country != null && body.country !== '' && !COUNTRIES.includes(body.country)) {
        return NextResponse.json({ error: 'Invalid country' }, { status: 400 });
      }
      if (key === 'source' && body.source != null && body.source !== '' && !SOURCES.includes(body.source)) {
        return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
      }
      if (key === 'reply_type' && body.reply_type != null && body.reply_type !== '' && !REPLY_TYPES.includes(body.reply_type)) {
        return NextResponse.json({ error: 'Invalid reply_type' }, { status: 400 });
      }
      if (key === 'must_haves' && body.must_haves != null && body.must_haves !== '' && !['Y', 'N'].includes(body.must_haves)) {
        return NextResponse.json({ error: 'must_haves must be Y or N' }, { status: 400 });
      }
      if (key === 'revenue_score' && body.revenue_score != null && body.revenue_score !== '') {
        const n = Number(body.revenue_score);
        if (!Number.isInteger(n) || n < 0 || n > 7) {
          return NextResponse.json({ error: 'revenue_score must be 0-7' }, { status: 400 });
        }
      }
      updates.push(`${key} = ?`);
      if (key === 'is_read' || key === 'replied') {
        values.push(body[key] ? 1 : 0);
      } else {
        values.push(body[key] === '' ? null : body[key]);
      }
    }
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: 'No updates' }, { status: 400 });
  }
  updates.push(`updated_at = datetime('now')`);

  const rowId = Number(id);
  // What the stage was before. Read only when the patch touches it, so the
  // ordinary edit stays one query.
  const before = 'stage' in body
    ? await db.prepare(`SELECT stage FROM prospects WHERE id = ? AND workspace = ?`).bind(rowId, ctx.workspace).first()
    : null;

  const sql = `UPDATE prospects SET ${updates.join(', ')} WHERE id = ? AND workspace = ?`;
  const info = await db.prepare(sql).bind(...values, rowId, ctx.workspace).run();
  if ((info?.meta?.changes ?? 0) === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const row = await db
    .prepare(`SELECT ${SELECT_COLS} FROM prospects WHERE id = ? AND workspace = ?`)
    .bind(rowId, ctx.workspace)
    .first();

  // A move into an end state is the one stage change worth a timestamp.
  // `stage = 'Client'` was a state and nothing else, which meant the moment a
  // prospect became a client could not be ordered against the reply that
  // preceded it, and editing the record later lost the date entirely.
  if (before && row && before.stage !== row.stage) {
    await recordTransition(db, {
      workspace: ctx.workspace,
      prospect: row,
      from: before.stage,
      to: row.stage,
      source: SOURCE.HUMAN,
    });
  }

  return NextResponse.json({ prospect: row });
}

export async function DELETE(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  const db = getDb();
  const info = await db
    .prepare("UPDATE prospects SET deleted_at = datetime('now') WHERE id = ? AND workspace = ? AND deleted_at IS NULL")
    .bind(Number(id), ctx.workspace)
    .run();
  if ((info?.meta?.changes ?? 0) === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
