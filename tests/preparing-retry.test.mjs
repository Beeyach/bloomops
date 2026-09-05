// A half-written package must not block its own repair.
//
// `idx_pkg_live` is a UNIQUE index on (workspace, prospect_id) across
// PREPARING, READY_FOR_APPROVAL, NEEDS_DECISION and APPROVED, so exactly one
// live package may exist per prospect. `savePackage` only ever INSERTed.
//
// A P2 preparation can fail after Email 1 and before Email 2 — the writer
// produced a second email the claim rules refused — and the handler stores the
// partial result as PREPARING and throws so the queue retries. The retry then
// came back to insert, and the database refused it. Prospect 3163 hit this for
// real: package 22 sat in PREPARING, attempt 3 died on `UNIQUE constraint
// failed`, and clearing the row by hand was the only way forward.
//
// These tests run against a real SQLite database with the real index, so the
// collision is reproduced rather than described.

import test from 'node:test';
import assert from 'node:assert/strict';
import { d1, migration, PROSPECTS_BEFORE_041, SETTINGS_TABLE } from './_d1.mjs';

const WS = 'ary';
const PROSPECT = 3163;

// The real schema, including the partial unique index that caused the failure.
const conn = () => d1([
  PROSPECTS_BEFORE_041,
  SETTINGS_TABLE,
  migration('032_outcome_events.sql'),
  migration('037_reply_events.sql'),
  migration('038_gmail_accounts.sql'),
  migration('039_outreach_packages.sql'),
  migration('040_package_versioning.sql'),
  migration('041_send_client_qualification.sql'),
  migration('043_source_provenance.sql'),
  migration('044_native_send.sql'),
  migration('047_strategy_v2.sql'),
  migration('056_auto_followup_permission.sql'),
]);

// The fields a real preparation writes, trimmed to what these tests read back.
const fields = (over = {}) => ({
  status: 'PREPARING',
  playbook: 'booking-friction',
  whyContact: 'Booking is a request form, not a calendar',
  evidence: [{ key: 'booking-is-a-form', text: 'Booking is a request form, not a calendar' }],
  evidenceLevel: 'strong',
  contactEmail: 'brianda@aztherapyquest.com',
  emailSubject: 'your booking form vs a calendar',
  emailBody: 'Hi there,\n\nEmail one.\n\nThanks,\nAry',
  allowedLength: 2,
  priorityBand: 'P2',
  generatorVersion: 'outreach-test',
  ...over,
});

const COMPLETE = { step: 2, subject: 'booking form steps, still open', body: 'Hi there,\n\nEmail two.\n\nThanks,\nAry' };

// The same function the preparation handler calls, against a real database.
const save = async (db, f) => {
  const { savePackage } = await import('../lib/runner.mjs');
  return savePackage(db, WS, PROSPECT, f);
};

const rows = async (db) => (await db
  .prepare('SELECT id, version, status, email_body, followups FROM outreach_packages WHERE prospect_id = ? ORDER BY id')
  .bind(PROSPECT).all()).results;

// 1
test('no package yet -> one PREPARING row is created', async () => {
  const db = conn();
  const id = await save(db, fields());
  const all = await rows(db);
  assert.equal(all.length, 1);
  assert.equal(all[0].id, id);
  assert.equal(all[0].version, 1);
  assert.equal(all[0].status, 'PREPARING');
});

// 2 + 3 + 4 + 5 + 6 — the exact regression
test('Email 1 written, Email 2 refused, retry resumes the same row', async () => {
  const db = conn();

  // Attempt one: Email 1 is fine, Email 2 fails validation, so the partial
  // package is stored as PREPARING and the job throws.
  const first = await save(db, fields({ statusReason: 'Email 2 could not be written, so the P2 package is not complete.' }));

  // Attempt two, on the same job. This is the INSERT that used to be refused.
  const second = await save(db, fields({
    emailBody: 'Hi there,\n\nEmail one, rewritten.\n\nThanks,\nAry',
    followups: [COMPLETE],
    status: 'READY_FOR_APPROVAL',
  }));

  const all = await rows(db);
  assert.equal(all.length, 1, 'still one row — no second live package');
  assert.equal(second, first, 'the retry reused the package id');
  assert.equal(all[0].version, 1, 'and the version, with no gap');
  assert.equal(all[0].status, 'READY_FOR_APPROVAL');
  assert.match(all[0].email_body, /rewritten/);
  assert.match(all[0].followups, /Email two/);
});

