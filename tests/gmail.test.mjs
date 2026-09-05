import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GMAIL_SCOPE, GMAIL_SEND_SCOPE, authUrl, headerMap, addressesIn, messageIdsIn, occurredAt, normalise,
} from '../lib/gmail.mjs';
import { needsRenewal, publicView, CONNECTION, RENEW_WHEN_HOURS_LEFT } from '../lib/gmail-store.mjs';
import { isRelevant, MAX_MESSAGES_PER_RUN, RECOVERY_QUERY } from '../lib/gmail-sync.mjs';

// Reading somebody's mailbox is the most invasive thing this product does, so
// the tests that matter are the ones about restraint: the narrowest scope, the
// smallest read, and never guessing whose message this is.

test('two scopes, each the narrowest that does its job', () => {
  // Sending was added deliberately, and it is the reason this assertion moved
  // from one scope to two. `gmail.send` can send and cannot read anything;
  // Google classifies it as sensitive rather than restricted, so it is a
  // smaller ask than the readonly scope already here.
  //
  // The pair is still narrower than `gmail.modify`, which is exactly why they
  // are two scopes and not one convenient one. The forbidden list below is the
  // part that must never soften.
  assert.equal(GMAIL_SCOPE, 'https://www.googleapis.com/auth/gmail.readonly');
  assert.equal(GMAIL_SEND_SCOPE, 'https://www.googleapis.com/auth/gmail.send');
  const url = authUrl({ clientId: 'cid', redirectUri: 'https://x/cb', state: 's' });
  const scopes = new URL(url).searchParams.get('scope').split(' ');
  assert.equal(scopes.length, 2, 'never ask for a third scope by accident');
  assert.deepEqual([...scopes].sort(), [GMAIL_SEND_SCOPE, GMAIL_SCOPE].sort());
  for (const forbidden of ['gmail.modify', 'gmail.compose', 'gmail.insert', 'gmail.settings', 'mail.google.com']) {
    assert.ok(!url.includes(forbidden), `${forbidden} must never be requested`);
  }
});

test('consent asks for offline access, or the connection is an hour long', () => {
  const q = new URL(authUrl({ clientId: 'cid', redirectUri: 'https://x/cb', state: 's' })).searchParams;
  assert.equal(q.get('access_type'), 'offline');
  // Without this Google returns no refresh token on a re-authorisation, and
  // reconnecting a broken mailbox would silently fail to fix it.
  assert.equal(q.get('prompt'), 'consent');
});

// ── Reading what Gmail hands back ─────────────────────────────────────────

const msg = (over = {}) => ({
  id: 'm1', threadId: 't1', internalDate: '1786000000000',
  snippet: 'Sounds good, what does it cost?',
  labelIds: ['INBOX'],
  payload: {
    headers: [
      { name: 'From', value: 'Kym Waters <kym@coastal.com.au>' },
      { name: 'To', value: 'hello@bloomwired.io' },
      { name: 'Subject', value: 'Re: your booking page' },
      { name: 'Message-ID', value: '<abc123@mail.coastal.com.au>' },
      { name: 'In-Reply-To', value: '<ours-1@bloomwired.io>' },
      { name: 'References', value: '<ours-0@bloomwired.io> <ours-1@bloomwired.io>' },
    ],
  },
  ...over,
});

test('addresses come out of whatever shape they went in as', () => {
  assert.deepEqual(addressesIn('Kym Waters <kym@coastal.com.au>'), ['kym@coastal.com.au']);
  assert.deepEqual(addressesIn('a@b.com, "X, Y" <c@d.com>'), ['a@b.com', 'c@d.com']);
  assert.deepEqual(addressesIn(''), []);
});

test('the reply chain is read as identifiers, not text', () => {
  assert.deepEqual(messageIdsIn('<a@b> <c@d>'), ['a@b', 'c@d']);
  assert.deepEqual(messageIdsIn(''), []);
});

test('arrival time comes from Gmail, not from the sender', () => {
  // The Date header is written by the sender's machine and is wrong often
  // enough to break ordering, which is what decides whether Ary answered.
  const m = msg({ payload: { headers: [{ name: 'Date', value: 'Tue, 1 Jan 1990 00:00:00 +0000' }] } });
  assert.equal(occurredAt(m), new Date(1786000000000).toISOString());
});

test('a message normalises to identity, ordering and nothing else', () => {
  const n = normalise(msg(), { accountEmail: 'hello@bloomwired.io' });
  assert.equal(n.direction, 'inbound');
  assert.equal(n.rfcMessageId, 'abc123@mail.coastal.com.au');
  assert.equal(n.inReplyTo, 'ours-1@bloomwired.io');
  assert.deepEqual(n.references, ['ours-0@bloomwired.io', 'ours-1@bloomwired.io']);
  assert.equal(n.fromAddress, 'kym@coastal.com.au');
  // No body, ever. A snippet is for recognising a message, not archiving it.
  assert.ok(!('body' in n) && !('payload' in n));
});

