// The late-follow-up pilot: one final Email 3 for the two-sent AU and US cohorts.
//
// Two kinds of proof live here. The pure rules — eligibility, the caps, the
// validator, the package shape — are exercised directly, because they are the
// strategy written as code and each hard exclusion deserves its own failing
// case. The rest are source pins: the composer cannot send, the drain calls
// the selector, the caps are the numbers Ary was told, and the approval and
// send machinery this rides on refuses everything it always refused.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  eligibleLateFollowup, composeBudget, lateFollowupPilotCap,
  validateLateFollowup, lateFollowupPackageFields, buildLateFollowupParts, parseLateFollowup,
  LATE_FOLLOWUP_PILOT_CAP, LATE_FOLLOWUP_PER_DRAIN, LATE_FOLLOWUP_CAP_SETTING,
  LATE_FOLLOWUP_WINDOW_START, LATE_FOLLOWUP_GENERATOR_VERSION, LATE_FOLLOWUP_STEP,
  LATE_FOLLOWUP_SHAPE, LATE_REJECT,
} from '../lib/late-followup.mjs';
import { reconcileForApproval, approvalPatch, RECONCILE } from '../lib/approval.mjs';
import { canSendNow, approvalFingerprint, BLOCK } from '../lib/send-guard.mjs';
import { allowedTouches, maySendStep, HARD_TOUCH_CEILING, PRIORITY } from '../lib/priority.mjs';
import { GMAIL_SEND_SCOPE } from '../lib/gmail-send.mjs';
import { KIND, PRIORITY as JOB_PRIORITY } from '../lib/queue.mjs';

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const stripped = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── Fixtures: the real cohort's shape ────────────────────────────────────

const OUTBOUND = [
  {
    direction: 'outbound', occurred_at: '2026-08-04T01:47:13.000Z',
    message_id: 'm1', thread_id: 't1', to_address: 'kim@studio.example',
    subject: 'Your discovery call',
  },
  {
    direction: 'outbound', occurred_at: '2026-08-06T03:53:03.000Z',
    message_id: 'm2', thread_id: 't2', to_address: 'kim@studio.example',
    subject: 'After someone books',
  },
];

const PROSPECT = {
  id: 7, name: 'Kim', business_name: 'Studio Seven', email: 'kim@studio.example',
  country: 'AU', stage: 'Email 2', rating: '💚', emails_sent: 2,
  last_contact_date: '2026-08-06', replied: 0, do_not_contact: 0, unsubscribed: 0,
  // The guard's boundary refuses a row missing these columns outright, which
  // is the IncompleteProspect protection working. Present and empty, like the
  // real cohort rows.
  reply_type: null, reply_date: null, next_action_date: null,
};

const EMAIL_1 = {
  subject: 'Your discovery call',
  body: 'Hi Kim.\n\nI was on your site and noticed the discovery call booking goes through the contact form rather than a calendar. Want me to send over what I mean?\n\nThanks,\nAry',
  at: '2026-08-04T01:47:13.000Z',
};
const EMAIL_2 = {
  subject: 'After someone books',
  body: 'Hi Kim.\n\nStill happy to send the note about the discovery call booking on your site if useful.\n\nThanks,\nAry',
  at: '2026-08-06T03:53:03.000Z',
};

const GOOD_DRAFT = [
  'Hi Kim.',
  '',
  "Just one last note about the discovery call booking on your site. If you ever want help with it, I'm around. If that's already handled, ignore me, I won't email you about it again.",
  '',
  'Thanks,',
  'Ary',
].join('\n');

const ok = (over = {}, ctx = {}) =>
  eligibleLateFollowup({ ...PROSPECT, ...over }, { outbound: OUTBOUND, events: null, ...ctx });

// ── The strategy's ceilings, pinned ──────────────────────────────────────

test('P1 allows four touches, and email 5 does not exist', () => {
  assert.equal(allowedTouches('P1'), 4);
  assert.equal(allowedTouches('P2'), 3);
  assert.equal(allowedTouches('P3'), 1);
  assert.equal(HARD_TOUCH_CEILING, 4);
  assert.equal(LATE_FOLLOWUP_STEP, 3);
  assert.equal(maySendStep('P1', 5).ok, false);
});

