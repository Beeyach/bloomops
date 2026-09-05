// The connected mailbox: storing it, keeping a usable access token, and saying
// plainly when it needs a person.
//
// The refresh token is the only durable secret here and it never leaves the
// server. It is sealed with the same AES-GCM box as the AI keys, it is not in
// any API response, and the status endpoint returns a state word and some
// timestamps. Nothing in a browser has ever held it.

import { sealSecret, openSecret } from './secret-box.mjs';
import { refreshAccessToken, GMAIL_SCOPE } from './gmail.mjs';

export const CONNECTION = {
  CONNECTED: 'connected',
  NEEDS_RECONNECT: 'needs-reconnect',
  ERROR: 'error',
};

// Renew a day before Gmail would drop it. Watches last seven days and Google's
// own advice is to call watch daily; this is the line that decides whether a
// missed cron is a nuisance or a silent outage.
export const RENEW_WHEN_HOURS_LEFT = 48;

export async function listAccounts(db, workspace) {
  const { results } = await db
    .prepare(`SELECT * FROM gmail_accounts WHERE workspace = ? ORDER BY id`)
    .bind(workspace)
    .all()
    .catch(() => ({ results: [] }));
  return results || [];
}

export async function getAccount(db, workspace, emailAddress = null) {
  if (emailAddress) {
    return db.prepare(`SELECT * FROM gmail_accounts WHERE workspace = ? AND email_address = ?`)
      .bind(workspace, String(emailAddress).toLowerCase()).first().catch(() => null);
  }
  return db.prepare(`SELECT * FROM gmail_accounts WHERE workspace = ? ORDER BY id LIMIT 1`)
    .bind(workspace).first().catch(() => null);
}

// Used by the push endpoint, which knows the mailbox address and nothing else:
// a Pub/Sub notification names an email, not a workspace.
export async function accountByAddress(db, emailAddress) {
  return db.prepare(`SELECT * FROM gmail_accounts WHERE email_address = ?`)
    .bind(String(emailAddress || '').toLowerCase()).first().catch(() => null);
}

export async function saveConnection(db, env, { workspace, emailAddress, tokens, historyId = null }) {
  const now = new Date().toISOString();
  const email = String(emailAddress).toLowerCase();
  const sealedRefresh = tokens.refresh_token ? await sealSecret(env, tokens.refresh_token) : null;
  const sealedAccess = tokens.access_token ? await sealSecret(env, tokens.access_token) : null;
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + (Number(tokens.expires_in) - 60) * 1000).toISOString()
    : null;

  const existing = await getAccount(db, workspace, email);
  if (existing) {
    // A re-connect that returns no refresh token keeps the stored one. Google
    // omits it when the user has already consented, and overwriting it with
    // null would break the connection at the moment somebody tried to fix it.
    await db.prepare(
      `UPDATE gmail_accounts
          SET refresh_token = COALESCE(?, refresh_token), access_token = ?, access_expires_at = ?,
              scope = ?, status = ?, last_error = NULL, connected_at = ?, updated_at = ?,
              history_id = COALESCE(?, history_id)
        WHERE id = ?`
    ).bind(sealedRefresh, sealedAccess, expiresAt, tokens.scope || GMAIL_SCOPE,
      CONNECTION.CONNECTED, now, now, historyId, existing.id).run();
    return { id: existing.id, reconnected: true };
  }

  const res = await db.prepare(
    `INSERT INTO gmail_accounts (workspace, email_address, refresh_token, access_token,
       access_expires_at, scope, history_id, status, connected_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(workspace, email, sealedRefresh, sealedAccess, expiresAt,
    tokens.scope || GMAIL_SCOPE, historyId, CONNECTION.CONNECTED, now, now, now).run();
  return { id: res?.meta?.last_row_id ?? null, reconnected: false };
}

// A usable access token, refreshed if the cached one is spent.
//
// Throws with `needsReconnect` when Google says the grant is gone. That is not
// a transient failure and must not be retried into oblivion: it means somebody
// revoked access or changed a password, and only a person can fix it.
export async function accessTokenFor(db, env, account) {
  if (account.access_token && account.access_expires_at && account.access_expires_at > new Date().toISOString()) {
    const cached = await openSecret(env, account.access_token);
    if (cached) return cached;
  }

  const refresh = await openSecret(env, account.refresh_token || '');
  if (!refresh) {
    // Either never stored, or sealed under a session secret that has since
    // rotated. Both look the same from here and both need reconnecting.
    await markNeedsReconnect(db, account.id, 'The stored Gmail authorisation could not be read.');
    const e = new Error('Gmail needs reconnecting.');
    e.needsReconnect = true;
    e.permanent = true;
    throw e;
  }

  let tokens;
  try {
    tokens = await refreshAccessToken({
      refreshToken: refresh,
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    });
  } catch (err) {
    if (err.needsReconnect) {
      await markNeedsReconnect(db, account.id, 'Google rejected the saved authorisation.');
      err.permanent = true;
    } else {
      await noteError(db, account.id, err.message);
    }
    throw err;
  }

  const sealed = await sealSecret(env, tokens.access_token);
  const expiresAt = new Date(Date.now() + (Number(tokens.expires_in || 3600) - 60) * 1000).toISOString();
  await db.prepare(
    `UPDATE gmail_accounts SET access_token = ?, access_expires_at = ?, status = ?, last_error = NULL, updated_at = ?
      WHERE id = ?`
  ).bind(sealed, expiresAt, CONNECTION.CONNECTED, new Date().toISOString(), account.id).run();
  return tokens.access_token;
}

export async function markNeedsReconnect(db, id, reason) {
  await db.prepare(
    `UPDATE gmail_accounts SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`
  ).bind(CONNECTION.NEEDS_RECONNECT, String(reason || '').slice(0, 300), new Date().toISOString(), id)
    .run().catch(() => {});
}

export async function noteError(db, id, message) {
  await db.prepare(
    `UPDATE gmail_accounts SET status = ?, last_error = ?, updated_at = ? WHERE id = ?`
  ).bind(CONNECTION.ERROR, String(message || '').slice(0, 300), new Date().toISOString(), id)
    .run().catch(() => {});
}

export async function recordWatch(db, id, { historyId, expiration }) {
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE gmail_accounts
        SET watch_expiration = ?, last_watch_at = ?, status = ?, last_error = NULL,
            history_id = COALESCE(history_id, ?), updated_at = ?
      WHERE id = ?`
  ).bind(
    expiration ? new Date(Number(expiration)).toISOString() : null,
    now, CONNECTION.CONNECTED, historyId ? String(historyId) : null, now, id
  ).run();
}

