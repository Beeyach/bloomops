// What happened to a job, after the row stopped remembering.
//
// PREPARE_OUTREACH job 522 failed twice with "parseFollowUp is not defined" and
// succeeded on attempt 3. Afterwards the row read status=done, last_error=null:
// the right answer to "what is true now" and no answer at all to "what
// happened". `complete()` clears the error, and each `fail()` overwrites the one
// before, so even mid-flight only the most recent failure ever existed.
//
// These run the real transitions against a fake D1 handle that behaves like the
// real one: prepared statements, bound parameters, and an atomic batch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complete, fail, release, ERROR_KIND, STATUS } from '../lib/queue.mjs';
import { sanitizeError, summariseHistory, JOB_EVENT } from '../lib/job-events.mjs';

// A handle that records what was written, in order, the way D1 would.
function fakeDb() {
  const events = [];
  const updates = [];
  const seen = new Set();
  const run = (sql, args) => {
    if (/INSERT OR IGNORE INTO job_events/i.test(sql)) {
      const [workspace, job_id, kind, attempt, event, error_kind, error, run_after] = args;
      // The unique index, honoured: (job_id, attempt, event).
      const key = `${job_id}|${attempt}|${event}`;
      if (seen.has(key)) return { meta: { changes: 0 } };
      seen.add(key);
      events.push({ workspace, job_id, kind, attempt, event, error_kind, error, run_after });
      return { meta: { changes: 1 } };
    }
    updates.push({ sql, args });
    return { meta: { changes: 1 } };
  };
  const stmt = (sql) => ({
    sql,
    bind: (...args) => ({ sql, args, run: async () => run(sql, args), all: async () => ({ results: [] }), first: async () => null }),
  });
  return {
    events, updates,
    prepare: stmt,
    // Atomic: either both land or neither does.
    batch: async (list) => list.map((s) => run(s.sql, s.args)),
  };
}

const job = (over = {}) => ({ id: 522, workspace: 'ary', kind: 'prepare-outreach', attempts: 1, max_attempts: 3, ...over });

// ── the shape job 522 had ────────────────────────────────────────────────

test('fail, fail, succeed keeps both failures after last_error clears', async () => {
  const db = fakeDb();
  await fail(db, job({ attempts: 1 }), { error: new Error('parseFollowUp is not defined') });
  await fail(db, job({ attempts: 2 }), { error: new Error('parseFollowUp is not defined') });
  await complete(db, 522, { job: job({ attempts: 3 }) });

  assert.equal(db.events.length, 3);
  assert.deepEqual(db.events.map((e) => e.event), [
    JOB_EVENT.RETRY_SCHEDULED, JOB_EVENT.RETRY_SCHEDULED, JOB_EVENT.SUCCEEDED,
  ]);
  assert.deepEqual(db.events.map((e) => e.attempt), [1, 2, 3]);
  // The thing that was lost.
  assert.equal(db.events[0].error, 'parseFollowUp is not defined');
  assert.equal(db.events[1].error, 'parseFollowUp is not defined');
});

test('two attempts with the same error stay two facts', async () => {
  const db = fakeDb();
  await fail(db, job({ attempts: 1 }), { error: new Error('same message') });
  await fail(db, job({ attempts: 2 }), { error: new Error('same message') });
  assert.equal(db.events.length, 2, 'identical text, different attempts');
});

test('the same transition replayed writes one row', async () => {
  const db = fakeDb();
  await fail(db, job({ attempts: 1 }), { error: new Error('boom') });
  await fail(db, job({ attempts: 1 }), { error: new Error('boom') });
  assert.equal(db.events.length, 1);
});

test('a first-attempt success still leaves a record', async () => {
  const db = fakeDb();
  await complete(db, 522, { job: job({ attempts: 1 }) });
  assert.equal(db.events.length, 1);
  assert.equal(db.events[0].event, JOB_EVENT.SUCCEEDED);
  assert.equal(db.events[0].attempt, 1);
});

// ── every other transition ───────────────────────────────────────────────

test('a retry records the exact run_after that was written', async () => {
  const db = fakeDb();
  const now = new Date('2026-08-12T05:20:36.000Z');
  const out = await fail(db, job({ attempts: 2 }), { error: new Error('boom'), now });
  assert.equal(out.status, STATUS.QUEUED);
  const ev = db.events[0];
  assert.equal(ev.event, JOB_EVENT.RETRY_SCHEDULED);
  // Not a recomputed interval: the value the job row got.
  const written = db.updates.find((u) => /run_after = \?/.test(u.sql));
  assert.ok(written.args.includes(ev.run_after), 'the history carries the value the row was given');
});

test('a terminal failure is retained', async () => {
  const db = fakeDb();
  const out = await fail(db, job({ attempts: 3, max_attempts: 3 }), { error: new Error('gave up') });
  assert.equal(out.status, STATUS.FAILED);
  assert.equal(db.events[0].event, JOB_EVENT.TERMINAL_FAILED);
  assert.equal(db.events[0].error, 'gave up');
});

test('waiting on a person and waiting on budget are distinguishable', async () => {
  const human = fakeDb();
  await fail(human, job(), { error: new Error('needs a decision'), kind: ERROR_KIND.HUMAN });
  assert.equal(human.events[0].event, JOB_EVENT.WAITING_ON_HUMAN);
  assert.equal(human.events[0].run_after, null, 'nothing schedules it');

  const budget = fakeDb();
  await fail(budget, job(), { error: new Error('no allowance'), kind: ERROR_KIND.BUDGET });
  assert.equal(budget.events[0].event, JOB_EVENT.WAITING_ON_BUDGET);
  assert.ok(budget.events[0].run_after, 'it comes back on its own');
});

