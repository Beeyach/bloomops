import test from 'node:test';
import assert from 'node:assert/strict';
import { d1, migration, PROSPECTS_BEFORE_041 } from './_d1.mjs';
import {
  recordSend, dedupeKey, reconcileSends, awaitingSend, confirmSend, needingReconciliation,
  matchOutbound, identityOf, strongerThan, reconcileFromMailbox, VIA, IDENTITY, RECONCILE,
} from '../lib/send-events.mjs';
import { recordTransition, KIND, SOURCE, TERMINAL_STAGES } from '../lib/outcomes.mjs';
import { cohortOf, split, intervals, COHORT, LINK, STRUCTURED_FROM, isLegacy } from '../lib/cohort.mjs';

const schema = () => d1([
  PROSPECTS_BEFORE_041,
  migration('032_outcome_events.sql'),
  migration('037_reply_events.sql'),
  // Adds rfc_message_id and friends. Left out at first, and the reconciliation
  // query's own catch swallowed the resulting SQL error into a quiet no-match.
  migration('038_gmail_accounts.sql'),
  migration('039_outreach_packages.sql'),
  migration('040_package_versioning.sql'),
  migration('041_send_client_qualification.sql'),
  migration('043_source_provenance.sql'),
  migration('044_native_send.sql'),
  // 047 adds send_events.approval_fingerprint, which recordSend now writes.
  // The comment above about 038 being left out is the same story: a hand-picked
  // list drifts behind the real schema, and the failure surfaces as a column
  // that exists in production and not here.
  migration('047_strategy_v2.sql'),
  migration('056_auto_followup_permission.sql'),
  migration('060_send_event_angle.sql'),
]);

// ── Send events ──────────────────────────────────────────────────────────

test('a send is recorded once however many times it is reported', async () => {
  // The failure this prevents: the sweep skill sends, the callback times out,
  // the skill retries. Without the unique index that is two sends, two
  // sequence steps, and a prospect that looks twice as contacted as they are.
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();

  const payload = {
    workspace: 'ary', prospectId: 1, sequenceStep: 1,
    providerMessageId: 'gmail-abc', providerThreadId: 'thread-1',
    sentAt: '2026-08-09T10:00:00Z',
  };
  const first = await recordSend(db, payload);
  const second = await recordSend(db, payload);
  const third = await recordSend(db, { ...payload, via: VIA.RECONCILE });

  assert.equal(first.recorded, true);
  assert.equal(second.recorded, false);
  assert.equal(second.duplicate, true);
  assert.equal(third.duplicate, true, 'the same send arriving by a second route is still one send');

  const { results } = await db.prepare(`SELECT * FROM send_events`).all();
  assert.equal(results.length, 1);
  // And exactly one outcome event, so the two tables cannot disagree.
  const ev = await db.prepare(`SELECT * FROM outcome_events WHERE kind = ?`).bind(KIND.SEND).all();
  assert.equal(ev.results.length, 1);
});

test('without a message id the key still cannot repeat within a day', async () => {
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name) VALUES (1, 'ary', 'Pat')`).run();
  const base = { workspace: 'ary', prospectId: 1, sequenceStep: 1, sentAt: '2026-08-09T10:00:00Z' };
  assert.equal((await recordSend(db, base)).recorded, true);
  assert.equal((await recordSend(db, { ...base, sentAt: '2026-08-09T18:30:00Z' })).duplicate, true);
  // A genuine follow-up tomorrow is a different send and must land.
  assert.equal((await recordSend(db, { ...base, sequenceStep: 2, sentAt: '2026-08-10T09:00:00Z' })).recorded, true);
});

test('the dedupe key prefers the provider id over anything we derive', () => {
  const withId = dedupeKey({ providerMessageId: 'abc', prospectId: 1, sequenceStep: 1, sentAt: '2026-08-09' });
  const without = dedupeKey({ prospectId: 1, sequenceStep: 1, sentAt: '2026-08-09' });
  assert.equal(withId, 'msg:abc');
  assert.match(without, /^derived:1:1:2026-08-09$/);
});

test('two workspaces can send the same message id without colliding', async () => {
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name) VALUES (1, 'ary', 'Pat')`).run();
  await db.prepare(`INSERT INTO prospects (id, workspace, name) VALUES (2, 'ellen', 'Sam')`).run();
  assert.equal((await recordSend(db, { workspace: 'ary', prospectId: 1, providerMessageId: 'x' })).recorded, true);
  assert.equal((await recordSend(db, { workspace: 'ellen', prospectId: 2, providerMessageId: 'x' })).recorded, true);
});