export async function recordNotification(db, id) {
  await db.prepare(`UPDATE gmail_accounts SET last_notification_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), id).run().catch(() => {});
}

// The cursor moves here and nowhere else, and only after a batch is done.
export async function advanceCursor(db, id, historyId) {
  const now = new Date().toISOString();
  await db.prepare(
    `UPDATE gmail_accounts SET history_id = ?, last_sync_at = ?, status = ?, last_error = NULL, updated_at = ?
      WHERE id = ?`
  ).bind(String(historyId), now, CONNECTION.CONNECTED, now, id).run();
}

// The skills read the mailbox now (shutdown 2026-08-27), so a reply sweep
// delivering what it found — or reporting it found nothing — is the moment
// "replies were last read". The send guard's staleness check runs against
// last_sync_at, and without this stamp the app could never send again once
// the old server-side sync stopped advancing it. The cursor is deliberately
// not touched: this records that the mailbox was read, not where a resume
// would start.
export async function markMailboxRead(db, workspace) {
  const now = new Date().toISOString();
  await db.prepare(`UPDATE gmail_accounts SET last_sync_at = ?, updated_at = ? WHERE workspace = ?`)
    .bind(now, now, workspace).run().catch(() => {});
}

export function needsRenewal(account, { now = new Date() } = {}) {
  if (!account?.watch_expiration) return true;
  const left = Date.parse(account.watch_expiration) - now.getTime();
  if (!Number.isFinite(left)) return true;
  return left <= RENEW_WHEN_HOURS_LEFT * 3600_000;
}

// What a person is allowed to see. No token, not even a masked one: a masked
// secret is still a secret in a response body.
export function publicView(account, { now = new Date() } = {}) {
  if (!account) return { connected: false, status: 'not-connected' };
  const expiresIn = account.watch_expiration
    ? Math.round((Date.parse(account.watch_expiration) - now.getTime()) / 3600_000)
    : null;
  return {
    connected: account.status === CONNECTION.CONNECTED,
    status: account.status,
    emailAddress: account.email_address,
    lastSyncAt: account.last_sync_at || null,
    lastNotificationAt: account.last_notification_at || null,
    watchExpiresAt: account.watch_expiration || null,
    watchHoursLeft: expiresIn,
    needsRenewal: needsRenewal(account, { now }),
    lastError: account.status === CONNECTION.CONNECTED ? null : account.last_error || null,
    connectedAt: account.connected_at || null,
  };
}