test('a released claim is recorded, and is not a failure', async () => {
  const db = fakeDb();
  await release(db, job({ attempts: 2 }));
  assert.equal(db.events[0].event, JOB_EVENT.RELEASED);
  assert.equal(db.events[0].error, null);
});

// ── atomicity ────────────────────────────────────────────────────────────

test('the state change and its history go in one batch', async () => {
  const db = fakeDb();
  let batched = 0;
  const inner = db.batch;
  db.batch = async (list) => { batched = list.length; return inner(list); };
  await fail(db, job({ attempts: 1 }), { error: new Error('boom') });
  assert.equal(batched, 2, 'the update and the event together');
});

test('a handle with no batch support still records the state change', async () => {
  // The job row is what matters. A lost history row shows as a gap; a lost
  // state change would be a wrong job.
  const db = fakeDb();
  delete db.batch;
  await fail(db, job({ attempts: 1 }), { error: new Error('boom') });
  assert.equal(db.updates.length, 1);
  assert.equal(db.events.length, 1);
});

// ── sanitization ─────────────────────────────────────────────────────────

test('useful error text survives', () => {
  for (const s of [
    'parseFollowUp is not defined',
    'page.goto: Timeout 45000ms exceeded.',
    'The precheck answered 502.',
    'No handler for prepare-outreach',
  ]) {
    assert.equal(sanitizeError(s), s, s);
  }
});

test('credentials do not survive', () => {
  const cases = [
    ['Authorization: Bearer ya29.a0ARGnuabcdefghijklmnop', /ya29/],
    ['failed with api_key=sk-live-9f8e7d6c5b4a3f2e1d0c9b8a7', /sk-live/],
    ['RENDER_SECRET=abcd1234efgh5678ijkl rejected', /abcd1234efgh5678ijkl/],
    ['cookie: session=deadbeefdeadbeef', /deadbeefdeadbeef/],
    ['GET /x?access_token=zzzzzzzzzzzz failed', /access_token=zzz/],
    ['token stored as enc:v1:AAAABBBBCCCCDDDD', /enc:v1:AAAA/],
  ];
  for (const [raw, leak] of cases) {
    const out = sanitizeError(raw);
    assert.ok(!leak.test(out), `${raw} -> ${out}`);
    assert.ok(out.length > 0, 'and it is not reduced to nothing');
  }
});

test('a long unbroken blob is removed even unlabelled', () => {
  const out = sanitizeError(`failed: ${'A1b2C3d4'.repeat(6)}`);
  assert.match(out, /\[redacted\]/);
  assert.match(out, /^failed:/, 'the sentence still reads');
});

test('sanitizing keeps it to one bounded line', () => {
  const out = sanitizeError(`boom\n    at foo (/app/lib/x.mjs:1:1)\n    at bar\n${'x '.repeat(400)}`);
  assert.ok(!out.includes('\n'));
  assert.ok(out.length <= 300);
});

test('nothing at all stays nothing', () => {
  assert.equal(sanitizeError(''), null);
  assert.equal(sanitizeError(null), null);
  assert.equal(sanitizeError(undefined), null);
});

// ── no payload, no secrets, in what is stored ────────────────────────────

test('the history row carries no job payload', async () => {
  const db = fakeDb();
  await fail(db, job({ payload: JSON.stringify({ apiKey: 'do-not-store-me' }) }), { error: new Error('boom') });
  const text = JSON.stringify(db.events[0]);
  assert.ok(!text.includes('do-not-store-me'));
  assert.ok(!('payload' in db.events[0]));
});

// ── reading it back ──────────────────────────────────────────────────────

test('a summary reads as one line per attempt, in order', () => {
  const rows = [
    { attempt: 1, event: JOB_EVENT.CLAIMED, occurred_at: 'a' },
    { attempt: 1, event: JOB_EVENT.RETRY_SCHEDULED, error: 'parseFollowUp is not defined', run_after: '2026-08-12T05:20:00Z', occurred_at: 'b' },
    { attempt: 2, event: JOB_EVENT.CLAIMED, occurred_at: 'c' },
    { attempt: 2, event: JOB_EVENT.RETRY_SCHEDULED, error: 'parseFollowUp is not defined', run_after: '2026-08-12T05:25:36Z', occurred_at: 'd' },
    { attempt: 3, event: JOB_EVENT.CLAIMED, occurred_at: 'e' },
    { attempt: 3, event: JOB_EVENT.SUCCEEDED, occurred_at: 'f' },
  ];
  const out = summariseHistory(rows);
  assert.deepEqual(out.map((a) => a.attempt), [1, 2, 3]);
  assert.deepEqual(out.map((a) => a.event), [
    JOB_EVENT.RETRY_SCHEDULED, JOB_EVENT.RETRY_SCHEDULED, JOB_EVENT.SUCCEEDED,
  ]);
  assert.equal(out[1].runAfter, '2026-08-12T05:25:36Z');
  assert.equal(out[2].error, null);
});

test('a job that worked first time has nothing worth showing', () => {
  const out = summariseHistory([
    { attempt: 1, event: JOB_EVENT.CLAIMED },
    { attempt: 1, event: JOB_EVENT.SUCCEEDED },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].event, JOB_EVENT.SUCCEEDED);
  assert.equal(summariseHistory([]).length, 0);
});
