import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// What has actually been sent to one person, and the machinery behind it.
//
// Two audiences in one read, which is deliberate: the prospect page shows the
// sends as a plain chronological list, and the collapsed System details section
// shows the identifiers that came with them. Both are the same rows, so the
// friendly view and the diagnostic view can never describe different sends.
//
// Nothing here is derived. Every field is a value somebody wrote down at the
// time; a send with no recorded date stays absent rather than being placed.

export async function GET(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const id = Number(params?.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Which prospect?' }, { status: 400 });

  const db = getDb();
  const ws = ctx.workspace;

  const { results: sends } = await db
    .prepare(
      `SELECT id, sequence_step, subject, sent_at, channel, provider, recorded_via,
              package_id, package_version, playbook, sent_by, prepared_by,
              provider_message_id, provider_thread_id, approval_fingerprint
         FROM send_events
        WHERE workspace = ? AND prospect_id = ?
        ORDER BY sent_at ASC, id ASC
        LIMIT 50`
    )
    .bind(ws, id)
    .all()
    .catch(() => ({ results: [] }));

  const { results: packages } = await db
    .prepare(
      `SELECT id, version, status, status_reason, playbook, generator_version,
              approved_fingerprint, created_at, updated_at
         FROM outreach_packages
        WHERE workspace = ? AND prospect_id = ?
        ORDER BY version DESC
        LIMIT 10`
    )
    .bind(ws, id)
    .all()
    .catch(() => ({ results: [] }));

  const { results: jobs } = await db
    .prepare(
      `SELECT id, kind, status, attempts, error_kind, last_error, updated_at
         FROM jobs
        WHERE workspace = ? AND prospect_id = ?
        ORDER BY updated_at DESC
        LIMIT 10`
    )
    .bind(ws, id)
    .all()
    .catch(() => ({ results: [] }));

  return NextResponse.json({
    sends: sends || [],
    packages: packages || [],
    jobs: jobs || [],
  });
}
