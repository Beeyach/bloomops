// P3C3A provider foundation, consumed by the guarded P3C3B thread-check command.
// The caller must obtain the immutable receipt/snapshot and original-account
// access token under live workspace/session/grant checks before invoking it.
const API = 'https://gmail.googleapis.com/gmail/v1/users/me/threads/';
const MAX_BYTES = 256 * 1024;
const MAX_MESSAGES = 100;
const HEADERS = ['Message-ID', 'From', 'To', 'In-Reply-To', 'References',
  'Auto-Submitted', 'X-Autoreply', 'X-Autorespond', 'Content-Type'];
const HEADER_NAMES = new Set(HEADERS.map(name => name.toLowerCase()));
const providerId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value);
const rfcId = value => typeof value === 'string' && /^<[^\s<>@]{1,450}@[^\s<>@]{1,450}>$/.test(value);
const unresolved = () => ({status: 'unresolved', hold: true, observations: []});

function address(value) {
  if (typeof value !== 'string' || value.length > 1000 || /[\r\n\x00-\x1f\x7f]/.test(value)) return null;
  const text = value.trim();
  const match = text.includes('<') ? text.match(/^(?:"(?:[^"\\]|\\.)*"|[^<>,;@"\\]*)\s*<([^<>]+)>$/) : [text, text];
  const email = match?.[1];
  return email && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(email)
    ? email.toLowerCase() : null;
}

function expectedContext(context) {
  const {receipt, snapshot, accountEmail} = context || {};
  const sender = snapshot?.sender?.email, recipient = snapshot?.draft?.recipient;
  if (receipt?.state !== 'accepted' || !providerId(receipt.providerMessageId) || !providerId(receipt.providerThreadId)
    || !/^<bloomsi-[0-9a-f-]{36}@bloomsi\.invalid>$/.test(receipt.messageId || '')
    || !address(accountEmail) || address(accountEmail) !== accountEmail
    || receipt.accountEmail !== accountEmail || !address(sender) || address(sender) !== sender
    || !address(recipient) || address(recipient) !== recipient) return null;
  return {receipt, sender, recipient, accountEmail};
}

function readHeaders(headers) {
  if (!Array.isArray(headers) || headers.length > 64) throw new Error('Invalid headers');
  const result = new Map();
  for (const header of headers) {
    if (typeof header?.name !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(header.name)
      || typeof header.value !== 'string' || header.value.length > 8192) throw new Error('Invalid header');
    const name = header.name.toLowerCase();
    if (!HEADER_NAMES.has(name)) continue;
    const value = header.value.replace(/\r?\n[\t ]+/g, ' ').trim();
    if (/[\x00-\x08\x0a-\x1f\x7f]/.test(value) || result.has(name)) throw new Error('Ambiguous header');
    result.set(name, value);
  }
  return result;
}

function references(value) {
  if (value === undefined) return [];
  const ids = value.split(/\s+/).filter(Boolean);
  // Unsupported RFC comments or malformed lists are review cases, not guesses.
  return ids.length <= 100 && ids.every(rfcId) ? ids : null;
}

function readMessage(message, threadId) {
  if (!providerId(message?.id) || message.threadId !== threadId || !Array.isArray(message.labelIds)
    || message.labelIds.length > 100 || message.labelIds.some(label => !providerId(label))
    || typeof message.internalDate !== 'string' || !/^\d{1,16}$/.test(message.internalDate)) throw new Error('Invalid message');
  const date = Number(message.internalDate);
  if (!Number.isSafeInteger(date) || date > 8640000000000000) throw new Error('Invalid date');
  const headers = readHeaders(message.payload?.headers);
  const id = headers.get('message-id');
  const parents = references(headers.get('in-reply-to')), refs = references(headers.get('references'));
  return {id: message.id, labels: message.labelIds, date, receivedAt: new Date(date).toISOString(), headers,
    rfcMessageId: rfcId(id) ? id : null, from: address(headers.get('from')),
    parents: parents && refs ? [...new Set([...parents, ...refs])] : null};
}

function responseKind(message) {
  const contentType = (message.headers.get('content-type') || '').toLowerCase();
  if (/^message\/(?:global-)?delivery-status(?:\s*;|$)/.test(contentType)
    || /^multipart\/report\s*;/.test(contentType) && /;\s*report-type\s*=\s*"?(?:global-)?delivery-status"?(?:\s*;|$)/.test(contentType)) return 'delivery_report';
  const automatic = message.headers.get('auto-submitted');
  if (automatic !== undefined && automatic.split(';')[0].trim().toLowerCase() !== 'no'
    || message.headers.has('x-autoreply') || message.headers.has('x-autorespond')) return 'automatic_response';
  // Lack of an automatic-response header is not proof that a person replied.
  return 'reply_unreviewed';
}