// ── Reconciliation ───────────────────────────────────────────────────────

test('an approved package with no send is found, and the sent folder closes it', async () => {
  // The callback is the fast path, not the safe one. A skill that sends and
  // then fails to report it would lose the send silently: no error, no gap,
  // just a prospect that looks like it was never contacted.
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();
  await db.prepare(
    `INSERT INTO outreach_packages (id, workspace, prospect_id, version, status, playbook, generator_version, reviewed_at, email_subject)
     VALUES (1, 'ary', 1, 1, 'APPROVED', 'booking-friction', 'outreach-2026-08-09.3', datetime('now', '-2 hours'), 'quick question')`
  ).run();

  const pending = await awaitingSend(db, 'ary');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].prospect_id, 1);

  // Relative to now, not a fixed instant. awaitingSend requires the send to be
  // at or after the approval, and the approval above is datetime('now','-2
  // hours'), so a hardcoded timestamp made this test pass only while the real
  // clock was before that literal. It started failing hours later, on a change
  // that had nothing to do with it.
  const sentAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const summary = await reconcileSends(db, 'ary', [
    { id: 'g1', threadId: 't1', to: 'Pat <pat@x.com>', subject: 'quick question', sentAt },
    { id: 'g2', threadId: 't2', to: 'someone-else@y.com', subject: 'unrelated' },
  ]);
  assert.equal(summary.recorded, 1);
  assert.equal(summary.unmatched, 1, 'the unrelated message is not guessed at');

  // And the package now has a send, so it stops being pending.
  assert.equal((await awaitingSend(db, 'ary')).length, 0);
  const row = await db.prepare(`SELECT * FROM send_events WHERE prospect_id = 1`).first();
  assert.equal(row.recorded_via, VIA.RECONCILE);
  assert.equal(row.playbook, 'booking-friction', 'the package details came with it');
});

test('reconciling twice does not double anything', async () => {
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();
  await db.prepare(
    `INSERT INTO outreach_packages (id, workspace, prospect_id, version, status, reviewed_at)
     VALUES (1, 'ary', 1, 1, 'APPROVED', datetime('now', '-2 hours'))`
  ).run();
  // Same reason as above: relative, so the test does not expire.
  const msgs = [{ id: 'g1', threadId: 't1', to: 'pat@x.com', sentAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() }];
  await reconcileSends(db, 'ary', msgs);
  const again = await reconcileSends(db, 'ary', msgs);
  assert.equal(again.pending, 0, 'nothing is left to reconcile');
  const { results } = await db.prepare(`SELECT * FROM send_events`).all();
  assert.equal(results.length, 1);
});

test('approved is not sent', async () => {
  // The whole reason this table exists. Before it, APPROVED was the last thing
  // the database knew, and reading it as a send would have inflated every
  // funnel silently, worst on the days a batch was approved and never sent.
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();
  await db.prepare(
    `INSERT INTO outreach_packages (id, workspace, prospect_id, version, status, reviewed_at)
     VALUES (1, 'ary', 1, 1, 'APPROVED', datetime('now', '-2 hours'))`
  ).run();
  const { results } = await db.prepare(`SELECT * FROM send_events`).all();
  assert.equal(results.length, 0);
  assert.equal((await awaitingSend(db, 'ary')).length, 1, 'and the gap is visible, not silent');
});

// ── Identity strength and ambiguity ──────────────────────────────────────

test('the mailbox confirms a send rather than creating a second one', async () => {
  // The half the first version got wrong. The skill records the send the
  // moment Gmail's compose window closes, with no message id, because the UI
  // never gives it one. The sync sees the same message minutes later WITH its
  // id. Recording again there is one email and two sends.
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();

  const first = await recordSend(db, { workspace: 'ary', prospectId: 1, sequenceStep: 1, sentAt: '2026-08-09T10:00:00Z' });
  assert.equal(first.identity, IDENTITY.DERIVED);
  assert.equal(first.needsReconciliation, true, 'a send nobody can point at a message is flagged');

  const c = await confirmSend(db, 'ary', {
    prospectId: 1, providerMessageId: 'gmail-real', providerThreadId: 'thread-9', sentAt: '2026-08-09T10:02:00Z',
  });
  assert.equal(c.status, RECONCILE.CONFIRMED);
  assert.equal(c.identity, IDENTITY.PROVIDER_MESSAGE_ID);
  assert.equal(c.upgradedFrom, IDENTITY.DERIVED);

  const { results } = await db.prepare(`SELECT * FROM send_events`).all();
  assert.equal(results.length, 1, 'one email, one send');
  assert.equal(results[0].provider_message_id, 'gmail-real');
  assert.equal(results[0].needs_reconciliation, 0);
  assert.equal(results[0].dedupe_key, 'msg:gmail-real', 'and the key upgrades too, so a later report collides');
});

