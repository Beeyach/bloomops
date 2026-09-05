// Turning a message into what the product knows.
//
// Two callers reach this: the Gmail sync, which is how replies actually arrive,
// and the HTTP endpoint, which the skills and any manual reconciliation use.
// They must not disagree about whether somebody unsubscribed, so the deciding
// lives here once and both call it.
//
// Everything is idempotent on the provider message id. Sending the same batch
// twice is a no-op, which matters because the sync deliberately overlaps its
// window and because Pub/Sub delivers at-least-once.

import { matchReply, bareAddress } from './reply-match.mjs';
import { confirmSend, RECONCILE } from './send-events.mjs';
import { classifyByRules, actionFor, REPLY, REAL_REPLY, NEEDS_HUMAN } from './reply-classify.mjs';
import { applyReplyToProspect } from './reply-apply.mjs';
import { enqueue, KIND, PRIORITY } from './queue.mjs';

// Loaded once per batch rather than per message.
export async function loadMatchContext(db, ws) {
  const { results: candidates } = await db
    .prepare(`SELECT id, name, business_name, email, domain FROM prospects WHERE workspace = ? AND deleted_at IS NULL`)
    .bind(ws).all();

  const { results: threadRows } = await db
    .prepare(`SELECT DISTINCT thread_id, prospect_id FROM reply_events
               WHERE workspace = ? AND thread_id IS NOT NULL AND prospect_id IS NOT NULL`)
    .bind(ws).all();

  // Our own sent messages, by RFC Message-ID. This is what makes In-Reply-To
  // matching possible, and it only fills up once outbound has been recorded —
  // which the Gmail sync does for every message in a thread it already knows.
  const { results: rfcRows } = await db
    .prepare(`SELECT rfc_message_id, prospect_id FROM reply_events
               WHERE workspace = ? AND direction = 'outbound'
                 AND rfc_message_id IS NOT NULL AND prospect_id IS NOT NULL`)
    .bind(ws).all().catch(() => ({ results: [] }));

  return {
    candidates: candidates || [],
    knownThreads: new Map((threadRows || []).map((r) => [String(r.thread_id), r.prospect_id])),
    knownRfcIds: new Map((rfcRows || []).map((r) => [String(r.rfc_message_id).toLowerCase(), r.prospect_id])),
  };
}

async function alreadySeen(db, ws, messageId) {
  return db.prepare(
    `SELECT 1 AS hit FROM reply_events WHERE workspace = ? AND message_id = ?
     UNION ALL
     SELECT 1 FROM unmatched_replies WHERE workspace = ? AND message_id = ?
     LIMIT 1`
  ).bind(ws, messageId, ws, messageId).first();
}