// ── Eligibility: the happy path, then every hard exclusion ───────────────

test('the clean cohort member is eligible, as a confident P1', () => {
  const r = ok();
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.band, 'P1');
  assert.equal(r.outbound.length, 2);
});

test('emails_sent past 2, in any form, is excluded', () => {
  assert.equal(ok({ emails_sent: 3 }).ok, false);
  assert.equal(ok({ emails_sent: 5 }).ok, false);
  assert.equal(ok({ emails_sent: 1 }).ok, false);
  assert.equal(ok({ emails_sent: 0 }).ok, false);
});

test('a reply of any kind ends cold outreach forever', () => {
  assert.equal(ok({ replied: 1 }).ok, false);
  // An inbound sitting in the events blocks too, whatever the row says.
  const withReply = ok({}, {
    events: [...OUTBOUND, { direction: 'inbound', occurred_at: '2026-08-07T00:00:00.000Z' }],
  });
  assert.equal(withReply.ok, false);
});

test('do_not_contact, unsubscribed, decline and defer are all hard stops', () => {
  assert.equal(ok({ do_not_contact: 1 }).ok, false);
  assert.equal(ok({ unsubscribed: 1 }).ok, false);
  assert.equal(ok({ reply_type: 'decline' }).ok, false);
  assert.equal(ok({ reply_type: 'defer' }).ok, false);
});

test('every closed or conversational stage is excluded', () => {
  for (const stage of ['Client', 'Rejected', 'Not This Offer', 'Lost', 'Invalid Email', 'Finished', 'Interested', 'Proposal Sent', 'Setup Check']) {
    assert.equal(ok({ stage }).ok, false, `${stage} must exclude`);
  }
});

test('anyone whose contact history ended before the window is excluded', () => {
  assert.equal(LATE_FOLLOWUP_WINDOW_START, '2026-08-05');
  assert.equal(ok({ last_contact_date: '2026-08-04' }).ok, false);
  assert.equal(ok({ last_contact_date: '2026-07-20' }).ok, false);
});

test('AU and US only, and never the internal test rows', () => {
  assert.equal(ok({ country: 'US' }).ok, true);
  assert.equal(ok({ country: 'USA' }).ok, true);
  assert.equal(ok({ country: 'NZ' }).ok, false);
  assert.equal(ok({ country: 'GB' }).ok, false);
  assert.equal(ok({ country: 'Australia' }).ok, true);
  assert.equal(ok({ source: 'canary' }).ok, false);
  assert.equal(ok({ domain: 'example.invalid' }).ok, false);
});

test('an uncertain band excludes rather than guesses', () => {
  // Unrated means provisional P2: the widest plan, never a confident P1.
  const unrated = ok({ rating: '' });
  assert.equal(unrated.ok, false);
  assert.match(unrated.reason, /provisional|Excluded/i);
  // Rated anything but green is simply not P1.
  assert.equal(ok({ rating: '✖️' }).ok, false);
  assert.equal(ok({ rating: '💙' }).ok, false);
  // A stored band wins over the rating, exactly as effectiveBand says it does.
  assert.equal(ok({ priority_band: 'P2' }).ok, false);
});

test('a history the mailbox disagrees with is excluded', () => {
  assert.equal(ok({}, { outbound: OUTBOUND.slice(0, 1) }).ok, false, 'counter says 2, mailbox shows 1');
  assert.equal(ok({}, { outbound: [...OUTBOUND, { ...OUTBOUND[1], message_id: 'm3', occurred_at: '2026-08-08T00:00:00.000Z' }] }).ok, false, 'mailbox shows 3');
  assert.equal(ok({}, { outbound: [OUTBOUND[0], { ...OUTBOUND[1], thread_id: '' }] }).ok, false, 'no thread to reply into');
  assert.equal(ok({}, { outbound: [OUTBOUND[0], { ...OUTBOUND[1], message_id: '' }] }).ok, false, 'no message identity');
  assert.equal(ok({}, { outbound: [OUTBOUND[0], { ...OUTBOUND[1], to_address: 'other@else.example' }] }).ok, false, 'thread belongs to another address');
});