test('seeing the same message twice changes nothing', async () => {
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();
  await recordSend(db, { workspace: 'ary', prospectId: 1, sentAt: '2026-08-09T10:00:00Z' });
  await confirmSend(db, 'ary', { prospectId: 1, providerMessageId: 'g1', sentAt: '2026-08-09T10:01:00Z' });
  const again = await confirmSend(db, 'ary', { prospectId: 1, providerMessageId: 'g1', sentAt: '2026-08-09T10:01:00Z' });
  assert.equal(again.status, RECONCILE.ALREADY);
  const { results } = await db.prepare(`SELECT * FROM send_events`).all();
  assert.equal(results.length, 1);
});

test('a send reported after the mailbox already saw it still gets its id', async () => {
  // The ordering the first real production send exposed. Pub/Sub delivered the
  // outbound message at 17:01:40 and the skill reported the send at 17:01:54,
  // so confirmSend ran fourteen seconds before there was anything to confirm,
  // correctly did nothing, and the row then sat unidentified forever while the
  // mailbox held its message id the whole time.
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();
  await db.prepare(
    `INSERT INTO reply_events (workspace, prospect_id, message_id, thread_id, direction, occurred_at)
     VALUES ('ary', 1, '19fe7791f9bf75c9', '19fe778db858d7b6', 'outbound', '2026-08-09T17:01:40.000Z')`
  ).run();
  await recordSend(db, { workspace: 'ary', prospectId: 1, sequenceStep: 1, sentAt: '2026-08-09T17:01:54.000Z' });

  const r = await reconcileFromMailbox(db, 'ary');
  assert.equal(r.confirmed, 1);
  const row = await db.prepare(`SELECT * FROM send_events WHERE prospect_id = 1`).first();
  assert.equal(row.provider_message_id, '19fe7791f9bf75c9');
  assert.equal(row.provider_thread_id, '19fe778db858d7b6');
  assert.equal(row.identity, IDENTITY.PROVIDER_MESSAGE_ID);
  assert.equal(row.needs_reconciliation, 0);
  const { results } = await db.prepare(`SELECT * FROM send_events`).all();
  assert.equal(results.length, 1, 'still one send');
});

test('two of our own messages in the window are refused from that side too', async () => {
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();
  for (const [id, at] of [['m1', '2026-08-09T10:00:00Z'], ['m2', '2026-08-09T14:00:00Z']]) {
    await db.prepare(
      `INSERT INTO reply_events (workspace, prospect_id, message_id, direction, occurred_at)
       VALUES ('ary', 1, ?, 'outbound', ?)`
    ).bind(id, at).run();
  }
  await recordSend(db, { workspace: 'ary', prospectId: 1, sentAt: '2026-08-09T12:00:00Z' });
  const r = await reconcileFromMailbox(db, 'ary');
  assert.equal(r.confirmed, 0);
  assert.equal(r.ambiguous.length, 1);
  const row = await db.prepare(`SELECT * FROM send_events WHERE prospect_id = 1`).first();
  assert.equal(row.provider_message_id, null, 'nothing was attached');
});

