// Talking to Gmail.
//
// Scope, and why it is the one we ask for:
//
//   https://www.googleapis.com/auth/gmail.readonly
//
// Gmail has exactly two read scopes and both are classified Restricted, so
// neither is cheaper to get approved. `gmail.metadata` is narrower on paper —
// headers and labels, no body — and it cannot do the job: without a snippet
// there is no way to tell an out-of-office from a decline, which is the whole
// point of ingesting replies. So readonly is the narrowest scope that actually
// works, and we ask for nothing else. Not `modify`, because we never change a
// mailbox. Not `send`, because the product's hardest rule is that it never
// sends anything. Not `mail.google.com`, ever.
//
// The narrowness that matters in practice is not the scope, it is what we
// fetch. Every changed message is read as `format=metadata` first, which
// returns headers only. A body is requested for exactly one reason: the
// message belongs to a thread we wrote to. Newsletters and receipts are
// identified and dropped having never left Google as anything but a header.

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

// Sending is a separate consent, requested alongside the read scope rather
// than folded into a broader one. `gmail.send` can send and cannot read
// anything; Google classifies it as sensitive rather than restricted, so it is
// a smaller ask than the readonly scope this app already holds. The pair is
// still narrower than `gmail.modify`, which is exactly why they are two.
//
// Adding it changes the consent screen, so a mailbox connected before this
// must be reconnected once. The granted scopes are stored on the account, so
// that is a thing the product can say rather than a 403 at four in the morning.
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export const GMAIL_SCOPES = [GMAIL_SCOPE, GMAIL_SEND_SCOPE].join(' ');
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Headers worth keeping. Everything needed to prove identity and ordering, and
// nothing else: no recipients beyond the ones on our own thread, no routing.
export const WANTED_HEADERS = [
  'From', 'To', 'Cc', 'Subject', 'Date',
  'Message-ID', 'In-Reply-To', 'References',
  'Auto-Submitted', 'X-Autoreply', 'X-Autorespond', 'Precedence',
  'X-Failed-Recipients', 'List-Unsubscribe',
];

export function authUrl({ clientId, redirectUri, state }) {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES,
    // Both are required to get a refresh token that survives the browser
    // closing. Without `prompt=consent` Google returns no refresh token on a
    // re-authorisation, and the connection silently becomes an hour long.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${q}`;
}

export async function exchangeCode({ code, clientId, clientSecret, redirectUri }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.error || `token exchange failed (${res.status})`);
  return data; // { access_token, refresh_token, expires_in, scope, token_type }
}

export async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: clientId,
      client_secret: clientSecret, grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.error || `refresh failed (${res.status})`);
    // `invalid_grant` means the user revoked access, changed their password, or
    // the token expired for good. Retrying cannot fix it; only a person
    // reconnecting can, and saying so is better than a queue retrying forever.
    if (data.error === 'invalid_grant') err.needsReconnect = true;
    throw err;
  }
  return data; // { access_token, expires_in, scope }
}

async function call(accessToken, path, params = null) {
  const url = `${API}${path}${params ? `?${new URLSearchParams(params)}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Gmail answered ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Starts (or renews) the mailbox watch. Idempotent: calling it again on a live
// watch just extends it, which is exactly what the daily renewal wants.
//
// INBOX only. A watch on every label would wake us for our own sent mail, for
// spam, and for every label change Gmail makes internally.
export async function startWatch(accessToken, { topicName }) {
  const res = await fetch(`${API}/watch`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicName, labelIds: ['INBOX'], labelFilterBehavior: 'INCLUDE' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `watch failed (${res.status})`);
  return data; // { historyId, expiration }
}

export async function stopWatch(accessToken) {
  await fetch(`${API}/stop`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } })
    .catch(() => {});
}

export const profile = (accessToken) => call(accessToken, '/profile');

// One page of history. The caller paginates; this stays a single request so
// the cursor logic above it is testable without a network.
export function historyPage(accessToken, { startHistoryId, pageToken = null, maxResults = 500 }) {
  const params = {
    startHistoryId: String(startHistoryId),
    // Only messages arriving. Label changes and deletions are somebody reading
    // their own mail, and reacting to those would mean a reply "arriving"
    // every time Ary archived something.
    historyTypes: 'messageAdded',
    labelId: 'INBOX',
    maxResults: String(maxResults),
  };
  if (pageToken) params.pageToken = pageToken;
  return call(accessToken, '/history', params);
}

// Headers only. This is the default read: enough to decide whether a message
// has anything to do with us, without the body ever leaving Google.
// One page of message ids matching a Gmail search, newest first. A page of
// ids is what every crawl starts with; the sent-mail observer walks these.
export function messagesPage(accessToken, { q, pageToken = null, maxResults = 20 }) {
  const params = { q, maxResults: String(maxResults) };
  if (pageToken) params.pageToken = pageToken;
  return call(accessToken, '/messages', params);
}