// ── The caps ─────────────────────────────────────────────────────────────

test('the pilot composes at most five per drain and stops at fifteen', () => {
  assert.equal(LATE_FOLLOWUP_PILOT_CAP, 15);
  assert.equal(LATE_FOLLOWUP_PER_DRAIN, 5);
  assert.equal(composeBudget({}), 5);
  assert.equal(composeBudget({ existing: 12 }), 3);
  assert.equal(composeBudget({ existing: 15 }), 0);
  assert.equal(composeBudget({ existing: 20 }), 0);
  // In-flight compositions count against both bounds, or 15 done plus 5
  // queued would make 20.
  assert.equal(composeBudget({ existing: 13, inFlight: 2 }), 0);
  assert.equal(composeBudget({ inFlight: 2 }), 3);
});

test('the cap lifts only through the named setting', () => {
  assert.equal(LATE_FOLLOWUP_CAP_SETTING, 'lateFollowupPilotCap');
  assert.equal(lateFollowupPilotCap({}), 15);
  assert.equal(lateFollowupPilotCap({ lateFollowupPilotCap: 40 }), 40);
  assert.equal(lateFollowupPilotCap({ lateFollowupPilotCap: 'nonsense' }), 15);
  assert.equal(lateFollowupPilotCap({ lateFollowupPilotCap: -3 }), 15);
  assert.equal(composeBudget({ cap: lateFollowupPilotCap({ lateFollowupPilotCap: 40 }), existing: 15 }), 5);
});

// ── The validator ────────────────────────────────────────────────────────

test('the approved shape, grounded in the real first email, passes', () => {
  const r = validateLateFollowup(GOOD_DRAFT, { prospect: PROSPECT, email1: EMAIL_1 });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
});

const codesOf = (draft) =>
  validateLateFollowup(draft, { prospect: PROSPECT, email1: EMAIL_1 }).problems.map((p) => p.code);

test('the register rules hold: no em dash, no exclamation, no semicolon, no link', () => {
  assert.ok(codesOf(GOOD_DRAFT.replace('I\'m around', 'I\'m around — truly')).includes(LATE_REJECT.EM_DASH));
  assert.ok(codesOf(GOOD_DRAFT.replace('I\'m around.', 'I\'m around!')).includes(LATE_REJECT.EXCLAMATION));
  assert.ok(codesOf(GOOD_DRAFT.replace('I\'m around.', 'I\'m around; truly.')).includes(LATE_REJECT.SEMICOLON));
  assert.ok(codesOf(GOOD_DRAFT.replace('your site', 'https://studio.example')).includes(LATE_REJECT.LINK));
});

test('it must end Thanks, Ary and it must carry an escape hatch', () => {
  assert.ok(codesOf(GOOD_DRAFT.replace(/Thanks,\nAry$/, 'Cheers,\nAry')).includes(LATE_REJECT.NO_SIGN_OFF));
  const noHatch = [
    'Hi Kim.',
    '',
    'One more thought on the discovery call booking setup on your site, since booking through the site still matters and worth another look sometime soon.',
    '',
    'Thanks,',
    'Ary',
  ].join('\n');
  assert.ok(codesOf(noHatch).includes(LATE_REJECT.NO_ESCAPE_HATCH));
});

test('it may not repeat Email 1, change the subject, or promise a new asset', () => {
  // Word for word again is a repeat, not a close.
  assert.equal(validateLateFollowup(EMAIL_1.body, { prospect: PROSPECT, email1: EMAIL_1 }).ok, false);
  // Nothing connecting it to Email 1 means it changed the subject.
  const offAngle = [
    'Hi Kim.',
    '',
    "Just one last note about maybe working together sometime. If you ever want help, I'm around. If that's already handled, ignore me, I won't email you about it again.",
    '',
    'Thanks,',
    'Ary',
  ].join('\n');
  assert.equal(validateLateFollowup(offAngle, { prospect: PROSPECT, email1: EMAIL_1 }).ok, false);
  // A video Email 1 never offered may not appear now.
  const asset = GOOD_DRAFT.replace('I\'m around.', 'I can send a video walkthrough, I\'m around.');
  assert.equal(validateLateFollowup(asset, { prospect: PROSPECT, email1: EMAIL_1 }).ok, false);
});

