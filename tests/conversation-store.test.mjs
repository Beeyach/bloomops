// The stored conversation: behind-detection, bounds, and wiring.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { storeIsBehind, STALE_HOURS } from '../lib/conversation-store.mjs';

const src = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const min = (n) => n * 60 * 1000;
const at = (msOffset) => new Date(1755500000000 + msOffset).toISOString();

test('an empty event list never forces a sync', () => {
  assert.equal(storeIsBehind([], []), false);
  assert.equal(storeIsBehind([], [{ at: at(0) }]), false);
});

test('conversation events with no stored copy mean the store is behind', () => {
  const events = [{ direction: 'inbound', occurred_at: at(0), thread_id: 't', matched_by: 'thread' }];
  assert.equal(storeIsBehind(events, []), true);
});

test('a genuinely newer event marks the store behind; clock slack does not', () => {
  const stored = [{ at: at(0) }];
  const newer = [{ direction: 'outbound', occurred_at: at(min(10)), thread_id: 't' }];
  const skewed = [{ direction: 'outbound', occurred_at: at(min(4)), thread_id: 't' }];
  assert.equal(storeIsBehind(newer, stored), true);
  assert.equal(storeIsBehind(skewed, stored), false);
});

test('a newsletter blast cannot force a sync', () => {
  const stored = [{ at: at(0) }];
  const blast = [
    { direction: 'inbound', occurred_at: at(min(60)), thread_id: 'b', matched_by: 'domain', in_reply_to: null, refs: null },
  ];
  assert.equal(storeIsBehind(blast, stored), false);
});

test('the reading copy is bounded and upserted, never deleted', () => {
  const store = src('lib/conversation-store.mjs');
  assert.match(store, /ON CONFLICT \(workspace, prospect_id, message_id\) DO UPDATE/);
  assert.match(store, /LIMIT 80/);
  assert.ok(!store.includes('DELETE FROM'), 'history is preserved, not pruned');
  assert.ok(!/UPDATE prospects/.test(store), 'the store never touches the prospect row');
});

test('the migration exists and matches what the store reads', () => {
  const mig = src('migrations/058_gmail_messages.sql');
  assert.match(mig, /CREATE TABLE IF NOT EXISTS gmail_messages/);
  assert.match(mig, /PRIMARY KEY \(workspace, prospect_id, message_id\)/);
});

// Ary shut the app's Gmail reading down on 2026-08-27. The stored history
// stays readable; nothing fetches from Gmail anymore, and nothing in the app
// writes email. These pin the shutdown the same way the old tests pinned the
// wiring, so a future change that quietly reconnects either one fails loudly.
test('the conversation endpoint serves the stored copy and never syncs', () => {
  const thread = src('app/api/prospects/[id]/gmail-thread/route.js');
  assert.match(thread, /readStored/);
  assert.ok(!thread.includes('conversationForReading'), 'no path from the endpoint to a Gmail fetch');
  assert.ok(!thread.includes('fetchGmailConversation'), 'no direct fetch either');
});

test('the retired draft endpoint answers instead of drafting', () => {
  const draft = src('app/api/draft-reply/route.js');
  assert.match(draft, /status: 410/);
  assert.match(draft, /reply-sync/);
  for (const gone of ['askBackground', 'conversationForReading', 'fetchGmailConversation']) {
    assert.ok(!draft.includes(gone), 'the draft route must not reach ' + gone);
  }
});

test('the drain neither warms copies nor reads Gmail', () => {
  const drain = src('app/api/cron/drain/route.js');
  for (const gone of ['refreshStaleConversations', 'observeSentMail', 'reconcileMailboxes', 'renewWatches']) {
    assert.ok(!drain.includes(gone), 'the drain must not call ' + gone);
  }
  assert.equal(STALE_HOURS, 12);
});

