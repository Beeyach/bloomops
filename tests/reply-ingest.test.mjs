import test from 'node:test';
import assert from 'node:assert/strict';
import { ingestMessages } from '../lib/reply-ingest.mjs';

// The ingestion brain, exercised through the real function rather than around
// it. Both callers reach this: the Gmail sync, which is how replies actually
// arrive, and the HTTP endpoint used for reconciliation.
//
// The two properties worth the fake database: a message must never be ingested
// twice however many times it is delivered, and a reply from an address nobody
// has seen must still reach the right prospect when the mail headers prove the
// relationship.

// A fake D1 holding just enough state to be honest about duplicates.
function fakeDb({ prospects = [], events = [] } = {}) {
  const state = {
    events: [...events],
    unmatched: [],
    jobs: [],
    prospectUpdates: [],
    outcomes: [],
  };
  const db = {
    state,
    prepare(sql) {
      return {
        bind(...b) {
          return {
            async first() {
              if (/FROM reply_events WHERE workspace = \? AND message_id/.test(sql)) {
                const [, messageId] = b;
                const hit = state.events.some((e) => e.message_id === messageId)
                  || state.unmatched.some((u) => u.message_id === messageId);
                return hit ? { hit: 1 } : null;
              }
              if (/SELECT id, stage, activity_log/.test(sql)) {
                const p = prospects.find((x) => x.id === b[0]);
                return p ? { ...p } : null;
              }
              return null;
            },
            async all() {
              if (/SELECT id, name, business_name, email, domain FROM prospects/.test(sql)) return { results: prospects };
              if (/DISTINCT thread_id/.test(sql)) {
                return { results: state.events.filter((e) => e.thread_id && e.prospect_id).map((e) => ({ thread_id: e.thread_id, prospect_id: e.prospect_id })) };
              }
              if (/rfc_message_id, prospect_id FROM reply_events/.test(sql)) {
                return { results: state.events.filter((e) => e.direction === 'outbound' && e.rfc_message_id && e.prospect_id)
                  .map((e) => ({ rfc_message_id: e.rfc_message_id, prospect_id: e.prospect_id })) };
              }
              return { results: [] };
            },
            async run() {
              if (/INSERT INTO reply_events/.test(sql)) {
                state.events.push({
                  workspace: b[0], prospect_id: b[1], message_id: b[2], thread_id: b[3],
                  rfc_message_id: b[4], in_reply_to: b[5], matched_by: b[8],
                  direction: b[9], occurred_at: b[10],
                });
              } else if (/INSERT OR IGNORE INTO unmatched_replies/.test(sql)) {
                state.unmatched.push({ message_id: b[1], reason: b[9] });
              } else if (/INSERT INTO jobs/.test(sql)) {
                state.jobs.push({ kind: b[1], dedupe: b[7] });
                // The real unique partial index rejects a second identical key.
                const seen = state.jobs.filter((j) => j.dedupe === b[7]);
                if (seen.length > 1) { state.jobs.pop(); throw new Error('UNIQUE constraint failed'); }
              } else if (/UPDATE prospects SET/.test(sql)) {
                state.prospectUpdates.push(sql);
              } else if (/INSERT INTO outcome_events/.test(sql)) {
                state.outcomes.push(b);
              }
              return { meta: { last_row_id: 1, changes: 1 } };
            },
          };
        },
      };
    },
  };
  return db;
}

const PROSPECTS = [
  { id: 7, name: 'Kym', business_name: 'Coastal', email: 'info@coastal.com.au', domain: 'coastal.com.au', stage: 'Email 2', activity_log: null },
  { id: 8, name: 'Dana', business_name: 'Peak', email: 'dana@peak.co', domain: 'peak.co', stage: 'Email 1', activity_log: null },
];

const inbound = (over = {}) => ({
  messageId: 'm-1', threadId: 't-1', direction: 'inbound',
  occurredAt: '2026-08-09T10:00:00Z',
  fromAddress: 'info@coastal.com.au', toAddresses: ['hello@bloomwired.io'],
  subject: 'Re: your booking page', snippet: 'Thanks, what does it cost?',
  references: [], headers: {}, ...over,
});

