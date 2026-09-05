// The next cold email: which one may exist, and whether the draft is usable.
//
// The old path had no step identity, never saw Email 1, and had no ceiling, so
// there was nothing to test. These are the rules that replace it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  legalSteps, nextFollowupStep, firstEmailOf, buildFollowupParts, parseFollowup,
  validateFollowup, packageShape, REJECT, MIN_WORDS, MAX_WORDS,
} from '../lib/followup-v2.mjs';
import { RATING, PRIORITY } from '../lib/priority.mjs';
import { NEXT } from '../lib/cutover.mjs';
import { REL } from '../lib/relationship.mjs';
import { todayIso } from '../lib/due.mjs';

const { GREEN, BLUE, CROSS } = RATING;
const base = { name: 'Jane', email: 'jane@example.com', last_contact_date: todayIso() };
const p = (o) => ({ ...base, ...o });

const FIRST = {
  subject: 'your contact form',
  body: 'Hi Jane,\n\nI had a look at your contact form and it did not submit when I tried it.\n\nWant me to send you a short rundown of what I would change? If that is already sorted, ignore me.\n\nThanks,\nAry',
};
const step2 = (o = {}) => ({
  prospect: p({ rating: GREEN, emails_sent: 1 }), step: 2, ceiling: 4, firstEmail: FIRST, eligible: true, ...o,
});
const ok = (body) => ({ subject: 'your contact form', body });

// ── Which steps may exist ────────────────────────────────────────────────

test('a band gets exactly the steps it allows, and no more', () => {
  assert.deepEqual(legalSteps(p({ rating: GREEN })), [1, 2, 3, 4]);
  assert.deepEqual(legalSteps(p({ rating: BLUE })), [1, 2, 3]);
  assert.deepEqual(legalSteps(p({ rating: CROSS })), [1]);
});

test('there is no email 5 or 6 for anybody', () => {
  for (const rating of [GREEN, BLUE, CROSS, '', null]) {
    const steps = legalSteps(p({ rating }));
    assert.ok(!steps.includes(5), `${rating} must never reach step 5`);
    assert.ok(!steps.includes(6), `${rating} must never reach step 6`);
    assert.ok(steps.length <= 4);
  }
});

test('the next step is the one the policy says, or none', () => {
  assert.equal(nextFollowupStep({ prospect: p({ rating: GREEN, emails_sent: 1 }), contactOk: true }).step, 2);
  assert.equal(nextFollowupStep({ prospect: p({ rating: GREEN, emails_sent: 2 }), contactOk: true }).step, 3);
  assert.equal(nextFollowupStep({ prospect: p({ rating: GREEN, emails_sent: 3 }), contactOk: true }).step, 4);
  assert.equal(nextFollowupStep({ prospect: p({ rating: GREEN, emails_sent: 4 }), contactOk: true }).step, null);
  assert.equal(nextFollowupStep({ prospect: p({ rating: BLUE, emails_sent: 1 }), contactOk: true }).step, 2);
  assert.equal(nextFollowupStep({ prospect: p({ rating: BLUE, emails_sent: 2 }), contactOk: true }).step, 3);
  assert.equal(nextFollowupStep({ prospect: p({ rating: BLUE, emails_sent: 3 }), contactOk: true }).step, null);
  assert.equal(nextFollowupStep({ prospect: p({ rating: CROSS, emails_sent: 1 }), contactOk: true }).step, null);
});

test('a ✖️ prospect who has had one email can never be written to again', () => {
  const r = nextFollowupStep({ prospect: p({ rating: CROSS, emails_sent: 1 }), contactOk: true });
  assert.equal(r.step, null);
  assert.equal(r.ceiling, 1);
  assert.equal(r.decision.next, NEXT.NO_ACTION_COMPLETE);
});

test('nobody who owes a person a reply gets a cold follow-up', () => {
  assert.equal(nextFollowupStep({ prospect: p({ rating: GREEN, emails_sent: 1, replied: 1 }), contactOk: true }).step, null);
  for (const state of [REL.INTERESTED, REL.AMBIGUOUS, REL.BUDGET_CONCERN, REL.RECONSIDERED, REL.ACCEPTED_OFFER]) {
    assert.equal(
      nextFollowupStep({ prospect: p({ rating: GREEN, emails_sent: 1 }), relationship: { state }, contactOk: true }).step,
      null, `${state} must not generate`);
  }
});

