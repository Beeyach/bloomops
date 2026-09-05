// The stored conversation: read from the database, sync from Gmail.
//
// Opening a prospect used to call Gmail live — one thread listing plus one
// fetch per message — every single time. Ary asked for the history to live IN
// the app: instant to open, refreshed only when something actually changed,
// with a 12-hour rhythm as the safety net and a button for "update it now".
//
// The rules:
//   1. Gmail is the source of truth. This table is a reading copy.
//   2. The store is "behind" when reply_events knows something newer than the
//      newest stored message. reply_events is kept fresh by push + reconcile,
//      so a new reply makes the very next open sync before it renders.
//   3. Storing is an optimisation, never a gate: if the insert fails the
//      fetched messages still serve, and if Gmail is unreachable the stored
//      copy still serves, labelled with when it was last synced.

import { fetchGmailConversation } from './gmail-thread.mjs';
import { isRealReply } from './reply-excerpt.mjs';

export const STALE_HOURS = 12;
// Gmail's clock and ours disagree by seconds, not minutes. Five minutes of
// slack means an event and the Gmail message it mirrors never look like two
// different moments.
const EVENT_SLACK_MS = 5 * 60 * 1000;

// A seed attempt that came back empty leaves this marker row behind, so the
// next drain does not pick the same prospect again. Without it, a prospect
// whose thread cannot be fetched (dead thread id, mailbox hiccup) occupied a
// seed slot on every single drain, forever: the backlog could not drain, and
// the query that found it re-ran ~350 times a day. The marker is bookkeeping
// in the same spirit as reply_events' 'idempotency marker' rows — it is never
// shown as a message, and a human opening the prospect still syncs live.
export const SEED_MARKER = 'seed-empty';
// Markers age out, so a transient Gmail failure costs one retry a week
// instead of either spinning forever or freezing seeding permanently.
const SEED_RETRY_DAYS = 7;

const ts = (v) => {
  const t = Date.parse(String(v || ''));
  return Number.isFinite(t) ? t : 0;
};

export async function readStored(db, { workspace, prospectId }) {
  const { results } = await db
    .prepare(
      `SELECT message_id, thread_id, from_side, from_address, occurred_at, subject, body, synced_at
         FROM gmail_messages
        WHERE workspace = ? AND prospect_id = ? AND message_id != ?
        ORDER BY occurred_at ASC LIMIT 80`
    )
    .bind(workspace, prospectId, SEED_MARKER)
    .all()
    .catch(() => ({ results: [] }));
  const rows = results || [];
  let syncedAt = null;
  for (const r of rows) if (!syncedAt || String(r.synced_at) > syncedAt) syncedAt = String(r.synced_at);
  return {
    messages: rows.map((r) => ({
      messageId: r.message_id,
      threadId: r.thread_id,
      from: r.from_side,
      fromAddress: r.from_address,
      at: r.occurred_at,
      subject: r.subject,
      text: r.body || '',
    })),
    syncedAt,
  };
}

/**
 * Does reply_events know a conversation moment the store has not seen?
 * Only events that are part of the conversation count — an outbound of ours,
 * or an inbound that is a genuine reply. A domain-matched newsletter arriving
 * must not force a sync.
 */
export function storeIsBehind(events = [], messages = []) {
  let latestEvent = 0;
  for (const e of events || []) {
    if (!e?.thread_id) continue;
    if (e.direction !== 'outbound' && !isRealReply(e)) continue;
    const t = ts(e.occurred_at);
    if (t > latestEvent) latestEvent = t;
  }
  if (!latestEvent) return false;
  let latestStored = 0;
  for (const m of messages || []) {
    const t = ts(m.at);
    if (t > latestStored) latestStored = t;
  }
  if (!latestStored) return true;
  return latestEvent - latestStored > EVENT_SLACK_MS;
}

/** Fetch from Gmail and upsert the reading copy. Returns the fresh messages. */
export async function syncConversation(db, env, { workspace, prospectId, events }) {
  const convo = await fetchGmailConversation(db, env, { workspace, events });
  if (!convo?.messages?.length) return { messages: [], syncedAt: null, unavailable: convo?.unavailable || 'no-thread' };
  const now = new Date().toISOString();
  try {
    const stmt = db.prepare(
      `INSERT INTO gmail_messages
         (workspace, prospect_id, message_id, thread_id, from_side, from_address, occurred_at, subject, body, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (workspace, prospect_id, message_id) DO UPDATE SET
         thread_id = excluded.thread_id,
         occurred_at = excluded.occurred_at,
         subject = excluded.subject,
         body = excluded.body,
         synced_at = excluded.synced_at`
    );
    await db.batch(
      convo.messages.map((m) =>
        stmt.bind(workspace, prospectId, m.messageId, m.threadId || null, m.from, m.fromAddress || null, m.at || null, m.subject || null, m.text || '', now)
      )
    );
  } catch {
    // Storing failed; the messages in hand still serve this request.
  }
  return { messages: convo.messages, syncedAt: now };
}