test('our own mail is our own mail, by the label Gmail put on it', () => {
  const sent = normalise(msg({ labelIds: ['SENT'] }), { accountEmail: 'hello@bloomwired.io' });
  assert.equal(sent.direction, 'outbound', 'Gmail knows what it sent better than an address comparison');
});

// ── The filter ────────────────────────────────────────────────────────────

const index = {
  knownThreads: new Map([['known-thread', 42]]),
  knownRfcIds: new Map([['ours-1@bloomwired.io', 42]]),
  prospectEmails: new Set(['kym@coastal.com.au']),
  prospectDomains: new Set(['coastal.com.au']),
};

test('a newsletter never gets its body read', () => {
  const n = normalise(msg({
    threadId: 'other',
    payload: { headers: [
      { name: 'From', value: 'news@somesaas.com' },
      { name: 'Subject', value: 'Your weekly digest' },
    ] },
  }));
  assert.equal(isRelevant(n, index).relevant, false);
});

test('every strong identifier makes a message relevant', () => {
  const thread = normalise(msg({ threadId: 'known-thread', payload: { headers: [{ name: 'From', value: 'anyone@nowhere.com' }] } }));
  assert.ok(isRelevant(thread, index).relevant, 'a thread we have seen');

  const chain = normalise(msg({ threadId: 'other' }));
  assert.ok(isRelevant(chain, index).relevant, 'it answers one of ours');

  const known = normalise(msg({
    threadId: 'other',
    payload: { headers: [{ name: 'From', value: 'kym@coastal.com.au' }] },
  }));
  assert.ok(isRelevant(known, index).relevant, 'from a prospect');

  const colleague = normalise(msg({
    threadId: 'other',
    payload: { headers: [{ name: 'From', value: 'reception@coastal.com.au' }] },
  }));
  assert.ok(isRelevant(colleague, index).relevant, 'same company domain');
});

test('sharing gmail.com with a prospect means nothing', () => {
  const wide = {
    ...index,
    knownThreads: new Map(), knownRfcIds: new Map(),
    prospectEmails: new Set(['someone@gmail.com']),
    prospectDomains: new Set(['gmail.com']),
  };
  const stranger = normalise(msg({
    threadId: 'other',
    payload: { headers: [{ name: 'From', value: 'unrelated@gmail.com' }] },
  }));
  assert.equal(isRelevant(stranger, wide).relevant, false);
});

test('a bounce for a prospect is caught even from an address we do not know', () => {
  const bounce = normalise(msg({
    threadId: 'other',
    payload: { headers: [
      { name: 'From', value: 'mailer-daemon@googlemail.com' },
      { name: 'Subject', value: 'Delivery Status Notification for kym@coastal.com.au' },
    ] },
  }));
  assert.ok(isRelevant(bounce, index).relevant);
});

// ── Staying connected ─────────────────────────────────────────────────────

test('the watch is renewed with days to spare, not on the day', () => {
  // A cron that misses one run must be a nuisance, not an outage. Gmail drops
  // a watch after seven days and silence looks exactly like a quiet inbox.
  const now = new Date('2026-08-09T12:00:00Z');
  const inHours = (h) => ({ watch_expiration: new Date(now.getTime() + h * 3600_000).toISOString() });
  assert.equal(needsRenewal(inHours(24), { now }), true);
  assert.equal(needsRenewal(inHours(RENEW_WHEN_HOURS_LEFT - 1), { now }), true);
  assert.equal(needsRenewal(inHours(RENEW_WHEN_HOURS_LEFT + 24), { now }), false);
  assert.equal(needsRenewal({}, { now }), true, 'never watched is always due');
});

test('the status a browser sees carries no secret', () => {
  const view = publicView({
    email_address: 'hello@bloomwired.io', status: CONNECTION.CONNECTED,
    refresh_token: 'enc:v1:xx:yy', access_token: 'enc:v1:aa:bb',
    watch_expiration: new Date(Date.now() + 6 * 86400_000).toISOString(),
    last_sync_at: '2026-08-09T11:00:00Z',
  });
  const json = JSON.stringify(view);
  assert.ok(!json.includes('enc:'), 'not even a sealed token belongs in a response');
  assert.ok(!/refresh|access_token/i.test(json));
  assert.equal(view.connected, true);
  assert.equal(view.emailAddress, 'hello@bloomwired.io');
});

test('a broken connection says so rather than looking quiet', () => {
  const view = publicView({ status: CONNECTION.NEEDS_RECONNECT, last_error: 'Google rejected the saved authorisation.' });
  assert.equal(view.connected, false);
  assert.ok(view.lastError, 'the reason is the whole point');
});

test('the bounds are real numbers, not aspirations', () => {
  assert.ok(MAX_MESSAGES_PER_RUN <= 500, 'one run must not try to read a whole mailbox');
  assert.match(RECOVERY_QUERY, /newer_than/, 'recovery is bounded in time, never a full scan');
});
