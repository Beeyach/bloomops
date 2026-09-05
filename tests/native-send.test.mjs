import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { d1, migration, PROSPECTS_BEFORE_041, SETTINGS_TABLE } from './_d1.mjs';
import { guardView, GUARD_FIELDS, IncompleteProspect } from '../lib/prospect-view.mjs';
import { canProgressOutbound } from '../lib/outbound.mjs';
import { buildMime, bodyAsHtml, encodeMime, hasSendScope, quotedPrintable, senderName, GMAIL_SEND_SCOPE } from '../lib/gmail-send.mjs';
import { sendPolicy, SEND_DEFAULTS, insideSendWindow, nextWindowOpen, remainingAllowance, localClock } from '../lib/send-policy.mjs';
import { canSendNow, approvalFingerprint, BLOCK } from '../lib/send-guard.mjs';
import { sendApproved, recoverInFlight, ATTEMPT, attemptKey } from '../lib/send-runner.mjs';

const schema = () => d1([
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
  // 047 adds send_events.approval_fingerprint. This list is hand-picked, so it
  // drifted behind production until a write to that column failed here while
  // working live — the same class of gap the test directly below this warns
  // about, where a partial list only checks what somebody remembered.
  migration('047_strategy_v2.sql'),
  // 056 adds the per-package auto-followup permission columns. Caught by the
  // schema-drift guard below the moment the migration landed, which is exactly
  // what that guard is for.
  migration('056_auto_followup_permission.sql'),
  migration('060_send_event_angle.sql'),
]);

// ── The boundary that would have caught the queue bug ────────────────────

test('a query that forgot a column throws instead of answering', () => {
  // The bug this exists for: the approval queue aliased `p.email AS
  // prospect_email`, handed the row to the guard, and the guard read
  // `undefined`. "Column not selected" and "no email address" became the same
  // answer, and every package in the queue was blocked for a week.
  const partial = { id: 1, stage: 'New', replied: 0, reply_type: null, reply_date: null, last_contact_date: null, next_action_date: null, do_not_contact: 0, unsubscribed: 0 };
  assert.throws(() => guardView(partial), IncompleteProspect);
  try { guardView(partial); } catch (e) {
    assert.deepEqual(e.missing, ['email']);
    assert.match(e.message, /answered about a prospect that does not exist/);
  }
});

test('an aliased column is undone at the boundary, in one place', () => {
  const row = { prospect_id: 7, prospect_email: 'pat@x.com', stage: 'New', replied: 0, reply_type: null, reply_date: null, last_contact_date: null, next_action_date: '2026-08-01', do_not_contact: 0, unsubscribed: 0 };
  const view = guardView(row, { aliases: { email: 'prospect_email', id: 'prospect_id' } });
  assert.equal(view.email, 'pat@x.com');
  assert.equal(view.id, 7);
  assert.equal(canProgressOutbound(view, { now: new Date('2026-08-09T12:00:00Z') }).ok, true);
});

test('a null value and an absent column are different answers', () => {
  const base = { id: 1, stage: 'New', replied: 0, reply_type: null, reply_date: null, last_contact_date: null, next_action_date: '2026-08-01', do_not_contact: 0, unsubscribed: 0 };
  // Present and null: a real prospect with no address. The guard stops.
  const view = guardView({ ...base, email: null });
  assert.equal(canProgressOutbound(view).stop, 'no-contact');
  // Absent: a bug. It never reaches the guard at all.
  assert.throws(() => guardView(base), IncompleteProspect);
});

test('every guard field is a real prospect column', async () => {
  // Every migration, not a hand-picked few: the point is that a guard field
  // cannot be a column nobody ever created, and a partial list would only
  // check the ones somebody remembered.
  const { readdirSync } = await import('node:fs');
  const dir = new URL('../migrations/', import.meta.url);
  const all = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8')
    + readdirSync(dir).filter((f) => f.endsWith('.sql'))
      .map((f) => readFileSync(new URL(f, dir), 'utf8')).join('\n');
  for (const f of GUARD_FIELDS) {
    assert.match(all, new RegExp(`\\b${f}\\b`), `${f} is read by the guard but is not a column`);
  }
});

// ── MIME ─────────────────────────────────────────────────────────────────

test('a header cannot be injected through a subject or an address', () => {
  // The message goes out from a real business's address. A newline in a header
  // value is either a bug or somebody adding their own headers to it.
  for (const bad of [{ subject: 'hi\r\nBcc: everyone@x.com' }, { to: 'a@b.com\nBcc: c@d.com' }]) {
    assert.throws(() => buildMime({ from: 'me@x.com', to: 'you@y.com', subject: 'ok', body: 'hi', ...bad }), /line break/);
  }
});

test('a subject outside ASCII is encoded rather than corrupted', () => {
  const mime = buildMime({ from: 'me@x.com', to: 'you@y.com', subject: 'quick question about Renée', body: 'hi' });
  assert.match(mime, /Subject: =\?UTF-8\?B\?/);
  const plain = buildMime({ from: 'me@x.com', to: 'you@y.com', subject: 'quick question', body: 'hi' });
  assert.match(plain, /Subject: quick question/, 'plain ASCII stays readable');
});

test('the body is CRLF and the encoding is base64url', () => {
  const mime = buildMime({ from: 'me@x.com', to: 'you@y.com', subject: 's', body: 'one\ntwo', boundary: 'B' });
  // The message is multipart now, so the body sits inside a part rather than
  // straight after the headers. The line endings are still the point.
  assert.equal(plainPartOf(mime), 'one\r\ntwo');
  const enc = encodeMime(mime);
  assert.ok(!/[+/=]/.test(enc), 'base64url has no +, / or padding');
});

