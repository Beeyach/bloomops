// The auto-prospect skill, held to Strategy V2.
//
// Two things are under test and they fail in different ways.
//
// The APP half is ordinary logic: the band decides the allowance, staging
// creates a package and never a send, and a reply ends cold progression. Those
// are asserted against the real modules.
//
// The SKILL half is a document a model reads, and it drifts silently: the
// packaged .skill sat in the repo as an opaque zip for weeks, still telling a
// subagent to write five emails and open Gmail, while the app had enforced
// three-and-stage since V2 shipped. A binary blob nobody can diff is a binary
// blob nobody reviews, so the readable source now lives beside it and these
// tests read that. They are string assertions on purpose: the failure they
// catch is a sentence, not a function.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

import { stageableSequence, sequencePackageFields } from '../lib/sequence-stage.mjs';
import { allowedTouches, effectiveBand, maySendStep, TOUCHES, SPACING, PRIORITY } from '../lib/priority.mjs';
import { STATUS } from '../lib/outreach.mjs';
import { videoCopyFor, withVideoLink, VIDEO_LINK_LABEL, NO_VIDEO } from '../lib/video-copy.mjs';
import { preparedFollowups } from '../lib/send-guard.mjs';

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const SKILL = src('../skills/auto-prospect.SKILL.md');
const ROUTE = src('../app/api/legacy-drafts/route.js');

// The showable-finding keys the app's videoDecision turns on. Kept here as a
// literal so the skill and lib/assets.mjs cannot drift apart quietly.
const VISUAL_KEYS = [
  'form-broken', 'captcha-broken', 'booking-is-a-form', 'calendar-not-loading',
  'two-schedulers', 'dead-links', 'nav-dead-link', 'broken-images',
  'dead-image-host', 'dead-feed', 'mobile-overflow', 'long-form', 'quote-form-thin',
];

// ── the band decides the length ────────────────────────────────────────────

test('P1 allows exactly four cold touches', () => {
  assert.equal(allowedTouches(PRIORITY.P1), 4);
  assert.deepEqual(SPACING[PRIORITY.P1], [0, 4, 9, 16]);
});

test('P2 allows exactly three cold touches', () => {
  assert.equal(allowedTouches(PRIORITY.P2), 3);
  assert.deepEqual(SPACING[PRIORITY.P2], [0, 5, 12]);
});

test('P3 allows exactly one cold touch', () => {
  assert.equal(allowedTouches(PRIORITY.P3), 1);
  assert.deepEqual(SPACING[PRIORITY.P3], [0]);
});

test('no band allows a fifth touch without a named manual override', () => {
  for (const band of Object.values(PRIORITY)) {
    assert.equal(maySendStep(band, 5).ok, false, `${band} must refuse step 5`);
    assert.equal(
      maySendStep(band, 5, { manualOverride: true }).ok, true,
      `${band} step 5 stays available as a deliberate override`
    );
  }
  assert.equal(Math.max(...Object.values(TOUCHES)), 4, 'four is the ceiling for everybody');
});

// ── the skill writes the allowance, not a template ─────────────────────────

test('the skill derives the length from the band and mirrors the app exactly', () => {
  // Stated somewhere in prose, however it is worded or line-wrapped.
  assert.match(SKILL, /P1\s*(?:=|gets)\s*4[,\s]+P2\s*(?:=|gets)\s*3|P1 four,? P2 three,? P3 one/,
    'the allowance table has to be stated');
  assert.match(SKILL, /TOUCHES = \{ P1: 4, P2: 3, P3: 1 \}/,
    'the band helper must match lib/priority.mjs');
  assert.match(SKILL, /SPACING = \{ P1: \[0, 4, 9, 16\], P2: \[0, 5, 12\], P3: \[0\] \}/,
    'spacing must match lib/priority.mjs');
});

test('the skill never tells a subagent to write five emails', () => {
  // The V1 instructions verbatim. Each of these was a line in the old file.
  assert.doesNotMatch(SKILL, /All 5 emails/i);
  assert.doesNotMatch(SKILL, /Email 4: Day 14/i);
  assert.doesNotMatch(SKILL, /Email 5: Day 21/i);
  assert.doesNotMatch(SKILL, /a sequence of exactly 5|write the 5-email/i);
  assert.doesNotMatch(SKILL, /"number": 5/,
    'the output JSON template must not show a fifth email');
  assert.match(SKILL, /There is no Email 5/,
    'the ban has to be stated to the subagent in its own prompt');
  assert.match(SKILL, /Email\s+5 does not exist in this skill/,
    'and the retirement has to be stated in the preamble');
});

