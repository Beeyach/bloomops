// P3C3D2 provider foundation only: no route, database, legacy account or job.
// A future guarded caller must supply its complete registered identity set for
// this workspace/account and its stored cursor, never client-supplied authority.
import {REPLY_METADATA_HEADERS, providerId, rfcId, address, readMessage, responseKind,
  expectedReplyContext, readGoogleReplyJson} from './prospect-reply-observations.mjs';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me/';
const historyId = value => typeof value === 'string' && /^[1-9][0-9]{0,24}$/.test(value);
const pageToken = value => typeof value === 'string' && /^[\x20-\x7e]{1,2048}$/.test(value);
const unresolved = reason => ({status: 'unresolved', hold: true, reason, observations: [], nextHistoryId: null});
const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function registeredReplyIdentities(context) {
  const {workspaceId, accountEmail, deliveries} = context || {};
  if (!providerId(workspaceId) || !address(accountEmail) || address(accountEmail) !== accountEmail
    || !Array.isArray(deliveries) || !deliveries.length || deliveries.length > 100) return null;
  const byRfc = new Map(), byProvider = new Map(), byDelivery = new Map();
  for (const entry of deliveries) {
    const {identity, receipt, snapshot} = entry || {};
    if (!expectedReplyContext({receipt, snapshot, accountEmail}) || !identity
      || !providerId(identity.id) || !providerId(receipt.id) || !providerId(receipt.prospectId)
      || receipt.workspaceId !== workspaceId || identity.workspaceId !== workspaceId
      || identity.prospectId !== receipt.prospectId || identity.deliveryId !== receipt.id
      || identity.accountEmail !== accountEmail || identity.providerMessageId !== receipt.providerMessageId
      || identity.providerThreadId !== receipt.providerThreadId || !rfcId(identity.rfcMessageId)
      || !providerId(identity.verifiedByMembershipId) || !validTime(identity.createdAt) || !validTime(receipt.attemptedAt)
      || !Number.isSafeInteger(identity.connectionRevision) || identity.connectionRevision < 1
      || !Number.isSafeInteger(identity.senderRevision) || identity.senderRevision < 1
      || byDelivery.has(receipt.id) || byRfc.has(identity.rfcMessageId) || byProvider.has(identity.providerMessageId)) return null;
    byDelivery.set(receipt.id, entry); byRfc.set(identity.rfcMessageId, entry); byProvider.set(identity.providerMessageId, entry);
  }
  return {byRfc, byProvider, byDelivery, accountEmail};
}

function registry(context) {
  return historyId(context?.startHistoryId) ? registeredReplyIdentities(context) : null;
}

function matchCandidates(candidates, context, retainUnassigned = false) {
  const roots = registry(context);
  if (!roots) return unresolved('invalid_context');
  if (!Array.isArray(candidates) || candidates.length > 40) return unresolved('candidate_limit');
  try {
    const ids = new Set(), messages = new Map();
    for (const raw of candidates) {
      if (!providerId(raw?.threadId)) return unresolved('invalid_metadata');
      const message = {...readMessage(raw, raw.threadId), threadId: raw.threadId};
      if (ids.has(message.id)) return unresolved('ambiguous_identity');
      ids.add(message.id);
      const original = roots.byProvider.get(message.id);
      if (original) {
        if (message.rfcMessageId !== original.identity.rfcMessageId || message.threadId !== original.identity.providerThreadId
          || !message.labels.includes('SENT') || message.labels.includes('DRAFT') || message.from !== original.snapshot.sender.email
          || address(message.headers.get('to')) !== original.snapshot.draft.recipient) return unresolved('anchor_conflict');
        continue;
      }
      if (message.labels.includes('DRAFT')) continue;
      if (!message.rfcMessageId || !message.parents) return unresolved('invalid_ancestry');
      if (roots.byRfc.has(message.rfcMessageId) || messages.has(message.rfcMessageId)) return unresolved('ambiguous_identity');
      messages.set(message.rfcMessageId, message);
    }
    // Propagate all roots, not the first match: multi-conversation references
    // must stay ambiguous even if another path reaches one root earlier.
    const matches = new Map([...roots.byRfc].map(([id, entry]) => [id, new Set([entry.receipt.id])]));
    for (const id of messages.keys()) matches.set(id, new Set());
    for (let pass = 0; pass <= messages.size; pass++) {
      let changed = false;
      for (const [id, message] of messages) {
        for (const parent of message.parents) for (const deliveryId of matches.get(parent) || []) {
          if (message.date < Date.parse(roots.byDelivery.get(deliveryId).receipt.attemptedAt)) continue;
          if (!matches.get(id).has(deliveryId)) { matches.get(id).add(deliveryId); changed = true; }
        }
      }
      if (!changed) break;
    }
    const observations = [], unassigned = [];
    for (const [id, message] of messages) {
      if (message.labels.includes('SENT')) continue;
      const possible = matches.get(id);
      if (possible.size === 0 && retainUnassigned) {
        unassigned.push({providerMessageId: message.id, providerThreadId: message.threadId,
          receivedAt: message.receivedAt, kind: 'needs_review'});
        continue;
      }
      if (possible.size !== 1) return unresolved(possible.size ? 'ambiguous_ancestry' : 'unattributed_message');
      const deliveryId = [...possible][0], entry = roots.byDelivery.get(deliveryId);
      const own = !message.from || [roots.accountEmail, entry.snapshot.sender.email].includes(message.from);
      observations.push({deliveryId, prospectId: entry.receipt.prospectId, providerMessageId: message.id,
        providerThreadId: message.threadId, receivedAt: message.receivedAt,
        kind: own ? 'needs_review' : responseKind(message), match: 'reply_chain', hold: true});
    }
    observations.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.providerMessageId.localeCompare(b.providerMessageId));
    unassigned.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.providerMessageId.localeCompare(b.providerMessageId));
    return {status: 'observed', hold: true, observations, ...(retainUnassigned ? {unassigned} : {})};
  } catch { return unresolved('invalid_metadata'); }
}