test('sending is refused until the mailbox has consented to it', () => {
  assert.equal(hasSendScope({ scope: 'https://www.googleapis.com/auth/gmail.readonly' }), false);
  assert.equal(hasSendScope({ scope: `https://www.googleapis.com/auth/gmail.readonly ${GMAIL_SEND_SCOPE}` }), true);
  assert.equal(hasSendScope(null), false);
});

// ── Policy ───────────────────────────────────────────────────────────────

test('everything about sending defaults to off', () => {
  const p = sendPolicy({});
  assert.equal(p.autoSendApprovedFirstEmails, false);
  assert.equal(p.autoSendApprovedFollowups, false);
  // And a workspace that upgrades and reads none of this keeps behaving
  // exactly as it did yesterday.
  assert.equal(SEND_DEFAULTS.autoSendApprovedFirstEmails, false);
  assert.equal(SEND_DEFAULTS.autoSendApprovedFollowups, false);
});

test('the two switches are independent', () => {
  const p = sendPolicy({ autoSendApprovedFollowups: true });
  assert.equal(p.autoSendApprovedFollowups, true);
  assert.equal(p.autoSendApprovedFirstEmails, false, 'wanting follow-ups is not wanting cold sends');
});

test('the send window is the workspace clock, not the server one', () => {
  const p = sendPolicy({ workspaceTimezone: 'America/Los_Angeles', sendWindowStartHour: 8, sendWindowEndHour: 17 });
  // 16:00 UTC on a Monday is 09:00 in Los Angeles.
  assert.equal(localClock(p, new Date('2026-08-10T16:00:00Z')).hour, 9);
  assert.equal(insideSendWindow(p, new Date('2026-08-10T16:00:00Z')).ok, true);
  // 06:00 UTC is 23:00 the previous evening there.
  assert.equal(insideSendWindow(p, new Date('2026-08-10T06:00:00Z')).ok, false);
});

test('a weekend approval waits for a sending day rather than being refused', () => {
  const p = sendPolicy({ sendDays: [1, 2, 3, 4, 5] });
  // Saturday.
  const sat = new Date('2026-08-08T18:00:00Z');
  assert.equal(insideSendWindow(p, sat).ok, false);
  const next = nextWindowOpen(p, sat);
  assert.ok(next && next > sat);
  assert.equal(insideSendWindow(p, next).ok, true);
});

test('both ceilings apply, and the tighter one wins', () => {
  const p = sendPolicy({ dailySendLimit: 20, hourlySendLimit: 5 });
  assert.equal(remainingAllowance(p, { sentToday: 0, sentThisHour: 4 }).allowed, 1);
  assert.equal(remainingAllowance(p, { sentToday: 20, sentThisHour: 0 }).allowed, 0);
});

// ── Approval is about a version, not a prospect ──────────────────────────

test('approval fingerprints the exact message, not the prospect', () => {
  const pkg = {
    id: 1, version: 1, playbook: 'booking-friction', playbook_version: 2,
    generator_version: 'g1', evidence_hash: 'e1', workspace_context_hash: 'w1',
    contact_email: 'pat@x.com', email_subject: 's', email_body: 'b',
  };
  const base = approvalFingerprint(pkg);
  for (const change of [
    { version: 2 }, { playbook: 'lead-capture-gap' }, { playbook_version: 3 },
    { generator_version: 'g2' }, { evidence_hash: 'e2' }, { workspace_context_hash: 'w2' },
    { contact_email: 'someone@else.com' }, { email_subject: 'different' }, { email_body: 'different' },
  ]) {
    assert.notEqual(approvalFingerprint({ ...pkg, ...change }), base, `${Object.keys(change)[0]} must invalidate approval`);
  }
  // An address that differs only in case or spacing is the same address.
  assert.equal(approvalFingerprint({ ...pkg, contact_email: ' Pat@X.com ' }), base);
});

// ── The execution-time guard ─────────────────────────────────────────────

// An approved package now carries the fingerprint of what was approved. It has
// to: a missing one no longer passes the guard, because the check used to read
// `if (stored && stored !== current)` and a null skipped it rather than failing
// it. These fixtures exist to exercise windows, caps and reply rules, so they
// carry a valid one and let those tests test what they are named for.
const READY_PKG = {
  id: 1, status: 'APPROVED', reviewed_at: '2026-08-10T15:00:00Z', version: 1,
  playbook: 'own-finding', playbook_version: 2, generator_version: 'g1',
  evidence_hash: 'e1', workspace_context_hash: 'w1',
  contact_email: 'pat@x.com', email_subject: 's', email_body: 'b',
};

const READY = {
  pkg: { ...READY_PKG, approved_fingerprint: approvalFingerprint(READY_PKG) },
  prospect: {
    id: 1, name: 'Pat', business_name: null, email: 'pat@x.com', stage: 'New',
    replied: 0, reply_type: null, reply_date: null, last_contact_date: null,
    next_action_date: null, do_not_contact: 0, unsubscribed: 0,
  },
  settings: { autoSendApprovedFirstEmails: true, minimumDelayAfterApprovalMinutes: 15 },
  account: { id: 1, email_address: 'me@x.com', status: 'connected', scope: `x ${GMAIL_SEND_SCOPE}`, last_sync_at: '2026-08-10 16:00:00' },
  now: new Date('2026-08-10T16:05:00Z'),
};

test('a fully clean approved package may send', () => {
  const r = canSendNow(READY);
  assert.equal(r.ok, true, r.reason);
});

test('automation off blocks before anything else is even considered', () => {
  const r = canSendNow({ ...READY, settings: {} });
  assert.equal(r.block, BLOCK.AUTOMATION_OFF);
});