// 7
test('the resumed row is regenerated whole, never stitched from two attempts', async () => {
  const db = conn();
  await save(db, fields({ emailBody: 'Hi there,\n\nOLD email one.\n\nThanks,\nAry' }));
  await save(db, fields({
    emailBody: 'Hi there,\n\nNEW email one.\n\nThanks,\nAry',
    followups: [COMPLETE],
    status: 'READY_FOR_APPROVAL',
    whyContact: 'A different angle entirely',
  }));
  const [row] = await rows(db);
  assert.doesNotMatch(row.email_body, /OLD/, 'Email 1 from the earlier attempt is gone');
  assert.match(row.email_body, /NEW/);
  const [full] = (await db.prepare('SELECT why_contact FROM outreach_packages WHERE id = ?').bind(row.id).all()).results;
  assert.equal(full.why_contact, 'A different angle entirely', 'every column moved together');
});

// 8 + 9 + 10 + 11
test('a completed retry is approvable-shaped and nothing more', async () => {
  const db = conn();
  await save(db, fields());
  const id = await save(db, fields({ followups: [COMPLETE], status: 'READY_FOR_APPROVAL' }));
  const [row] = (await db
    .prepare('SELECT status, sequence_approved, sequence_max_step, auto_followup_approved, approved_fingerprint, reviewed_at FROM outreach_packages WHERE id = ?')
    .bind(id).all()).results;
  assert.equal(row.status, 'READY_FOR_APPROVAL');
  assert.equal(Number(row.sequence_approved), 0);
  assert.equal(row.sequence_max_step, null);
  assert.equal(Number(row.auto_followup_approved), 0);
  assert.equal(row.approved_fingerprint, null, 'no fingerprint before approval');
  assert.equal(row.reviewed_at, null);
});

// 12 — an APPROVED package holds the live slot, so it is neither resumed nor
// duplicated. The two are different failures and both matter: overwriting it
// would rewrite what somebody agreed to, and inserting beside it would put two
// live packages on one prospect.
test('an APPROVED package is never resumed and never duplicated', async () => {
  const db = conn();
  const id = await save(db, fields());
  await db.prepare("UPDATE outreach_packages SET status = 'APPROVED' WHERE id = ?").bind(id).run();

  const next = await save(db, fields({ emailBody: 'Hi there,\n\nSomething new.\n\nThanks,\nAry' }));
  const all = await rows(db);
  assert.equal(next, id, 'it answers with the package that exists');
  assert.equal(all.length, 1, 'and writes nothing');
  assert.equal(all[0].status, 'APPROVED');
  assert.doesNotMatch(all[0].email_body, /Something new/, 'the approved words are untouched');
});

// 13 — SENT is not a live status: the sequence is under way and a fresh
// preparation is honestly a new version rather than a rewrite of the sent one.
test('a SENT package is never resumed, and a fresh preparation versions past it', async () => {
  const db = conn();
  const id = await save(db, fields());
  await db.prepare("UPDATE outreach_packages SET status = 'SENT' WHERE id = ?").bind(id).run();

  const next = await save(db, fields({ emailBody: 'Hi there,\n\nSomething new.\n\nThanks,\nAry' }));
  const all = await rows(db);
  assert.notEqual(next, id, 'a new row, not the sent one');
  assert.equal(all.length, 2);
  const sent = all.find((r) => r.id === id);
  assert.equal(sent.status, 'SENT', 'the sent package is unchanged');
  assert.doesNotMatch(sent.email_body, /Something new/);
  assert.deepEqual(all.map((r) => r.version), [1, 2]);
});