// History remains all-or-nothing; only recovery collection retains unassigned IDs.
export const matchGoogleReplyCandidates = (candidates, context) => matchCandidates(candidates, context);
export const collectGoogleReplyCandidates = (candidates, context) => matchCandidates(candidates, context, true);

async function inspectChanges(accessToken, context, {fetcher = fetch} = {}, retainUnassigned = false) {
  if (!registry(context) || typeof accessToken !== 'string' || !accessToken || accessToken.length > 16384
    || /[\x00-\x20\x7f]/.test(accessToken)) return unresolved('invalid_context');
  const signal = AbortSignal.timeout(15000), byteBudget = {remaining: 1024 * 1024};
  const read = (path, query, maxBytes) => readGoogleReplyJson(fetcher, API + path + '?' + query,
    accessToken, {signal, byteBudget, maxBytes});
  try {
    const changed = new Map(), tokens = new Set(); let token, terminal, previous = BigInt(context.startHistoryId), high = previous;
    for (let page = 0; page < 3; page++) {
      const query = new URLSearchParams({startHistoryId: context.startHistoryId, historyTypes: 'messageAdded', maxResults: '100',
        fields: 'history(id,messagesAdded(message(id,threadId))),nextPageToken,historyId'});
      if (token) query.set('pageToken', token);
      const response = await read('history', query, 256 * 1024);
      if (response.status !== 200) return unresolved(response.status === 404 ? 'history_gap' : 'provider_unavailable');
      const data = response.data;
      if (!data || !historyId(data.historyId) || BigInt(data.historyId) < high
        || data.history !== undefined && !Array.isArray(data.history) || (data.history?.length || 0) > 100) return unresolved('invalid_history');
      high = BigInt(data.historyId);
      for (const item of data.history || []) {
        if (!historyId(item?.id) || BigInt(item.id) <= previous || BigInt(item.id) > high
          || !Array.isArray(item.messagesAdded) || !item.messagesAdded.length) return unresolved('invalid_history');
        previous = BigInt(item.id);
        for (const addition of item.messagesAdded || []) {
          const message = addition?.message;
          if (!providerId(message?.id) || !providerId(message.threadId)) return unresolved('invalid_history');
          if (changed.has(message.id) && changed.get(message.id) !== message.threadId) return unresolved('invalid_history');
          changed.set(message.id, message.threadId);
          if (changed.size > 40) return unresolved('candidate_limit');
        }
      }
      if (data.nextPageToken === undefined) { terminal = data.historyId; break; }
      if (!pageToken(data.nextPageToken) || tokens.has(data.nextPageToken)) return unresolved('invalid_pagination');
      token = data.nextPageToken; tokens.add(token);
    }
    if (!terminal) return unresolved('incomplete_history');
    const messages = [];
    for (const [id, threadId] of changed) {
      const query = new URLSearchParams({format: 'metadata', fields: 'id,threadId,labelIds,internalDate,payload/headers'});
      for (const header of REPLY_METADATA_HEADERS) query.append('metadataHeaders', header);
      const response = await read('messages/' + encodeURIComponent(id), query, 64 * 1024);
      if (response.status !== 200) return unresolved('message_unavailable');
      if (response.data?.id !== id || response.data.threadId !== threadId) return unresolved('message_identity_changed');
      messages.push(response.data);
    }
    const result = retainUnassigned ? collectGoogleReplyCandidates(messages, context) : matchGoogleReplyCandidates(messages, context);
    return result.status === 'observed' ? {...result, nextHistoryId: terminal} : result;
  } catch { return unresolved('provider_unavailable'); }
}

export const inspectGoogleReplyChanges = (token, context, options) => inspectChanges(token, context, options);
export const collectGoogleReplyChanges = (token, context, options) => inspectChanges(token, context, options, true);

// A starting point for future changes only. This does not verify prior coverage
// and must never replace an existing cursor after an expired-history response.
export async function inspectGoogleReplyBaseline(accessToken, accountEmail, {fetcher = fetch} = {}) {
  if (!address(accountEmail) || address(accountEmail) !== accountEmail || typeof accessToken !== 'string'
    || !accessToken || accessToken.length > 16384 || /[\x00-\x20\x7f]/.test(accessToken)) return unresolved('invalid_context');
  try {
    const response = await readGoogleReplyJson(fetcher, API + 'profile?fields=emailAddress%2ChistoryId', accessToken,
      {signal: AbortSignal.timeout(15000), maxBytes: 64 * 1024});
    if (response.status !== 200 || response.data?.emailAddress !== accountEmail || !historyId(response.data?.historyId)) return unresolved('provider_unavailable');
    return {status: 'observed', hold: true, observations: [], nextHistoryId: response.data.historyId};
  } catch { return unresolved('provider_unavailable'); }
}
