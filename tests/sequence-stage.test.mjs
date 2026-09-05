// Staging a skill-written sequence: the free-drafting path into the queue.
//
// The promise under test: what Ary's skills write in Claude Code becomes an
// ordinary package — approvable, fingerprinted, guarded — without the app
// spending a token, and the V2 allowance is enforced at the door.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  stageableSequence, sequencePackageFields,
  SEQUENCE_STAGE_GENERATOR_VERSION, SEQUENCE_STAGE_PLAYBOOK,
} from '../lib/sequence-stage.mjs';
import { reconcileForApproval, RECONCILE } from '../lib/approval.mjs';
import { allowedTouches } from '../lib/priority.mjs';

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');

const SEQ5 = JSON.stringify([
  { number: 1, subject: 'Your booking form', body: 'Hi Kim.\n\nI was on your site and noticed the booking goes through a contact form with no calendar behind it. Want me to send over what I mean?\n\nThanks,\nAry' },
  { number: 2, subject: 'Your booking form', body: 'Hi Kim.\n\nStill happy to send the note about the booking form if useful.\n\nThanks,\nAry' },
  { number: 3, subject: 'Your booking form', body: "Hi Kim.\n\nJust one last note about the booking form. If you ever want help with it, I'm around. If that's already handled, ignore me.\n\nThanks,\nAry" },
  { number: 4, subject: 'old strategy', body: 'Email 4 from the five-email era.' },
  { number: 5, subject: 'old strategy', body: 'Email 5 from the five-email era.' },
]);

const PROSPECT = {
  id: 9, name: 'Kim', business_name: 'Studio Seven', email: 'kim@studio.example',
  country: 'AU', stage: 'New', rating: '💚', emails_sent: 0,
  last_contact_date: null, next_action_date: null,
  replied: 0, reply_type: null, reply_date: null, do_not_contact: 0, unsubscribed: 0,
  email_sequence: SEQ5,
};

const ok = (over = {}) => stageableSequence({ ...PROSPECT, ...over });

test('a 💚 prospect with a full stored sequence stages as P1, trimmed to four', () => {
  const r = ok();
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.band, 'P1');
  assert.equal(r.steps.length, 4, 'the V3 allowance, never five');
  assert.equal(r.dropped, 1, 'email 5 stays stored but unstaged');
  assert.deepEqual(r.steps.map((s) => s.step), [1, 2, 3, 4]);
});

test('the safety gate refuses the people cold outreach must never touch', () => {
  assert.equal(ok({ replied: 1 }).ok, false);
  assert.equal(ok({ do_not_contact: 1 }).ok, false);
  assert.equal(ok({ unsubscribed: 1 }).ok, false);
  assert.equal(ok({ reply_type: 'decline' }).ok, false);
  assert.equal(ok({ stage: 'Client' }).ok, false);
  assert.equal(ok({ source: 'canary' }).ok, false);
  assert.equal(ok({ email: '' }).ok, false);
});

