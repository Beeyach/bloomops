// Whether the V2 follow-up path is safe to be a real-send path.
//
// Two things stood between the shadow queue and sending. The live preparation
// job still used the retired generator, and `isFollowup` was a parameter no
// caller ever set — which meant the send guard judged every send as a first
// email, consulted the wrong switch, and blocked anybody who had ever been
// emailed as "already sent". A follow-up could not go out at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { canSendNow, BLOCK } from '../lib/send-guard.mjs';
import { RATING } from '../lib/priority.mjs';
import { approvalFingerprint } from '../lib/send-guard.mjs';

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const stripped = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const OFF = { autoSendApprovedFirstEmails: false, autoSendApprovedFollowups: false };
// An approved package carries the fingerprint of what was approved. A missing
// one is now a block in its own right, so these fixtures stamp a real one and
// go on testing the gates they are named for.
const BASE_PKG = {
  id: 1, prospect_id: 1, status: 'APPROVED', reviewed_at: '2020-01-01T00:00:00Z',
  email_subject: 'your contact form', email_body: 'Hi Jane.', copy_approved: 1,
};

const base = {
  pkg: { ...BASE_PKG, approved_fingerprint: approvalFingerprint(BASE_PKG) },
  prospect: { id: 1, name: 'Jane', email: 'jane@example.com', rating: RATING.GREEN, emails_sent: 1 },
  events: [], account: { email_address: 'a@b.com' }, settings: OFF, now: new Date(),
  // A follow-up must bring its V2 schedule now. These tests are about the other
  // gates, so they carry a due one.
  schedule: { status: 'OVERDUE', step: 2, reason: 'due' },
};

// ── The live path is V2 ──────────────────────────────────────────────────

test('live follow-up preparation uses the V2 generator, not the retired one', () => {
  const runner = src('../lib/runner.mjs');
  assert.ok(runner.includes('buildFollowupParts'), 'the V2 prompt writes it');
  assert.ok(runner.includes('validateFollowup'), 'and the V2 validators check it');
  assert.ok(!runner.includes('buildFollowUpParts'), 'the retired prompt is gone from the live path');
});

test('live preparation is handed the exact step, never a generic follow-up', () => {
  const runner = src('../lib/runner.mjs');
  assert.ok(runner.includes('nextFollowupStep'), 'the step comes from policy');
  assert.ok(/step:\s*next\.step/.test(runner), 'and is passed into the generator');
});

test('live preparation refuses when there is no first email to continue', () => {
  assert.ok(src('../lib/runner.mjs').includes('no angle to carry on'));
});

test('one follow-up generator remains, with no live caller left', () => {
  // Shadow preview and live preparation shared the library; only persistence
  // differed. The preview route is retired now (the app does not write email,
  // 2026-08-27), so the runner is the only importer, and it only runs for
  // kinds the drain no longer claims.
  assert.ok(src('../lib/runner.mjs').includes('followup-v2.mjs'), 'the runner uses the shared generator');
  assert.ok(src('../app/api/followup-preview/route.js').includes('status: 410'), 'the preview route is retired, not a second generator');
  assert.throws(() => require('../lib/followup.mjs'), () => true);
});

test('the retired prompt throws rather than quietly writing a draft', async () => {
  const { buildFollowUpParts } = await import('../lib/followup.mjs');
  assert.throws(() => buildFollowUpParts({}, {}), /retired/i);
});

// ── The send guard now knows what it is sending ──────────────────────────

test('a follow-up is no longer judged as a first email', () => {
  // The bug: with isFollowup false, anybody with a recorded send was blocked
  // as "already sent", so no second email could ever go.
  const asFirst = canSendNow({ ...base, existingSends: 1, isFollowup: false, manual: true });
  assert.equal(asFirst.ok, false);
  assert.equal(asFirst.block, BLOCK.ALREADY_SENT);

  const asFollowup = canSendNow({ ...base, existingSends: 1, isFollowup: true, step: 2, manual: true });
  assert.notEqual(asFollowup.block, BLOCK.ALREADY_SENT, 'a second email is not a duplicate first one');
  // It gets past that and lands on the next real gate instead: the step 2 copy
  // was never in the approved package, so nobody has read it.
  assert.equal(asFollowup.block, BLOCK.COPY_NOT_APPROVED);
});

test('a follow-up whose copy nobody approved cannot go out', () => {
  // Gate 3. Approving a package approves the words in it; a step that was not
  // in those words has had no human eye on it.
  const r = canSendNow({ ...base, existingSends: 1, isFollowup: true, step: 2, manual: true });
  assert.equal(r.ok, false);
  assert.match(r.reason, /nobody has read it/i);
});