test('two unidentified sends in the window are refused, not guessed between', async () => {
  // Picking one is a coin flip written into the record as a fact, and nothing
  // downstream could ever tell it was a guess.
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, email) VALUES (1, 'ary', 'Pat', 'pat@x.com')`).run();
  await recordSend(db, { workspace: 'ary', prospectId: 1, sequenceStep: 1, sentAt: '2026-08-09T10:00:00Z' });
  await recordSend(db, { workspace: 'ary', prospectId: 1, sequenceStep: 2, sentAt: '2026-08-09T14:00:00Z' });

  const c = await confirmSend(db, 'ary', { prospectId: 1, providerMessageId: 'g1', sentAt: '2026-08-09T12:00:00Z' });
  assert.equal(c.status, RECONCILE.AMBIGUOUS);
  assert.equal(c.candidates.length, 2);
  assert.match(c.why, /without guessing/);

  const flagged = await needingReconciliation(db, 'ary');
  assert.equal(flagged.length, 2, 'both are surfaced for a person, neither is chosen');
  const { results } = await db.prepare(`SELECT * FROM send_events WHERE provider_message_id IS NOT NULL`).all();
  assert.equal(results.length, 0, 'and nothing was attached');
});

test('recipient alone does not decide which package went out', async () => {
  // The rule from the brief, and the right one. A subject line would break the
  // tie and would be a guess: subjects repeat across a sequence.
  const pending = [
    { prospect_id: 1, email: 'pat@x.com', email_subject: 'quick question' },
    { prospect_id: 2, email: 'pat@x.com', email_subject: 'quick question' },
  ];
  const r = matchOutbound({ to: 'pat@x.com', subject: 'quick question' }, pending);
  assert.equal(r.match, null);
  assert.equal(r.ambiguous.length, 2);
});

test('identity is read from what was supplied, not from what was claimed', () => {
  assert.equal(identityOf({ providerMessageId: 'a', providerThreadId: 't' }), IDENTITY.PROVIDER_MESSAGE_ID);
  assert.equal(identityOf({ rfcMessageId: '<x@y>', providerThreadId: 't' }), IDENTITY.RFC_MESSAGE_ID);
  assert.equal(identityOf({ providerThreadId: 't' }), IDENTITY.THREAD_CHRONOLOGY);
  assert.equal(identityOf({}), IDENTITY.DERIVED);
  assert.ok(strongerThan(IDENTITY.PROVIDER_MESSAGE_ID, IDENTITY.DERIVED));
  assert.ok(!strongerThan(IDENTITY.DERIVED, IDENTITY.THREAD_CHRONOLOGY));
});

// ── Client transition ────────────────────────────────────────────────────

test('becoming a client is stamped once and never moved', async () => {
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name, stage) VALUES (1, 'ary', 'Pat', 'Interested')`).run();

  const first = await recordTransition(db, {
    workspace: 'ary', prospect: { id: 1, stage: 'Interested' }, from: 'Interested', to: 'Client', source: SOURCE.HUMAN,
  });
  assert.equal(first.firstClient, true);
  const stamped = await db.prepare(`SELECT first_client_at FROM prospects WHERE id = 1`).first();
  assert.ok(stamped.first_client_at);

  // Editing the record later, or flipping the stage away and back, must not
  // move the date they became one.
  await db.prepare(`UPDATE prospects SET stage = 'Interested' WHERE id = 1`).run();
  const second = await recordTransition(db, {
    workspace: 'ary', prospect: { id: 1, stage: 'Interested' }, to: 'Client',
  });
  assert.equal(second.firstClient, false);
  const after = await db.prepare(`SELECT first_client_at FROM prospects WHERE id = 1`).first();
  assert.equal(after.first_client_at, stamped.first_client_at);

  const clients = await db.prepare(`SELECT * FROM outcome_events WHERE kind = ?`).bind(KIND.CLIENT).all();
  assert.equal(clients.results.length, 1, 'one client event, ever');
});

test('only end states get an event', async () => {
  // Event-sourcing every move a row makes would bury the transitions that
  // matter under New-to-Contacted noise.
  const db = schema();
  await db.prepare(`INSERT INTO prospects (id, workspace, name) VALUES (1, 'ary', 'Pat')`).run();
  assert.equal((await recordTransition(db, { workspace: 'ary', prospect: { id: 1 }, to: 'Email 2' })).recorded, false);
  assert.equal((await recordTransition(db, { workspace: 'ary', prospect: { id: 1 }, to: 'Rejected' })).recorded, true);
  assert.equal((await recordTransition(db, { workspace: 'ary', prospect: { id: 1 }, to: 'Lost' })).recorded, true);
  assert.ok(TERMINAL_STAGES.has('Do Not Contact'));
});

// ── Legacy boundary and cohort ───────────────────────────────────────────

test('the boundary is a date, stated once', () => {
  assert.equal(STRUCTURED_FROM, '2026-08-09');
  assert.equal(isLegacy({ created_at: '2026-07-30 09:00:00' }), true);
  assert.equal(isLegacy({ created_at: '2026-08-09 09:00:00' }), false);
  // No date is legacy. Assuming modern is the one mistake that silently
  // contaminates the clean side.
  assert.equal(isLegacy({}), true);
});

