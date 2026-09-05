// Handing over a recording that was already promised.
//
// The whole risk in this feature is that it becomes a way to send an ordinary
// email past a ceiling. Most of what follows is therefore about what it
// REFUSES, and the load-bearing test is the last one: strip the recording out
// and the exception evaporates.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  stageableVideoDelivery, videoDeliveryPackageFields,
  VIDEO_DELIVERY_PLAYBOOK,
} from '../lib/video-delivery.mjs';
import { STATUS } from '../lib/outreach.mjs';

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const URL_ = 'https://file.gobloomwired.com/watch/magsbell';

const EMAIL = {
  subject: 'A short video of your about page',
  body: `Hi Mags.\n\nI recorded a short video of your about page a while back.\n\nNo pitch in it.\n\nThanks,\nAry\n\nHere's the link to it:\n${URL_}`,
};

// Someone whose sequence ran out, who never replied, with a real unsent video.
const OWED = {
  id: 6266, name: 'Mags', business_name: 'Mags Bell Speaker',
  email: 'info@magsbell.com', stage: 'Finished', rating: '💚',
  emails_sent: 2, replied: 0, reply_type: null,
  do_not_contact: 0, unsubscribed: 0,
  video_url: URL_, video_sent_at: null, video_tier: 'SEND',
};

const fit = (over = {}, email = EMAIL) => stageableVideoDelivery({ ...OWED, ...over }, { email });

test('a finished sequence with an unsent video may be handed it', () => {
  const r = fit();
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.url, URL_);
  assert.equal(r.tier, 'SEND');
  assert.equal(r.unverified, false);
});

test('no recording means no exception, which is what makes this safe', () => {
  // Everything else about this prospect is identical. Take the video away and
  // there is simply nothing here: this path cannot be used to reach somebody
  // whose sequence is over.
  assert.equal(fit({ video_url: '' }).ok, false);
  assert.match(fit({ video_url: '' }).reason, /nothing to deliver/i);
  assert.equal(fit({ video_url: null }).ok, false);
});

