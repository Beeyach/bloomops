import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { enqueue, KIND, PRIORITY } from '@/lib/queue.mjs';
import { canProgressOutbound } from '@/lib/outbound.mjs';
import { guardView } from '@/lib/prospect-view.mjs';
import { friendlyError, canRetry } from '@/lib/friendly-errors.mjs';

export const dynamic = 'force-dynamic';

// "Try again" on a check that could not finish.
//
// It re-queues through the existing durable queue rather than doing the work
// here. A second retry mechanism would be a second place for a job to get
// stuck, and the queue already knows about claims, backoff and dedupe.

// Kinds that are safe to run again on their own. A send is deliberately absent:
// retrying a send is not a UI button.
const RETRYABLE = new Set([
  KIND.PRESCREEN, KIND.SIGNALS, KIND.VERIFY_SITE, KIND.VET,
  KIND.DISCOVER_CONTACT, KIND.PREPARE_OUTREACH, KIND.PREPARE_FOLLOWUP,
  KIND.CLASSIFY_REPLY,
]);

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const ws = ctx.workspace;
  const body = await req.json().catch(() => ({}));
  const prospectId = Number(body.prospectId);
  if (!prospectId) return NextResponse.json({ error: 'Which prospect?' }, { status: 400 });

  const p = await db
    .prepare(
      `SELECT id, name, business_name, email, stage, replied, reply_type, reply_date,
              next_action_date, do_not_contact, unsubscribed
         FROM prospects WHERE id = ? AND workspace = ? AND deleted_at IS NULL`
    ).bind(prospectId, ws).first().catch(() => null);
  if (!p) return NextResponse.json({ error: 'No such prospect.' }, { status: 404 });

  const job = await db
    .prepare(
      `SELECT id, kind, status, error_kind, last_error FROM jobs
        WHERE workspace = ? AND prospect_id = ? AND status IN ('failed','waiting')
        ORDER BY updated_at DESC LIMIT 1`
    ).bind(ws, prospectId).first().catch(() => null);

  if (!job) return NextResponse.json({ error: 'There is nothing waiting to be retried.' }, { status: 404 });

  // The same question the card asked before it drew the button. Asked again
  // here, because the state can move between a page load and a click.
  const fail = friendlyError(job.last_error, { errorKind: job.error_kind });
  if (!canRetry(fail, p)) {
    return NextResponse.json({
      error: 'This one is not safe to run again. Open the prospect and take a look.',
    }, { status: 409 });
  }

  const gate = canProgressOutbound(guardView(p, { where: 'retry' }), { now: new Date() });
  if (!gate.ok && gate.stop !== 'not-due') {
    return NextResponse.json({ error: gate.reason }, { status: 409 });
  }

  const kind = RETRYABLE.has(job.kind) ? job.kind : KIND.PRESCREEN;
  const q = await enqueue(db, {
    workspace: ws, kind, prospectId, priority: PRIORITY.VET,
    // A retry of a job that already exists in a failed state needs its own
    // dedupe identity, or the unique index refuses it and the button does
    // nothing at all.
    extra: `retry:${job.id}`,
  }).catch(() => ({ queued: false }));

  return NextResponse.json({ ok: true, queued: Boolean(q.queued), kind });
}