test('a modern row missing a link is partial, not clean and not legacy', () => {
  const complete = {
    created_at: '2026-08-09', package_id: 1, generator_version: 'g', playbook: 'p',
    evidence_hash: 'e', send_count: 1,
  };
  assert.equal(cohortOf(complete).cohort, COHORT.STRUCTURED);

  const noSend = { ...complete, send_count: 0 };
  const c = cohortOf(noSend);
  assert.equal(c.cohort, COHORT.PARTIAL);
  assert.deepEqual(c.missing, [LINK.SEND]);
  // And a narrower question can still use it.
  assert.equal(cohortOf(noSend, { requires: [LINK.PACKAGE, LINK.PLAYBOOK] }).cohort, COHORT.STRUCTURED);
});

test('splitting reports why rows fell out instead of dropping them', () => {
  const rows = [
    { created_at: '2026-08-09', package_id: 1, generator_version: 'g', playbook: 'p', evidence_hash: 'e', send_count: 1 },
    { created_at: '2026-08-09', package_id: 2, generator_version: 'g', playbook: 'p', evidence_hash: 'e', send_count: 0 },
    { created_at: '2026-07-01' },
  ];
  const s = split(rows);
  assert.equal(s.structured.length, 1);
  assert.equal(s.partial.length, 1);
  assert.equal(s.legacy.length, 1);
  assert.equal(s.total, 3);
  assert.deepEqual(s.missingCounts, [{ link: LINK.SEND, n: 1 }]);
});

// ── The whole chain ──────────────────────────────────────────────────────

