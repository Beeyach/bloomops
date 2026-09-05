import test from 'node:test';
import assert from 'node:assert/strict';
import { mailboxHealth, MAILBOX, STALE_AFTER_MINUTES } from '../lib/mailbox-health.mjs';
import { classifyError, ERROR_KIND } from '../lib/queue.mjs';
import { publicView, CONNECTION } from '../lib/gmail-store.mjs';
import { isUnanswered } from '../lib/reply-match.mjs';
import { canProgressOutbound, STOP } from '../lib/outbound.mjs';
import { readFileSync } from 'node:fs';

// What happens when the mailbox connection breaks.
//
// This is the failure mode with the worst consequence and the quietest
// symptom. A broken Gmail sync does not throw anything at a person: replies
// simply stop arriving, the follow-up guard keeps saying "nobody has written
// back", and the app cheerfully prepares an email to somebody who wrote on
// Tuesday. Silence is the bug.

const NOW = new Date('2026-08-09T12:00:00Z');
const minutesAgo = (m) => new Date(NOW.getTime() - m * 60_000).toISOString();

test('a workspace with no mailbox is not broken', () => {
  // Ellen has never connected Gmail. Her reply data comes from where it always
  // did, and blocking her drafts would be punishing her for a feature she does
  // not use.
  const h = mailboxHealth([], { now: NOW });
  assert.equal(h.state, MAILBOX.NONE);
  assert.equal(h.safeToPrepare, true);
});

test('a healthy mailbox lets the drafts through', () => {
  const h = mailboxHealth([{ status: 'connected', last_sync_at: minutesAgo(4), email_address: 'a@b.io' }], { now: NOW });
  assert.equal(h.state, MAILBOX.HEALTHY);
  assert.equal(h.safeToPrepare, true);
});

test('a mailbox needing reconnection stops new follow-ups being written', () => {
  // The guard is only as good as the reply data under it. Preparing on a
  // mailbox nobody has read is how the worst email in the sequence gets
  // written, and it would look like the automation working.
  const h = mailboxHealth(
    [{ status: CONNECTION.NEEDS_RECONNECT, last_sync_at: minutesAgo(2), email_address: 'a@b.io' }],
    { now: NOW }
  );
  assert.equal(h.state, MAILBOX.BROKEN);
  assert.equal(h.safeToPrepare, false);
  assert.match(h.reason, /without the app seeing it/);
});

test('a connected mailbox nobody has read in too long counts as broken', () => {
  // Status can say "connected" while the syncs quietly stopped. The thing that
  // matters is when it was last actually read.
  const stale = mailboxHealth(
    [{ status: 'connected', last_sync_at: minutesAgo(STALE_AFTER_MINUTES + 10), email_address: 'a@b.io' }],
    { now: NOW }
  );
  assert.equal(stale.state, MAILBOX.STALE);
  assert.equal(stale.safeToPrepare, false);

  const never = mailboxHealth([{ status: 'connected', last_sync_at: null, email_address: 'a@b.io' }], { now: NOW });
  assert.equal(never.safeToPrepare, false);
});

test('one slow cron run is not an outage', () => {
  // The reconcile runs every five minutes. If a twenty-minute gap blocked
  // drafting, the safety valve would fire constantly and get ignored.
  const h = mailboxHealth([{ status: 'connected', last_sync_at: minutesAgo(20), email_address: 'a@b.io' }], { now: NOW });
  assert.equal(h.safeToPrepare, true);
  assert.ok(STALE_AFTER_MINUTES >= 60, 'the threshold must be well clear of normal jitter');
});

test('a dead grant is permanent, so the queue asks for a person instead of retrying', () => {
  // Retrying a revoked token forever burns attempts, fills the failed list and
  // never once produces a working connection.
  const revoked = new Error('Gmail needs reconnecting.');
  revoked.needsReconnect = true;
  revoked.permanent = true;
  assert.equal(classifyError(revoked), ERROR_KIND.PERMANENT);

  const rejected = new Error('Google rejected the saved authorisation.');
  rejected.permanent = true;
  assert.equal(classifyError(rejected), ERROR_KIND.PERMANENT);

  // A network blip is not the same thing and must still be retried.
  assert.equal(classifyError(new Error('fetch failed: ETIMEDOUT')), ERROR_KIND.TRANSIENT);
});

test('a broken connection is visible rather than quiet', () => {
  const view = publicView({
    status: CONNECTION.NEEDS_RECONNECT,
    email_address: 'hello@bloomwired.io',
    last_error: 'Google rejected the saved authorisation.',
    last_sync_at: '2026-08-06T09:00:00Z',
  });
  assert.equal(view.connected, false);
  assert.equal(view.status, CONNECTION.NEEDS_RECONNECT);
  assert.ok(view.lastError, 'Today needs a reason to show, not just a red dot');
  assert.ok(!JSON.stringify(view).includes('enc:'), 'and still no token');
});

