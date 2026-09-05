import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { listAccounts, publicView, getAccount, accessTokenFor, recordWatch } from '@/lib/gmail-store.mjs';
import { startWatch, stopWatch, GMAIL_SCOPE } from '@/lib/gmail.mjs';
import { openSecret } from '@/lib/secret-box.mjs';

export const dynamic = 'force-dynamic';

// Connection state, for the person who has to trust it.
//
// Returns a state word and some timestamps. No token, not even a masked one:
// a masked secret in a response body is still a secret in a response body.

function env() {
  try { const { env: e } = getCloudflareContext(); if (e) return e; } catch {}
  return typeof process !== 'undefined' && process.env ? process.env : {};
}

export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const e = env();
  const db = getDb();
  const accounts = await listAccounts(db, ctx.workspace);
  return NextResponse.json({
    // Whether the deployment could connect a mailbox at all, so "not connected"
    // and "not set up" are distinguishable without reading a log.
    configured: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.GMAIL_PUBSUB_TOPIC),
    scope: GMAIL_SCOPE,
    mailboxes: accounts.map((a) => publicView(a)),
  });
}

// Renew the watch by hand, or disconnect. Renewal is normally the cron's job;
// having a button matters the day something is wrong and waiting until 4am is
// not an acceptable answer.
export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const e = env();
  const db = getDb();
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || 'renew');

  const account = await getAccount(db, ctx.workspace, body?.emailAddress || null);
  if (!account) return NextResponse.json({ error: 'No mailbox is connected.' }, { status: 404 });

  if (action === 'disconnect') {
    // Tell Google to stop first, then forget the tokens. The other order
    // leaves Gmail publishing to a topic nobody is listening on.
    try {
      const token = await accessTokenFor(db, e, account);
      await stopWatch(token);
    } catch { /* disconnecting must work even when the token is already dead */ }
    await db.prepare(`DELETE FROM gmail_accounts WHERE id = ? AND workspace = ?`)
      .bind(account.id, ctx.workspace).run();
    return NextResponse.json({ ok: true, disconnected: true });
  }

  if (!e.GMAIL_PUBSUB_TOPIC) {
    return NextResponse.json({ error: 'GMAIL_PUBSUB_TOPIC is not set on this deployment.' }, { status: 503 });
  }
  try {
    const token = await accessTokenFor(db, e, account);
    const w = await startWatch(token, { topicName: e.GMAIL_PUBSUB_TOPIC });
    await recordWatch(db, account.id, w);
    const fresh = await getAccount(db, ctx.workspace, account.email_address);
    return NextResponse.json({ ok: true, mailbox: publicView(fresh) });
  } catch (err) {
    return NextResponse.json({ error: String(err.message).slice(0, 300) }, { status: 502 });
  }
}