export function observeGoogleReplyThread(thread, context) {
  const expected = expectedContext(context);
  if (!expected) return unresolved();
  try {
    const {receipt, sender, recipient, accountEmail} = expected;
    if (thread?.id !== receipt.providerThreadId || !Array.isArray(thread.messages)
      || thread.messages.length < 1 || thread.messages.length > MAX_MESSAGES) return unresolved();
    const messages = thread.messages.map(message => readMessage(message, thread.id));
    const providerIds = new Set(), rfcIds = new Set();
    for (const message of messages) {
      if (providerIds.has(message.id) || message.rfcMessageId && rfcIds.has(message.rfcMessageId)) return unresolved();
      providerIds.add(message.id);
      if (message.rfcMessageId) rfcIds.add(message.rfcMessageId);
    }
    const anchor = messages.find(message => message.id === receipt.providerMessageId);
    if (!anchor || !anchor.rfcMessageId || !anchor.labels.includes('SENT')
      || anchor.labels.includes('DRAFT') || anchor.from !== sender || address(anchor.headers.get('to')) !== recipient) return unresolved();

    const ownAddresses = new Set([sender, accountEmail]);
    // Google may return an RFC Message-ID different from the submitted one.
    // Only the exact accepted provider message, in its original account/thread
    // with verified SENT/sender/recipient, can supply this ancestry root. Never
    // treat the submitted ID as a fallback or rewrite the immutable receipt.
    const reachable = new Set([anchor.rfcMessageId]);
    // Resolve ancestry independently of Google's response order. Cycles without
    // the sent anchor never become associated replies.
    for (let pass = 0; pass < messages.length; pass++) {
      let changed = false;
      for (const message of messages) {
        if (!message.rfcMessageId || message.labels.includes('DRAFT') || message.date < anchor.date
          || reachable.has(message.rfcMessageId) || !message.parents?.some(id => reachable.has(id))) continue;
        reachable.add(message.rfcMessageId); changed = true;
      }
      if (!changed) break;
    }
    const observations = [];
    for (const message of messages) {
      if (message === anchor || message.labels.includes('DRAFT')) continue;
      // Gmail applies SENT, including mail sent through another account alias.
      // Use the message's label, never an aggregate thread label or From guess.
      if (message.labels.includes('SENT')) continue;
      const linked = Boolean(message.rfcMessageId && reachable.has(message.rfcMessageId));
      const ambiguous = !linked || !message.from || ownAddresses.has(message.from);
      observations.push({providerMessageId: message.id, receivedAt: message.receivedAt,
        kind: ambiguous ? 'needs_review' : responseKind(message),
        match: linked ? 'reply_chain' : 'unresolved', hold: true});
    }
    observations.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.providerMessageId.localeCompare(b.providerMessageId));
    // This is a snapshot, not a send permission or a persistent stop-state reset.
    // Server-only provenance, emitted only after every original-message gate.
    return {status: 'observed', threadId: thread.id, hold: observations.length > 0, observations,
      identity: {accountEmail, providerMessageId: anchor.id, providerThreadId: thread.id, rfcMessageId: anchor.rfcMessageId}};
  } catch { return unresolved(); }
}

// Shared metadata transport. Callers choose fixed Google URLs, limits and one
// deadline; the reader never follows redirects or returns error response data.
export async function readGoogleReplyJson(fetcher, url, accessToken, {signal, maxBytes = MAX_BYTES, byteBudget} = {}) {
  let reader;
  try {
    signal?.throwIfAborted();
    const response = await fetcher(url, {
      method: 'GET', headers: {authorization: 'Bearer ' + accessToken}, redirect: 'manual', signal,
    });
    reader = response.body?.getReader();
    if (response.status !== 200 || !reader) return {status: response.status, data: null};
    const chunks = []; let size = 0;
    for (;;) {
      signal?.throwIfAborted();
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (byteBudget) byteBudget.remaining -= value.byteLength;
      if (size > maxBytes || byteBudget?.remaining < 0) throw new Error('Metadata budget exceeded');
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return {status: 200, data: JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes))};
  }
  finally { try { await reader?.cancel(); } catch {} }
}

export async function inspectGoogleReplyThread(accessToken, context, {fetcher = fetch} = {}) {
  const expected = expectedContext(context);
  if (!expected || typeof accessToken !== 'string' || !accessToken || accessToken.length > 16384
    || /[\x00-\x20\x7f]/.test(accessToken)) return unresolved();
  try {
    const query = new URLSearchParams({format: 'metadata', fields: 'id,messages(id,threadId,labelIds,internalDate,payload/headers)'});
    for (const header of HEADERS) query.append('metadataHeaders', header);
    const result = await readGoogleReplyJson(fetcher, API + encodeURIComponent(expected.receipt.providerThreadId) + '?' + query,
      accessToken, {signal: AbortSignal.timeout(15000)});
    return result.status === 200 ? observeGoogleReplyThread(result.data, context) : unresolved();
  } catch { return unresolved(); }
}

export {HEADERS as REPLY_METADATA_HEADERS, providerId, rfcId, address, readMessage, responseKind, expectedContext as expectedReplyContext};
