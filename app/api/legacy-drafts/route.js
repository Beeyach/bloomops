import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { enqueue, KIND, PRIORITY } from '@/lib/queue.mjs';
import { canProgressOutbound } from '@/lib/outbound.mjs';
import { guardView } from '@/lib/prospect-view.mjs';
import { contactStateOf, CONTACT_STATE } from '@/lib/contact-state.mjs';
import { verificationDecision, VERIFICATION } from '@/lib/verification.mjs';
import { PROSPECT_COLUMNS } from '@/lib/columns.mjs';
import { appendEntry } from '@/lib/activity-log.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// The old drafts, and what can be done with them.
//
// There is no regenerate-all, and there never will be: V2 will refuse prospects
// V1 happily wrote to, and a bulk redo would turn "old copy" into "live
// outreach" for a pile of people nobody re-read.
//
// Dismiss-all is a different animal and is allowed. It sends nothing, prepares
// nothing, and decides nothing about the business: it is the same "off today's
// list" flag the single button writes, applied to a backlog that is stale by
// construction. Everything in this pile predates Strategy V2, so clearing it
// one card at a time is 77 clicks that all mean the same thing.

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const ws = ctx.workspace;
  const body = await req.json().catch(() => ({}));
  const id = Number(body.prospectId);
  const action = String(body.action || '');

  // ── put the whole pre-V2 pile aside ────────────────────────────────────
  //
  // Deliberately before the prospectId check: this action is about the pile,
  // not a person.
  //
  // Stale drafts are excluded on purpose. `pending_draft_stale` means somebody
  // wrote back after the draft was prepared, which makes them a person to read
  // rather than clutter to clear, and they sit in Decisions rather than in this
  // pile anyway.
  if (action === 'dismiss-all') {
    const { results: rows } = await db
      .prepare(
        `SELECT id, activity_log FROM prospects
          WHERE workspace = ? AND deleted_at IS NULL
            AND pending_draft IS NOT NULL AND pending_draft != ''
            AND pending_draft_dismissed_at IS NULL
            AND COALESCE(pending_draft_stale, 0) = 0`
      )
      .bind(ws)
      .all()
      .catch(() => ({ results: [] }));

    if (!rows?.length) return NextResponse.json({ ok: true, dismissed: 0 });

    const stmt = db.prepare(
      `UPDATE prospects
          SET pending_draft_dismissed_at = datetime('now'), activity_log = ?, updated_at = datetime('now')
        WHERE id = ? AND workspace = ?`
    );
    await db.batch(
      rows.map((r) =>
        stmt.bind(
          appendEntry(r.activity_log, 'note', 'Put the old draft aside with the rest of the pre-V2 batch. Nothing else changed.'),
          r.id, ws
        )
      )
    );

    return NextResponse.json({ ok: true, dismissed: rows.length });
  }

  if (!id) return NextResponse.json({ error: 'Which prospect?' }, { status: 400 });

  const p = await db
    .prepare(`SELECT ${PROSPECT_COLUMNS} FROM prospects WHERE id = ? AND workspace = ? AND deleted_at IS NULL`)
    .bind(id, ws).first().catch(() => null);
  if (!p) return NextResponse.json({ error: 'No such prospect.' }, { status: 404 });

  // ── dismiss ────────────────────────────────────────────────────────────
  //
  // Off today's list, and nothing else. The draft text stays, the stage stays,
  // the rating stays, and nobody is marked rejected or do-not-contact. "I do
  // not want to see this today" is not a verdict about the business, and the
  // two must never be written to the same column.
  if (action === 'dismiss') {
    await db.prepare(
      `UPDATE prospects
          SET pending_draft_dismissed_at = datetime('now'), activity_log = ?, updated_at = datetime('now')
        WHERE id = ? AND workspace = ?`
    ).bind(
      appendEntry(p.activity_log, 'note', 'Put the old draft aside. Nothing else changed.'),
      id, ws
    ).run().catch(() => {});
    return NextResponse.json({ ok: true, dismissed: true, stage: p.stage, rating: p.rating });
  }

  // ── redo under the current rules ───────────────────────────────────────
  //
  // Not a conversion. The old copy is not carried across, because it was
  // written to a five-email shape with a close the evidence says does not
  // work. This runs the prospect through the same preparation everything else
  // uses, and it is allowed to say no.
  if (action === 'regenerate') {
    const gate = canProgressOutbound(guardView(p, { where: 'legacy redo' }), { now: new Date() });
    if (!gate.ok && gate.stop !== 'not-due') {
      return NextResponse.json({ ok: false, blocked: gate.stop, reason: gate.reason }, { status: 409 });
    }

    const contact = contactStateOf(p);
    if (contact === CONTACT_STATE.NONE) {
      return NextResponse.json({
        ok: false, blocked: 'no-contact',
        reason: 'There is no safe address for them yet, so nothing can be prepared. They are in the waiting list.',
      }, { status: 409 });
    }
    if (contact === CONTACT_STATE.NEEDS_CONTACT_RECOVERY) {
      return NextResponse.json({
        ok: false, blocked: 'contact-recovery',
        reason: 'Their address stopped working. Find a new one first; everything else about them is still good.',
      }, { status: 409 });
    }

    const v = verificationDecision(p, { budgetRemaining: Infinity });
    if (v.parks) {
      return NextResponse.json({ ok: false, blocked: v.reason, reason: v.detail }, { status: 409 });
    }
    if (v.state === VERIFICATION.WAITING_FOR_BUDGET) {
      return NextResponse.json({
        ok: false, blocked: 'waiting-for-budget',
        reason: 'They are worth checking, but today’s allowance is spent. This will pick up by itself.',
      }, { status: 409 });
    }

    // A live package already means the work is done and this button is a
    // no-op rather than a second package racing the first.
    const live = await db
      .prepare(
        `SELECT id, status FROM outreach_packages
          WHERE workspace = ? AND prospect_id = ? AND status IN ('PREPARING','READY_FOR_APPROVAL','NEEDS_DECISION','APPROVED')
          ORDER BY version DESC LIMIT 1`
      ).bind(ws, id).first().catch(() => null);
    if (live) {
      return NextResponse.json({ ok: true, already: true, packageId: live.id, status: live.status });
    }

    const q = await enqueue(db, {
      workspace: ws, kind: KIND.PREPARE_OUTREACH, prospectId: id, priority: PRIORITY.PREPARE_OUTREACH,
    }).catch(() => ({ queued: false }));

    // The old draft steps aside either way. It is not the answer any more, and
    // leaving it on the list next to a new package would show two.
    await db.prepare(
      `UPDATE prospects
          SET pending_draft_dismissed_at = datetime('now'), activity_log = ?, updated_at = datetime('now')
        WHERE id = ? AND workspace = ?`
    ).bind(
      appendEntry(p.activity_log, 'auto', 'Redoing the outreach under the current rules. The old draft was put aside.'),
      id, ws
    ).run().catch(() => {});

    return NextResponse.json({ ok: true, queued: Boolean(q.queued), next: KIND.PREPARE_OUTREACH });
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