test('closed, deferred and unreachable all generate nothing', () => {
  assert.equal(nextFollowupStep({ prospect: p({ rating: GREEN, emails_sent: 1, do_not_contact: 1 }), contactOk: true }).step, null);
  assert.equal(nextFollowupStep({ prospect: p({ rating: GREEN, emails_sent: 1, unsubscribed: 1 }), contactOk: true }).step, null);
  assert.equal(nextFollowupStep({ prospect: p({ rating: GREEN, emails_sent: 1 }), contactOk: false }).step, null);
  assert.equal(nextFollowupStep({
    prospect: p({ rating: GREEN, emails_sent: 1 }),
    relationship: { state: REL.DEFERRED, deferredUntil: '2099-01-01' }, contactOk: true,
  }).step, null);
});

// ── Email 1, the angle of record ─────────────────────────────────────────

test('email 1 is read from a package first, then the legacy sequence', () => {
  const pkg = { email_subject: 'from package', email_body: 'Hi Jane, package body.' };
  assert.equal(firstEmailOf({}, { pkg }).source, 'package');

  const legacy = { email_sequence: JSON.stringify([{ number: 1, subject: 'from sequence', body: 'Hi Jane, sequence body.' }]) };
  const got = firstEmailOf(legacy);
  assert.equal(got.source, 'email_sequence');
  assert.equal(got.subject, 'from sequence');

  // Every prospect currently owed a follow-up predates packages, so losing this
  // fallback would mean generating with no angle at all.
  assert.equal(firstEmailOf({}).source, null);
});

// ── The prompt ───────────────────────────────────────────────────────────

test('the prompt is told the step, the ceiling and the whole first email', () => {
  const { system, user } = buildFollowupParts({}, p({ rating: GREEN, emails_sent: 1 }),
    { step: 2, ceiling: 4, firstEmail: FIRST });
  assert.match(system, /email 2 of at most 4/);
  assert.match(system, /30 to 50 words/);
  assert.ok(user.includes(FIRST.body), 'the first email goes in verbatim');
});

test('the last email is told it is last, and told not to say so', () => {
  const { system } = buildFollowupParts({}, p({ rating: GREEN, emails_sent: 3 }),
    { step: 4, ceiling: 4, firstEmail: FIRST });
  assert.match(system, /It is the last one/);
  assert.match(system, /must not be told that/);
});

test('the model is never asked how long the sequence should be', () => {
  const { system, user } = buildFollowupParts({}, p({ rating: GREEN }), { step: 2, ceiling: 4, firstEmail: FIRST });
  for (const s of [system, user]) {
    assert.ok(!/how many emails/i.test(s));
    assert.ok(!/decide.*sequence/i.test(s));
  }
});

test('with nothing verified the prompt forbids new detail about their site', () => {
  const { system } = buildFollowupParts({}, p({}), { step: 2, ceiling: 4, firstEmail: FIRST, strength: null });
  assert.match(system, /NO verified facts about their website/);
  assert.match(system, /Do not describe, guess at, or imply/);
});

// ── Parsing ──────────────────────────────────────────────────────────────

test('a draft that is not the right shape is refused rather than used', () => {
  assert.equal(parseFollowup('just some prose').ok, false);
  assert.equal(parseFollowup('SUBJECT: hi\nBODY:\n').ok, false);
  const good = parseFollowup('SUBJECT: your contact form\nBODY:\nHi Jane, still happy to send that.');
  assert.equal(good.ok, true);
  assert.equal(good.subject, 'your contact form');
});

// ── Validators ───────────────────────────────────────────────────────────

const GOOD = 'Hi Jane.\n\nStill happy to send that rundown on the contact form whenever you want it. No rush at all. How are enquiries reaching you at the moment?';

test('a good follow-up passes', () => {
  const v = validateFollowup(ok(GOOD), step2());
  assert.equal(v.ok, true, JSON.stringify(v.problems));
  assert.ok(v.words >= MIN_WORDS && v.words <= MAX_WORDS);
});