test('the never-write list still applies', () => {
  assert.equal(validateLateFollowup(
    GOOD_DRAFT.replace('Just one last note about', 'Just checking in about'),
    { prospect: PROSPECT, email1: EMAIL_1 }
  ).ok, false);
  assert.equal(validateLateFollowup(
    GOOD_DRAFT.replace("I won't email you about it again", 'this is my final follow-up'),
    { prospect: PROSPECT, email1: EMAIL_1 }
  ).ok, false);
});

test('the corporate register Ary rejected is refused by name', () => {
  for (const phrase of ['Closing the loop on', 'Circling back on', 'Touching base about']) {
    const codes = codesOf(GOOD_DRAFT.replace('Just one last note about', phrase));
    assert.ok(
      codes.includes(LATE_REJECT.CORPORATE) || codes.includes('BANNED_PHRASE'),
      `"${phrase}" must be refused, got ${JSON.stringify(codes)}`
    );
  }
  // And the shape itself is the plain one, so the model is never handed the
  // phrase it is banned from writing.
  assert.match(LATE_FOLLOWUP_SHAPE, /Just one last note about/);
  assert.ok(!/closing the loop|circling back/i.test(LATE_FOLLOWUP_SHAPE));
});

test('the prompt hands the model both sent emails and the one approved shape', () => {
  const { system, user } = buildLateFollowupParts({}, PROSPECT, { email1: EMAIL_1, email2: EMAIL_2 });
  assert.ok(system.includes(LATE_FOLLOWUP_SHAPE), 'the shape shown to Ary is the shape given to the model');
  assert.ok(system.includes('END WITH EXACTLY'));
  assert.ok(user.includes(EMAIL_1.body), 'Email 1 verbatim');
  assert.ok(user.includes(EMAIL_2.body), 'Email 2 verbatim');
  assert.ok(user.includes('Kim'));
});

test('parsing strips wrappers and refuses emptiness', () => {
  assert.equal(parseLateFollowup(`BODY:\n${GOOD_DRAFT}`).body, GOOD_DRAFT);
  assert.equal(parseLateFollowup('```\nHi Kim.\n```').body, 'Hi Kim.');
  assert.equal(parseLateFollowup('   ').ok, false);
});

// ── The package rides the real approval machinery ────────────────────────

const packageRow = (draft = GOOD_DRAFT) => {
  const f = lateFollowupPackageFields(PROSPECT, { email1: EMAIL_1, email2: EMAIL_2, draft, model: 'test' });
  return {
    id: 41, prospect_id: PROSPECT.id, version: 1,
    status: f.status, status_reason: f.statusReason,
    playbook: f.playbook, why_contact: f.whyContact,
    contact_email: f.contactEmail, email_subject: f.emailSubject, email_body: f.emailBody,
    followups: JSON.stringify(f.followups),
    allowed_length: f.allowedLength, priority_band: f.priorityBand,
    band_was_provisional: f.bandWasProvisional, generator_version: f.generatorVersion,
  };
};

test('the package is the canonical shape: real emails 1 and 2, the draft as step 3', () => {
  const f = lateFollowupPackageFields(PROSPECT, { email1: EMAIL_1, email2: EMAIL_2, draft: GOOD_DRAFT, model: 'test' });
  assert.equal(f.status, 'READY_FOR_APPROVAL');
  assert.equal(f.emailBody, EMAIL_1.body, 'Email 1 verbatim, never rewritten');
  assert.equal(f.allowedLength, 4);
  assert.equal(f.priorityBand, 'P1');
  assert.equal(f.generatorVersion, LATE_FOLLOWUP_GENERATOR_VERSION);
  assert.deepEqual(f.followups.map((x) => x.step), [2, 3]);
  assert.equal(f.followups[0].body, EMAIL_2.body, 'Email 2 verbatim');
  assert.equal(f.followups[1].body, GOOD_DRAFT);
  assert.ok(f.followups.every((x) => x.approved === true));
});

