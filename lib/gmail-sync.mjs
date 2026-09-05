// Incremental mailbox sync.
//
// A Pub/Sub notification is a wake signal and nothing else. It carries a
// historyId and we deliberately ignore it: trusting a number from an inbound
// HTTP request to decide where to resume reading somebody's mailbox would make
// a forged or replayed notification able to skip messages. The cursor we resume
// from is the one we stored after the last batch we actually finished.
//
// That single decision handles most of the hard cases for free. Duplicate
// notifications re-read the same window and dedupe on message id.
// Out-of-order notifications are identical to duplicates. A missed
// notification is caught by the next one, because the cursor never moved past
// what we processed.
//
// The cursor advances only after a whole batch is stored. A crash mid-batch
// replays it; replaying is free.

import { historyPage, messageMetadata, messageFull, threadMessages, normalise, profile } from './gmail.mjs';
import { accessTokenFor, advanceCursor, noteError } from './gmail-store.mjs';
import { ingestMessages, loadMatchContext } from './reply-ingest.mjs';
import { domainOf, isPublicDomain, bareAddress } from './reply-match.mjs';

// Bounds. A sync is a background job on an edge runtime with a wall clock, and
// an unbounded loop over a busy mailbox is how one prospect's reply waits
// behind six thousand newsletters.
export const MAX_HISTORY_PAGES = 10;
export const MAX_MESSAGES_PER_RUN = 200;
// Recovery when the cursor is too old for Gmail to answer. Gmail keeps roughly
// a week of history; past that it returns 404 and says do a full sync. A full
// sync of a real inbox is exactly what this file exists to avoid, so recovery
// is bounded to recent mail and the cursor is reset to now.
export const RECOVERY_QUERY = 'in:inbox newer_than:7d';
export const RECOVERY_MAX = 100;

// Does this message have anything to do with us?
//
// Runs on headers alone. Everything that fails is dropped having never left
// Google as more than a From line, which is the point: a prospecting tracker
// has no business holding the body of a newsletter, and asking for one costs
// money and creates a privacy surface for nothing.
export function isRelevant(msg, { knownThreads, knownRfcIds, prospectEmails, prospectDomains }) {
  if (msg.threadId && knownThreads.has(String(msg.threadId))) return { relevant: true, why: 'known thread' };

  const inReplyTo = String(msg.inReplyTo || '').toLowerCase();
  if (inReplyTo && knownRfcIds.has(inReplyTo)) return { relevant: true, why: 'replies to one of ours' };
  for (const r of msg.references || []) {
    if (knownRfcIds.has(String(r).toLowerCase())) return { relevant: true, why: 'our message is in its ancestry' };
  }

  const from = bareAddress(msg.fromAddress);
  if (from && prospectEmails.has(from)) return { relevant: true, why: 'from a prospect' };

  // A delivery failure names the address that bounced somewhere in its
  // headers. Worth catching even from an address we have never seen, because a
  // bounce is how a dead contact gets marked instead of being written to
  // forever.
  const failed = bareAddress(msg.headers?.['x-failed-recipients']);
  if (failed && prospectEmails.has(failed)) return { relevant: true, why: 'a bounce for a prospect' };
  if (/mailer-daemon|postmaster/i.test(from || '')) {
    // Only worth reading if some prospect address appears in the subject,
    // which is where the failed recipient usually ends up.
    const subject = String(msg.subject || '').toLowerCase();
    for (const e of prospectEmails) {
      if (subject.includes(e)) return { relevant: true, why: 'a bounce naming a prospect' };
    }
  }

  // Same company domain. Never a public mailbox domain: sharing gmail.com with
  // a prospect says nothing at all.
  const d = domainOf(from);
  if (d && !isPublicDomain(d) && prospectDomains.has(d)) return { relevant: true, why: 'same company domain' };

  return { relevant: false, why: 'nothing links it to a prospect' };
}

function relevanceIndex(ctx) {
  const prospectEmails = new Set();
  const prospectDomains = new Set();
  for (const p of ctx.candidates) {
    const e = bareAddress(p.email);
    if (e) { prospectEmails.add(e); const d = domainOf(e); if (d && !isPublicDomain(d)) prospectDomains.add(d); }
    const d2 = String(p.domain || '').trim().toLowerCase().replace(/^www\./, '');
    if (d2 && !isPublicDomain(d2)) prospectDomains.add(d2);
  }
  return { knownThreads: ctx.knownThreads, knownRfcIds: ctx.knownRfcIds, prospectEmails, prospectDomains };
}