// 14
test('an explicit reprepare after a completed package creates a new version', async () => {
  const db = conn();
  const first = await save(db, fields({ status: 'READY_FOR_APPROVAL', followups: [COMPLETE] }));
  // Retired the canonical way, freeing the live slot.
  await db.prepare("UPDATE outreach_packages SET status = 'SKIPPED' WHERE id = ?").bind(first).run();

  const second = await save(db, fields());
  const all = await rows(db);
  assert.notEqual(second, first);
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((r) => r.version), [1, 2], 'versions increment, no gap');
  assert.equal(all[0].status, 'SKIPPED', 'history preserved');
});

// 15
test('two executions racing cannot create two live packages', async () => {
  const db = conn();
  // Both workers see no package and both write.
  const [a, b] = await Promise.all([save(db, fields()), save(db, fields())]);
  const all = await rows(db);
  const live = all.filter((r) => ['PREPARING', 'READY_FOR_APPROVAL', 'NEEDS_DECISION', 'APPROVED'].includes(r.status));
  assert.equal(live.length, 1, 'the index is still the last word');
  assert.ok(a && b);
});

// 16
test('a stale worker cannot clobber a package that has moved on', async () => {
  const db = conn();
  const id = await save(db, fields());
  // The lease expired, the job was reclaimed, and the newer run finished it.
  await db.prepare("UPDATE outreach_packages SET status = 'APPROVED', email_body = 'Hi there,\n\nThe approved words.\n\nThanks,\nAry' WHERE id = ?").bind(id).run();

  // The stale worker comes back and writes what it was going to write.
  await save(db, fields({ emailBody: 'Hi there,\n\nStale words.\n\nThanks,\nAry' }));

  const all = await rows(db);
  const approved = all.find((r) => r.id === id);
  assert.equal(approved.status, 'APPROVED');
  assert.match(approved.email_body, /The approved words/, 'the approval survived');
  assert.doesNotMatch(approved.email_body, /Stale words/);
});

// 17 + 18
test('retry exhaustion leaves it non-actionable, and a later run recovers it without SQL', async () => {
  const { ACTIONABLE_STATUSES } = await import('../lib/outreach.mjs');
  const db = conn();
  const id = await save(db, fields({ statusReason: 'Email 2 could not be written, so the P2 package is not complete.' }));
  const [stuck] = await rows(db);

  assert.equal(stuck.status, 'PREPARING');
  assert.equal(ACTIONABLE_STATUSES.includes('PREPARING'), false, 'nothing can approve or send it');

  // The operator simply asks for preparation again. This is the step that used
  // to require hand-clearing the row.
  const again = await save(db, fields({ followups: [COMPLETE], status: 'READY_FOR_APPROVAL' }));
  assert.equal(again, id, 'recovered into the same record');
  const all = await rows(db);
  assert.equal(all.length, 1);
  assert.equal(all[0].status, 'READY_FOR_APPROVAL');
});

// 19
test('P1 and P3 preparations are unaffected', async () => {
  for (const [band, length, followups] of [['P1', 3, [COMPLETE, { step: 3, subject: 's3', body: 'b3' }]], ['P3', 1, []]]) {
    const db = conn();
    const id = await save(db, fields({ priorityBand: band, allowedLength: length, followups, status: 'READY_FOR_APPROVAL' }));
    const [row] = (await db.prepare('SELECT version, priority_band, allowed_length, status FROM outreach_packages WHERE id = ?').bind(id).all()).results;
    assert.equal(row.priority_band, band);
    assert.equal(row.allowed_length, length);
    assert.equal(row.version, 1, `${band} still starts at version 1`);
    assert.equal(row.status, 'READY_FOR_APPROVAL');
  }
});

// The index itself must not have been loosened to make any of this work.
test('idx_pkg_live still allows only one live package', async () => {
  const db = conn();
  const [idx] = (await db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_pkg_live'").all()).results;
  assert.ok(idx, 'the index exists');
  assert.match(idx.sql, /UNIQUE/);
  assert.match(idx.sql, /workspace,\s*prospect_id/);
  for (const s of ['PREPARING', 'READY_FOR_APPROVAL', 'NEEDS_DECISION', 'APPROVED']) {
    assert.ok(idx.sql.includes(s), `${s} still counts as live`);
  }
});