test('reconciliation reports P1 partial because step 4 has not been written', () => {
  const recon = reconcileForApproval(packageRow(), PROSPECT);
  assert.equal(recon.status, RECONCILE.PARTIAL);
  assert.equal(recon.finalBand, 'P1');
  assert.equal(recon.finalLength, 4);
  assert.equal(recon.canApprove, true);
  assert.equal(recon.canApproveSequence, false);
});

test('approval writes partial consent because step 4 copy is missing', () => {
  const row = packageRow();
  const patched = approvalPatch(row, PROSPECT, { at: '2026-08-18 00:00:00' });
  assert.equal(patched.ok, true);
  assert.equal(patched.patch.sequence_approved, 0);
  assert.equal(patched.patch.sequence_max_step, null);
  assert.equal(patched.patch.allowed_length, 4);

  const approved = { ...row, ...patched.patch };
  assert.equal(approvalFingerprint(approved), approved.approved_fingerprint, 'the stored row matches its own fingerprint');

  // Change one word of the draft after approval and the approval goes stale.
  const followups = JSON.parse(approved.followups);
  followups[1].body = followups[1].body.replace('around', 'nearby');
  const edited = { ...approved, followups: JSON.stringify(followups) };
  assert.notEqual(approvalFingerprint(edited), approved.approved_fingerprint);
});

// ── The send guard keeps every refusal ───────────────────────────────────

const approvedRow = () => {
  const row = packageRow();
  return { ...row, ...approvalPatch(row, PROSPECT, { at: '2026-08-18 00:00:00' }).patch };
};

// Tuesday 10:30 in Los Angeles: inside the window, on a sending day.
// Wednesday 09:30 in Sydney, and Tuesday 16:30 in Pacific: inside the send
// window on both clocks.
//
// This used to be 17:30Z, which is 03:30 in Sydney. The prospect below is AU,
// so the suite was asserting that a follow-up could go to an Australian
// business at half past three in the morning. It passed only because the guard
// read the workspace's Pacific hours and never the recipient's.
const NOW = new Date('2026-08-18T23:30:00Z');
const OFF = { autoSendApprovedFirstEmails: false, autoSendApprovedFollowups: false };
const ACCOUNT = {
  email_address: 'hello@bloomwired.io', status: 'connected',
  scope: `https://www.googleapis.com/auth/gmail.readonly ${GMAIL_SEND_SCOPE}`,
  // Kept just inside the reply-staleness window relative to NOW below.
  last_sync_at: '2026-08-18T23:25:00.000Z',
};
const sendArgs = (over = {}) => ({
  pkg: approvedRow(), prospect: { ...PROSPECT }, events: [], settings: OFF, account: ACCOUNT,
  now: NOW, isFollowup: true, step: 3, existingSends: 2, manual: true,
  schedule: { status: 'OVERDUE', step: 3, reason: 'day 10 has passed' },
  ...over,
});

test('a manual, due, approved Email 3 may go', () => {
  const r = canSendNow(sendArgs());
  assert.equal(r.ok, true, `${r.block}: ${r.reason}`);
  assert.equal(r.step, 3);
});

test('the machine cannot send it while the automation switches stay off', () => {
  const r = canSendNow(sendArgs({ manual: false }));
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.AUTOMATION_OFF);
});

test('a reply arriving before the send cancels the follow-up', () => {
  const r = canSendNow(sendArgs({
    events: [
      { direction: 'outbound', occurred_at: '2026-08-06T03:53:03.000Z' },
      { direction: 'inbound', occurred_at: '2026-08-18T12:00:00.000Z' },
    ],
  }));
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.UNANSWERED_REPLY);
});