test('anyone already written to is refused: their touches belong to follow-up, not a new Email 1', () => {
  const r = ok({ emails_sent: 2 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /already gone/);
});

test('a sequence shorter than the band allowance is refused with the number needed', () => {
  const three = JSON.stringify(JSON.parse(SEQ5).slice(0, 3));
  const r = ok({ email_sequence: three });
  assert.equal(r.ok, false);
  assert.match(r.reason, /P1 allows 4/);
  // An unrated prospect is provisional P2: three stored emails suffice.
  const p2 = ok({ email_sequence: three, rating: '' });
  assert.equal(p2.ok, true, p2.reason);
  assert.equal(p2.band, 'P2');
  assert.equal(p2.provisional, true);
  assert.equal(p2.steps.length, 3);
});

test('no stored sequence means nothing to stage', () => {
  assert.equal(ok({ email_sequence: null }).ok, false);
  assert.equal(ok({ email_sequence: '[]' }).ok, false);
});

test('the corporate family and the em dash are refused by name', () => {
  const seq = JSON.parse(SEQ5);
  seq[1].body = 'Hi Kim.\n\nJust circling back on the booking form.\n\nThanks,\nAry';
  assert.match(ok({ email_sequence: JSON.stringify(seq) }).reason, /"circling back"/);
  const dash = JSON.parse(SEQ5);
  dash[0].body = dash[0].body.replace('Want me', '— want me');
  assert.match(ok({ email_sequence: JSON.stringify(dash) }).reason, /em dash/);
});

test('the package is the canonical shape and reconciliation accepts it whole', () => {
  const fit = ok();
  const f = sequencePackageFields(PROSPECT, fit);
  assert.equal(f.status, 'READY_FOR_APPROVAL');
  assert.equal(f.playbook, SEQUENCE_STAGE_PLAYBOOK);
  assert.equal(f.generatorVersion, SEQUENCE_STAGE_GENERATOR_VERSION);
  assert.equal(f.model, null, 'no model ran, and the record says so');
  assert.equal(f.allowedLength, allowedTouches('P1'));
  assert.deepEqual(f.followups.map((x) => x.step), [2, 3, 4]);
  assert.ok(f.followups.every((x) => x.approved === true));

  const row = {
    id: 51, prospect_id: PROSPECT.id, version: 1,
    status: f.status, status_reason: f.statusReason,
    playbook: f.playbook, why_contact: f.whyContact,
    contact_email: f.contactEmail, email_subject: f.emailSubject, email_body: f.emailBody,
    followups: JSON.stringify(f.followups),
    allowed_length: f.allowedLength, priority_band: f.priorityBand,
    band_was_provisional: f.bandWasProvisional, generator_version: f.generatorVersion,
  };
  const recon = reconcileForApproval(row, PROSPECT);
  assert.equal(recon.status, RECONCILE.READY, JSON.stringify(recon));
  assert.equal(recon.canApproveSequence, true);
});

test('the route stages and nothing more: no send, no approval, no schedule, no model', () => {
  const route = src('../app/api/prospects/[id]/stage-sequence/route.js');
  assert.match(route, /savePackage/);
  assert.match(route, /stageableSequence/);
  for (const forbidden of ['sendMessage', 'buildMime', 'sendApproved', 'approvalPatch', 'scheduled_send_at', 'enqueue(', 'aiKey', 'anthropic']) {
    assert.ok(!route.includes(forbidden), `the stage route must never reach ${forbidden}`);
  }
  const lib = src('../lib/sequence-stage.mjs');
  for (const forbidden of ['fetch(', 'gmail', 'aiKey', 'AUTO_SEND', 'autoSendApproved']) {
    assert.ok(!lib.includes(forbidden), `sequence-stage.mjs must not mention ${forbidden}`);
  }
});

test('the approval list marks staged sequences so the batch can gather them', () => {
  const list = src('../app/api/outreach/route.js');
  assert.match(list, /stagedSequence: r\.playbook === SEQUENCE_STAGE_PLAYBOOK/);
});

test('window.bloom exposes staging beside the sequence it stages', () => {
  const api = src('../lib/bloom-api.mjs');
  assert.match(api, /async stageSequence\(key\)/);
  assert.match(api, /\/stage-sequence`, \{ method: 'POST' \}/);
  assert.match(api, /stageSequence\(key\)\s+→/, 'documented on the surface list');
});

// ── Angle uniqueness ────────────────────────────────────────────────────

test('a sequence with repeated angles is refused', () => {
  const seq = JSON.parse(SEQ5);
  seq[0].angle = 'PAIN_MICRO_OFFER';
  seq[1].angle = 'FIX_SKETCH';
  seq[2].angle = 'FIX_SKETCH';
  seq[3].angle = 'BREAKUP';
  const r = ok({ email_sequence: JSON.stringify(seq) });
  assert.equal(r.ok, false);
  assert.match(r.reason, /[Aa]ngle/);
  assert.match(r.reason, /repeats/i);
});

test('a sequence with all unique known angles stages cleanly', () => {
  const seq = JSON.parse(SEQ5);
  seq[0].angle = 'PAIN_MICRO_OFFER';
  seq[1].angle = 'FIX_SKETCH';
  seq[2].angle = 'VIDEO';
  seq[3].angle = 'BREAKUP';
  const r = ok({ email_sequence: JSON.stringify(seq) });
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.steps.map((s) => s.angle), ['PAIN_MICRO_OFFER', 'FIX_SKETCH', 'VIDEO', 'BREAKUP']);
});

test('angles default from the band rotation when the stored sequence has none', () => {
  const r = ok();
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(r.steps.map((s) => s.angle), ['PAIN_MICRO_OFFER', 'FIX_SKETCH', 'VIDEO', 'BREAKUP']);
});