// Walks history from the stored cursor and returns the message ids that
// changed, plus where the cursor should move to.
async function collectChangedIds(token, startHistoryId) {
  const ids = new Set();
  let pageToken = null;
  let latest = String(startHistoryId);
  for (let page = 0; page < MAX_HISTORY_PAGES; page += 1) {
    const res = await historyPage(token, { startHistoryId, pageToken });
    for (const h of res.history || []) {
      if (h.id && String(h.id) > latest) latest = String(h.id);
      for (const added of h.messagesAdded || []) {
        if (added?.message?.id) ids.add(added.message.id);
      }
    }
    // Gmail's own "where the mailbox is now". Safe to adopt only when the
    // pages are exhausted, which is why it is read but not used until then.
    if (res.historyId && String(res.historyId) > latest) latest = String(res.historyId);
    pageToken = res.nextPageToken || null;
    if (!pageToken) return { ids: [...ids], nextCursor: latest, complete: true };
    if (ids.size >= MAX_MESSAGES_PER_RUN) break;
  }
  // Stopped early. The cursor must NOT jump to Gmail's current position or the
  // unread remainder is lost, so it stays where the last processed page was
  // and the next run continues from there.
  return { ids: [...ids], nextCursor: latest, complete: false };
}

// When the cursor is too old to be answered. Bounded, and resets to now.
async function recover(db, env, account, token, ws) {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({
      q: RECOVERY_QUERY, maxResults: String(RECOVERY_MAX), labelIds: 'INBOX',
    })}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json().catch(() => ({}));
  const ids = (data.messages || []).map((m) => m.id).filter(Boolean);
  const result = await processMessages(db, env, account, token, ws, ids);
  const p = await profile(token);
  await advanceCursor(db, account.id, p.historyId);
  return { ...result, recovered: true, scanned: ids.length, cursor: String(p.historyId) };
}

// Headers for everything, bodies for almost nothing.
async function processMessages(db, env, account, token, ws, ids) {
  const ctx = await loadMatchContext(db, ws);
  const index = relevanceIndex(ctx);
  const keep = [];
  const threads = new Set();
  let looked = 0;
  let dropped = 0;

  for (const id of ids.slice(0, MAX_MESSAGES_PER_RUN)) {
    let meta;
    try { meta = await messageMetadata(token, id); } catch { continue; }
    looked += 1;
    const msg = normalise(meta, { accountEmail: account.email_address });
    const verdict = isRelevant(msg, index);
    if (!verdict.relevant) { dropped += 1; continue; }

    // Only now, and only for a message that belongs to a conversation of ours,
    // do we ask for the text. Outbound messages skip even this: we wrote them.
    if (msg.direction === 'inbound') {
      try {
        const full = await messageFull(token, id);
        msg.snippet = String(full.snippet || '').slice(0, 300);
      } catch { /* header-only is still ingestable; it classifies as unknown */ }
    }
    keep.push(msg);
    if (msg.threadId) threads.add(String(msg.threadId));
  }

  // Our own side of those conversations.
  //
  // The watch is on INBOX, which is the right place to be woken from and means
  // Ary's sent mail is never seen. Two of the product's better properties
  // depend on knowing what we sent: matching a reply by the Message-ID it
  // answers, and telling "she replied and Ary answered" apart from "she
  // replied and nobody has". Without this the outbound table stays empty
  // forever and both quietly degrade to the conservative fallback.
  //
  // Only threads that already contain a reply are read, so this never touches
  // a conversation we are not already part of.
  const seen = new Set(keep.map((m) => m.messageId));
  for (const threadId of threads) {
    let thread;
    try { thread = await threadMessages(token, threadId); } catch { continue; }
    for (const m of thread.messages || []) {
      if (!m?.id || seen.has(m.id)) continue;
      const norm = normalise(m, { accountEmail: account.email_address });
      // Inbound messages we have not already handled are picked up by the
      // history walk on their own notification; taking them here as well would
      // ingest them without a snippet. Ours is what is missing.
      if (norm.direction !== 'outbound') continue;
      seen.add(m.id);
      keep.push(norm);
    }
  }

  // Oldest first, so a thread's outbound is recorded before the reply that
  // answers it and the RFC index is populated in the right order.
  keep.sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)));

  const result = await ingestMessages(db, ws, keep, { source: 'gmail', accountId: account.id, ctx });
  return { ...result, looked, dropped, relevant: keep.length };
}

// One sync. Returns a summary; throws only on things a retry could fix.
export async function syncMailbox(db, env, account) {
  const ws = account.workspace;
  const token = await accessTokenFor(db, env, account);

  // No cursor yet means the connection is new. Start from where the mailbox is
  // now rather than reading history that predates consent.
  if (!account.history_id) {
    const p = await profile(token);
    await advanceCursor(db, account.id, p.historyId);
    return { bootstrapped: true, cursor: String(p.historyId), ingested: 0 };
  }

  let changed;
  try {
    changed = await collectChangedIds(token, account.history_id);
  } catch (err) {
    if (err.status === 404) return recover(db, env, account, token, ws);
    if (err.status === 401 || err.status === 403) {
      await noteError(db, account.id, err.message);
      err.permanent = true;
    }
    throw err;
  }

  if (!changed.ids.length) {
    await advanceCursor(db, account.id, changed.nextCursor);
    return { ingested: 0, looked: 0, dropped: 0, cursor: changed.nextCursor, complete: true };
  }

  const result = await processMessages(db, env, account, token, ws, changed.ids);

  // The cursor moves last, and only here. Everything above is safe to repeat.
  await advanceCursor(db, account.id, changed.nextCursor);
  return { ...result, cursor: changed.nextCursor, complete: changed.complete };
}