test('the same message twice is ingested once', async () => {
  // Pub/Sub delivers at least once and the sync deliberately overlaps its
  // window, so this is the normal case, not an edge case.
  const db = fakeDb({ prospects: PROSPECTS });
  const first = await ingestMessages(db, 'ary', [inbound()], { source: 'gmail' });
  assert.equal(first.ingested, 1);
  assert.equal(first.duplicates, 0);

  const second = await ingestMessages(db, 'ary', [inbound()], { source: 'gmail' });
  assert.equal(second.ingested, 0);
  assert.equal(second.duplicates, 1);
  assert.equal(db.state.events.length, 1, 'one event, not two');
});

test('a replayed notification charges nothing and queues nothing twice', async () => {
  const db = fakeDb({ prospects: PROSPECTS });
  // A message the rules cannot read is the one that costs a model call.
  const unreadable = inbound({ messageId: 'm-2', snippet: 'Hmm. Let me think about that one.' });
  const a = await ingestMessages(db, 'ary', [unreadable], { source: 'gmail' });
  assert.equal(a.queuedForReading, 1, 'the first one asks the model');

  const b = await ingestMessages(db, 'ary', [unreadable], { source: 'gmail' });
  assert.equal(b.queuedForReading, 0, 'the replay does not');
  assert.equal(b.duplicates, 1);
  const classifyJobs = db.state.jobs.filter((j) => j.kind === 'classify-reply');
  assert.equal(classifyJobs.length, 1, 'one classification, one charge');
  assert.equal(db.state.prospectUpdates.length, 1, 'and the prospect is touched once');
});

test('a reply from an unknown address still reaches the right prospect via the thread', async () => {
  const db = fakeDb({
    prospects: PROSPECTS,
    events: [{ message_id: 'out-1', thread_id: 't-9', prospect_id: 7, direction: 'outbound', rfc_message_id: 'ours-1@bloomwired.io' }],
  });
  const r = await ingestMessages(db, 'ary', [
    inbound({ messageId: 'm-3', threadId: 't-9', fromAddress: 'kym.personal@gmail.com' }),
  ], { source: 'gmail' });
  assert.equal(r.ingested, 1);
  assert.equal(r.results[0].prospectId, 7);
  assert.equal(r.results[0].how, 'thread');
});

test('a reply from an unknown address on a new thread matches by In-Reply-To', async () => {
  // The owner writes from a personal account, and the mail client names the
  // Message-ID of the email we sent. That is proof, not a guess.
  const db = fakeDb({
    prospects: PROSPECTS,
    events: [{ message_id: 'out-2', thread_id: 't-x', prospect_id: 8, direction: 'outbound', rfc_message_id: 'ours-42@bloomwired.io' }],
  });
  const r = await ingestMessages(db, 'ary', [
    inbound({ messageId: 'm-4', threadId: 'brand-new', fromAddress: 'dana@somewhere-else.net', inReplyTo: 'ours-42@bloomwired.io' }),
  ], { source: 'gmail' });
  assert.equal(r.results[0].prospectId, 8);
  assert.equal(r.results[0].how, 'in-reply-to');
});

test('References works when In-Reply-To is missing', async () => {
  const db = fakeDb({
    prospects: PROSPECTS,
    events: [{ message_id: 'out-3', thread_id: 't-y', prospect_id: 8, direction: 'outbound', rfc_message_id: 'ours-9@bloomwired.io' }],
  });
  const r = await ingestMessages(db, 'ary', [
    inbound({ messageId: 'm-5', threadId: 'new', fromAddress: 'someone@nowhere.org', references: ['third@party.com', 'ours-9@bloomwired.io'] }),
  ], { source: 'gmail' });
  assert.equal(r.results[0].prospectId, 8);
  assert.equal(r.results[0].how, 'references');
});

