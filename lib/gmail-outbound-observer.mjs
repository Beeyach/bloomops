// Records what the mailbox says went OUT, for every prospect it matches.
//
// The guarded transport writes its own sends down; everything sent by hand
// from Gmail — the whole manual era, and any one-off Ary sends tomorrow —
// only ever existed in the mailbox. This walks in:sent on the drain's
// heartbeat, two ways at once: newest-first, so a fresh manual send is
// recorded within minutes, and a slow historical crawl (cursor in
// sync_state) until the whole folder has been read once.
//
// Rows are OBSERVATIONS: direction outbound, source 'gmail-observed',
// INSERT OR IGNORE on the unique message id. Nothing here touches counters,
// stages, queues, or any send path — and once these rows exist, the
// conversation store seeds each prospect's thread on its own, which is what
// fills the Email tab and the Conversation for everybody Ary ever emailed.

import { messagesPage, messageMetadata, headerMap, addressesIn, occurredAt } from './gmail.mjs';
import { getAccount, accessTokenFor } from './gmail-store.mjs';

const CURSOR_SOURCE = 'gmail-sent-observer';

// Mail to ourselves is not outreach: the workspace's own addresses, the
// test inboxes, and Ary's personal accounts.
const INTERNAL_RECIPIENT = /@bloomwired\.io$|^arylombres@gmail\.com$|^aryannelombres@gmail\.com$|^brixontabula@gmail\.com$/i;

export async function observeSentMail(db, env, { workspace = 'ary', freshMax = 8, backlogMax = 16 } = {}) {
  const out = { recorded: 0, scanned: 0, backlogDone: false };
  const account = await getAccount(db, workspace).catch(() => null);
  if (!account || account.status !== 'connected') return out;
  let token;
  try { token = await accessTokenFor(db, env, account); } catch { return out; }

  const row = await db
    .prepare(`SELECT cursor FROM sync_state WHERE workspace = ? AND source = ?`)
    .bind(workspace, CURSOR_SOURCE)
    .first()
    .catch(() => null);
  let state = {};
  try { state = row?.cursor ? JSON.parse(row.cursor) : {}; } catch { state = {}; }

  // One message: known already means no metadata fetch at all, so a settled
  // mailbox costs one list call and nothing else.
  const record = async (id) => {
    const known = await db
      .prepare(`SELECT 1 AS y FROM reply_events WHERE workspace = ? AND message_id = ?`)
      .bind(workspace, id)
      .first()
      .catch(() => null);
    if (known) return false;
    let meta;
    try { meta = await messageMetadata(token, id); } catch { return false; }
    const h = headerMap(meta);
    const to = addressesIn(h.to || '')[0] || null;
    if (!to || INTERNAL_RECIPIENT.test(to)) return false;
    const prospect = await db
      .prepare(`SELECT id FROM prospects WHERE workspace = ? AND lower(email) = lower(?) AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`)
      .bind(workspace, to)
      .first()
      .catch(() => null);
    if (!prospect) return false;
    await db
      .prepare(
        `INSERT OR IGNORE INTO reply_events
           (workspace, prospect_id, message_id, thread_id, direction, occurred_at, from_address, to_address, subject, snippet, matched_by, source)
         VALUES (?, ?, ?, ?, 'outbound', ?, ?, ?, ?, ?, 'thread', 'gmail-observed')`
      )
      .bind(
        workspace,
        prospect.id,
        meta.id,
        meta.threadId || null,
        occurredAt(meta),
        account.email_address || null,
        to,
        h.subject || null,
        String(meta.snippet || '').slice(0, 290)
      )
      .run()
      .catch(() => {});
    return true;
  };

  // Newest first: a manual send this morning is on page one.
  try {
    const fresh = await messagesPage(token, { q: 'in:sent', maxResults: freshMax });
    for (const m of fresh.messages || []) {
      out.scanned += 1;
      if (await record(m.id)) out.recorded += 1;
    }
  } catch {}

  // The historical walk, one page per drain, until the folder has been read
  // once. After that only the fresh page above ever runs.
  if (!state.done) {
    try {
      const page = await messagesPage(token, {
        q: 'in:sent',
        maxResults: backlogMax,
        pageToken: state.pageToken || null,
      });
      for (const m of page.messages || []) {
        out.scanned += 1;
        if (await record(m.id)) out.recorded += 1;
      }
      state = page.nextPageToken ? { pageToken: page.nextPageToken } : { done: true };
      await db
        .prepare(
          `INSERT INTO sync_state (workspace, source, cursor, last_run_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT (workspace, source) DO UPDATE SET cursor = excluded.cursor, last_run_at = excluded.last_run_at`
        )
        .bind(workspace, CURSOR_SOURCE, JSON.stringify(state))
        .run()
        .catch(() => {});
    } catch {}
  }
  out.backlogDone = Boolean(state.done);
  return out;
}
