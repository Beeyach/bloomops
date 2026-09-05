import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { stageableSequence, sequencePackageFields } from '@/lib/sequence-stage.mjs';
import { savePackage } from '@/lib/runner.mjs';

export const dynamic = 'force-dynamic';

// Stage a prospect's stored email sequence as a READY_FOR_APPROVAL package.
//
// Called by window.bloom.stageSequence from Ary's own signed-in browser after
// a skill wrote the sequence onto the row. Creates a package and nothing
// else: no send, no approval, no schedule. The one live package per prospect
// rule is savePackage's, and a prospect whose slot is occupied comes back as
// a refusal rather than a duplicate.
export async function POST(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();

  const prospectId = Number(params?.id);
  if (!Number.isFinite(prospectId)) {
    return NextResponse.json({ error: 'Which prospect? No id was given.' }, { status: 400 });
  }

  const db = getDb();
  const ws = ctx.workspace;

  const prospect = await db
    .prepare(`SELECT * FROM prospects WHERE id = ? AND workspace = ? AND deleted_at IS NULL`)
    .bind(prospectId, ws)
    .first()
    .catch(() => null);
  if (!prospect) {
    return NextResponse.json({ error: 'That prospect is not in the workspace.' }, { status: 404 });
  }

  const { results: events } = await db
    .prepare(
      `SELECT direction, occurred_at, classification FROM reply_events
        WHERE workspace = ? AND prospect_id = ? ORDER BY occurred_at DESC LIMIT 40`
    )
    .bind(ws, prospectId)
    .all()
    .catch(() => ({ results: [] }));

  const fit = stageableSequence(prospect, { events: events || [] });
  if (!fit.ok) {
    return NextResponse.json({ ok: false, error: fit.reason }, { status: 409 });
  }

  // A live package already waiting is an answer, not an error to bury:
  // savePackage returns the existing id without touching it, and the caller
  // is told which situation they are in.
  const before = await db
    .prepare(`SELECT id FROM outreach_packages WHERE workspace = ? AND prospect_id = ?
               AND status IN ('PREPARING','READY_FOR_APPROVAL','NEEDS_DECISION','APPROVED') LIMIT 1`)
    .bind(ws, prospectId)
    .first()
    .catch(() => null);
  if (before) {
    return NextResponse.json(
      { ok: false, error: `A live package (id ${before.id}) already exists for this prospect. Approve, skip or reprepare it first.` },
      { status: 409 }
    );
  }

  const fields = sequencePackageFields(prospect, fit);
  const packageId = await savePackage(db, ws, prospectId, fields);

  return NextResponse.json({
    ok: true,
    packageId,
    band: fit.band,
    bandProvisional: fit.provisional,
    emails: fit.steps.length,
    droppedBeyondCap: fit.dropped,
    status: fields.status,
  });
}