test('ambiguity is still refused, and the test does not weaken it to pass', async () => {
  // Two prospects on one domain, a sender matching neither address, and no
  // ancestry. The safe answer is a list a person resolves.
  const db = fakeDb({
    prospects: [
      { id: 1, email: 'a@shared.com', domain: 'shared.com' },
      { id: 2, email: 'b@shared.com', domain: 'shared.com' },
    ],
  });
  const r = await ingestMessages(db, 'ary', [
    inbound({ messageId: 'm-6', threadId: 'unknown', fromAddress: 'c@shared.com' }),
  ], { source: 'gmail' });
  assert.equal(r.unmatched, 1);
  assert.equal(db.state.events.length, 0, 'nothing may be written to a guessed record');
  assert.match(db.state.unmatched[0].reason, /Not guessing/);
});

test('a stranger with no connection to anybody is not attached to the nearest record', async () => {
  const db = fakeDb({ prospects: PROSPECTS });
  const r = await ingestMessages(db, 'ary', [
    inbound({ messageId: 'm-7', threadId: 'unknown', fromAddress: 'newsletter@saas.io' }),
  ], { source: 'gmail' });
  assert.equal(r.unmatched, 1);
  assert.equal(r.ingested, 0);
});

test('our own outbound is recorded so the next reply has ancestry to match on', async () => {
  const db = fakeDb({ prospects: PROSPECTS });
  await ingestMessages(db, 'ary', [
    { messageId: 'out-9', threadId: 't-new', direction: 'outbound', occurredAt: '2026-08-09T08:00:00Z',
      fromAddress: 'hello@bloomwired.io', toAddresses: ['info@coastal.com.au'],
      rfcMessageId: 'ours-77@bloomwired.io', references: [], subject: 'Your booking page', headers: {} },
  ], { source: 'gmail' });
  const out = db.state.events.find((e) => e.message_id === 'out-9');
  assert.equal(out.direction, 'outbound');
  assert.equal(out.prospect_id, 7);
  assert.equal(out.rfc_message_id, 'ours-77@bloomwired.io');
});

// ── The route is the freshness marker now ────────────────────────────────
//
// Since the 2026-08-27 shutdown the skills read the mailbox and this endpoint
// is how what they found arrives. The send guard refuses every send when
// replies have not been read recently, and last_sync_at only ever advanced
// from the server-side sync that no longer runs — so the post itself has to
// stamp it, or the app can never send again.

import fs from 'node:fs';
const routeSrc = fs.readFileSync(new URL('../app/api/replies/ingest/route.js', import.meta.url), 'utf8');

test('a successful ingest stamps the mailbox as read', () => {
  assert.match(routeSrc, /markMailboxRead\(db, ctx\.workspace\)/, 'the stamp is on the ingest path');
  const ingested = routeSrc.indexOf('await ingestMessages(');
  const stamped = routeSrc.indexOf('markMailboxRead(db, ctx.workspace)');
  assert.ok(ingested > 0 && stamped > ingested, 'stamped after the batch landed, never before');
});

test('an empty sweep is a real message: mailbox read, nothing new', () => {
  // A quiet inbox must not become a blocked send button. The skill posts an
  // empty array on a quiet day and the freshness still advances.
  assert.match(routeSrc, /if \(!raw\.length\) \{\s*await markMailboxRead\(getDb\(\), ctx\.workspace\);/);
  // A missing or malformed body is still refused — silence is never a sweep.
  assert.match(routeSrc, /if \(!Array\.isArray\(body\?\.messages\)\)/);
});

test('the stamp touches freshness and nothing else', () => {
  const store = fs.readFileSync(new URL('../lib/gmail-store.mjs', import.meta.url), 'utf8');
  const fn = store.slice(store.indexOf('export async function markMailboxRead'));
  const body = fn.slice(0, fn.indexOf('}', fn.indexOf('WHERE')));
  assert.match(body, /SET last_sync_at = \?, updated_at = \?/, 'freshness only');
  assert.ok(!body.includes('history_id'), 'the cursor is not moved: this records a read, not a resume point');
  assert.ok(!body.includes('status'), 'connection status is not touched');
});