// `messages` are already normalised (see gmail.mjs normalise, or the HTTP
// route's hand-built equivalent).
export async function ingestMessages(db, ws, messages, { source = 'skill', accountId = null, ctx = null } = {}) {
  const context = ctx || (await loadMatchContext(db, ws));
  const out = {
    ingested: 0, duplicates: 0, unmatched: 0, outbound: 0,
    // Sends the mailbox was able to put a real Gmail id on, and sends it
    // refused to choose between.
    sendsConfirmed: 0, sendsAmbiguous: 0,
    stopped: 0, needsHuman: 0, staleDrafts: 0, queuedForReading: 0, results: [],
  };

  for (const msg of messages) {
    const messageId = String(msg.messageId || '').trim();
    if (!messageId) { out.results.push({ error: 'missing messageId' }); continue; }

    if (await alreadySeen(db, ws, messageId)) {
      out.duplicates += 1;
      out.results.push({ messageId, status: 'duplicate' });
      continue;
    }

    // Our own outbound. Recorded so "did she answer" comes from message order
    // rather than a date column, and so the next reply in this thread has an
    // RFC id of ours to match against.
    if (msg.direction === 'outbound') {
      const m = matchReply(
        { ...msg, fromAddress: msg.toAddresses?.[0] || msg.toAddress, sentToAddress: msg.toAddresses?.[0] || msg.toAddress },
        context
      );
      await insertEvent(db, ws, msg, {
        prospectId: m.prospectId, direction: 'outbound', source, accountId,
        matchedBy: m.how, classification: null, confidence: null, by: null, why: null, needsHuman: false,
      });
      if (m.prospectId) {
        if (msg.threadId) context.knownThreads.set(String(msg.threadId), m.prospectId);
        if (msg.rfcMessageId) context.knownRfcIds.set(String(msg.rfcMessageId).toLowerCase(), m.prospectId);

        // The mailbox confirms a send. It never creates one.
        //
        // The sweep records the send the moment Gmail's compose window closes,
        // with no message id, because the UI never hands one over. This is the
        // same message arriving minutes later WITH its id, and the tempting
        // move — record it — would make one email into two sends.
        //
        // Refusal is built in below: if two unidentified sends to this prospect
        // sit inside the window, confirmSend flags both and attaches nothing.
        const c = await confirmSend(db, ws, {
          prospectId: m.prospectId,
          providerMessageId: msg.id || messageId,
          rfcMessageId: msg.rfcMessageId || null,
          providerThreadId: msg.threadId || null,
          sentAt: msg.occurredAt || null,
        }).catch(() => null);
        if (c?.status === RECONCILE.CONFIRMED) out.sendsConfirmed += 1;
        else if (c?.status === RECONCILE.AMBIGUOUS) out.sendsAmbiguous += 1;
      }
      out.outbound += 1;
      out.ingested += 1;
      out.results.push({ messageId, status: 'outbound-recorded', prospectId: m.prospectId, how: m.how });
      continue;
    }

    const match = matchReply(msg, context);

    // Will not guess. An unmatched reply goes somewhere a person can resolve it
    // rather than onto the nearest-looking record.
    if (!match.prospectId) {
      await db.prepare(
        `INSERT OR IGNORE INTO unmatched_replies
           (workspace, message_id, thread_id, rfc_message_id, gmail_account_id, occurred_at,
            from_address, subject, snippet, reason, candidates)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        ws, messageId, msg.threadId || null, msg.rfcMessageId || null, accountId, msg.occurredAt,
        bareAddress(msg.fromAddress), msg.subject || '', msg.snippet || '',
        match.reason || match.how, JSON.stringify(match.candidates || [])
      ).run().catch(() => {});
      out.unmatched += 1;
      out.results.push({ messageId, status: 'unmatched', how: match.how, reason: match.reason });
      continue;
    }

    // Rules first. Half of a cold-outreach inbox is autoresponders, bounces
    // and unsubscribes, and none of them needs a model.
    let cls = classifyByRules(msg);
    const needsRead = !cls;
    if (!cls) cls = { classification: REPLY.UNKNOWN, confidence: 'low', by: 'rules', why: 'Needs reading.' };

    const action = actionFor(cls.classification, { whenIso: null });
    const isReal = action.isRealReply !== false && REAL_REPLY.has(cls.classification);
    const needsHuman = action.needsHuman || NEEDS_HUMAN.has(cls.classification);

    await insertEvent(db, ws, msg, {
      prospectId: match.prospectId, direction: 'inbound', source, accountId,
      matchedBy: match.how, classification: cls.classification, confidence: cls.confidence,
      by: cls.by, why: cls.why, needsHuman,
    });
    if (msg.threadId) context.knownThreads.set(String(msg.threadId), match.prospectId);
    out.ingested += 1;

    const applied = await applyReplyToProspect(db, ws, match.prospectId, {
      cls, action, isReal, needsHuman, occurredAt: msg.occurredAt,
      message: { id: messageId, threadId: msg.threadId, text: `${msg.subject || ''} ${msg.snippet || ''}` },
    });
    if (applied.stopped) out.stopped += 1;
    if (needsHuman) out.needsHuman += 1;
    if (applied.staleDraft) out.staleDrafts += 1;

    // Anything the rules would not touch goes to the cheap model in the
    // background. The prospect is already protected: an unknown reply stops
    // outbound from `replied` alone, so this only ever improves the label.
    if (needsRead) {
      const r = await enqueue(db, {
        workspace: ws, kind: KIND.CLASSIFY_REPLY, prospectId: match.prospectId,
        priority: PRIORITY.CLASSIFY_REPLY, extra: messageId, payload: { messageId },
      });
      if (r.queued) out.queuedForReading += 1;
    }

    out.results.push({
      messageId, status: 'ingested', prospectId: match.prospectId, how: match.how,
      classification: cls.classification, confidence: cls.confidence,
      needsHuman, staleDraft: applied.staleDraft, queuedForReading: needsRead,
    });
  }

  return out;
}

async function insertEvent(db, ws, msg, meta) {
  await db.prepare(
    `INSERT INTO reply_events
       (workspace, prospect_id, message_id, thread_id, rfc_message_id, in_reply_to, refs,
        gmail_account_id, matched_by, direction, occurred_at, from_address, to_address,
        subject, snippet, classification, confidence, classified_by, why, requires_human, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    ws, meta.prospectId, msg.messageId, msg.threadId || null,
    msg.rfcMessageId || null, msg.inReplyTo || null,
    Array.isArray(msg.references) && msg.references.length ? msg.references.join(' ').slice(0, 2000) : null,
    meta.accountId, meta.matchedBy, meta.direction, msg.occurredAt,
    bareAddress(msg.fromAddress),
    bareAddress(msg.toAddresses?.[0] || msg.toAddress),
    msg.subject || '',
    // Outbound snippets are not kept. We wrote it; storing our own words back
    // is a copy of the sequence we already have.
    meta.direction === 'inbound' ? (msg.snippet || '') : null,
    meta.classification, meta.confidence, meta.by, meta.why,
    meta.needsHuman ? 1 : 0, meta.source
  ).run();
}
