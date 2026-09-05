import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { stageableVideoDelivery, videoDeliveryPackageFields } from '@/lib/video-delivery.mjs';
import { savePackage } from '@/lib/runner.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Stage a one-off video delivery as a READY_FOR_APPROVAL package.
//
// The recording already exists and was already offered. This gives it a place
// to wait for Ary's approval instead of living in a text file she pastes from,
// and puts it on the same rails as everything else: the same approval, the same
// fingerprint, the same send guard, the same window, and video_sent_at stamped
// automatically when it actually goes.
//
// Creates a package and nothing else. No send, no approval, no schedule, no
// model call. Every refusal below is a plain sentence rather than a code,
// because the person reading it is deciding what to do next.
export async function POST(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();

  const prospectId = Number(params?.id);
  if (!Number.isFinite(prospectId)) {
    return NextResponse.json({ error: 'Which prospect? No id was given.' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const email = {
    subject: String(body?.subject || '').trim(),
    body: String(body?.body || '').trim(),
  };

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

  const fit = stageableVideoDelivery(prospect, { email });
  if (!fit.ok) {
    return NextResponse.json({ ok: false, error: fit.reason }, { status: 409 });
  }

  // One live package per prospect. A delivery never races a sequence.
  const live = await db
    .prepare(
      `SELECT id, status FROM outreach_packages
        WHERE workspace = ? AND prospect_id = ?
          AND status IN ('PREPARING','READY_FOR_APPROVAL','NEEDS_DECISION','APPROVED') LIMIT 1`
    )
    .bind(ws, prospectId)
    .first()
    .catch(() => null);
  if (live) {
    return NextResponse.json(
      { ok: false, error: `A live package (id ${live.id}) already exists for this prospect. Approve, skip or reprepare it first.` },
      { status: 409 }
    );
  }

  const fields = videoDeliveryPackageFields(prospect, fit);
  const packageId = await savePackage(db, ws, prospectId, fields);

  return NextResponse.json({
    ok: true,
    packageId,
    status: fields.status,
    tier: fit.tier,
    // Said out loud rather than buried: a MAYBE recording is one nobody has
    // watched, and the approval screen is where that belongs.
    unverified: fit.unverified,
  });
}