test('the PDF stays out of the cold sequence', () => {
  assert.match(SKILL, /No cold PDF/i);
  assert.doesNotMatch(SKILL, /setPdfFilename\(/, 'no PDF on the cold path');
  assert.doesNotMatch(SKILL, /Generate the Email 5 PDF/i);
  assert.doesNotMatch(SKILL, /prospect-pdf/i, 'the PDF skill is not part of this path any more');
});

test('a prospect with no showable evidence cannot become VIDEO_WORTHY', () => {
  // The threshold, stated as a hard conjunction rather than a vibe.
  assert.match(SKILL, /2 or more showable findings/i);
  assert.match(SKILL, /video_worthy is TRUE only when ALL of these hold/i);
  assert.match(SKILL, /One showable finding is a sentence in an email, not a video/i);
  assert.match(SKILL, /Do not mark VIDEO_WORTHY because credits exist/i);
  assert.match(SKILL, /[Nn]ever raise a finding count, invent a defect, or stretch an angle/,
    'the subagent needs the ban in its own prompt');
  assert.match(SKILL, /evidence below STRONG/i);
  assert.match(SKILL, /site could not be read, or the check is stale/i);
});

test('visually meaningful evidence can become VIDEO_WORTHY, on the app criteria', () => {
  // The skill must mirror lib/assets.mjs rather than invent a second rule.
  for (const key of VISUAL_KEYS) {
    assert.ok(SKILL.includes(key), `showable key ${key} must be listed for the subagent`);
  }
  for (const pb of ['lead-capture-gap', 'booking-friction', 'broken-path', 'mobile-friction']) {
    assert.ok(SKILL.includes(pb), `visual playbook ${pb} must be listed`);
  }
  assert.match(SKILL, /videoDecision/, 'the app is named as the authority');
});

test('a VIDEO_WORTHY sequence offers the video and never links it in email 1', () => {
  assert.match(SKILL, /Email 1\*\* names the real issue and offers the video/i);
  assert.match(SKILL, /No link\. No URL\. The video may not exist yet/i);
  assert.match(SKILL, /only the last email may carry video wording/i);
});

test('a non-video-worthy prospect gets no video copy at all', () => {
  assert.match(
    SKILL,
    /If video_worthy is FALSE, write no video wording at all: no `body_video`, no `subject_video`, and no mention of a video anywhere in any email/i
  );
});

test('video never buys an extra touch', () => {
  assert.match(SKILL, /It never adds a touch\. It occupies one the band already allows/i);
  assert.match(SKILL, /A video never adds a touch/i);
  assert.match(SKILL, /If\s+adding the video would mean a fourth email, the answer is no/i);
});

test('the skill refuses to invent a reason to contact somebody', () => {
  assert.match(SKILL, /do not invent pain/i);
  assert.match(SKILL, /If there is no legitimate reason to contact them, do not invent one/i,
    'the subagent prompt needs it, not just the preamble');
  for (const gate of ['fit', 'contact_reason', 'in_scope', 'evidence_sufficient']) {
    assert.ok(SKILL.includes(gate), `the four-part Strong test needs ${gate}`);
  }
});

test('the skill closes every email on a concrete micro-offer, never a booking ask', () => {
  assert.match(SKILL, /concrete micro-offer/i);
  assert.match(SKILL, /Never a generic call-booking CTA/i);
  assert.match(SKILL, /Never close on an open question/i);
  assert.match(SKILL, /micro_offer/, 'the offer has to come back in the JSON to be checkable');
});

test('the skill stages the package and never opens Gmail', () => {
  assert.match(SKILL, /stageSequence/);
  assert.match(SKILL, /This skill never sends/i);
  assert.match(SKILL, /There is no send step/i);
  // The V1 browser-send choreography, gone in full.
  assert.doesNotMatch(SKILL, /Send Email 1 via Gmail/i);
  assert.doesNotMatch(SKILL, /Click Compose/i);
  assert.doesNotMatch(SKILL, /subjectbox/);
  assert.doesNotMatch(SKILL, /Message Body/);
  assert.doesNotMatch(SKILL, /hello@bloomwired\.io signed into Gmail/i);
});

test('the skill stops cold progression at any human reply', () => {
  assert.match(SKILL, /Any genuine human reply ends automated cold outreach/i);
  assert.match(SKILL, /never re-enters cold outreach/i);
  assert.match(SKILL, /silence is not rejection/i);
  assert.match(SKILL, /emails_sent.*greater than zero means skip/is,
    'an already-contacted prospect must not reach the subagent at all');
});

// Every skill: the zip must match the readable source beside it.
//
// This is the test that would have caught the whole mess. The packaged .skill
// files are zips, so a diff shows "Bin 14008 -> 14608 bytes" and a reviewer
// sees nothing. All five had drifted from what the app actually does, some for
// weeks, because nobody could read them in a pull request.
const SKILL_NAMES = [
  'auto-prospect', 'daily-followup-sweep', 'daily-reply-sync',
  'prospect-pdf', 'website-audit',
];
const REPO = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

for (const name of SKILL_NAMES) {
  test(`the packaged ${name}.skill matches its readable source`, () => {
    const packed = execFileSync('python', ['-c',
      'import zipfile,sys;'
      + `z=zipfile.ZipFile(r"skills/${name}.skill");`
      + 'n=[e for e in z.namelist() if e.replace(chr(92),"/").endswith("SKILL.md")][0];'
      + 'sys.stdout.buffer.write(z.read(n))',
    ], { cwd: REPO });
    const source = src(`../skills/${name}.SKILL.md`);
    assert.equal(
      packed.toString('utf8').replace(/\r\n/g, '\n'),
      source.replace(/\r\n/g, '\n'),
      `skills/${name}.skill is out of date; repackage it from the .SKILL.md source`
    );
  });
}

test('every skill description fits the 1024 limit, measured the strictest way', () => {
  // The loader rejects a description over 1024, and auto-prospect's went to
  // 1329 when the VIDEO_WORTHY summary was added. Measured in UTF-8 bytes
  // rather than JS string length: the ratings (💚 ✖️ 🥀) cost more than one
  // each, and a description that passes `.length` can still fail on bytes.
  const LIMIT = 1024;
  for (const name of SKILL_NAMES) {
    const text = src(`../skills/${name}.SKILL.md`);
    // Quoted or bare: prospect-pdf's is an unquoted YAML scalar.
    const m = text.match(/^description:[ \t]*(.*?)[ \t]*\r?$/m);
    assert.ok(m && m[1], `${name} has no description`);
    const value = m[1].replace(/^"([\s\S]*)"$/, '$1');
    const bytes = Buffer.byteLength(value, 'utf8');
    assert.ok(
      bytes <= LIMIT,
      `${name} description is ${bytes} UTF-8 bytes, over the ${LIMIT} limit by ${bytes - LIMIT}`
    );
  }
});

test('no skill still instructs anyone to write Email 5', () => {
  // Allowed: sentences that say Email 5 does not exist. Banned: shapes,
  // triggers and stage lists that would produce one.
  const BANNED = [
    /write the entire sequence \(Emails 1-5/i,
    /\*\*Email 5 —/,
    /Email 5 \(N === 5\)/,
    /VIDTEST:A/,
  ];
  for (const name of SKILL_NAMES) {
    const text = src(`../skills/${name}.SKILL.md`);
    for (const re of BANNED) {
      assert.doesNotMatch(text, re, `${name} still carries ${re}`);
    }
  }
});

test('every skill states the same video rule, and none of them bans it outright', () => {
  for (const name of SKILL_NAMES) {
    const text = src(`../skills/${name}.SKILL.md`);
    assert.doesNotMatch(text, /No cold video\./,
      `${name} still says video is banned; it is conditional on evidence now`);
  }
  // The three that decide or carry video copy name the threshold.
  for (const name of ['auto-prospect', 'website-audit']) {
    const text = src(`../skills/${name}.SKILL.md`);
    assert.match(text, /2 or more showable findings|two\s+or more showable findings/i,
      `${name} must state the VIDEO_WORTHY threshold`);
  }
});

// ── staging prepares, and only prepares ────────────────────────────────────

const SEQ = (n) => JSON.stringify(
  Array.from({ length: n }, (_, i) => ({
    number: i + 1,
    subject: `Your booking form ${i + 1}`,
    body: `Hi Kim.\n\nI saw the booking goes through a contact form. Want me to send the three fixes?\n\nThanks,\nAry`,
  }))
);

const BASE = {
  id: 9, name: 'Kim', business_name: 'Studio Seven', email: 'kim@studio.example',
  country: 'AU', stage: 'New', emails_sent: 0,
  last_contact_date: null, next_action_date: null,
  replied: 0, reply_type: null, reply_date: null, do_not_contact: 0, unsubscribed: 0,
};

test('each band stages exactly its allowance and no more', () => {
  const cases = [
    { rating: '💚', band: 'P1', allowed: 4 },
    { rating: '💙', band: 'P2', allowed: 3 },
    { rating: '✖️', band: 'P3', allowed: 1 },
  ];
  for (const { rating, band, allowed } of cases) {
    const r = stageableSequence({ ...BASE, rating, email_sequence: SEQ(5) });
    assert.equal(r.ok, true, `${band}: ${r.reason}`);
    assert.equal(r.band, band);
    assert.equal(r.steps.length, allowed, `${band} must stage ${allowed}`);
    assert.equal(r.dropped, 5 - allowed, `${band} leaves the rest stored and unsent`);
  }
});

test('a package staged from a sequence is ready for a person, not for the wire', () => {
  const fit = stageableSequence({ ...BASE, rating: '💚', email_sequence: SEQ(4) });
  const fields = sequencePackageFields({ ...BASE, rating: '💚' }, fit);

  assert.equal(fields.status, STATUS.READY, 'staging lands in READY_FOR_APPROVAL');
  assert.notEqual(fields.status, STATUS.APPROVED, 'staging never approves');
  assert.notEqual(fields.status, STATUS.SENT, 'staging never sends');
  assert.equal(fields.model, null, 'no model ran, so no model is claimed');
  assert.equal(fields.allowedLength, 4);
  assert.equal(fields.followups.length, 3, 'the rest of the allowance rides the same approval');

  // Nothing in the package shape can carry a send instruction.
  for (const key of ['sentAt', 'sendAt', 'autoSend', 'send']) {
    assert.equal(key in fields, false, `a staged package must not carry ${key}`);
  }
});

test('a prospect who already replied cannot be staged a fresh sequence', () => {
  const replied = stageableSequence({ ...BASE, rating: '💚', replied: 1, email_sequence: SEQ(3) });
  assert.equal(replied.ok, false);

  const contacted = stageableSequence({ ...BASE, rating: '💚', emails_sent: 1, email_sequence: SEQ(3) });
  assert.equal(contacted.ok, false);
  assert.match(contacted.reason, /already/i);
});

test('a short sequence is refused rather than quietly staged half-length', () => {
  const r = stageableSequence({ ...BASE, rating: '💚', email_sequence: SEQ(2) });
  assert.equal(r.ok, false, 'P1 needs four, and two is not close enough');
  assert.match(r.reason, /allows 4 emails and the stored sequence has 2/);
});

// ── the video rides an allowed touch, or it does not go ────────────────────

const DELIVERY = {
  step: 3,
  subject: 'Your booking form',
  body: 'Hi Kim.\n\nLast note about the booking form.\n\nThanks,\nAry',
  bodyVideo: 'Hi Kim.\n\nI recorded it anyway, in case it is still useful.\n\nThanks,\nAry',
};
const FILMED = { video_url: 'https://file.gobloomwired.com/v/kim', video_sent_at: null };

test('the video wording goes out only when a real video exists', () => {
  const yes = videoCopyFor(DELIVERY, FILMED);
  assert.equal(yes.useVideo, true);
  assert.match(yes.body, /I recorded it anyway/);
  assert.match(yes.body, new RegExp(VIDEO_LINK_LABEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(yes.body, /https:\/\/file\.gobloomwired\.com\/v\/kim$/);

  // No render yet: the plain body goes, and nobody is promised a video.
  const no = videoCopyFor(DELIVERY, { video_url: '', video_sent_at: null });
  assert.equal(no.useVideo, false);
  assert.equal(no.why, NO_VIDEO.NO_URL);
  assert.equal(no.body, DELIVERY.body);
  assert.doesNotMatch(no.body, /recorded it anyway/);
});

test('a prospect gets exactly one video, ever', () => {
  const again = videoCopyFor(DELIVERY, { ...FILMED, video_sent_at: '2026-08-01T10:00:00Z' });
  assert.equal(again.useVideo, false);
  assert.equal(again.why, NO_VIDEO.ALREADY_SENT);
  assert.equal(again.body, DELIVERY.body, 'later steps revert to standard wording on their own');
});

test('a step with no video wording is untouched by any of this', () => {
  const plain = { step: 2, subject: 'Your booking form', body: 'Hi Kim.\n\nShort nudge.\n\nThanks,\nAry' };
  const r = videoCopyFor(plain, FILMED);
  assert.equal(r.useVideo, false);
  assert.equal(r.why, NO_VIDEO.NO_COPY);
  assert.equal(r.body, plain.body);
});

test('the link is appended after the sign-off, and never twice', () => {
  const url = 'https://file.gobloomwired.com/v/kim';
  const once = withVideoLink('Hi Kim.\n\nHere it is.\n\nThanks,\nAry', url);
  assert.ok(once.endsWith(`${VIDEO_LINK_LABEL}\n${url}`), 'link goes last, under its label');
  assert.equal(once.indexOf(url), once.lastIndexOf(url), 'exactly one copy');

  // Copy that already carries the link is left alone.
  const written = `Hi Kim.\n\nWatch it here: ${url}\n\nThanks,\nAry`;
  assert.equal(withVideoLink(written, url), written);
});

test('video copy survives staging into the package, and only where it exists', () => {
  const seq = JSON.stringify([
    { number: 1, subject: 'Your booking form', body: 'Hi Kim.\n\nWant a short video of it?\n\nThanks,\nAry' },
    { number: 2, subject: 'Your booking form', body: 'Hi Kim.\n\nShort nudge.\n\nThanks,\nAry' },
    { number: 3, subject: 'Your booking form', body: 'Hi Kim.\n\nAnother note about the booking form.\n\nThanks,\nAry' },
    { number: 4, subject: 'Your booking form', body: DELIVERY.body, body_video: DELIVERY.bodyVideo },
  ]);
  const p = { ...BASE, rating: '💚', email_sequence: seq };
  const fit = stageableSequence(p);
  assert.equal(fit.ok, true, fit.reason);

  const fields = sequencePackageFields(p, fit);
  const round = preparedFollowups({ followups: JSON.stringify(fields.followups) });
  const two = round.find((f) => f.step === 2);
  const four = round.find((f) => f.step === 4);

  assert.equal(four.bodyVideo, DELIVERY.bodyVideo, 'the delivery step keeps its video wording');
  assert.equal(two.bodyVideo, '', 'the nudge has none, and none is invented for it');
  assert.equal(videoCopyFor(four, FILMED).useVideo, true);
  assert.equal(videoCopyFor(two, FILMED).useVideo, false);
});

test('video copy faces the same phrase and em-dash bans as everything else', () => {
  const bad = (videoBody) => stageableSequence({
    ...BASE, rating: '💙',
    email_sequence: JSON.stringify([
      { number: 1, subject: 'Your booking form', body: 'Hi Kim.\n\nWant a short video?\n\nThanks,\nAry' },
      { number: 2, subject: 'Your booking form', body: 'Hi Kim.\n\nShort nudge.\n\nThanks,\nAry' },
      { number: 3, subject: 'Your booking form', body: DELIVERY.body, body_video: videoBody },
    ]),
  });

  assert.equal(bad('Hi Kim.\n\nJust circling back with the video.\n\nThanks,\nAry').ok, false);
  assert.match(bad('Hi Kim.\n\nJust circling back with the video.\n\nThanks,\nAry').reason, /circling back/);
  assert.equal(bad('Hi Kim.\n\nI recorded it — have a look.\n\nThanks,\nAry').ok, false);
  assert.equal(bad(DELIVERY.bodyVideo).ok, true, 'clean video copy still stages');
});

test('a video subject with no video body is refused', () => {
  const r = stageableSequence({
    ...BASE, rating: '💙',
    email_sequence: JSON.stringify([
      { number: 1, subject: 'Your booking form', body: 'Hi Kim.\n\nWant a video?\n\nThanks,\nAry' },
      { number: 2, subject: 'Your booking form', body: 'Hi Kim.\n\nShort nudge.\n\nThanks,\nAry' },
      { number: 3, subject: 'Your booking form', body: DELIVERY.body, subject_video: 'I recorded it' },
    ]),
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /video subject but no video body/);
});

test('the send path picks the video body and stamps the prospect once', () => {
  const runner = src('../lib/send-runner.mjs');
  assert.match(runner, /videoCopyFor\(approvedStep, prospect\)/,
    'the pick is made from the approved step, not from raw package JSON');
  assert.match(runner, /videoPick\.useVideo \? videoPick\.body : approvedStep\.body/,
    'and it falls back to the approved plain body');
  assert.match(runner, /video_sent_at = datetime\('now'\), video_sent_email = \?/,
    'the send that carried the video says so');
  // Same statement as the send count, so the two cannot disagree.
  const stampBlock = runner.slice(runner.indexOf('if (recorded.recorded)'), runner.indexOf('return {\n    sent: true'));
  assert.match(stampBlock, /emails_sent = COALESCE\(emails_sent, 0\) \+ 1/);
  assert.match(stampBlock, /video_sent_at/,
    'stamped in the same write that counts the send, never a second one');
});

test('email 1 can never carry a video: only follow-ups are considered', () => {
  const runner = src('../lib/send-runner.mjs');
  assert.match(runner, /const videoPick = followup\s*\n?\s*\? videoCopyFor/,
    'the video pick is gated on followup');
  assert.match(runner, /: \{ useVideo: false, subject: null, body: null, url: null \}/,
    'and email 1 gets an explicit no');
});

// ── the stale-draft sweep ──────────────────────────────────────────────────

test('the bulk sweep only ever dismisses, and only pre-V2 drafts', () => {
  const bulk = ROUTE.slice(ROUTE.indexOf("action === 'dismiss-all'"), ROUTE.indexOf("if (!id)"));

  assert.match(bulk, /pending_draft_dismissed_at = datetime\('now'\)/,
    'the sweep writes the same flag the single button writes');
  assert.doesNotMatch(bulk, /outreach_packages/,
    'the sweep must never touch a package');
  assert.doesNotMatch(bulk, /DELETE\s+FROM/i, 'nothing is deleted');
  assert.doesNotMatch(bulk, /enqueue|PREPARE_OUTREACH/,
    'no bulk redo: a hundred regenerations nobody re-read is the thing this avoids');
  assert.doesNotMatch(bulk, /SET stage|SET rating|do_not_contact/,
    'putting a draft aside is not a verdict about the business');
});

test('the sweep leaves stale drafts alone, because a reply came in after them', () => {
  const bulk = ROUTE.slice(ROUTE.indexOf("action === 'dismiss-all'"), ROUTE.indexOf("if (!id)"));
  assert.match(bulk, /COALESCE\(pending_draft_stale, 0\) = 0/,
    'a draft someone replied to is a person to read, not clutter to clear');
});

test('the sweep is scoped to the workspace and to undismissed drafts', () => {
  const bulk = ROUTE.slice(ROUTE.indexOf("action === 'dismiss-all'"), ROUTE.indexOf("if (!id)"));
  assert.match(bulk, /workspace = \?/);
  assert.match(bulk, /deleted_at IS NULL/);
  assert.match(bulk, /pending_draft_dismissed_at IS NULL/,
    'already-dismissed rows are not re-stamped');
  assert.match(bulk, /pending_draft IS NOT NULL AND pending_draft != ''/,
    'a row with no draft is not part of the pile');
});

test('the single-row redo path is untouched by the bulk work', () => {
  assert.match(ROUTE, /action === 'regenerate'/, 'one-at-a-time redo still exists');
  assert.match(ROUTE, /There is no regenerate-all/,
    'the reason it stays one-at-a-time is still written down');
});