test('a step past the ceiling is refused', () => {
  const v = validateFollowup(ok(GOOD), step2({ step: 5 }));
  assert.ok(v.problems.some((x) => x.code === REJECT.STEP_ILLEGAL));
});

test('an ineligible prospect is refused even with perfect copy', () => {
  const v = validateFollowup(ok(GOOD), step2({ eligible: false }));
  assert.ok(v.problems.some((x) => x.code === REJECT.NOT_ELIGIBLE));
});

test('an empty body is refused', () => {
  const v = validateFollowup(ok('   '), step2());
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((x) => x.code === REJECT.EMPTY));
});

test('the never-write phrases are caught', () => {
  for (const phrase of ['just circling back', 'bumping this', 'I have not heard back', 'last chance',
    'before I close your file', 'I hope this email finds you well', 'touching base']) {
    const v = validateFollowup(ok(`Hi Jane.\n\n${phrase} about the contact form rundown I offered you last week. Let me know either way please.`), step2());
    assert.ok(v.problems.some((x) => x.code === REJECT.BANNED_PHRASE), `"${phrase}" must be caught`);
  }
});

test('claims about an industry nobody counted are caught', () => {
  for (const claim of ['Most coaches lose enquiries this way', '40% of businesses never reply',
    '3 out of 4 clinics miss them', 'Studies show this costs money']) {
    const v = validateFollowup(ok(`Hi Jane.\n\n${claim}. Still happy to send that contact form rundown whenever suits you best.`), step2());
    assert.ok(v.problems.some((x) => x.code === REJECT.UNSUPPORTED_CLAIM), `"${claim}" must be caught`);
  }
});

test('knowing what businesses like theirs do is caught, number or not', () => {
  // This is the one a real draft got past. "how other centers handle that gap"
  // has no statistic in it, so the numbers check saw nothing wrong, and it is
  // still the same move: implying we have counted an industry we have not.
  const real = 'Hi Jane. Still curious whether that first reply on your contact form is automated. Happy to share how other centers handle that gap if useful.';
  const v = validateFollowup(ok(real), step2());
  assert.ok(v.problems.some((x) => x.code === REJECT.THIRD_PARTY_CLAIM), 'the soft version must be caught too');

  for (const claim of ['how other studios handle this', 'what most clinics do about it',
    'a few other businesses had the same contact form issue', 'others in your position solve this']) {
    const body = `Hi Jane.

Still happy to send that contact form rundown. ${claim}, if that helps at all here.`;
    assert.ok(validateFollowup(ok(body), step2()).problems.some((x) => x.code === REJECT.THIRD_PARTY_CLAIM),
      `"${claim}" must be caught`);
  }
});

test('talking about our own work is still allowed', () => {
  // The rule is about claiming knowledge of their industry, not about Ary
  // describing what she would do.
  const fine = 'Hi Jane. Still happy to share what I would check first on that contact form, whenever it is useful to you.';
  const v = validateFollowup(ok(fine), step2());
  assert.ok(!v.problems.some((x) => x.code === REJECT.THIRD_PARTY_CLAIM), JSON.stringify(v.problems));
});

test('a video or PDF cannot be offered unless the first email offered one', () => {
  const bad = 'Hi Jane.\n\nI recorded a short video showing the contact form problem. Want me to send it over whenever you have a minute?';
  assert.ok(validateFollowup(ok(bad), step2()).problems.some((x) => x.code === REJECT.ASSET_PROMISE));

  // Allowed when Email 1 already promised exactly that.
  const promised = { ...FIRST, body: `${FIRST.body}\n\nI can record a quick video of it if that helps.` };
  const v = validateFollowup(ok(bad), step2({ firstEmail: promised }));
  assert.ok(!v.problems.some((x) => x.code === REJECT.ASSET_PROMISE));
});

test('sending the first email again is caught', () => {
  const v = validateFollowup(ok(FIRST.body), step2());
  assert.ok(v.problems.some((x) => x.code === REJECT.REPEATS_FIRST));
});

