import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { getAccount, accessTokenFor } from '@/lib/gmail-store.mjs';
import { buildMime, sendMessage, senderName, hasSendScope } from '@/lib/gmail-send.mjs';
import { canSendHumanReply, replyTarget } from '@/lib/reply-send-guard.mjs';

export const dynamic = 'force-dynamic';

// Send a human reply, into the conversation it answers.
//
// Deliberately separate from the cold path. `lib/send-runner.mjs` moves a
// package through a sequence and is bounded by cadence, caps and a send
// window. None of that belongs here: somebody wrote to Ary and is waiting,
// so the only reasons to refuse are the ones that would still hold if she
// typed the message in Gmail herself.
//
// What this must never do is look like a cold send afterwards. It writes an
// outbound reply_event, which is where conversation state is derived from,
// and it does NOT write send_events, does not touch the package, and does not
// increment emails_sent — that counter drives cold cadence, and a reply is
// not a cold touch.

function env() {
  try { return getCloudflareContext().env || {}; } catch { return {}; }
}

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();

  const body = await req.json().catch(() => ({}));
  const prospectId = Number(body?.prospectId);
  const text = String(body?.body || '').trim();
  const fingerprint = body?.fingerprint || null;

  if (!Number.isFinite(prospectId)) {
    return NextResponse.json({ error: 'Which conversation? No prospect was given.' }, { status: 400 });
  }

  const db = getDb();
  const ws = ctx.workspace;
  const e = env();

  const prospect = await db
    .prepare(
      `SELECT id, business_name, name, email, stage, do_not_contact, unsubscribed,
              emails_sent, rating
         FROM prospects WHERE id = ? AND workspace = ? AND deleted_at IS NULL`
    )
    .bind(prospectId, ws)
    .first()
    .catch(() => null);

  const { results: events } = await db
    .prepare(
      `SELECT direction, occurred_at, subject, snippet, thread_id, message_id,
              rfc_message_id, refs, from_address, classification
         FROM reply_events
        WHERE workspace = ? AND prospect_id = ?
        ORDER BY occurred_at DESC LIMIT 40`
    )
    .bind(ws, prospectId)
    .all()
    .catch(() => ({ results: [] }));

  const target = replyTarget(events || [], prospect || {});
  const latestInbound = (events || []).find((x) => x.direction === 'inbound') || null;

  const rel = await db
    .prepare(`SELECT state FROM relationship_events WHERE workspace = ? AND prospect_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 1`)
    .bind(ws, prospectId)
    .first()
    .catch(() => null);

  const verdict = canSendHumanReply(prospect || {}, {
    thread: target, body: text, state: rel?.state || null, fingerprint, latest: latestInbound,
  });
  if (!verdict.ok) {
    return NextResponse.json({ error: verdict.reason, block: verdict.block }, { status: 409 });
  }

  // Idempotency. A double click, a retry, or a request that timed out after
  // Gmail already accepted it must not put two copies in somebody's inbox.
  // The key is stable for the same draft in the same thread.
  const keySource = `${ws}:${prospectId}:${target.threadId}:${text}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(keySource));
  const idemKey = [...new Uint8Array(digest)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');

  const already = await db
    .prepare(`SELECT message_id FROM reply_events WHERE workspace = ? AND message_id = ?`)
    .bind(ws, `native-reply:${idemKey}`)
    .first()
    .catch(() => null);
  if (already) {
    return NextResponse.json({ ok: true, deduped: true, messageId: already.message_id });
  }

  const account = await getAccount(db, ws).catch(() => null);
  if (!account) {
    return NextResponse.json({ error: 'No mailbox is connected yet. Connect Gmail in Settings.' }, { status: 503 });
  }
  if (!hasSendScope(account)) {
    return NextResponse.json({ error: 'The mailbox is connected for reading only. Reconnect it to allow sending.' }, { status: 503 });
  }

  let token;
  try { token = await accessTokenFor(db, e, account); } catch {
    return NextResponse.json({ error: "Couldn't send that reply. Nothing was sent. Try again." }, { status: 502 });
  }

  const mime = buildMime({
    from: account.email_address,
    fromName: senderName({ operatorName: 'Ary', businessName: 'Bloomwired' }),
    to: target.to,
    subject: target.subject || 'Re:',
    body: text,
    inReplyTo: target.inReplyTo,
    references: target.references,
  });

  let sent;
  try {
    sent = await sendMessage(token, { mime, threadId: target.threadId });
  } catch {
    // Never Gmail's words. "Nothing was sent" is the part that matters.
    return NextResponse.json({ error: "Couldn't send that reply. Nothing was sent. Try again." }, { status: 502 });
  }

  const now = new Date().toISOString();

  // Record it where conversation state is read from. Two rows: the real Gmail
  // ids so a future sync recognises its own message, and the idempotency
  // marker so a retry is a no-op.
  await db
    .prepare(
      `INSERT OR IGNORE INTO reply_events
         (workspace, prospect_id, message_id, thread_id, direction, occurred_at,
          from_address, to_address, subject, snippet, source, rfc_message_id, matched_by)
       VALUES (?1, ?2, ?3, ?4, 'outbound', ?5, ?6, ?7, ?8, ?9, 'native-reply', ?10, 'thread')`
    )
    .bind(
      // sendMessage returns { messageId, threadId, labelIds }. Reading
      // `sent.id` stored the idempotency key where Gmail's own id belongs, so
      // a later sync could not recognise its own message.
      ws, prospectId, sent?.messageId || `native-reply:${idemKey}`, sent?.threadId || target.threadId, now,
      account.email_address, target.to, target.subject, text.slice(0, 300),
      null
    )
    .run()
    .catch(() => null);

  await db
    .prepare(
      `INSERT OR IGNORE INTO reply_events
         (workspace, prospect_id, message_id, thread_id, direction, occurred_at, subject, snippet, source)
       VALUES (?1, ?2, ?3, ?4, 'outbound', ?5, ?6, 'idempotency marker', 'native-reply')`
    )
    .bind(ws, prospectId, `native-reply:${idemKey}`, sent?.threadId || target.threadId, now, target.subject)
    .run()
    .catch(() => null);

  // The inbound message is now answered. This is what moves the conversation
  // from "needs your reply" to "waiting on them" — no stage change, no
  // package touch, no cold sequence restart.
  if (latestInbound?.message_id) {
    await db
      .prepare(`UPDATE reply_events SET answered_at = ? WHERE workspace = ? AND message_id = ? AND answered_at IS NULL`)
      .bind(now, ws, latestInbound.message_id)
      .run()
      .catch(() => null);
  }

  if (target.anchor === 'outbound') {
    // A follow-up into silence IS a cold touch, and the row should say so:
    // the stage advances to the touch that just went, and the stale next
    // action date clears (the router re-derives due-ness from evidence).
    // Ary sent two follow-ups live and watched the stage sit on Email 1.
    const touches = Number(prospect?.emails_sent || 0) + 1;
    await db
      .prepare(`UPDATE prospects SET last_contact_date = ?, stage = ?, next_action_date = NULL WHERE id = ? AND workspace = ?`)
      .bind(now.slice(0, 10), `Email ${Math.min(touches, 5)}`, prospectId, ws)
      .run()
      .catch(() => null);
  } else {
    await db
      .prepare(`UPDATE prospects SET last_contact_date = ? WHERE id = ? AND workspace = ?`)
      .bind(now.slice(0, 10), prospectId, ws)
      .run()
      .catch(() => null);
  }

  return NextResponse.json({
    ok: true,
    messageId: sent?.messageId || null,
    threadId: sent?.threadId || target.threadId,
    to: target.to,
  });
}