test('there is no email 4, even under this approval', () => {
  const r = canSendNow(sendArgs({ step: 4, schedule: { status: 'OVERDUE', step: 4 } }));
  assert.equal(r.ok, false);
  assert.ok([BLOCK.COPY_NOT_APPROVED, BLOCK.PAST_ALLOWED_LENGTH].includes(r.block));
});

test('the schedule is enforced at send time: not due means not sent', () => {
  const r = canSendNow(sendArgs({ schedule: { status: 'NOT_DUE_YET', step: 3, reason: 'day 10 is tomorrow' } }));
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.NOT_DUE);
});

test('copy edited after approval goes stale and is refused', () => {
  const pkg = approvedRow();
  const followups = JSON.parse(pkg.followups);
  followups[1].body = 'Different words nobody read.';
  const r = canSendNow(sendArgs({ pkg: { ...pkg, followups: JSON.stringify(followups) } }));
  assert.equal(r.ok, false);
  assert.equal(r.block, BLOCK.STALE_APPROVAL);
});

// ── Source pins: the composer cannot send, and the drain is bounded ──────

function handlerBody(source, kind) {
  const at = source.indexOf(`async [KIND.${kind}]`);
  assert.ok(at >= 0, `${kind} handler not found`);
  const open = source.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${kind}`);
}

test('composition cannot send, schedule a send, or touch the automation switches', () => {
  const body = handlerBody(stripped('../lib/runner.mjs'), 'LATE_FOLLOWUP');
  assert.ok(body.length > 200, 'the handler body was actually found');
  for (const forbidden of [
    'sendApproved', 'sendMessage', 'buildMime', 'SEND_APPROVED',
    'enqueueDueApprovedFollowups', 'scheduled_send_at',
    'autoSendApprovedFollowups', 'autoSendApprovedFirstEmails', 'auto_followup_approved',
  ]) {
    assert.ok(!body.includes(forbidden), `the composer must never reach ${forbidden}`);
  }
  assert.ok(body.includes('savePackage'), 'it writes through the canonical package path');
  assert.ok(body.includes('recordSend'), 'and records the observed history through the canonical ledger');
});

test('the library itself has no path to Gmail and no opinion about the switches', () => {
  const s = stripped('../lib/late-followup.mjs');
  for (const forbidden of ['gmail-send', 'send-runner', 'sendMessage(', 'buildMime(', 'autoSendApproved', 'AUTO_SEND']) {
    assert.ok(!s.includes(forbidden), `late-followup.mjs must not mention ${forbidden}`);
  }
});

test('the drafts it writes wait for a person: READY_FOR_APPROVAL or NEEDS_DECISION, never APPROVED', () => {
  const body = handlerBody(stripped('../lib/runner.mjs'), 'LATE_FOLLOWUP');
  assert.ok(!body.includes('STATUS.APPROVED'), 'composition never approves its own work');
  assert.ok(!body.includes('approvalPatch'), 'and never writes an approval record');
  assert.ok(!body.includes('approved_fingerprint'), 'and never stamps a fingerprint nobody consented to');
});

test('the selector carries every hard exclusion in SQL', () => {
  const s = src('../lib/late-followup.mjs');
  for (const pin of [
    'p.emails_sent = 2',
    "COALESCE(p.replied, 0) = 0",
    "COALESCE(p.do_not_contact, 0) = 0",
    "COALESCE(p.unsubscribed, 0) = 0",
    "'canary'",
    "'example.invalid'",
    "'Client','Rejected','Not This Offer','Lost','Invalid Email','Finished'",
    'p.deleted_at IS NULL',
    "IN ('AU','Australia','US','USA','United States')",
  ]) {
    assert.ok(s.includes(pin), `selector must pin: ${pin}`);
  }
  assert.ok(s.includes(`p.last_contact_date >= '\${LATE_FOLLOWUP_WINDOW_START}'`), 'the window is the named constant');
});

test('the drain no longer runs the selector; the library keeps its shape', () => {
  // The selector queued paid compositions on its own schedule, which is the
  // class of thing Ary ended on 2026-08-27. The library stays importable for
  // its history and its tests; nothing calls it from the cron.
  const drain = stripped('../app/api/cron/drain/route.js');
  assert.ok(!drain.includes('enqueueLateFollowups'), 'the drain must not feed the pilot');
  const lib = stripped('../lib/late-followup.mjs');
  assert.ok(lib.includes('KIND.LATE_FOLLOWUP'), 'the library still names its kind');
  assert.equal(KIND.LATE_FOLLOWUP, 'late-followup');
  assert.ok(Number.isFinite(JOB_PRIORITY.LATE_FOLLOWUP), 'the job kind keeps a priority so history sorts sanely');
});

test('one composition per prospect, ever, so a discarded draft stays discarded', () => {
  const lib = src('../lib/late-followup.mjs');
  assert.ok(lib.includes('k2.generator_version'), 'the selector excludes anyone with a pilot package in any status');
  const body = handlerBody(stripped('../lib/runner.mjs'), 'LATE_FOLLOWUP');
  assert.ok(body.includes('already-composed'), 'and the handler re-checks it at run time');
});

test('a refused prospect rests half a day instead of looping every drain', () => {
  // The handler answers "not eligible" as a clean completion, so the selector
  // has to pace done jobs as well as failed ones or the four known
  // counter-mismatch prospects would be re-enqueued every five minutes
  // forever, each time taking a slot the cap meant for a real composition.
  const lib = stripped('../lib/late-followup.mjs');
  assert.ok(lib.includes(`j.status IN ('failed', 'done')`), 'done and failed both rest');
  assert.ok(lib.includes(`'-12 hours'`), 'for half a day');
});

test('the batch review approves through the one existing action and adds no send path', () => {
  const queue = src('../components/ApprovalQueue.jsx');
  assert.ok(queue.includes('approveAllLate'), 'the batch control exists');
  assert.ok(queue.includes("action: 'approve', approveSequence: true"), 'and it is the ordinary sequence approval per package');
  // Exactly one place in the file names the send action: the per-row button
  // that already existed. The batch adds none.
  assert.equal((queue.match(/action: 'send'/g) || []).length, 1);
  assert.ok(queue.includes('LATE_FOLLOWUP_SHAPE'), 'the shape Ary reads is the shape the model was given');
  assert.ok(queue.includes("act(i, 'skip')"), 'discarding one row is the ordinary skip');
  // The same tap grants the per-package automation consent through the
  // existing arm action, with its own server-side shape check. Approval alone
  // still never implies it, and the button says which mode it is in.
  assert.ok(queue.includes("action: 'auto-followup', allow: true"), 'the batch arms what it approves');
  assert.ok(queue.includes('data.automation?.followups'), 'the label reads the real switch, never assumes it');
  // Skill-staged sequences ride the same batch, through the same actions.
  assert.ok(queue.includes('i.lateFollowup || i.stagedSequence'), 'staged sequences join the one batch');
});

test('the auto-send switch lives in Settings, defaults off, and only Ary flips it', () => {
  const view = src('../components/SettingsView.jsx');
  assert.match(view, /Auto-send approved follow-ups/);
  assert.match(view, /patch\(\{ autoSendApprovedFollowups: !settings\.autoSendApprovedFollowups \}\)/);
  assert.ok(!view.includes('/api/outreach'), 'the settings page never reaches the outreach actions');
  // The words next to the switch tell the truth about its bounds.
  assert.match(view, /word for word/);
  assert.match(view, /If someone replies first/);
});

test('band evaluation asks priority.mjs, never its own table', () => {
  const s = stripped('../lib/late-followup.mjs');
  assert.ok(s.includes('effectiveBand'), 'the band comes from the canonical helper');
  assert.ok(s.includes('allowedTouches'), 'and the ceiling from the canonical table');
  assert.ok(!/TOUCHES\s*=/.test(s), 'no second touch table exists here');
  assert.ok(PRIORITY.P1 === 'P1');
});
