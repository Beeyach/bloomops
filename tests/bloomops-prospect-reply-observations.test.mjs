import {test} from 'node:test';
import assert from 'node:assert/strict';
import {observeGoogleReplyThread as observe, inspectGoogleReplyThread as inspect} from '../lib/bloomops/prospect-reply-observations.mjs';
import {context, message, thread} from './_prospect-reply-thread.mjs';
const failed = {status: 'unresolved', hold: true, observations: []};
const read = value => observe(value, context);
const identity = {accountEmail:context.accountEmail,providerMessageId:context.receipt.providerMessageId,providerThreadId:context.receipt.providerThreadId,rfcMessageId:context.receipt.messageId};
const headers = item => item.payload.headers;
const set = (item, name, value) => {headers(item).find(h => h.name === name).value = value;};
const remove = (item, name) => {item.payload.headers = headers(item).filter(h => h.name !== name);};

test('exact accepted thread with no inbound observations is a limited snapshot, not send permission', () => {
  assert.deepEqual(read(thread()), {status: 'observed', threadId: 'sent-thread', hold: false, observations: [], identity});
  assert.equal(Object.hasOwn(read(thread()), 'canSend'), false);
});
test('an exact reply holds and remains unreviewed without inventing a human or positive result', () => {
  assert.deepEqual(read(thread(message('reply'))), {status: 'observed', threadId: 'sent-thread', hold: true, identity, observations: [{
    providerMessageId: 'reply', receivedAt: '2026-09-13T08:00:01.000Z', kind: 'reply_unreviewed', match: 'reply_chain', hold: true,
  }]});
});
test('the exact accepted Google message anchors replies using its returned RFC identity', () => {
  const returnedId='<provider-returned@example.test>';
  const t=thread(message('reply', {'In-Reply-To':returnedId}),message('descendant', {'In-Reply-To':'<reply@example.test>'}));
  set(t.messages[0],'Message-ID',returnedId);
  const before=structuredClone(context),result=read(t);
  assert.equal(result.status,'observed');assert.equal(result.hold,true);
  assert.deepEqual(result.identity,{...identity,rfcMessageId:returnedId});
  assert.ok(result.observations.every(o=>o.match==='reply_chain'&&o.kind==='reply_unreviewed'));
  assert.deepEqual(context,before); // The submitted receipt identity is immutable.
});
test('a submitted RFC identity alone cannot replace the returned accepted-message ancestry', () => {
  const t=thread(message('old-submission-reference'));
  set(t.messages[0],'Message-ID','<provider-returned@example.test>');
  assert.equal(read(t).observations[0].match,'unresolved');
  assert.equal(read(t).observations[0].kind,'needs_review');
});
test('a different returned RFC identity never bypasses original provider, sender, recipient or SENT checks', () => {
  for(const mutate of [t=>{t.messages[0].id='foreign';},t=>set(t.messages[0],'From','foreign@example.test'),t=>set(t.messages[0],'To','foreign@example.test'),t=>{t.messages[0].labelIds=[];},t=>{t.messages[0].labelIds.push('DRAFT');}]){
    const t=thread(message('reply',{'In-Reply-To':'<provider-returned@example.test>'}));
    set(t.messages[0],'Message-ID','<provider-returned@example.test>');mutate(t);assert.deepEqual(read(t),failed);
  }
});
test('original verified primary account can own a sender alias; foreign accounts fail before transport', async () => {
  assert.equal(read(thread()).status, 'observed');
  let calls = 0;
  for (const patch of [{accountEmail: 'other@example.test'}, {accountEmail: null}, {accountEmail: 'Primary@example.test'},
    {receipt: {...context.receipt, accountEmail: 'other@example.test'}}]) {
    assert.deepEqual(await inspect('synthetic-token', {...context, ...patch}, {fetcher: async () => {calls++;}}), failed);
  }
  assert.equal(calls, 0);
});
test('unaccepted, malformed or injected receipt identities never contact the provider', async () => {
  let calls = 0;
  for (const receipt of [null, {...context.receipt, state: 'prepared'}, {...context.receipt, state: 'uncertain'},
    {...context.receipt, providerMessageId: ''}, {...context.receipt, providerThreadId: '../other'},
    {...context.receipt, providerThreadId: 'thread?fields=raw'}, {...context.receipt, messageId: '<foreign@example.test>'}]) {
    assert.deepEqual(await inspect('synthetic-token', {...context, receipt}, {fetcher: async () => {calls++;}}), failed);
  }
  for (const token of ['', null, 'token\r\nheader: value', 'x'.repeat(16385)]) {
    assert.deepEqual(await inspect(token, context, {fetcher: async () => {calls++;}}), failed);
  }
  assert.equal(calls, 0);
});
test('missing or ambiguous original sender/recipient snapshot prevents transport', async () => {
  let calls = 0;
  for (const snapshot of [null, {sender: {email: 'hello@example.test'}, draft: {recipient: 'a@example.test, person@example.test'}},
    {...context.snapshot, sender: {email: 'Name <hello@example.test>'}}]) {
    assert.deepEqual(await inspect('synthetic-token', {...context, snapshot}, {fetcher: async () => {calls++;}}), failed);
  }
  assert.equal(calls, 0);
});
for (const [name, mutate] of [
  ['wrong thread', t => {t.id = 'other';}],
  ['missing anchor', t => {t.messages = [message('reply')];}],
  ['invalid returned anchor RFC ID', t => set(t.messages[0], 'Message-ID', 'malformed')],
  ['missing returned anchor RFC ID', t => remove(t.messages[0], 'Message-ID')],
  ['missing SENT label', t => {t.messages[0].labelIds = ['INBOX'];}],
  ['draft anchor', t => {t.messages[0].labelIds.push('DRAFT');}],
  ['wrong original sender', t => set(t.messages[0], 'From', 'other@example.test')],
  ['wrong original recipient', t => set(t.messages[0], 'To', 'other@example.test')],
  ['multiple recipient list', t => set(t.messages[0], 'To', 'other@example.test, Person <person@example.test>')],
  ['duplicate original sender header', t => headers(t.messages[0]).push({name: 'from', value: 'hello@example.test'})],
  ['duplicate provider message ID', t => t.messages.push(structuredClone(t.messages[0]))],
  ['duplicate RFC message ID', t => t.messages.push(message('other', {'Message-ID': context.receipt.messageId}))],
  ['wrong inner thread', t => {t.messages[1].threadId = 'foreign';}],
  ['invalid date', t => {t.messages[1].internalDate = '-1';}],
  ['out-of-range date', t => {t.messages[1].internalDate = '8640000000000001';}],
  ['too many messages', t => {t.messages.push(...Array.from({length: 100}, (_, i) => message('more-' + i)));}],
  ['overlong header', t => set(t.messages[1], 'References', 'x'.repeat(8193))],
]) test(name + ' returns an unresolved hold with no partial reply evidence', () => {
  const t = thread(message('reply', {References: context.receipt.messageId})); mutate(t); assert.deepEqual(read(t), failed);
});
test('quoted display names and folded, case-insensitive headers match without treating them as addresses', () => {
  const t = thread(message('reply'));
  set(t.messages[0], 'From', '"Ary, Bloomwired" <HELLO@example.test>');
  set(t.messages[0], 'To', '"Person, Business" <person@example.test>');
  const h = headers(t.messages[1]).find(h => h.name === 'In-Reply-To');
  h.name = 'iN-RePlY-tO'; h.value = '\r\n\t' + context.receipt.messageId;
  assert.equal(read(t).observations[0].kind, 'reply_unreviewed');
});
test('references ancestry works without In-Reply-To and follows indirect replies independently of response order', () => {
  const first = message('first', {From: 'Other <personal@example.test>'});
  const second = message('second', {'In-Reply-To': '<first@example.test>'});
  const third = message('third', {References: '<second@example.test>'}); remove(third, 'In-Reply-To');
  assert.ok(read(thread(third, second, first)).observations.every(o => o.kind === 'reply_unreviewed'));
  assert.deepEqual(read(thread(third, second, first)), read(thread(first, second, third)));
});
test('subject, recipient address and domain are never fallback ancestry matches', () => {
  const reply = message('reply', {Subject: 'Re: accepted subject'}); remove(reply, 'In-Reply-To');
  assert.deepEqual(read(thread(reply)).observations[0], {
    providerMessageId: 'reply', receivedAt: '2026-09-13T08:00:01.000Z', kind: 'needs_review', match: 'unresolved', hold: true,
  });
});
test('unsupported ancestry, missing message ID, self cycles and older replies hold for review', () => {
  for (const reply of [message('reply', {'In-Reply-To': '(comment) ' + context.receipt.messageId}),
    message('reply', {'Message-ID': 'invalid'}), message('reply', {'In-Reply-To': '<reply@example.test>'}),
    message('reply', {}, {date: '1789286399999'})]) {
    const observation = read(thread(reply)).observations[0];
    assert.equal(observation.kind, 'needs_review'); assert.equal(observation.match, 'unresolved');
  }
});
test('a cycle disconnected from the sent anchor never establishes a match', () => {
  const a = message('a', {'In-Reply-To': '<b@example.test>'}), b = message('b', {'In-Reply-To': '<a@example.test>'});
  assert.ok(read(thread(a, b)).observations.every(o => o.kind === 'needs_review'));
});
test('drafts and verified own SENT messages are excluded; apparent own mail without SENT remains held', () => {
  const outgoing = message('outgoing', {From: 'primary@example.test'}, {labels: ['SENT']});
  const draft = message('draft', {}, {labels: ['DRAFT']});
  assert.deepEqual(read(thread(outgoing, draft)).observations, []);
  for (const value of [message('self', {From: 'hello@example.test'}), message('self-primary', {From: 'primary@example.test'})]) {
    assert.equal(read(thread(value)).observations[0].kind, 'needs_review');
  }
  const reply = message('reply', {'In-Reply-To': '<draft@example.test>'});
  assert.equal(read(thread(draft, reply)).observations[0].match, 'unresolved');
});
test('another account alias marked SENT creates no false hold, while a reply to it still holds', () => {
  const outgoing = message('alias-outbound', {From: 'Another alias <other-alias@example.test>'}, {labels: ['SENT']});
  assert.deepEqual(read(thread(outgoing)).observations, []);
  assert.equal(read(thread(outgoing)).hold, false);
  const inbound = message('alias-reply', {'In-Reply-To': '<alias-outbound@example.test>'});
  // SENT on another message (or aggregated at thread level) never hides inbound mail.
  const value = thread(outgoing, inbound); value.labelIds = ['SENT'];
  assert.deepEqual(read(value).observations.map(o => [o.providerMessageId, o.kind, o.hold]), [['alias-reply', 'reply_unreviewed', true]]);
});
test('missing or malformed From is held without returning raw headers', () => {
  for (const from of ['', 'one@example.test, Other <two@example.test>', 'not a mailbox']) {
    assert.equal(read(thread(message('reply', {From: from}))).observations[0].kind, 'needs_review');
  }
  const injected = thread(message('reply', {From: 'Person\r\nInjected: value'}));
  assert.deepEqual(read(injected), failed);
});
for (const [header, value] of [['Auto-Submitted', 'auto-replied'], ['Auto-Submitted', 'AUTO-GENERATED; reason=test'],
  ['Auto-Submitted', 'unknown-extension'], ['X-Autoreply', 'yes'], ['X-Autorespond', 'yes']]) {
  test(header + ' ' + value + ' is an automatic response and still holds', () => {
    const o = read(thread(message('reply', {[header]: value}))).observations[0];
    assert.equal(o.kind, 'automatic_response'); assert.equal(o.hold, true);
  });
}
test('Auto-Submitted no and automatic-looking subject cannot confirm automation, humanity or a hard bounce', () => {
  for (const h of [{'Auto-Submitted': 'no'}, {Subject: 'Automatic reply: unavailable'},
    {Subject: 'Undeliverable', From: 'mailer-daemon@example.test'}]) {
    assert.equal(read(thread(message('reply', h))).observations[0].kind, 'reply_unreviewed');
  }
});
for (const type of ['multipart/report; report-type=delivery-status; boundary=x',
  'Multipart/Report; boundary=x; report-type="delivery-status"', 'message/delivery-status',
  'multipart/report; report-type=global-delivery-status']) {
  test(type + ' is a delivery report needing review, not a confirmed hard bounce', () => {
    const o = read(thread(message('reply', {'Content-Type': type, 'Auto-Submitted': 'auto-generated'}))).observations[0];
    assert.equal(o.kind, 'delivery_report'); assert.equal(o.hold, true); assert.equal(Object.hasOwn(o, 'hardBounce'), false);
  });
}
test('provider fetch uses one exact metadata-only GET and strips unrelated response content', async () => {
  let calls = 0;
  const t = thread(message('reply')); t.messages[1].snippet = 'PRIVATE'; t.messages[1].payload.body = {data: 'PRIVATE'};
  const result = await inspect('synthetic-token', context, {fetcher: async (url, init) => {
    calls++; const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, 'https://gmail.googleapis.com/gmail/v1/users/me/threads/sent-thread');
    assert.equal(parsed.searchParams.get('format'), 'metadata'); assert.equal(parsed.searchParams.has('q'), false);
    assert.equal(parsed.searchParams.get('fields'), 'id,messages(id,threadId,labelIds,internalDate,payload/headers)');
    assert.ok(!parsed.search.includes('snippet')); assert.ok(!parsed.search.includes('body'));
    assert.equal(init.method, 'GET'); assert.equal(init.redirect, 'manual'); assert.equal(init.headers.authorization, 'Bearer synthetic-token');
    assert.ok(init.signal instanceof AbortSignal); assert.equal(init.body, undefined);
    return Response.json(t);
  }});
  assert.equal(calls, 1); assert.equal(result.status, 'observed');
  for (const forbidden of ['PRIVATE', 'synthetic-token', 'person@example.test', 'payload', 'headers', 'snippet', 'subject']) {
    assert.ok(!JSON.stringify(result).includes(forbidden));
  }
});
test('redirects and HTTP errors fail closed without following, retrying or exposing raw errors', async () => {
  for (const status of [204, 206, 301, 302, 303, 307, 308, 400, 401, 403, 404, 429, 503]) {
    let calls = 0;
    const result = await inspect('synthetic-token', context, {fetcher: async () => {
      calls++; return new Response(status === 204 ? null : 'PRIVATE PROVIDER ERROR', {status, headers: {location: 'https://untrusted.example.test'}});
    }});
    assert.deepEqual(result, failed); assert.equal(calls, 1);
  }
});
test('truncated, invalid UTF-8, oversized and malformed success responses never produce partial observations', async () => {
  for (const value of ['{"messages":', 'null', '{}', 'x'.repeat(256 * 1024 + 1), new Uint8Array([0xff, 0xfe])]) {
    assert.deepEqual(await inspect('synthetic-token', context, {fetcher: async () => new Response(value)}), failed);
  }
  let cancelled = false;
  const body = new ReadableStream({start(controller) {controller.enqueue(new Uint8Array(256 * 1024)); controller.enqueue(new Uint8Array(1));},
    cancel() {cancelled = true;}});
  assert.deepEqual(await inspect('synthetic-token', context, {fetcher: async () => new Response(body)}), failed);
  assert.equal(cancelled, true);
});
test('network and stream failures are unresolved without leaking provider diagnostics', async () => {
  for (const fetcher of [async () => {throw new Error('synthetic-token PRIVATE');},
    async () => new Response(new ReadableStream({start(c) {c.error(new Error('PRIVATE'));}}))]) {
    assert.deepEqual(await inspect('synthetic-token', context, {fetcher}), failed);
  }
});