test('a prospect gets exactly one video, ever', () => {
  const r = fit({ video_sent_at: '2026-08-01T10:00:00Z' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /already been sent/i);
});

test('you can only deliver on a promise you made', () => {
  // Never written to, so there was no offer. That person gets a sequence.
  const r = fit({ emails_sent: 0 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /no offer to follow through on/i);
});

test('a reply moves it into the conversation, where a person answers', () => {
  assert.equal(fit({ replied: 1 }).ok, false);
  assert.match(fit({ replied: 1 }).reason, /belongs in that conversation/i);
  for (const t of ['decline', 'unsubscribe', 'wrong-person', 'not-now']) {
    assert.equal(fit({ reply_type: t }).ok, false, `${t} must refuse`);
  }
});

test('the refusals that are never negotiable stay refused', () => {
  assert.equal(fit({ do_not_contact: 1 }).ok, false);
  assert.equal(fit({ unsubscribed: 1 }).ok, false);
  assert.equal(fit({ email: '' }).ok, false);
  assert.equal(fit({ deleted_at: '2026-01-01' }).ok, false);
  assert.equal(fit({ source: 'canary' }).ok, false, 'internal test rows are never real outreach');
});

test('Finished is the only terminal stage a delivery may follow', () => {
  assert.equal(fit({ stage: 'Finished' }).ok, true);
  // A video is not an answer to any of these.
  for (const stage of ['Client', 'Rejected', 'Lost', 'Invalid Email']) {
    const r = fit({ stage });
    assert.equal(r.ok, false, `${stage} must refuse`);
    assert.match(r.reason, /not an answer to that/i);
  }
});

test('the copy has to actually carry the link', () => {
  // Otherwise the email promises a video with no way to watch it.
  const noLink = { subject: EMAIL.subject, body: 'Hi Mags.\n\nI recorded something.\n\nThanks,\nAry' };
  const r = fit({}, noLink);
  assert.equal(r.ok, false);
  assert.match(r.reason, /does not contain the video link/i);
});

test('it must be the watch page, not the raw file', () => {
  // video_url is the raw mp4. The watch page is the branded one with the call
  // to action, and it is the only form a prospect is ever meant to see. This
  // is exactly what the first live run got wrong.
  const RAW = 'https://file.gobloomwired.com/video/magsbell.mp4';
  const WATCH = 'https://file.gobloomwired.com/watch/magsbell';

  const rawBody = { subject: EMAIL.subject, body: `Hi Mags.\n\nHere's the link to it:\n${RAW}` };
  const bad = stageableVideoDelivery({ ...OWED, video_url: RAW }, { email: rawBody });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /links the raw file/i);
  assert.match(bad.reason, /\/watch\/magsbell/, 'and it names the link to use instead');

  const watchBody = { subject: EMAIL.subject, body: `Hi Mags.\n\nHere's the link to it:\n${WATCH}` };
  const good = stageableVideoDelivery({ ...OWED, video_url: RAW }, { email: watchBody });
  assert.equal(good.ok, true, good.reason);
});

test('delivery copy faces the em dash ban like everything else', () => {
  const dashed = { subject: EMAIL.subject, body: EMAIL.body.replace('No pitch in it.', 'No pitch in it — really.') };
  assert.equal(fit({}, dashed).ok, false);
  assert.equal(fit({}, { subject: '', body: EMAIL.body }).ok, false);
  assert.equal(fit({}, { subject: EMAIL.subject, body: '' }).ok, false);
});

test('an unwatched recording stages, and says so', () => {
  // The tier is a judgement about the finding, and Ary approves each package
  // herself. Blocking here would hide the decision instead of surfacing it.
  const maybe = fit({ video_tier: 'MAYBE' });
  assert.equal(maybe.ok, true);
  assert.equal(maybe.unverified, true);
  const fields = videoDeliveryPackageFields({ ...OWED, video_tier: 'MAYBE' }, maybe);
  assert.match(fields.statusReason, /MAYBE tier/);
  assert.match(fields.statusReason, /Watch it before approving/);
});

test('a delivery is one email and can never become a sequence', () => {
  const fields = videoDeliveryPackageFields(OWED, fit());
  assert.equal(fields.status, STATUS.READY, 'it waits for a person');
  assert.notEqual(fields.status, STATUS.APPROVED);
  assert.notEqual(fields.status, STATUS.SENT);
  assert.equal(fields.allowedLength, 1);
  assert.deepEqual(fields.followups, [], 'no follow-ups, ever');
  assert.equal(fields.playbook, VIDEO_DELIVERY_PLAYBOOK);
  assert.equal(fields.model, null, 'no model ran, so none is claimed');
  assert.equal(fields.emailBody.includes(URL_), true);
});

// ── The guard's half of the carve-out ────────────────────────────────────

test('the guard refuses the mode outright without a real unsent recording', () => {
  const code = src('../lib/send-guard.mjs');
  // The mode is meaningless on its own: asking for it without a video is
  // refused rather than quietly falling back to an ordinary send.
  assert.match(code, /if \(isVideoDelivery\) \{/);
  assert.match(code, /No video exists for this prospect, so there is nothing to deliver/);
  assert.match(code, /Their video has already been sent/);
});

test('the guard only forgives Finished, and only with a video', () => {
  const code = src('../lib/send-guard.mjs');
  const block = code.slice(code.indexOf('const deliverableFinish'), code.indexOf('Belt as well as braces'));
  assert.match(block, /isVideoDelivery/);
  assert.match(block, /STOP\.TERMINAL_STAGE/);
  assert.match(block, /'Finished'/);
  assert.match(block, /video_url/);
  assert.match(block, /video_sent_at/);
  // Nothing else is forgiven: a reply, an unsubscribe and do-not-contact all
  // come back from canProgressOutbound as different stops and still return.
  for (const stop of ['UNSUBSCRIBED', 'DO_NOT_CONTACT', 'UNANSWERED_REPLY', 'DECLINED']) {
    assert.doesNotMatch(block, new RegExp(stop), `${stop} must not be forgiven here`);
  }
});

test('sending a delivery stamps the recording so it cannot go twice', () => {
  const runner = src('../lib/send-runner.mjs');
  assert.match(runner, /const stamp = videoPick\.useVideo \|\| String\(pkg\.playbook \|\| ''\) === VIDEO_DELIVERY_PLAYBOOK/);
  assert.match(runner, /isVideoDelivery,/, 'the runner tells the guard which mode it is in');
  assert.match(runner, /String\(pkg\.playbook \|\| ''\) === VIDEO_DELIVERY_PLAYBOOK/);
});

test('the route stages and does nothing else', () => {
  const route = src('../app/api/prospects/[id]/stage-video/route.js');
  assert.match(route, /savePackage/);
  // Calls, not prose: the refusal copy legitimately says the word "Approve".
  assert.doesNotMatch(route, /sendMessage\(|buildMime\(|sendApproved\(/, 'staging never sends');
  assert.doesNotMatch(route, /approved_at|status:\s*STATUS\.APPROVED/, 'staging never approves');
  assert.doesNotMatch(route, /scheduled_send_at|enqueue\(/, 'staging never schedules a send');
  assert.match(route, /already exists for this prospect/, 'one live package per prospect');
});
