import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { recordSend, sendsFor, reconcileSends, reconcileFromMailbox, VIA } from '@/lib/send-events.mjs';
import { appendEntry } from '@/lib/activity-log.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Where a send comes back into the product.
//
// The app does not send. The sweep skill does, out of Ary's own mailbox, and
// that is the right design: it keeps the sending inside an account a person
// controls, with no delegated authority to email strangers. What it cost was
// the last link in the chain — the database knew a package was APPROVED and
// nothing more, and approved is not sent.
//
// So the skill reports back here. Two properties matter more than anything
// else about this endpoint:
//
//   It is idempotent. A retry after a dropped connection must not advance a
//   sequence twice, and the deduplication is done by the database's unique
//   index rather than by a read-then-write, which two concurrent calls would
//   both sail through.
//
//   It never becomes the only record. If the callback is lost the send still
//   happened, and the proof is sitting in the sent folder. PATCH reconciles
//   from that, so a silent loss is recoverable rather than permanent.

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const prospectId = Number(body.prospectId || body.prospect_id);
  if (!Number.isInteger(prospectId) || prospectId <= 0) {
    return NextResponse.json({ error: 'A send needs a prospectId.' }, { status: 400 });
  }

  const prospect = await db
    .prepare(`SELECT id, name, stage, emails_sent, activity_log FROM prospects WHERE id = ? AND workspace = ?`)
    .bind(prospectId, ctx.workspace)
    .first();
  if (!prospect) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // The live package, if there is one. A manual send has none, and inventing
  // an id to fill the field would put a fiction in the causal chain.
  const pkg = await db
    .prepare(
      `SELECT id, version, generator_version, playbook FROM outreach_packages
        WHERE workspace = ? AND prospect_id = ? ORDER BY version DESC LIMIT 1`
    )
    .bind(ctx.workspace, prospectId)
    .first();

  const step = Number.isInteger(Number(body.sequenceStep)) && Number(body.sequenceStep) > 0
    ? Number(body.sequenceStep)
    : (Number(prospect.emails_sent) || 0) + 1;

  const result = await recordSend(db, {
    workspace: ctx.workspace,
    prospectId,
    packageId: pkg?.id ?? null,
    packageVersion: pkg?.version ?? null,
    generatorVersion: pkg?.generator_version ?? null,
    playbook: pkg?.playbook ?? null,
    sequenceStep: step,
    channel: String(body.channel || 'email'),
    provider: String(body.provider || 'gmail'),
    // Strongest identifier the caller could get, in order. The Gmail UI path
    // has none at send time, which is why the derived key exists and why the
    // mailbox sync upgrades it later rather than recording a second send.
    providerMessageId: body.messageId || body.message_id || null,
    rfcMessageId: body.rfcMessageId || body.rfc_message_id || null,
    providerThreadId: body.threadId || body.thread_id || null,
    subject: body.subject || null,
    sentAt: body.sentAt || body.sent_at || null,
    via: VIA.CALLBACK,
  });

  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  // Everything below happens exactly as often as a send did, which is why
  // recordSend reports which of the two cases this was.
  if (result.recorded) {
    await db
      .prepare(
        `UPDATE prospects
            SET emails_sent = COALESCE(emails_sent, 0) + 1,
                last_contact_date = COALESCE(?, date('now')),
                last_contact_at = COALESCE(?, datetime('now')),
                activity_log = ?,
                updated_at = datetime('now')
          WHERE id = ? AND workspace = ?`
      )
      .bind(
        String(result.sentAt || '').slice(0, 10) || null,
        result.sentAt || null,
        appendEntry(prospect.activity_log, 'auto', `Email ${step} sent.`),
        prospectId,
        ctx.workspace
      )
      .run();
  }

  return NextResponse.json({
    ok: true,
    recorded: Boolean(result.recorded),
    duplicate: Boolean(result.duplicate),
    dedupeKey: result.dedupeKey,
    identity: result.identity,
    // True when the send is real and which message it was is not established.
    // The caller should say so rather than reporting a clean success.
    needsReconciliation: Boolean(result.needsReconciliation),
    sends: (await sendsFor(db, ctx.workspace, prospectId)).length,
  });
}

// What is approved and has no send recorded, plus reconciliation from sent
// mail when the caller has it.
export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const { awaitingSend } = await import('@/lib/send-events.mjs');
  const pending = await awaitingSend(db, ctx.workspace, {
    olderThanMinutes: Number(new URL(req.url).searchParams.get('after')) || 30,
  });
  return NextResponse.json({
    pending: pending.map((p) => ({
      prospectId: p.prospect_id,
      name: p.name,
      email: p.email,
      subject: p.email_subject,
      approvedAt: p.reviewed_at,
    })),
  });
}

// Reconcile against outbound messages the caller read from the mailbox.
//
// The recipient address has to match. A subject-line match would be a guess,
// and a wrong guess here writes a send that never happened into the one record
// that is supposed to be authoritative.
export async function PATCH(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages.slice(0, 200) : [];
  const summary = await reconcileSends(db, ctx.workspace, messages);
  // And the other direction: sends waiting for an id whose message the mailbox
  // already holds. The two orderings are both real — the first production send
  // was observed by Pub/Sub fourteen seconds before the skill reported it — so
  // both have to be swept.
  const fromMailbox = await reconcileFromMailbox(db, ctx.workspace);
  return NextResponse.json({ ok: true, ...summary, fromMailbox });
}
