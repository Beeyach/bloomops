// Every successful native send has to leave the timestamp the next step needs.
//
// The recording itself was already right: all four successful native sends in
// production have an event, each with a real provider id. Only five events
// exist because only five emails have ever gone through LTB at all.
//
// What was wrong was the step. It read `isFollowup ? emails_sent + 1 : 1`, and
// neither caller ever set isFollowup, so every send recorded as step 1. Nothing
// had broken yet because every send so far HAS been a first email.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  recordSend, coldSendCount, nextColdStep, repairMissingEvents, succeededWithoutEvent,
  MAX_SEQUENCE_STEP, VIA,
} from '../lib/send-events.mjs';
import { HARD_TOUCH_CEILING, RATING } from '../lib/priority.mjs';
import { nextFollowupSchedule, DUE } from '../lib/followup-schedule.mjs';
import { isoShift } from '../lib/due.mjs';

const { GREEN, BLUE, CROSS } = RATING;

// A D1 stand-in that models the bits these paths actually use: an
// INSERT OR IGNORE that respects a unique dedupe key, and counting selects.
function fakeDb({ events = [], attempts = [] } = {}) {
  const db = { events: [...events], attempts: [...attempts], writes: 0 };
  db.prepare = (sql) => {
    const q = sql.replace(/\s+/g, ' ').trim();
    let binds = [];
    const api = {
      bind: (...b) => { binds = b; return api; },
      async run() {
        if (/INSERT OR IGNORE INTO send_events/i.test(q)) {
          const key = binds[14];
          if (db.events.some((e) => e.dedupe_key === key)) return { meta: { changes: 0 } };
          db.events.push({
            id: db.events.length + 1, workspace: binds[0], prospect_id: binds[1],
            package_id: binds[2], sequence_step: binds[6],
            provider_message_id: binds[9], sent_at: binds[12],
            recorded_via: binds[13], dedupe_key: key,
          });
          db.writes += 1;
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
      async first() {
        if (/COUNT\(\*\) AS n FROM send_events/i.test(q)) {
          const [ws, pid, max] = binds;
          return { n: db.events.filter((e) => e.workspace === ws && e.prospect_id === pid
            && e.sequence_step >= 1 && e.sequence_step <= max).length };
        }
        return null;
      },
      async all() {
        if (/FROM send_attempts a/i.test(q)) {
          const ws = binds[0];
          return {
            results: db.attempts.filter((a) => a.workspace === ws && a.state === 'succeeded'
              && a.provider_message_id
              && !db.events.some((e) => e.provider_message_id === a.provider_message_id)),
          };
        }
        return { results: [] };
      },
    };
    return api;
  };
  return db;
}

const send = (db, over = {}) => recordSend(db, {
  workspace: 'ary', prospectId: 1, sequenceStep: 1,
  providerMessageId: 'gmail-1', sentAt: '2026-08-01T10:00:00Z', via: VIA.NATIVE, ...over,
});

// ── The bound ────────────────────────────────────────────────────────────

test('the highest cold step comes from the band table', () => {
  assert.equal(MAX_SEQUENCE_STEP, HARD_TOUCH_CEILING);
  assert.equal(MAX_SEQUENCE_STEP, 4);
});

test('a step outside the cold sequence is refused at the write', async () => {
  const db = fakeDb();
  for (const bad of [0, 5, 6, 99, -1, null, 'two', 1.5]) {
    const r = await send(db, { sequenceStep: bad, providerMessageId: `m-${bad}` });
    assert.equal(r.recorded, false, `step ${bad} must not record`);
    assert.match(r.error, /not a cold sequence step/);
  }
  assert.equal(db.events.length, 0);
});

test('steps 1, 2, 3 and 4 record', async () => {
  const db = fakeDb();
  for (const s of [1, 2, 3, 4]) {
    const r = await send(db, { sequenceStep: s, providerMessageId: `ok-${s}` });
    assert.equal(r.recorded, true, `step ${s} should record`);
  }
  assert.equal(db.events.length, 4);
});

// ── Dedupe ───────────────────────────────────────────────────────────────

test('one provider success is one event, however many times it is replayed', async () => {
  const db = fakeDb();
  assert.equal((await send(db)).recorded, true);
  for (let i = 0; i < 4; i += 1) {
    const again = await send(db);
    assert.equal(again.recorded, false, 'a replay must not record twice');
    assert.equal(again.duplicate, true);
  }
  assert.equal(db.events.length, 1);
});

test('the same message reconciled later collapses onto the same event', async () => {
  const db = fakeDb();
  await send(db, { via: VIA.NATIVE });
  const recon = await send(db, { via: VIA.RECONCILE, sentAt: '2026-08-01T11:30:00Z' });
  assert.equal(recon.recorded, false);
  assert.equal(db.events.length, 1, 'the provider id is the identity, not the clock');
});

// ── Which step is going out ──────────────────────────────────────────────

test('the step is counted from what actually went out', async () => {
  const db = fakeDb();
  const p = { id: 1, emails_sent: 0 };

  assert.deepEqual((await nextColdStep(db, 'ary', p, { ceiling: 3 })).step, 1);
  await send(db, { sequenceStep: 1, providerMessageId: 'a' });
  assert.equal((await nextColdStep(db, 'ary', p, { ceiling: 3 })).step, 2);
  await send(db, { sequenceStep: 2, providerMessageId: 'b' });
  assert.equal((await nextColdStep(db, 'ary', p, { ceiling: 3 })).step, 3);
});

test('recorded events outrank the legacy count', async () => {
  const db = fakeDb();
  await send(db, { sequenceStep: 1, providerMessageId: 'a' });
  // The summary field says five; the record says one went out.
  const r = await nextColdStep(db, 'ary', { id: 1, emails_sent: 5 }, { ceiling: 3 });
  assert.equal(r.step, 2);
  assert.equal(r.source, 'recorded sends');
});

test('a prospect with no events falls back to the legacy count', async () => {
  // Every prospect contacted before LTB could send is in this state. Without
  // the fallback their next email would record as step 1 and restart a
  // sequence that is already part done.
  const r = await nextColdStep(fakeDb(), 'ary', { id: 1, emails_sent: 2 }, { ceiling: 3 });
  assert.equal(r.step, 3);
  assert.equal(r.source, 'the legacy sent count');
});

test('a step past the ceiling is refused, not recorded', async () => {
  const r = await nextColdStep(fakeDb(), 'ary', { id: 1, emails_sent: 2 }, { ceiling: 2 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /allows 2/);
});

test('nothing can reach a fifth cold email', async () => {
  const r = await nextColdStep(fakeDb(), 'ary', { id: 1, emails_sent: 4 }, { ceiling: 4 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no step 5/);
});

test('a caller that disagrees about the step blocks rather than guesses', async () => {
  const db = fakeDb();
  await send(db, { sequenceStep: 1, providerMessageId: 'a' });
  // This is the real bug: a manual send that thinks it is Email 1 on somebody
  // who has already had one.
  const r = await nextColdStep(db, 'ary', { id: 1, emails_sent: 1 }, { ceiling: 3, declared: 1 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /sent as step 1/);
});

test('a caller that agrees is allowed through', async () => {
  const r = await nextColdStep(fakeDb(), 'ary', { id: 1, emails_sent: 0 }, { ceiling: 3, declared: 1 });
  assert.equal(r.ok, true);
  assert.equal(r.step, 1);
});

// ── Gmail succeeded, the event write did not ─────────────────────────────

test('a succeeded attempt with no event is found', async () => {
  const db = fakeDb({
    attempts: [
      { id: 7, workspace: 'ary', prospect_id: 1, package_id: 3, sequence_step: 2,
        provider_message_id: 'lost-1', provider_thread_id: 't1', state: 'succeeded',
        finished_at: '2026-08-01T10:00:05Z' },
    ],
  });
  const found = await succeededWithoutEvent(db, 'ary');
  assert.equal(found.length, 1);
  assert.equal(found[0].provider_message_id, 'lost-1');
});

test('the repair rebuilds the event from the attempt, exactly', async () => {
  const db = fakeDb({
    attempts: [
      { id: 7, workspace: 'ary', prospect_id: 1, package_id: 3, sequence_step: 2,
        provider_message_id: 'lost-1', provider_thread_id: 't1', state: 'succeeded',
        finished_at: '2026-08-01T10:00:05Z' },
    ],
  });

  const dry = await repairMissingEvents(db, 'ary');
  assert.equal(dry.found, 1);
  assert.equal(db.events.length, 0, 'a dry run writes nothing');

  const done = await repairMissingEvents(db, 'ary', { write: true });
  assert.equal(done.repaired[0].written, true);
  const e = db.events[0];
  assert.equal(e.provider_message_id, 'lost-1', 'the original provider id is kept');
  assert.equal(e.sent_at, '2026-08-01T10:00:05Z', 'the original send time is kept, not now');
  assert.equal(e.sequence_step, 2, 'the original step is kept');
});

test('repairing twice still leaves one event', async () => {
  const db = fakeDb({
    attempts: [
      { id: 7, workspace: 'ary', prospect_id: 1, package_id: null, sequence_step: 1,
        provider_message_id: 'lost-2', provider_thread_id: null, state: 'succeeded',
        finished_at: '2026-08-01T10:00:05Z' },
    ],
  });
  await repairMissingEvents(db, 'ary', { write: true });
  await repairMissingEvents(db, 'ary', { write: true });
  assert.equal(db.events.length, 1);
});

test('a step the attempt never recorded is surfaced, never invented', async () => {
  const db = fakeDb({
    attempts: [
      { id: 8, workspace: 'ary', prospect_id: 2, sequence_step: null,
        provider_message_id: 'lost-3', state: 'succeeded', finished_at: '2026-08-01T10:00:00Z' },
      { id: 9, workspace: 'ary', prospect_id: 3, sequence_step: 2,
        provider_message_id: 'lost-4', state: 'succeeded', finished_at: null },
    ],
  });
  const r = await repairMissingEvents(db, 'ary', { write: true });
  assert.equal(r.repaired.length, 0);
  assert.equal(r.unrepairable.length, 2);
  assert.match(r.unrepairable[0].why, /not a cold step/);
  assert.match(r.unrepairable[1].why, /send time is unknown/);
  assert.equal(db.events.length, 0);
});

test('a failed send leaves no event to repair', async () => {
  const db = fakeDb({
    attempts: [{ id: 1, workspace: 'ary', prospect_id: 1, sequence_step: 1, state: 'failed',
      provider_message_id: null, finished_at: '2026-08-01T10:00:00Z' }],
  });
  assert.equal((await succeededWithoutEvent(db, 'ary')).length, 0);
  assert.equal((await repairMissingEvents(db, 'ary', { write: true })).found, 0);
});

test('repairing never sends anything', () => {
  const src = readFileSync(new URL('../lib/send-events.mjs', import.meta.url), 'utf8');
  const from = src.indexOf('export async function repairMissingEvents');
  const body = src.slice(from);
  for (const forbidden of ['sendMessage', 'buildMime', 'sendApproved', 'enqueue(']) {
    assert.ok(!body.includes(forbidden), `the repair must never ${forbidden}`);
  }
});

// ── The proof the blocker is closed ──────────────────────────────────────

test('a P1 can now walk Email 1 to Email 2 to Email 3 to Email 4 on recorded facts alone', async () => {
  const db = fakeDb();
  // No last_contact_date anywhere: everything below comes from send events.
  const prospect = { id: 1, name: 'Jane', email: 'jane@example.com', rating: GREEN, emails_sent: 0 };
  const day0 = isoShift(-16);
  const day4 = isoShift(-12);

  // Email 1 goes out.
  let step = await nextColdStep(db, 'ary', prospect, { ceiling: 4 });
  assert.equal(step.step, 1);
  await send(db, { sequenceStep: 1, providerMessageId: 'e1', sentAt: `${day0}T09:00:00Z` });
  prospect.emails_sent = 1;

  const events = () => db.events.map((e) => ({ sequence_step: e.sequence_step, sent_at: e.sent_at }));

  // Day 4: Email 2 is due, anchored on Email 1's real timestamp.
  const at4 = nextFollowupSchedule(prospect, { sendEvents: events(), now: new Date(`${day4}T12:00:00Z`) });
  assert.equal(at4.step, 2);
  assert.equal(at4.anchor, day0);
  assert.equal(at4.dueAt, day4);
  assert.equal(at4.status, DUE.DUE_NOW);
  assert.equal(at4.anchorSource, 'send event');

  // Email 2 goes out, and records as step 2 rather than as another step 1.
  step = await nextColdStep(db, 'ary', prospect, { ceiling: 4 });
  assert.equal(step.step, 2);
  await send(db, { sequenceStep: 2, providerMessageId: 'e2', sentAt: `${day4}T09:00:00Z` });
  prospect.emails_sent = 2;

  // Day 9 from EMAIL 1: Email 3 is due.
  const day9 = isoShift(-7);
  const at9 = nextFollowupSchedule(prospect, { sendEvents: events(), now: new Date(`${day9}T12:00:00Z`) });
  assert.equal(at9.step, 3);
  assert.equal(at9.anchor, day0, 'still anchored on the first email');
  assert.equal(at9.dueAt, day9);
  assert.equal(at9.status, DUE.DUE_NOW);
  assert.equal(at9.isFinalStep, false);

  // Email 3 goes out.
  step = await nextColdStep(db, 'ary', prospect, { ceiling: 4 });
  assert.equal(step.step, 3);
  await send(db, { sequenceStep: 3, providerMessageId: 'e3', sentAt: `${day9}T09:00:00Z` });
  prospect.emails_sent = 3;

  // Day 16 from EMAIL 1: Email 4 is due and is the final step.
  const at16 = nextFollowupSchedule(prospect, { sendEvents: events(), now: new Date() });
  assert.equal(at16.step, 4);
  assert.equal(at16.anchor, day0, 'still anchored on the first email');
  assert.equal(at16.dueAt, isoShift(0));
  assert.equal(at16.status, DUE.DUE_NOW);
  assert.equal(at16.isFinalStep, true);

  // And there is no fifth.
  await send(db, { sequenceStep: 4, providerMessageId: 'e4', sentAt: `${isoShift(0)}T09:00:00Z` });
  prospect.emails_sent = 4;
  const after = await nextColdStep(db, 'ary', prospect, { ceiling: 4 });
  assert.equal(after.ok, false);
  assert.equal(nextFollowupSchedule(prospect, { sendEvents: events() }).status, DUE.COMPLETE);
});

test('P2 stops after three and P3 after one, on recorded facts', async () => {
  const two = fakeDb();
  await recordSend(two, { workspace: 'ary', prospectId: 1, sequenceStep: 1, providerMessageId: 'p2-1', sentAt: `${isoShift(-12)}T09:00:00Z` });
  const p2 = { id: 1, name: 'J', email: 'j@e.com', rating: BLUE, emails_sent: 1 };
  const s2 = nextFollowupSchedule(p2, { sendEvents: two.events });
  assert.equal(s2.step, 2);
  assert.equal(s2.isFinalStep, false, 'P2 knows its second email is not the last one');

  // Second email goes out.
  await recordSend(two, { workspace: 'ary', prospectId: 1, sequenceStep: 2, providerMessageId: 'p2-2', sentAt: `${isoShift(-5)}T09:00:00Z` });
  const s3 = nextFollowupSchedule({ ...p2, emails_sent: 2 }, { sendEvents: two.events });
  assert.equal(s3.step, 3);
  assert.equal(s3.isFinalStep, true, 'P2 knows its third email is the last one');

  // Once that third email is on record, there is no fourth for a P2.
  await recordSend(two, { workspace: 'ary', prospectId: 1, sequenceStep: 3, providerMessageId: 'p2-3', sentAt: `${isoShift(0)}T09:00:00Z` });
  const after = await nextColdStep(two, 'ary', { id: 1, emails_sent: 3 }, { ceiling: 3 });
  assert.equal(after.ok, false);
  assert.match(after.reason, /allows 3/);
  assert.equal(nextFollowupSchedule({ ...p2, emails_sent: 3 }, { sendEvents: two.events }).status, DUE.COMPLETE);

  const one = fakeDb();
  await recordSend(one, { workspace: 'ary', prospectId: 2, sequenceStep: 1, providerMessageId: 'p3-1', sentAt: `${isoShift(-4)}T09:00:00Z` });
  const p3 = { id: 2, name: 'K', email: 'k@e.com', rating: CROSS, emails_sent: 1 };
  assert.equal(nextFollowupSchedule(p3, { sendEvents: one.events }).status, DUE.COMPLETE);
});

test('the scheduler prefers a recorded event over the legacy fallback', () => {
  // Same prospect, two sends. With events, the anchor is known and the step is
  // schedulable. Without them it is UNCLEAR, which is where the 52 historical
  // rows sit and must stay.
  const p = { id: 1, name: 'J', email: 'j@e.com', rating: GREEN, emails_sent: 2, last_contact_date: isoShift(-3) };
  const withEvents = nextFollowupSchedule(p, {
    sendEvents: [
      { sequence_step: 1, sent_at: `${isoShift(-9)}T09:00:00Z` },
      { sequence_step: 2, sent_at: `${isoShift(-3)}T09:00:00Z` },
    ],
  });
  assert.equal(withEvents.anchorSource, 'send event');
  assert.equal(withEvents.anchor, isoShift(-9));

  assert.equal(nextFollowupSchedule(p, {}).status, DUE.UNCLEAR);
});