test('every relationship stop still blocks a send that was approved', () => {
  // Approval is a judgement about a draft. None of these are about the draft.
  const cases = [
    [{ replied: 1, reply_date: '2026-08-10' }, BLOCK.UNANSWERED_REPLY],
    [{ unsubscribed: 1 }, BLOCK.UNSUBSCRIBED],
    [{ reply_type: 'decline' }, BLOCK.DECLINED],
    [{ stage: 'Client' }, BLOCK.CLIENT],
    [{ do_not_contact: 1 }, BLOCK.DO_NOT_CONTACT],
    [{ stage: 'Interested' }, BLOCK.ACTIVE_CONVERSATION],
    [{ next_action_date: '2026-09-01' }, BLOCK.DEFERRED_UNTIL],
    [{ email: null }, BLOCK.NO_CONTACT],
    [{ stage: 'Rejected' }, BLOCK.TERMINAL_STAGE],
  ];
  for (const [patch, expected] of cases) {
    const r = canSendNow({ ...READY, prospect: { ...READY.prospect, ...patch } });
    assert.equal(r.ok, false, `${expected} did not block`);
    assert.equal(r.block, expected, JSON.stringify(patch));
  }
});

test('a package edited after approval is stale', () => {
  const approved = { ...READY.pkg, approved_fingerprint: approvalFingerprint(READY.pkg) };
  assert.equal(canSendNow({ ...READY, pkg: approved }).ok, true);
  const edited = { ...approved, email_body: 'somebody regenerated this' };
  const r = canSendNow({ ...READY, pkg: edited });
  assert.equal(r.block, BLOCK.STALE_APPROVAL);
  assert.match(r.reason, /not what would be sent/);
});

test('an address changed after approval blocks', () => {
  const r = canSendNow({ ...READY, prospect: { ...READY.prospect, email: 'someone@else.com' } });
  assert.equal(r.block, BLOCK.CONTACT_CHANGED);
});

test('a mailbox with no send consent blocks', () => {
  const r = canSendNow({ ...READY, account: { ...READY.account, scope: 'readonly-only' } });
  assert.equal(r.block, BLOCK.NO_SEND_SCOPE);
  assert.match(r.reason, /Reconnect/);
});

test('stale reply knowledge blocks, and waiting is the right mistake', () => {
  const r = canSendNow({ ...READY, account: { ...READY.account, last_sync_at: '2026-08-10 14:00:00' } });
  assert.equal(r.block, BLOCK.REPLY_STATE_STALE);
  assert.equal(r.retryable, true);
  assert.match(r.reason, /Waiting beats sending from stale knowledge/);
});

test('a mailbox that never synced blocks rather than defaulting to fresh', () => {
  const r = canSendNow({ ...READY, account: { ...READY.account, last_sync_at: null } });
  assert.equal(r.block, BLOCK.REPLY_STATE_STALE);
});

test('a send too soon after approval waits', () => {
  const r = canSendNow({ ...READY, now: new Date('2026-08-10T15:02:00Z') });
  assert.equal(r.block, BLOCK.TOO_SOON);
  assert.ok(r.retryAfter instanceof Date);
});

test('outside the window and over the limits both block, retryably', () => {
  // The mailbox has to still be fresh, or staleness blocks first and this
  // would be asserting the wrong thing.
  const night = canSendNow({
    ...READY,
    account: { ...READY.account, last_sync_at: '2026-08-11 05:50:00' },
    now: new Date('2026-08-11T06:00:00Z'),
  });
  assert.equal(night.block, BLOCK.OUTSIDE_WINDOW);
  assert.equal(night.retryable, true);
  const full = canSendNow({ ...READY, sentThisHour: 99 });
  assert.equal(full.block, BLOCK.RATE_LIMIT);
});

test('an already-sent prospect is not sent a first email again', () => {
  const r = canSendNow({ ...READY, existingSends: 1 });
  assert.equal(r.block, BLOCK.ALREADY_SENT);
});

// ── The crash case ───────────────────────────────────────────────────────

test('an attempt whose outcome is unknown is never resent', async () => {
  // The scenario the whole design is for: the request left, Gmail may have
  // accepted it, and the connection died. Retrying sends a stranger a second
  // email. Not retrying loses the send. The answer is written down first.
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();
  await db.prepare(
    `INSERT INTO send_attempts (workspace, prospect_id, package_id, sequence_step, attempt_key, state, started_at)
     VALUES ('ary', 1, 1, 1, 'k1', 'in-flight', '2026-08-10T15:00:00Z')`
  ).run();
  const prior = await db.prepare(`SELECT * FROM send_attempts WHERE attempt_key = 'k1'`).first();

  // Nothing in the mailbox: it probably never left, and "probably" is not
  // enough to send again on.
  const r = await recoverInFlight(db, 'ary', prior, { now: new Date('2026-08-10T16:00:00Z') });
  assert.equal(r.sent, false);
  assert.equal(r.block, 'outcome-unknown');
  assert.match(r.reason, /a duplicate is worse than a delay/);
  const after = await db.prepare(`SELECT state FROM send_attempts WHERE attempt_key = 'k1'`).first();
  assert.equal(after.state, ATTEMPT.ABANDONED);
});

test('an attempt the mailbox can settle is recorded, not resent', async () => {
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();
  await db.prepare(
    `INSERT INTO send_attempts (workspace, prospect_id, package_id, sequence_step, attempt_key, state, started_at)
     VALUES ('ary', 1, 1, 1, 'k1', 'in-flight', '2026-08-10T15:00:00Z')`
  ).run();
  await db.prepare(
    `INSERT INTO reply_events (workspace, prospect_id, message_id, thread_id, direction, occurred_at)
     VALUES ('ary', 1, 'gm-1', 'th-1', 'outbound', '2026-08-10T15:00:30Z')`
  ).run();
  const prior = await db.prepare(`SELECT * FROM send_attempts WHERE attempt_key = 'k1'`).first();

  const r = await recoverInFlight(db, 'ary', prior, { now: new Date('2026-08-10T16:00:00Z') });
  assert.equal(r.recovered, true);
  assert.equal(r.messageId, 'gm-1');
  const sends = await db.prepare(`SELECT * FROM send_events`).all();
  assert.equal(sends.results.length, 1, 'one send, recorded from the mailbox');
  const after = await db.prepare(`SELECT state FROM send_attempts WHERE attempt_key = 'k1'`).first();
  assert.equal(after.state, ATTEMPT.SUCCEEDED);
});