// ── Chronology, from real message order ───────────────────────────────────
//
// The date columns cannot tell "she replied and Ary answered" from "she replied
// after Ary's send". Gmail timestamps can, and that is the whole reason for
// recording outbound events too.

test('an outbound after the inbound is ANSWERED', () => {
  const events = [
    { direction: 'outbound', occurred_at: '2026-08-08T09:00:00Z' },
    { direction: 'inbound', occurred_at: '2026-08-08T14:00:00Z', classification: 'question' },
    { direction: 'outbound', occurred_at: '2026-08-08T16:30:00Z' },
  ];
  assert.equal(isUnanswered(events), false);
  const gate = canProgressOutbound(
    { id: 1, email: 'k@x.com', stage: 'Email 2', next_action_date: '2026-08-09' },
    { now: NOW, events }
  );
  assert.notEqual(gate.stop, STOP.UNANSWERED_REPLY);
});

test('no outbound after the inbound is UNANSWERED', () => {
  const events = [
    { direction: 'outbound', occurred_at: '2026-08-08T09:00:00Z' },
    { direction: 'inbound', occurred_at: '2026-08-08T14:00:00Z', classification: 'question' },
  ];
  assert.equal(isUnanswered(events), true);
  const gate = canProgressOutbound(
    { id: 1, email: 'k@x.com', stage: 'Email 2', next_action_date: '2026-08-09' },
    { now: NOW, events }
  );
  assert.equal(gate.stop, STOP.UNANSWERED_REPLY);
});

test('same-day is resolved by the clock, not by the calendar', () => {
  // The legacy rule treats same-day as unanswered because a date cannot order
  // two events. With real timestamps, answering at 4pm means the sequence may
  // resume, which is a genuine improvement over waiting a whole day.
  const answered = [
    { direction: 'inbound', occurred_at: '2026-08-09T09:15:00Z', classification: 'question' },
    { direction: 'outbound', occurred_at: '2026-08-09T09:47:00Z' },
  ];
  assert.equal(isUnanswered(answered), false);

  const notYet = [
    { direction: 'outbound', occurred_at: '2026-08-09T09:00:00Z' },
    { direction: 'inbound', occurred_at: '2026-08-09T09:15:00Z', classification: 'question' },
  ];
  assert.equal(isUnanswered(notYet), true);
});

test('legacy rows with no events keep the conservative date rule', () => {
  // Nothing about the Gmail path is allowed to make the old path less safe.
  const gate = canProgressOutbound(
    { id: 1, email: 'k@x.com', stage: 'Email 2', next_action_date: '2026-08-09',
      replied: 1, reply_date: '2026-08-08', last_contact_date: '2026-08-08' },
    { now: NOW }
  );
  assert.equal(gate.stop, STOP.UNANSWERED_REPLY, 'same-day with no timestamps is still unanswered');
});

// ── The reply nobody could read ───────────────────────────────────────────
//
// Found by a live test on 2026-08-09, not by any of the tests above it.
//
// A real inbound arrived, classified `unknown` because the body genuinely was
// not readable as a reply, and every visible thing worked: the event stored,
// the draft staled, Today updated. And `replied` stayed 0, which is correct on
// purpose so unreadable mail never inflates a reply rate.
//
// The sweep asked the guard without the events, the guard fell back to
// `replied`, saw 0, and said the prospect was clear to be written to. The one
// case we cannot read is the one to be most careful with.

test('an unreadable reply blocks outbound even though `replied` stays 0', () => {
  const p = {
    id: 6544, email: 'k@x.com', stage: 'Email 2',
    next_action_date: '2026-08-09', replied: 0, last_contact_date: '2026-08-05',
  };
  const events = [{ direction: 'inbound', occurred_at: '2026-08-09T13:20:27Z', classification: 'unknown' }];

  // Without the events the guard has nothing to go on, which is exactly why
  // the sweep must pass them.
  assert.equal(canProgressOutbound(p, { now: NOW }).ok, true, 'the fallback genuinely cannot see it');

  const withEvents = canProgressOutbound(p, { now: NOW, events });
  assert.equal(withEvents.ok, false);
  assert.equal(withEvents.stop, STOP.UNANSWERED_REPLY);
});

test('the sweep reads reply events rather than trusting the flag', () => {
  // Pinned against the source, because this is a wiring bug: every piece was
  // individually correct and the call site did not pass the argument.
  const src = readFileSync(new URL('../lib/runner.mjs', import.meta.url), 'utf8');
  assert.match(src, /FROM reply_events/, 'the sweep must load the events');
  assert.match(src, /canProgressOutbound\(p, \{ now, events: eventsFor\(p\.id\) \}\)/);
  assert.match(src, /canPrepareFollowUp\(p, \{ now, events: eventsFor\(p\.id\) \}\)/);
});
