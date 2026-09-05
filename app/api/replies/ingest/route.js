import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { bareAddress } from '@/lib/reply-match.mjs';
import { ingestMessages } from '@/lib/reply-ingest.mjs';
import { markMailboxRead } from '@/lib/gmail-store.mjs';

export const dynamic = 'force-dynamic';

// Reply ingestion over HTTP.
//
// Since the 2026-08-27 shutdown this is how replies arrive, full stop: the
// daily-reply-sync skill reads the mailbox in Cowork and posts what it found
// here. The app no longer reads Gmail itself.
//
// That makes a successful post the moment "replies were last read" — so it
// stamps the mailbox freshness the send guard checks before any send. An
// empty batch is a real message too: "I read the mailbox, nothing new" keeps
// sends possible on a quiet day, which is why it is accepted rather than
// rejected. A missing or malformed body still 400s; silence is never treated
// as a sweep.
//
// Everything is idempotent on message id.

const MAX_BATCH = 100;

export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();

  let body;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!Array.isArray(body?.messages)) {
    return NextResponse.json({ error: 'Send a messages array. An empty one means the mailbox was read and held nothing new.' }, { status: 400 });
  }
  const raw = body.messages.slice(0, MAX_BATCH);
  if (!raw.length) {
    await markMailboxRead(getDb(), ctx.workspace);
    return NextResponse.json({ ingested: 0, duplicates: 0, unmatched: 0, note: 'Mailbox read, nothing new.' });
  }

  // Normalised into the same shape the Gmail path produces, so downstream code
  // never has to ask where a message came from.
  const messages = raw.map((m) => ({
    messageId: String(m?.messageId || '').trim(),
    threadId: String(m?.threadId || '') || null,
    rfcMessageId: String(m?.rfcMessageId || '') || null,
    inReplyTo: String(m?.inReplyTo || '') || null,
    references: Array.isArray(m?.references) ? m.references : [],
    direction: m?.direction === 'outbound' ? 'outbound' : 'inbound',
    occurredAt: m?.occurredAt || new Date().toISOString(),
    fromAddress: bareAddress(m?.from),
    toAddresses: [bareAddress(m?.sentTo || m?.to)].filter(Boolean),
    subject: String(m?.subject || '').slice(0, 300),
    // Recognition only. The body is not stored: this is a prospecting tracker,
    // not a mail archive, and keeping correspondence it has no feature for
    // would be collecting other people's mail.
    snippet: String(m?.snippet || m?.body || '').slice(0, 300),
    headers: m?.headers || {},
  }));

  const db = getDb();
  const result = await ingestMessages(db, ctx.workspace, messages, {
    source: String(body?.source || 'skill'),
  });
  // Only after the batch landed: a sweep that threw has not refreshed
  // anything, and stamping it fresh would let a send go out on knowledge
  // that never arrived.
  await markMailboxRead(db, ctx.workspace);
  return NextResponse.json(result);
}

// What could not be matched, for the person who has to resolve it.
export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const db = getDb();
  const { results } = await db
    .prepare(`SELECT * FROM unmatched_replies WHERE workspace = ? AND resolved_prospect_id IS NULL ORDER BY occurred_at DESC LIMIT 50`)
    .bind(ctx.workspace)
    .all();
  return NextResponse.json({ unmatched: results || [] });
}