test('an in-flight attempt inside the grace window is left alone', async () => {
  // A second worker picking the job up thirty seconds later must not decide
  // the first one crashed.
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();
  await db.prepare(
    `INSERT INTO send_attempts (workspace, prospect_id, sequence_step, attempt_key, state, started_at)
     VALUES ('ary', 1, 1, 'k1', 'in-flight', '2026-08-10T15:59:30Z')`
  ).run();
  const prior = await db.prepare(`SELECT * FROM send_attempts WHERE attempt_key = 'k1'`).first();
  const r = await recoverInFlight(db, 'ary', prior, { now: new Date('2026-08-10T16:00:00Z') });
  assert.equal(r.block, 'in-flight');
  assert.equal(r.retryable, true);
});

test('the attempt key is stable across retries and different per step', () => {
  const a = attemptKey({ prospectId: 1, sequenceStep: 1, fingerprint: 'f' });
  assert.equal(a, attemptKey({ prospectId: 1, sequenceStep: 1, fingerprint: 'f' }));
  assert.notEqual(a, attemptKey({ prospectId: 1, sequenceStep: 2, fingerprint: 'f' }));
  assert.notEqual(a, attemptKey({ prospectId: 1, sequenceStep: 1, fingerprint: 'g' }));
});

test('two workers racing the same package produce one attempt', async () => {
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();
  const insert = () => db
    .prepare(`INSERT OR IGNORE INTO send_attempts (workspace, prospect_id, sequence_step, attempt_key, state) VALUES ('ary', 1, 1, 'same', 'in-flight')`)
    .run();
  const [a, b] = await Promise.all([insert(), insert()]);
  assert.equal(Number(a.meta.changes) + Number(b.meta.changes), 1, 'the index decides, not a read-then-write');
});

test('a package that is not approved is never sent, whatever the queue says', async () => {
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();
  await db.prepare(
    `INSERT INTO outreach_packages (id, workspace, prospect_id, version, status, email_subject, email_body, contact_email)
     VALUES (1, 'ary', 1, 1, 'READY_FOR_APPROVAL', 's', 'b', 'pat@x.com')`
  ).run();
  await db.prepare(`INSERT INTO settings (workspace, key, value) VALUES ('ary', 'engine', ?)`)
    .bind(JSON.stringify({ autoSendApprovedFirstEmails: true })).run();
  const r = await sendApproved(db, {}, { workspace: 'ary', packageId: 1 });
  assert.equal(r.sent, false);
  assert.equal(r.block, BLOCK.NOT_APPROVED);
  const attempts = await db.prepare(`SELECT * FROM send_attempts`).all();
  assert.equal(attempts.results.length, 0, 'nothing was even attempted');
});