test('the sent-mail observer records observations and can never send', () => {
  const obs = src('lib/gmail-outbound-observer.mjs');
  // Observations only: outbound rows, Gmail provenance, idempotent on the
  // unique message id, and our own addresses filtered out.
  assert.match(obs, /INSERT OR IGNORE INTO reply_events/);
  assert.match(obs, /'gmail-observed'/);
  assert.match(obs, /INTERNAL_RECIPIENT/);
  assert.match(obs, /q: 'in:sent'/);
  // Bounded per drain: a fresh page and one backlog page, with a cursor that
  // ends the historical walk for good.
  assert.match(obs, /freshMax = 8, backlogMax = 16/);
  assert.match(obs, /\{ done: true \}/);
  // Never a send, never a counter, never a prospect mutation.
  for (const forbidden of ['gmail.send', 'sendApproved', 'UPDATE prospects', 'emails_sent', 'enqueue(']) {
    assert.ok(!obs.includes(forbidden), `the observer must never touch ${forbidden}`);
  }
  // The drain no longer runs it (see the shutdown test above); the library
  // keeps its invariants for the recorded history it already wrote.
  assert.match(src('lib/gmail.mjs'), /export function messagesPage/);
});

test('reconciliation lifts the row to the evidence and never below it', () => {
  const facts = src('lib/prospect-facts.mjs');
  // Counters only rise: MAX against the existing value, marker rows excluded.
  assert.match(facts, /emails_sent = MAX\(COALESCE\(emails_sent, 0\)/);
  assert.match(facts, /last_contact_date = MAX\(COALESCE\(last_contact_date, ''\)/);
  assert.match(facts, /!= 'idempotency marker'/);
  // Reply flags are set, never cleared, and only where the row said nothing.
  assert.match(facts, /COALESCE\(replied, 0\) = 0/);
  assert.match(facts, /reply_date = COALESCE\(reply_date,/);
  // The pass may not touch judgement or scheduling fields. Comments are
  // stripped first: the module explains what it refuses to touch, and the
  // explanation must not trip the check on its own words.
  const code = facts.replace(/\/\/.*$/gm, '');
  for (const forbidden of ['reply_type', 'stage =', 'do_not_contact', 'next_action_date', 'DELETE FROM']) {
    assert.ok(!code.includes(forbidden), `reconciliation must never touch ${forbidden}`);
  }
  assert.match(src('app/api/cron/drain/route.js'), /reconcileProspectFacts/);
});

test('the conversation offers Update now and never polls on its own', () => {
  const view = src('components/ConversationTimeline.jsx');
  assert.match(view, /\?refresh=1/);
  assert.match(view, /Update now/);
  // Scoped to the thread component alone: DraftReply below it owns a
  // legitimate setInterval (the Draft & send countdown), which is a send
  // timer, not a poll.
  const gmailThread = view.slice(view.indexOf('function GmailThread'), view.indexOf('function DraftReply'));
  assert.ok(!/setInterval/.test(gmailThread), 'no client polling; the cron owns the rhythm');
});

// ── The D1 burn, second round (Aug 25) ─────────────────────────────────────
// The seed query joined reply_events against the whole prospects table and
// applied LIMIT after the join: 24.8 million rows materialised to return 4,
// ~350 times a day — 87% of an 8.4-billion-row day. And a prospect whose
// thread could not be fetched was re-selected every drain forever, so the
// backlog never drained. These pin the shape that fixed both.

test('the seed query is correlated seeks, never a join over prospects', () => {
  const store = src('lib/conversation-store.mjs');
  assert.ok(!/LEFT JOIN gmail_messages/.test(store), 'the events x prospects join is gone');
  assert.match(store, /NOT EXISTS \(\s*SELECT 1 FROM gmail_messages/, 'seeding probes the store per event row');
  assert.match(store, /EXISTS \(\s*SELECT 1 FROM prospects/, 'liveness is a PK probe, not a join');
});

test('an empty seed attempt leaves a marker instead of spinning', () => {
  const store = src('lib/conversation-store.mjs');
  assert.match(store, /SEED_MARKER = 'seed-empty'/);
  // The marker is written on the empty-seed path and refreshed on retry.
  assert.match(store, /DO UPDATE SET synced_at = excluded\.synced_at/);
  // Markers age back into eligibility instead of freezing seeding forever.
  assert.match(store, /SEED_RETRY_DAYS/);
});

test('marker rows never surface as messages and never hog the stale slot', () => {
  const store = src('lib/conversation-store.mjs');
  // readStored excludes the marker, so the drawer and Draft reply never see it.
  assert.match(store, /AND message_id != \?\s*\n\s*ORDER BY occurred_at ASC LIMIT 80/);
  // The stale rotation excludes it too: a marker is not a conversation.
  assert.match(store, /WHERE message_id != \?\s*\n\s*GROUP BY workspace, prospect_id/);
});