test('changing the subject entirely is caught', () => {
  const off = 'Hi Jane.\n\nHave you thought about your pricing page and whether the packages listed there still match what you actually charge people now?';
  const v = validateFollowup(ok(off), step2());
  assert.ok(v.problems.some((x) => x.code === REJECT.OFF_ANGLE));
});

test('a greeting naming somebody else is caught', () => {
  const v = validateFollowup(ok('Hi Michael.\n\nStill happy to send that contact form rundown whenever you want it. How are enquiries reaching you now?'), step2());
  assert.ok(v.problems.some((x) => x.code === REJECT.NAME_MISMATCH));
});

test('length is bounded at both ends', () => {
  const long = `Hi Jane.\n\n${'I am still happy to send over that rundown about your contact form and what I would change. '.repeat(6)}`;
  assert.ok(validateFollowup(ok(long), step2()).problems.some((x) => x.code === REJECT.TOO_LONG));
  assert.ok(validateFollowup(ok('Hi Jane. Contact form?'), step2()).problems.some((x) => x.code === REJECT.TOO_SHORT));
});

test('the model is never asked to judge the model', () => {
  const src = readFileSync(new URL('../lib/followup-v2.mjs', import.meta.url), 'utf8');
  assert.ok(!src.includes('askBackground'), 'validation is deterministic');
  assert.ok(!/callAI|anthropic/i.test(src));
});

// ── Package shape and fingerprint ────────────────────────────────────────

test('the shape reflects the real band, and changes as sends happen', () => {
  assert.deepEqual(packageShape(p({ rating: GREEN, emails_sent: 0 })).remaining, [1, 2, 3, 4]);
  assert.deepEqual(packageShape(p({ rating: GREEN, emails_sent: 1 })).remaining, [2, 3, 4]);
  assert.deepEqual(packageShape(p({ rating: GREEN, emails_sent: 2 })).remaining, [3, 4]);
  assert.deepEqual(packageShape(p({ rating: GREEN, emails_sent: 3 })).remaining, [4]);
  assert.deepEqual(packageShape(p({ rating: GREEN, emails_sent: 4 })).remaining, []);
  assert.deepEqual(packageShape(p({ rating: BLUE, emails_sent: 0 })).remaining, [1, 2, 3]);
  assert.deepEqual(packageShape(p({ rating: CROSS, emails_sent: 0 })).remaining, [1]);
});

test('the fingerprint tells the three package shapes apart', () => {
  const keys = new Set([
    packageShape(p({ rating: GREEN })).key,
    packageShape(p({ rating: BLUE })).key,
    packageShape(p({ rating: CROSS })).key,
  ]);
  assert.equal(keys.size, 3, 'P1, P2 and P3 packages are not the same package');
});

test('the fingerprint changes when sends change what is left', () => {
  assert.notEqual(packageShape(p({ rating: GREEN, emails_sent: 1 })).key, packageShape(p({ rating: GREEN, emails_sent: 2 })).key);
});

test('no five-email assumption survives anywhere in the shape', () => {
  for (const rating of [GREEN, BLUE, CROSS, '']) {
    for (let sent = 0; sent <= 6; sent += 1) {
      const s = packageShape(p({ rating, emails_sent: sent }));
      assert.ok(s.ceiling <= 4);
      assert.ok(s.remaining.every((x) => x <= 4));
    }
  }
});

// ── What this file may never do ──────────────────────────────────────────

test('generating a draft cannot send, queue, spend or write', () => {
  const src = readFileSync(new URL('../lib/followup-v2.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['sendApproved', 'enqueue(', 'INSERT INTO', 'UPDATE ', 'DELETE ',
    'spendCredits', 'send_attempts', 'provider_id', 'pending_draft =', 'fetch(']) {
    assert.ok(!src.includes(forbidden), `followup-v2 must never ${forbidden}`);
  }
});

test('the shadow script cannot write or send either', () => {
  const src = readFileSync(new URL('../scripts/shadow-followups.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const forbidden of ['INSERT INTO', 'UPDATE ', 'DELETE ', 'sendApproved', 'enqueue(',
    'send_attempts', 'outreach_packages SET', '--write']) {
    assert.ok(!src.includes(forbidden), `the shadow run must never ${forbidden}`);
  }
});