test('a reply arriving before the scheduled send stops it, server side', async () => {
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email, stage) VALUES (1, 'ary', 'Pat', 'pat@x.com', 'New')`).run();
  // Approved rows carry the fingerprint of what was approved; a null no longer
  // slips past the guard, and this test is about the reply rule, not that.
  await db.prepare(
    `INSERT INTO outreach_packages (id, workspace, prospect_id, version, status, reviewed_at, email_subject, email_body, contact_email, approved_fingerprint)
     VALUES (1, 'ary', 1, 1, 'APPROVED', '2026-08-10T15:00:00Z', 's', 'b', 'pat@x.com', ?)`
  ).bind(approvalFingerprint({ id: 1, version: 1, contact_email: 'pat@x.com', email_subject: 's', email_body: 'b' })).run();
  await db.prepare(`INSERT INTO settings (workspace, key, value) VALUES ('ary', 'engine', ?)`)
    .bind(JSON.stringify({ autoSendApprovedFirstEmails: true, minimumDelayAfterApprovalMinutes: 0 })).run();
  await db.prepare(
    `INSERT INTO gmail_accounts (id, workspace, email_address, status, scope, last_sync_at)
     VALUES (1, 'ary', 'me@x.com', 'connected', ?, datetime('now'))`
  ).bind(`x ${GMAIL_SEND_SCOPE}`).run();

  // They wrote back between approval and execution.
  await db.prepare(
    `INSERT INTO reply_events (workspace, prospect_id, message_id, direction, occurred_at, classification)
     VALUES ('ary', 1, 'in-1', 'inbound', '2026-08-10T15:30:00Z', 'question')`
  ).run();
  await db.prepare(`UPDATE prospects SET replied = 1, reply_date = '2026-08-10' WHERE id = 1`).run();

  const r = await sendApproved(db, {}, { workspace: 'ary', packageId: 1, now: new Date('2026-08-10T16:05:00Z') });
  assert.equal(r.sent, false);
  assert.equal(r.block, BLOCK.UNANSWERED_REPLY);
  const attempts = await db.prepare(`SELECT * FROM send_attempts`).all();
  assert.equal(attempts.results.length, 0, 'the provider was never called');
  const pkg = await db.prepare(`SELECT send_block_reason FROM outreach_packages WHERE id = 1`).first();
  assert.match(pkg.send_block_reason, /replied/i);
});

// ── A person pressing send is not automation ─────────────────────────────
//
// The gap this covers: AUTO_SEND_FIRST is named for and documented as gating
// AUTOMATIC sending, but the guard used it to gate ALL sending. With the switch
// off there was no path from an approved package to a sent email at all, and
// the only route left was pasting the text into Gmail by hand.

test('approving with the switch off still sends nothing on its own', () => {
  const r = canSendNow({ ...READY, settings: { minimumDelayAfterApprovalMinutes: 15 } });
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.AUTOMATION_OFF, 'no timer may fire while the switch is off');
});

test('a manual send is allowed while the switch is off', () => {
  const r = canSendNow({ ...READY, settings: {}, manual: true });
  assert.equal(r.ok, true, r.reason);
});

test('manual skips the automation switch and the approval pause, and nothing else', () => {
  const base = { ...READY, settings: {}, manual: true };

  // Every other guard still refuses.
  const cases = [
    [{ pkg: { ...READY.pkg, status: 'READY_FOR_APPROVAL' } }, BLOCK.NOT_APPROVED],
    [{ pkg: { ...READY.pkg, approved_fingerprint: 'something-else' } }, BLOCK.STALE_APPROVAL],
    [{ prospect: { ...READY.prospect, email: 'someone@else.com' } }, BLOCK.CONTACT_CHANGED],
    [{ prospect: { ...READY.prospect, unsubscribed: 1 } }, 'unsubscribed'],
    [{ prospect: { ...READY.prospect, do_not_contact: 1 } }, 'do-not-contact'],
    [{ prospect: { ...READY.prospect, reply_type: 'decline' } }, 'declined'],
    [{ prospect: { ...READY.prospect, stage: 'Client' } }, 'client'],
    [{ existingSends: 1 }, BLOCK.ALREADY_SENT],
    [{ account: null }, BLOCK.MAILBOX_UNHEALTHY],
    [{ account: { ...READY.account, scope: 'readonly-only' } }, BLOCK.NO_SEND_SCOPE],
  ];
  for (const [patch, expected] of cases) {
    const r = canSendNow({ ...base, ...patch });
    assert.equal(r.ok, false, `${expected} must still block a manual send`);
    assert.equal(r.block, expected);
  }
});

test('a manual send still obeys the daily and hourly caps', () => {
  const capped = canSendNow({ ...READY, settings: { dailySendLimit: 0 }, manual: true });
  assert.equal(capped.ok, false);
  assert.equal(capped.block, BLOCK.RATE_LIMIT);
});

test('a manual send still obeys the send window', () => {
  // Sunday. The window is about the person receiving it, not about who pressed.
  const sunday = new Date('2026-08-09T18:00:00Z');
  const r = canSendNow({ ...READY, settings: {}, manual: true, now: sunday,
    account: { ...READY.account, last_sync_at: '2026-08-09 17:59:00' } });
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.OUTSIDE_WINDOW);
});

test('a manual send cannot send copy nobody approved', () => {
  // Fingerprinted as it stands, empty body and all. Without that the body
  // differs from what was approved and STALE_APPROVAL answers first — true,
  // but a different sentence than the one this test is named for. Approving
  // the empty package isolates the guard that should catch it: there is no
  // copy to send.
  const emptyPkg = { ...READY_PKG, email_body: '', edited_body: null };
  const empty = canSendNow({
    ...READY, settings: {}, manual: true,
    pkg: { ...emptyPkg, approved_fingerprint: approvalFingerprint(emptyPkg) },
  });
  assert.equal(empty.ok, false);
  assert.equal(empty.block, BLOCK.COPY_NOT_APPROVED);
});

test('changing the copy after approval blocks before anything else looks at it', () => {
  // The other half of the pair above: same empty body, but approved as 'b'.
  // That is a changed package, and it is caught as one.
  const changed = canSendNow({
    ...READY, settings: {}, manual: true,
    pkg: { ...READY.pkg, email_body: '', edited_body: null },
  });
  assert.equal(changed.ok, false);
  assert.equal(changed.block, BLOCK.STALE_APPROVAL);
});

test('both automatic switches are still off by default', () => {
  const p = sendPolicy({});
  assert.equal(p.autoSendApprovedFirstEmails, false);
  assert.equal(p.autoSendApprovedFollowups, false);
});

// ── The approval that could never be sent ────────────────────────────────
//
// Found in production during the live acceptance test, on the first real press
// of Send now. The guard answered STALE_APPROVAL: "the package changed after it
// was approved". Nothing had changed. Nobody had touched the row.
//
// The approve handler built a separate object to fingerprint, and it differed
// from the row it then wrote. It set sequence_max_step to the final length,
// while the write stores null unless the sequence was approved as well, which
// it is not on an ordinary approval. So the stored fingerprint described a
// package that never existed, and recomputing it from the real row could never
// match. Every approval was born stale.
//
// It was invisible because until the manual send existed nothing could reach
// the check. It would have blocked automatic sending too, on the first day that
// switch was ever turned on.

test('the stored fingerprint is recomputable from the row that was actually written', () => {
  const pkg = { ...READY.pkg, sequence_approved: 0 };

  // What the approve handler writes for an ordinary approval: the sequence is
  // not approved, so sequence_max_step is null.
  const written = { sequence_approved: 0, sequence_max_step: null, allowed_length: 3, priority_band: 'P1' };
  const row = {
    ...pkg, ...written,
    approved_fingerprint: approvalFingerprint({ ...pkg, ...written }),
  };
  assert.equal(canSendNow({ ...READY, pkg: row }).ok, true, 'an untouched approval must still be sendable');

  // The bug, exactly: fingerprint one shape, store another.
  const drifted = {
    ...pkg, ...written,
    approved_fingerprint: approvalFingerprint({ ...pkg, ...written, sequence_max_step: 3 }),
  };
  const r = canSendNow({ ...READY, pkg: drifted });
  assert.equal(r.block, BLOCK.STALE_APPROVAL, 'and the guard is right to refuse a fingerprint of a row that never existed');
});

test('the approve handler fingerprints the same object it writes', () => {
  const src = readFileSync(new URL('../app/api/outreach/route.js', import.meta.url), 'utf8')
    .replace(/^\s*\/\/.*$/gm, '');

  assert.match(
    src,
    /approvalFingerprint\(\{\s*\.\.\.pkg,\s*\.\.\.approvedFields\s*\}\)/,
    'the fingerprint must be taken from the fields being written, not from a copy that resembles them'
  );
  assert.match(
    src,
    /setStatus\(STATUS\.APPROVED,\s*\{\s*\.\.\.approvedFields/,
    'and those same fields must be what is written'
  );
  assert.ok(
    !/const approvedPkg\s*=/.test(src),
    'the second, hand-built package object is what drifted; it must not come back'
  );
});

// ── The email that arrived broken ────────────────────────────────────────
//
// The first message this product ever sent natively landed on a phone in
// ragged lines, breaking mid-sentence after "as a request" and after "If not,".
//
// The body in the database was one clean paragraph, 457 characters, no line
// breaks in it at all, and buildMime adds none. So nothing on this side did it.
// The header said `Content-Transfer-Encoding: 8bit`, and a long line declared
// 8bit is an invitation: the relay has to make the message 7-bit clean on the
// way out and the cheapest way is to hard-wrap it. Measured against the
// original, the breaks landed at 70, 138, 209, 280, 350 and 417 — 72 columns.
// The receiving client then wrapped the already-wrapped lines again.

test('a long paragraph carries no real line breaks into the message', () => {
  const body = 'Hi Ary,\n\n' + 'I checked the booking page on Bloomwired and it is set up as a request form rather than something that puts a time straight on a calendar. That means every booking needs someone on your end to read it, confirm it, and reply before it is actually locked in. If that step is already handled on your side, then this is not worth another thought. If not, it is worth knowing where the gap sits. How does a booking request actually reach your calendar right now?';
  const mime = buildMime({ from: 'hello@bloomwired.io', to: 'a@b.com', subject: 'x', body, boundary: 'B' });

  assert.match(mime, /Content-Transfer-Encoding: quoted-printable/);
  assert.ok(!/Content-Transfer-Encoding: 8bit/.test(mime), '8bit is what let the relay rewrap it');

  // Decoding has to give back exactly what was written, one long line and all.
  assert.equal(plainPartOf(mime), body.replace(/\n/g, '\r\n'));

  // Every break inside the paragraph is soft: it ends in `=` and disappears on
  // decode. The only real breaks are the two the author typed.
  const hard = rawPlainPart(mime).split('\r\n').filter((l) => !l.endsWith('='));
  assert.equal(hard.length, 3, 'greeting, blank line, and the final chunk of the paragraph');
});

test('no line exceeds what the standard allows', () => {
  const body = 'x'.repeat(5000) + '\n\n' + 'word '.repeat(400);
  const mime = buildMime({ from: 'a@b.com', to: 'c@d.com', subject: 's', body });
  for (const line of mime.split('\r\n')) {
    assert.ok(line.length <= 76, `line of ${line.length} characters: ${line.slice(0, 40)}…`);
  }
});

test('quoted-printable survives everything a real email contains', () => {
  const cases = [
    'plain ascii',
    'an = sign, which is the one character that must always be escaped',
    'a curly apostrophe: it’s here, and an em space:\u2003end',
    'accents: café, naïve, Ærø, Straße',
    'emoji: 🌸 and a flag 🇵🇭',
    'trailing space at the end of a line \nand the next line',
    'trailing tab\t\nnext',
    'a very long unbroken token ' + 'z'.repeat(300),
    '',
  ];
  for (const body of cases) {
    const normalised = body.replace(/\n/g, '\r\n');
    assert.equal(decodeQP(quotedPrintable(normalised)), normalised, JSON.stringify(body.slice(0, 30)));
  }
});

test('a multi-byte character is never split across a soft break', () => {
  // The failure this prevents is silent: half an =XX pair on each side of a
  // break decodes to mojibake rather than to an error.
  const body = 'é'.repeat(200);
  const encoded = quotedPrintable(body);
  for (const line of encoded.split('\r\n')) {
    const content = line.endsWith('=') ? line.slice(0, -1) : line;
    assert.ok(!/=[0-9A-F]?$/.test(content), `a triplet was cut: ${line.slice(-6)}`);
  }
  assert.equal(decodeQP(encoded), body);
});

test('a space at the end of a line is encoded so it survives', () => {
  const encoded = quotedPrintable('ends with a space \r\nnext line');
  assert.match(encoded, /=20\r\n/);
  assert.equal(decodeQP(encoded), 'ends with a space \r\nnext line');
});

// A decoder, written here rather than imported, so the tests check the output
// against the standard instead of against the encoder's own idea of it.
function decodeQP(s) {
  const withoutSoftBreaks = String(s).replace(/=\r\n/g, '');
  const bytes = [];
  for (let i = 0; i < withoutSoftBreaks.length; i += 1) {
    const c = withoutSoftBreaks[i];
    if (c === '=' && /^[0-9A-F]{2}$/.test(withoutSoftBreaks.slice(i + 1, i + 3))) {
      bytes.push(parseInt(withoutSoftBreaks.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      for (const b of new TextEncoder().encode(c)) bytes.push(b);
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// ── The name a stranger sees ─────────────────────────────────────────────
//
// The first email arrived from "Ary". A first name, no surname, no company,
// from an address nobody recognises. That is the shape of every spam message
// anybody has ever deleted, and it fails the only job the From line has.
//
// Worse, the Settings screen said of that field: "Nothing here is ever shown to
// a prospect on its own." True when it was written, and false from the day the
// app started sending its own mail, which is the most expensive kind of stale
// copy: it stops anybody from looking.

test('the sender is a person at a business, not a bare first name', () => {
  assert.equal(senderName({ operatorName: 'Ary', businessName: 'Bloomwired' }), 'Ary at Bloomwired');
  assert.equal(senderName({ operatorName: 'Ary Lombres', businessName: 'Bloomwired' }), 'Ary Lombres at Bloomwired');
});

test('with only one name on file, that one is used and nothing is invented', () => {
  assert.equal(senderName({ operatorName: 'Ary' }), 'Ary');
  assert.equal(senderName({ businessName: 'Bloomwired' }), 'Bloomwired');
  assert.equal(senderName({}), null, 'no display name at all beats a made-up one');
  assert.equal(senderName(), null);
});

test('a name that already carries the business does not say it twice', () => {
  assert.equal(senderName({ operatorName: 'Bloomwired Studio', businessName: 'Bloomwired' }), 'Bloomwired Studio');
});

test('the From header quotes a display name that needs it', () => {
  const of = (fromName) => buildMime({ from: 'hello@bloomwired.io', fromName, to: 'a@b.com', subject: 's', body: 'b' })
    .split('\r\n')[0];

  assert.equal(of('Ary at Bloomwired'), 'From: Ary at Bloomwired <hello@bloomwired.io>');
  // A comma unquoted would read as two addresses; a full stop ends a phrase.
  assert.equal(of('Ary, Bloomwired'), 'From: "Ary, Bloomwired" <hello@bloomwired.io>');
  assert.equal(of('Ary L. Lombres'), 'From: "Ary L. Lombres" <hello@bloomwired.io>');
  // Non-ASCII goes through RFC 2047, which is an atom and must not be quoted.
  assert.match(of('Aryanne Lombrés'), /^From: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <hello@bloomwired\.io>$/);
  // And a name is never a way to add a header.
  assert.throws(() => of('Ary\r\nBcc: someone@else.com'), /line break/);
});

test('the send runner takes the name from both settings fields', () => {
  const src = readFileSync(new URL('../lib/send-runner.mjs', import.meta.url), 'utf8');
  assert.match(src, /fromName: senderName\(settings\)/);
  assert.ok(!/fromName: settings\.operatorName/.test(src), 'the bare first name must not come back');
});

test('Settings no longer claims the name stays private', () => {
  const src = readFileSync(new URL('../components/SettingsView.jsx', import.meta.url), 'utf8');
  assert.ok(
    !/never shown to a prospect|Nothing here is ever shown/.test(src),
    'that sentence stopped being true the day the app started sending'
  );
  assert.match(src, /senderName\(settings\)/, 'and the real name is shown instead of described');
});

// ── "This is not normal emails" ──────────────────────────────────────────
//
// After the quoted-printable fix the body reached Gmail as one logical
// paragraph with no hard breaks in it at all. Gmail still drew it wrapped at 69
// characters inside a box wide enough for about 95: the text stopped a third of
// the way short of the right edge.
//
// That is Gmail rendering text/plain the way it always has, in its own fixed
// column rather than the width of the window. Every other email in that inbox
// is multipart with an HTML part, so every other email reflows. No amount of
// care in the plain part fixes it, because the plain part was never the thing
// being wrapped wrongly.

test('the message carries both a plain and an HTML part, least rich first', () => {
  const mime = buildMime({ from: 'a@b.com', to: 'c@d.com', subject: 's', body: 'Hi.\n\nOne paragraph.', boundary: 'B' });
  assert.match(mime, /Content-Type: multipart\/alternative; boundary="B"/);
  const plainAt = mime.indexOf('Content-Type: text/plain');
  const htmlAt = mime.indexOf('Content-Type: text/html');
  assert.ok(plainAt > 0 && htmlAt > 0, 'both parts are present');
  assert.ok(plainAt < htmlAt, 'the least rich part comes first, as the standard requires');
  assert.ok(mime.endsWith('--B--\r\n'), 'and the closing boundary terminates it');
});

test('the HTML says the same thing as the plain text, because it is generated from it', () => {
  const body = 'Hi Ary,\n\nFirst paragraph.\n\nSecond paragraph.';
  assert.equal(
    bodyAsHtml(body),
    '<p>Hi Ary,</p>\n<p>First paragraph.</p>\n<p>Second paragraph.</p>'
  );
  // A single newline inside a paragraph is a line the author wanted.
  assert.equal(bodyAsHtml('one\ntwo'), '<p>one<br>two</p>');
  assert.equal(bodyAsHtml(''), '<div></div>');
});

test('the HTML part carries no styling, no images and nothing to click', () => {
  const mime = buildMime({ from: 'a@b.com', to: 'c@d.com', subject: 's', body: 'Hi.\n\nA sentence.', boundary: 'B' });
  for (const marketing of [/<table/i, /<img/i, /<style/i, /style=/i, /<a\s/i, /background/i, /font-family/i]) {
    assert.ok(!marketing.test(mime), `an email a person typed would not contain ${marketing}`);
  }
});

test('a body that looks like markup cannot become markup', () => {
  const html = bodyAsHtml('5 < 6 & "quoted" <script>alert(1)</script>');
  assert.ok(!/<script/.test(html), 'the one thing an HTML part must never do');
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /5 &lt; 6 &amp; "quoted"/);
});

test('neither part is left for a relay to rewrap', () => {
  const long = 'word '.repeat(300).trim();
  const mime = buildMime({ from: 'a@b.com', to: 'c@d.com', subject: 's', body: long, boundary: 'B' });
  assert.ok(!/Content-Transfer-Encoding: 8bit/.test(mime));
  assert.equal((mime.match(/Content-Transfer-Encoding: quoted-printable/g) || []).length, 2, 'both parts encoded');
  for (const line of mime.split('\r\n')) {
    assert.ok(line.length <= 76, `line of ${line.length}: ${line.slice(0, 40)}…`);
  }
});

test('the boundary is unpredictable when nobody supplies one', () => {
  const of = (m) => m.match(/boundary="([^"]+)"/)[1];
  const a = of(buildMime({ from: 'a@b.com', to: 'c@d.com', subject: 's', body: 'x' }));
  const b = of(buildMime({ from: 'a@b.com', to: 'c@d.com', subject: 's', body: 'x' }));
  assert.notEqual(a, b, 'two messages must not share a boundary');
  assert.ok(a.length > 20);
});


// The raw text/plain part, still encoded. Written here rather than imported so
// the tests read the message the way a mail client would.
function rawPlainPart(mime) {
  const boundary = mime.match(/boundary="([^"]+)"/)[1];
  const part = mime.split('--' + boundary).find((x) => /Content-Type: text\/plain/.test(x));
  return part.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
}

const plainPartOf = (mime) => decodeQP(rawPlainPart(mime));

// ── The send window belongs to the recipient ─────────────────────────────
//
// It used to belong to the workspace. `regionScopeFor` existed, was exported,
// and carried a comment promising "the app's answer, so a skill asking 'may I
// send to this AU prospect now' gets the same answer the app would have given
// itself" — and had zero callers. Every send was judged on California hours,
// so the only times an Australian business could legally be mailed were the
// middle of its night.

import {
  sendPolicy as policyOf, insideSendWindow as inWindow,
  nextWindowOpen as nextOpen, windowFor, regionScopeFor,
} from '../lib/send-policy.mjs';

const POLICY = policyOf({});
const AU = { country: 'AU' };
const US = { country: 'US' };
const GB = { country: 'GB' };

// 2026-08-18T23:30Z is Wed 09:30 in Sydney and Tue 16:30 in Pacific.
const SYD_MORNING = new Date('2026-08-18T23:30:00Z');
// 2026-08-18T17:30Z is Wed 03:30 in Sydney and Tue 10:30 in Pacific.
const SYD_NIGHT = new Date('2026-08-18T17:30:00Z');

test('an AU prospect is judged in Sydney, not in California', () => {
  assert.equal(inWindow(POLICY, SYD_MORNING, AU).ok, true, '09:30 Sydney is inside');
  const night = inWindow(POLICY, SYD_NIGHT, AU);
  assert.equal(night.ok, false, '03:30 Sydney is not a time to email anybody');
  assert.match(night.reason, /Australia\/Sydney/);
});

test('the same instant can be fine for one country and wrong for another', () => {
  // Tue 10:30 Pacific, Wed 03:30 Sydney. One business is at its desk; the
  // other is asleep. A single workspace window cannot express that.
  assert.equal(inWindow(POLICY, SYD_NIGHT, US).ok, true);
  assert.equal(inWindow(POLICY, SYD_NIGHT, AU).ok, false);
});

test('no country falls back to the workspace window, exactly as before', () => {
  const noCountry = inWindow(POLICY, SYD_NIGHT, { country: '' });
  const noProspect = inWindow(POLICY, SYD_NIGHT);
  assert.equal(noCountry.ok, noProspect.ok);
  assert.equal(noProspect.ok, true, 'Tue 10:30 Pacific is inside the workspace window');
  assert.match(inWindow(POLICY, new Date('2026-08-19T02:00:00Z')).reason, /America\/Los_Angeles/);
});

test('every configured scope names a real timezone', () => {
  // A scope with hours but no zone is what the bug was. Without this the
  // config can regress to "8 to 17, somewhere".
  for (const s of POLICY.regionScopes) {
    assert.ok(s.timeZone, `${s.name} has no timeZone`);
    assert.doesNotThrow(
      () => new Intl.DateTimeFormat('en-US', { timeZone: s.timeZone }).format(new Date()),
      `${s.name} timeZone "${s.timeZone}" is not a real zone`
    );
  }
  assert.equal(regionScopeFor(POLICY, AU).timeZone, 'Australia/Sydney');
  assert.equal(regionScopeFor(POLICY, GB).timeZone, 'Europe/London');
});

test('a scope missing a zone falls back rather than silently meaning Pacific', () => {
  const odd = policyOf({ regionScopes: [{ name: 'X', countries: ['ZA'], startHour: 9, endHour: 16 }] });
  const w = windowFor(odd, { country: 'ZA' });
  assert.equal(w.startHour, 9, 'its hours still apply');
  assert.equal(w.timeZone, odd.workspaceTimezone, 'and the zone falls back visibly');
});

test('the weekday is read in the recipient timezone too', () => {
  // Fri 20:00 Pacific is Sat 13:00 in Sydney. Pacific still calls it Friday.
  // Reading the day on the wrong clock is the same mistake as the hours.
  const fri = new Date('2026-08-22T03:00:00Z');
  const au = inWindow(POLICY, fri, AU);
  assert.equal(au.ok, false);
  assert.match(au.reason, /Not a sending day in AU\/NZ|Outside the send window/);
});

test('nextWindowOpen answers in the recipient timezone', () => {
  const at = nextOpen(POLICY, SYD_NIGHT, AU);
  assert.ok(at instanceof Date, 'there is a next opening');
  assert.equal(inWindow(POLICY, at, AU).ok, true, 'and it is actually inside their window');
  // Whatever it picks must be a working hour in Sydney, never merely in LA.
  const h = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Australia/Sydney', hour: 'numeric', hour12: false,
  }).format(at));
  assert.ok(h >= 8 && h < 17, `picked ${h}:00 Sydney, which is outside 8-17`);
});