export function messageMetadata(accessToken, id) {
  const params = new URLSearchParams({ format: 'metadata' });
  for (const h of WANTED_HEADERS) params.append('metadataHeaders', h);
  return call(accessToken, `/messages/${encodeURIComponent(id)}`, params);
}

// The snippet, fetched only once a message is known to belong to a prospect
// thread. `format=full` is the only format Gmail returns a snippet with; we
// keep the snippet and drop the payload.
export function messageFull(accessToken, id) {
  return call(accessToken, `/messages/${encodeURIComponent(id)}`, { format: 'full' });
}

// Every message in one thread, headers only.
//
// The watch is on INBOX, which is the right place to be woken from and means
// our own sent mail is never seen. That is a problem, because two of the
// product's better properties depend on knowing what WE sent: matching a reply
// by the Message-ID it answers, and telling "she replied and Ary answered"
// apart from "she replied and nobody has". Both need our side of the
// conversation on record.
//
// Fetching the thread is the narrow way to get it. It runs only for a thread
// that already contains a prospect's reply, so nothing is read about anybody
// we are not already in a conversation with — far less than watching SENT,
// which would notify us about every email Ary writes to anyone.
export function threadMessages(accessToken, threadId) {
  const params = new URLSearchParams({ format: 'metadata' });
  for (const h of WANTED_HEADERS) params.append('metadataHeaders', h);
  return call(accessToken, `/threads/${encodeURIComponent(threadId)}`, params);
}

// ── Reading what Gmail hands back ──────────────────────────────────────────

export function headerMap(message) {
  const out = {};
  for (const h of message?.payload?.headers || []) {
    if (h?.name) out[h.name.toLowerCase()] = h.value ?? '';
  }
  return out;
}

// `<a@b.com>` and `Name <a@b.com>` and `a@b.com` all become `a@b.com`.
export function addressesIn(value) {
  const s = String(value || '');
  const out = [];
  const re = /<([^>]+@[^>]+)>|([^\s,<>"]+@[^\s,<>"]+)/g;
  let m;
  while ((m = re.exec(s))) {
    const a = (m[1] || m[2] || '').trim().toLowerCase().replace(/[.,;]+$/, '');
    if (a && !out.includes(a)) out.push(a);
  }
  return out;
}

// RFC Message-IDs, angle brackets stripped, in order. `References` is a
// space-separated chain of every message in the thread's ancestry, which is
// what makes it the strongest evidence a message answers something of ours.
export function messageIdsIn(value) {
  return String(value || '')
    .split(/[\s,]+/)
    .map((s) => s.replace(/^</, '').replace(/>$/, '').trim())
    .filter(Boolean);
}

// Gmail's internalDate is epoch milliseconds as a string and is the arrival
// time as Gmail recorded it. Preferred over the Date header, which is written
// by the sender's machine and is wrong often enough to matter for ordering.
export function occurredAt(message) {
  const ms = Number(message?.internalDate);
  if (Number.isFinite(ms) && ms > 0) return new Date(ms).toISOString();
  const d = Date.parse(headerMap(message).date || '');
  return Number.isFinite(d) ? new Date(d).toISOString() : new Date().toISOString();
}

// Everything the app stores about one message, and nothing more.
export function normalise(message, { accountEmail = '' } = {}) {
  const h = headerMap(message);
  const labels = message?.labelIds || [];
  const from = addressesIn(h.from)[0] || null;
  const to = addressesIn(h.to);
  const me = String(accountEmail || '').toLowerCase();
  return {
    messageId: message?.id || '',
    threadId: message?.threadId || null,
    rfcMessageId: messageIdsIn(h['message-id'])[0] || null,
    inReplyTo: messageIdsIn(h['in-reply-to'])[0] || null,
    references: messageIdsIn(h.references),
    fromAddress: from,
    toAddresses: to,
    subject: String(h.subject || '').slice(0, 300),
    occurredAt: occurredAt(message),
    snippet: String(message?.snippet || '').slice(0, 300),
    labels,
    // Ours or theirs. The label is authoritative: Gmail knows what it sent
    // better than an address comparison does, and Ary sends from aliases.
    direction: labels.includes('SENT') || (me && from === me) ? 'outbound' : 'inbound',
    headers: {
      'auto-submitted': h['auto-submitted'] || '',
      'x-autoreply': h['x-autoreply'] || '',
      'x-autorespond': h['x-autorespond'] || '',
      precedence: h.precedence || '',
      'x-failed-recipients': h['x-failed-recipients'] || '',
      'list-unsubscribe': h['list-unsubscribe'] || '',
    },
  };
}