/**
 * The one read both the conversation view and Draft reply use.
 * Stored when fresh; synced when empty, behind, or forced; stored again as
 * the fallback when Gmail itself is unreachable.
 */
export async function conversationForReading(db, env, { workspace, prospectId, events = [], force = false } = {}) {
  const stored = await readStored(db, { workspace, prospectId }).catch(() => ({ messages: [], syncedAt: null }));
  const behind = storeIsBehind(events, stored.messages);
  if (!force && stored.messages.length && !behind) {
    return { ...stored, source: 'stored' };
  }
  const fresh = await syncConversation(db, env, { workspace, prospectId, events });
  if (fresh.messages.length) return { ...fresh, source: 'gmail' };
  if (stored.messages.length) return { ...stored, source: 'stored', unavailable: fresh.unavailable || null };
  return { messages: [], syncedAt: null, source: 'none', unavailable: fresh.unavailable || 'no-thread' };
}

/**
 * The cron's share: keep the copies warm with nobody watching.
 * Each drain refreshes at most one stale conversation (synced over 12 hours
 * ago) and seeds at most one prospect that has conversation events but no
 * copy yet. Deliberately tiny — a drain is a heartbeat, not a batch job — and
 * with a handful of conversations the whole set cycles well inside a day.
 */
export async function refreshStaleConversations(db, env, { hours = STALE_HOURS, max = 1, seedMax = 4, now = new Date() } = {}) {
  const cutoff = new Date(now.getTime() - hours * 3600 * 1000).toISOString();
  const targets = [];

  const { results: stale } = await db
    .prepare(
      `SELECT workspace, prospect_id, MAX(synced_at) AS synced
         FROM gmail_messages
        WHERE message_id != ?
        GROUP BY workspace, prospect_id
       HAVING synced < ?
        ORDER BY synced ASC LIMIT ?`
    )
    .bind(SEED_MARKER, cutoff, max)
    .all()
    .catch(() => ({ results: [] }));
  for (const r of stale || []) targets.push({ workspace: r.workspace, prospectId: r.prospect_id, why: 'stale' });

  // Seeding runs faster than refreshing: the sent-mail observer creates a
  // large one-time backlog of prospects whose conversations have never been
  // copied, and most of those threads are one cold email — cheap fetches.
  //
  // Shaped as correlated seeks on purpose. The previous version joined
  // reply_events against the whole prospects table and applied LIMIT after
  // the join, which materialised events × prospects (24.8 million rows) to
  // return four ids — 87% of an 8.4-billion-row day. NOT EXISTS/EXISTS keep
  // the cost bounded by reply_events itself, one index probe per row.
  const retryCutoff = new Date(now.getTime() - SEED_RETRY_DAYS * 86400 * 1000).toISOString();
  const { results: unseeded } = await db
    .prepare(
      `SELECT DISTINCT r.workspace, r.prospect_id
         FROM reply_events r
        WHERE r.thread_id IS NOT NULL AND r.prospect_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM gmail_messages g
             WHERE g.workspace = r.workspace AND g.prospect_id = r.prospect_id
               AND (g.message_id != ? OR g.synced_at >= ?)
          )
          AND EXISTS (
            SELECT 1 FROM prospects p
             WHERE p.id = r.prospect_id AND p.workspace = r.workspace AND p.deleted_at IS NULL
          )
        LIMIT ?`
    )
    .bind(SEED_MARKER, retryCutoff, seedMax)
    .all()
    .catch(() => ({ results: [] }));
  for (const r of unseeded || []) targets.push({ workspace: r.workspace, prospectId: r.prospect_id, why: 'seed' });

  const out = { refreshed: 0, seeded: 0 };
  for (const t of targets) {
    const { results: events } = await db
      .prepare(
        `SELECT direction, occurred_at, thread_id, matched_by, in_reply_to, refs
           FROM reply_events
          WHERE workspace = ? AND prospect_id = ?
          ORDER BY occurred_at DESC LIMIT 60`
      )
      .bind(t.workspace, t.prospectId)
      .all()
      .catch(() => ({ results: [] }));
    const synced = await syncConversation(db, env, { workspace: t.workspace, prospectId: t.prospectId, events: events || [] })
      .catch(() => ({ messages: [] }));
    if (synced.messages.length) {
      out[t.why === 'seed' ? 'seeded' : 'refreshed'] += 1;
    } else if (t.why === 'seed') {
      // Nothing came back: leave the marker so this prospect stops occupying
      // a seed slot on every drain. Upserting refreshes synced_at, which is
      // what ages the marker back into eligibility a week from now.
      await db
        .prepare(
          `INSERT INTO gmail_messages
             (workspace, prospect_id, message_id, thread_id, from_side, from_address, occurred_at, subject, body, synced_at)
           VALUES (?, ?, ?, NULL, 'marker', NULL, NULL, NULL, '', ?)
           ON CONFLICT (workspace, prospect_id, message_id) DO UPDATE SET synced_at = excluded.synced_at`
        )
        .bind(t.workspace, t.prospectId, SEED_MARKER, new Date().toISOString())
        .run()
        .catch(() => {});
    }
  }
  return out;
}