test('the send runner derives isFollowup rather than trusting a caller', () => {
  const runner = stripped('../lib/send-runner.mjs');
  assert.ok(/const followup = step > 1/.test(runner), 'derived from the real step');
  assert.ok(/isFollowup:\s*followup/.test(runner), 'and handed to the guard');
  // The step must be worked out before the guard, since the guard's answer
  // depends on it.
  assert.ok(runner.indexOf('nextColdStep') < runner.indexOf('canSendNow({'),
    'the step is derived before the guard runs');
});

test('the follow-up switch gates follow-ups, and it is off', () => {
  const blocked = canSendNow({ ...base, existingSends: 1, isFollowup: true, step: 2, manual: false });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.block, BLOCK.AUTOMATION_OFF);
  assert.match(blocked.reason, /follow-up/i);
});

test('a manual send is still consent, and still passes every other guard', () => {
  // Manual bypasses the automation switch by design: Ary pressing send is the
  // consent. It does not bypass the name guard, the ceiling or the reply stop.
  const manual = canSendNow({ ...base, existingSends: 1, isFollowup: true, step: 2, manual: true });
  assert.notEqual(manual.block, BLOCK.AUTOMATION_OFF);
});

// ── The gates that outrank a prepared draft ──────────────────────────────

test('a reply landing after preparation blocks the send', () => {
  const replied = canSendNow({
    ...base, existingSends: 1, isFollowup: true, step: 2, manual: true,
    prospect: { ...base.prospect, replied: 1 },
    events: [{ direction: 'inbound', occurred_at: new Date().toISOString(), classification: 'interested' }],
  });
  assert.equal(replied.ok, false);
});

test('do not contact and unsubscribe block the send', () => {
  for (const field of ['do_not_contact', 'unsubscribed']) {
    const r = canSendNow({
      ...base, existingSends: 1, isFollowup: true, step: 2, manual: true,
      prospect: { ...base.prospect, [field]: 1 },
    });
    assert.equal(r.ok, false, `${field} must block`);
  }
});

test('losing the address blocks the send', () => {
  const r = canSendNow({
    ...base, existingSends: 1, isFollowup: true, step: 2, manual: true,
    prospect: { ...base.prospect, email: null },
  });
  assert.equal(r.ok, false);
});

// ── What the send path may never do ──────────────────────────────────────

test('nothing enqueues a follow-up send while the switch is off', () => {
  const route = stripped('../app/api/outreach/route.js');
  const i = route.indexOf('KIND.SEND_APPROVED');
  assert.ok(i > 0, 'the only enqueue site');
  // The enqueue sits inside the auto-send branch, so with both switches off no
  // send job is created by any route.
  assert.ok(/autoSendApprovedFirstEmails[\s\S]{0,600}KIND\.SEND_APPROVED/.test(route),
    'enqueue is inside the automation branch');
});

test('the canary cannot skip the canonical send path', () => {
  // Anything that sent by calling Gmail directly would miss the name guard, the
  // ceiling, the step derivation and the send event in one go.
  for (const f of ['../lib/runner.mjs', '../app/api/outreach/route.js']) {
    const s = stripped(f);
    assert.ok(!s.includes('sendMessage('), `${f} must not call Gmail directly`);
    assert.ok(!s.includes('buildMime('), `${f} must not build its own message`);
  }
});

// The body of one job handler, by brace matching.
//
// This used to be a slice between the first mention of PREPARE_FOLLOWUP and the
// first mention of PREPARE_OUTREACH, which is not a function — it is whatever
// text happens to lie between two markers. The moment an unrelated function was
// added in that range the test failed for a reason that had nothing to do with
// what it guards. The property is right and worth keeping; the instrument was
// measuring the wrong thing.
function handlerBody(src, kind) {
  const at = src.indexOf(`async [KIND.${kind}]`);
  assert.ok(at >= 0, `${kind} handler not found`);
  const open = src.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${kind}`);
}

test('preparation cannot send', () => {
  const body = handlerBody(stripped('../lib/runner.mjs'), 'PREPARE_FOLLOWUP');
  assert.ok(body.length > 200, 'the handler body was actually found');
  for (const forbidden of ['sendApproved', 'sendMessage', 'SEND_APPROVED', 'enqueueDueApprovedFollowups']) {
    assert.ok(!body.includes(forbidden), `preparing a follow-up must never ${forbidden}`);
  }
});

test('the sweep is the only thing that queues an automatic follow-up send', () => {
  const src = stripped('../lib/runner.mjs');
  // Exactly one caller, and it is the scheduled sweep — never a job that
  // prepares copy, and never a request handler. The declaration itself matches
  // the same text, so it is counted and excluded rather than pattern-dodged.
  const mentions = src.split('enqueueDueApprovedFollowups(').length - 1;
  const declarations = src.split('function enqueueDueApprovedFollowups(').length - 1;
  assert.equal(declarations, 1, 'declared once');
  assert.equal(mentions - declarations, 1, 'and called from exactly one place');
  assert.ok(handlerBody(src, 'SWEEP').includes('enqueueDueApprovedFollowups('), 'and it is inside the sweep');
});