test('one modern prospect, from added to client, answers every question', async () => {
  // The success standard, as a regression test. Every one of these was
  // answerable only by reading somebody's notes before this pass.
  const db = schema();

  // Added, carrying the qualification that was already true at the lead.
  await db.prepare(
    `INSERT INTO prospects (id, workspace, name, email, stage, qualification, created_at)
     VALUES (1, 'ary', 'Pat', 'pat@x.com', 'New', ?, '2026-08-09 09:00:00')`
  ).bind(JSON.stringify({
    from: 'lead', verdict: 'green',
    reasons: ['asking for follow-up automation, reminders or auto-replies'],
    matchedGreen: [{ id: 'green-asking-follow-automation-reminders', effect: 'STATED_NEED', source: 'lead-scoring' }],
    matchedRed: [],
  })).run();

  // Vet decided, with its reason.
  await db.prepare(
    `INSERT INTO outcome_events (workspace, prospect_id, kind, value, context, created_at)
     VALUES ('ary', 1, 'vet', 'STRONG', ?, '2026-08-09 09:30:00')`
  ).bind(JSON.stringify({ rule: 'fresh-intel', opportunity: 'clear' })).run();

  // A package, fully versioned.
  await db.prepare(
    `INSERT INTO outreach_packages
       (id, workspace, prospect_id, version, status, playbook, playbook_version, generator_version,
        model, evidence_hash, workspace_context_hash, workspace_fit, selection_reason,
        email_subject, email_body, reviewed_at, review_outcome, edited_body, created_at)
     VALUES (1, 'ary', 1, 1, 'APPROVED', 'booking-friction', 2, 'outreach-2026-08-09.3',
        'claude-sonnet-5', 'ev-hash', 'ws-hash', 'IN_SCOPE', 'Booking takes more steps than it needs to',
        'quick question', 'Hi Pat.', '2026-08-09 10:00:00', 'EDITED', 'Hi Pat. Edited.', '2026-08-09 09:45:00')`
  ).run();

  // Actually sent, with the Gmail identifiers.
  await recordSend(db, {
    workspace: 'ary', prospectId: 1, packageId: 1, packageVersion: 1,
    generatorVersion: 'outreach-2026-08-09.3', playbook: 'booking-friction',
    providerMessageId: 'gmail-1', providerThreadId: 'thread-1',
    subject: 'quick question', sentAt: '2026-08-09 10:05:00',
  });

  // They replied.
  await db.prepare(
    `INSERT INTO reply_events (workspace, prospect_id, message_id, thread_id, direction, classification, occurred_at)
     VALUES ('ary', 1, 'gmail-2', 'thread-1', 'inbound', 'interested', '2026-08-11 14:00:00')`
  ).run();

  // And became a client.
  await db.prepare(`UPDATE prospects SET stage = 'Client' WHERE id = 1`).run();
  await recordTransition(db, {
    workspace: 'ary', prospect: { id: 1, stage: 'Interested' }, from: 'Interested', to: 'Client', source: SOURCE.HUMAN,
  });

  // One query answers the story.
  const row = await db.prepare(`
    SELECT p.id, p.name, p.qualification, p.first_client_at, p.created_at,
           pk.playbook, pk.playbook_version, pk.generator_version, pk.model,
           pk.evidence_hash, pk.workspace_context_hash, pk.workspace_fit,
           pk.selection_reason, pk.review_outcome, pk.reviewed_at,
           pk.created_at AS package_created_at,
           (SELECT COUNT(*) FROM send_events s WHERE s.prospect_id = p.id) AS send_count,
           (SELECT MIN(sent_at) FROM send_events s WHERE s.prospect_id = p.id) AS first_sent_at,
           (SELECT provider_message_id FROM send_events s WHERE s.prospect_id = p.id) AS send_message_id,
           (SELECT provider_thread_id FROM send_events s WHERE s.prospect_id = p.id) AS send_thread_id,
           (SELECT COUNT(*) FROM reply_events r WHERE r.prospect_id = p.id) AS reply_event_count,
           (SELECT MIN(occurred_at) FROM reply_events r WHERE r.prospect_id = p.id) AS first_reply_at,
           (SELECT classification FROM reply_events r WHERE r.prospect_id = p.id) AS reply_kind,
           (SELECT value FROM outcome_events e WHERE e.prospect_id = p.id AND e.kind = 'vet') AS vet_verdict,
           (SELECT context FROM outcome_events e WHERE e.prospect_id = p.id AND e.kind = 'vet') AS vet_context
      FROM prospects p
      LEFT JOIN outreach_packages pk ON pk.prospect_id = p.id
     WHERE p.id = 1
  `).first();

  // Who were they, and what rules applied?
  assert.equal(row.name, 'Pat');
  assert.equal(JSON.parse(row.qualification).matchedGreen[0].id, 'green-asking-follow-automation-reminders');
  // What did Vet decide, and why?
  assert.equal(row.vet_verdict, 'STRONG');
  assert.equal(JSON.parse(row.vet_context).opportunity, 'clear');
  // Which playbook, which generator, which workspace context?
  assert.equal(row.playbook, 'booking-friction');
  assert.equal(row.playbook_version, 2);
  assert.equal(row.generator_version, 'outreach-2026-08-09.3');
  assert.equal(row.workspace_context_hash, 'ws-hash');
  assert.equal(row.evidence_hash, 'ev-hash');
  assert.equal(row.workspace_fit, 'IN_SCOPE');
  assert.ok(row.selection_reason);
  // Did she edit it, and approve it?
  assert.equal(row.review_outcome, 'EDITED');
  assert.ok(row.reviewed_at);
  // When was it actually sent, and which Gmail message is it?
  assert.equal(row.send_count, 1);
  assert.equal(row.first_sent_at, '2026-08-09 10:05:00');
  assert.equal(row.send_message_id, 'gmail-1');
  assert.equal(row.send_thread_id, 'thread-1');
  // When did they reply, and how?
  assert.equal(row.reply_event_count, 1);
  assert.equal(row.reply_kind, 'interested');
  // When did they become a client?
  assert.ok(row.first_client_at);

  // Clean cohort, and every interval computable.
  assert.equal(cohortOf({ ...row, package_id: 1 }).cohort, COHORT.STRUCTURED);
  const i = intervals(row);
  for (const k of ['preparedToApproved', 'approvedToSent', 'sentToReplied', 'repliedToClient', 'addedToClient']) {
    assert.ok(i[k] !== null && Number.isFinite(i[k]), `${k} is not computable`);
  }
  assert.ok(i.approvedToSent >= 0, 'sent after approved');
  assert.ok(i.sentToReplied > 0, 'replied after sent');
});

test('a legacy prospect is answerable about state and honest about the rest', async () => {
  const db = schema();
  await db.prepare(
    `INSERT INTO prospects (id, workspace, name, stage, replied, reply_type, created_at)
     VALUES (1, 'ary', 'Old', 'Client', 1, 'interested', '2026-05-02 09:00:00')`
  ).run();
  const row = await db.prepare(`SELECT * FROM prospects WHERE id = 1`).first();
  assert.equal(row.stage, 'Client', 'the state is real');
  assert.equal(row.first_client_at, null, 'and the moment is genuinely unknown, not zero');
  assert.equal(cohortOf(row).cohort, COHORT.LEGACY);
  assert.equal(intervals(row).approvedToSent, null, 'null, never a fabricated number');
});
