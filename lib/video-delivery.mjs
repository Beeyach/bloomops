// Handing over a recording that was already promised.
//
// This is NOT outreach and it must never become a way to do outreach. A cold
// sequence asks a stranger for something. A video delivery gives them a thing
// that was already offered, already rendered, and already paid for, and then
// stops. That difference is the entire justification for it being allowed past
// a spent band, and every rule below exists to keep the two apart.
//
// The narrow carve-out: a prospect whose sequence is over may receive exactly
// one more email, if and only if a real unsent recording exists for them. Take
// the recording away and there is nothing here, by construction: the guard
// refuses without one, so this path cannot be used to smuggle an ordinary
// email past a ceiling.
//
// Everything else still applies. Replied, unsubscribed, do-not-contact,
// declined, deferred, no address, the send window, the rate limits, the
// approval delay, the name check and the fingerprint are all untouched.

import { isInternalTest } from './canary.mjs';
import { STATUS } from './outreach.mjs';
import { watchUrl } from './watch-url.mjs';

export const VIDEO_DELIVERY_PLAYBOOK = 'video-delivery';
export const VIDEO_DELIVERY_GENERATOR_VERSION = 'video-delivery-2026-08.1';

// The only terminal stage a delivery may follow.
//
// 'Finished' means the sequence ran its course, which is exactly the situation
// a late recording is for. The others are refusals or relationships, and a
// video is not an answer to any of them: Rejected and Lost said no, Client is
// already working with her, and Invalid Email would bounce.
export const DELIVERABLE_TERMINAL_STAGE = 'Finished';
const NEVER_DELIVER_STAGES = new Set(['Client', 'Rejected', 'Lost', 'Invalid Email']);

// Reply classes that end it. A person who wrote back gets their video inside
// the conversation they started, from Ary, not as a one-off broadcast.
const CLOSED_REPLIES = new Set(['decline', 'unsubscribe', 'wrong-person', 'not-now']);

const clean = (v) => String(v ?? '').trim();

/**
 * May this prospect be handed their video, and as what?
 *
 * Pure. The route loads the row; this answers from it alone.
 *
 * @param {object} prospect  the row
 * @param {object} opts.email  { subject, body } the delivery copy
 */
export function stageableVideoDelivery(prospect = {}, { email = null } = {}) {
  const no = (reason) => ({ ok: false, reason });
  const p = prospect || {};

  if (!p.id) return no('No prospect.');
  if (p.deleted_at) return no('The prospect is deleted.');
  if (isInternalTest(p)) return no('Internal test record. Never part of real outreach.');
  if (!clean(p.email)) return no('No address to deliver to.');

  // 1. There has to be something to deliver. This is the condition that makes
  //    the whole carve-out safe: no recording, no exception.
  const url = clean(p.video_url);
  if (!url) return no('No video has been rendered for this prospect, so there is nothing to deliver.');
  if (clean(p.video_sent_at)) return no('Their video has already been sent. A prospect gets exactly one.');

  // 2. You can only deliver on a promise you made. Somebody never written to
  //    is a cold prospect, and a cold prospect gets a sequence, not a video.
  if (!(Number(p.emails_sent) > 0)) {
    return no('Nothing has ever been sent to this person, so there is no offer to follow through on.');
  }

  // 3. A reply moves this into the conversation, where a person answers it.
  if (Number(p.replied) === 1) {
    return no('They wrote back. Their video belongs in that conversation, sent by Ary, not as a one-off.');
  }
  if (CLOSED_REPLIES.has(clean(p.reply_type))) {
    return no(`Their last reply was read as "${clean(p.reply_type)}". That is not somebody to send anything else to.`);
  }

  // 4. Never, on any path.
  if (p.do_not_contact) return no('This person is marked do not contact.');
  if (p.unsubscribed) return no('This person unsubscribed.');

  // 5. Which terminal stages this may follow.
  const stage = clean(p.stage);
  if (NEVER_DELIVER_STAGES.has(stage)) {
    return no(`Their stage is ${stage}. A video is not an answer to that.`);
  }

  // 6. The copy itself.
  const subject = clean(email?.subject);
  const body = clean(email?.body);
  if (!subject) return no('The delivery email has no subject.');
  if (!body) return no('The delivery email has no body.');
  if (/[—–]/.test(subject + body)) return no('The delivery email uses an em dash, which Ary never does.');

  // The link is part of the copy here rather than appended at send time,
  // because unlike a sequence step this email only exists once the recording
  // does. It is checked rather than assumed.
  //
  // And it must be the WATCH form. `video_url` is the raw file; the watch page
  // is the branded one with the call to action that reports views back to the
  // tracker, and it is the only form a prospect is ever meant to see. This
  // caught its own first run: seven emails carried the right link and were
  // compared against the wrong one.
  const watch = watchUrl(url);
  if (!body.includes(watch)) {
    return no(
      body.includes(url)
        ? `The delivery email links the raw file. Use the watch page instead: ${watch}`
        : 'The delivery email does not contain the video link, so it would promise a video with no way to watch it.'
    );
  }

  // Whether a person has actually watched the recording. Not a blocker: the
  // tier is a judgement about the finding, and Ary approves each package
  // herself. It rides along so the approval screen can say so.
  const tier = clean(p.video_tier).toUpperCase();
  return {
    ok: true,
    url,
    tier: tier || 'UNKNOWN',
    unverified: tier !== 'SEND',
    email: { subject, body },
  };
}

/**
 * The canonical package shape for a delivery.
 *
 * One email, allowedLength 1, no follow-ups. It rides the same approval,
 * fingerprint and send guard as everything else, which is the point: a
 * delivery is not a side channel, it is an ordinary package with an unusual
 * reason for existing.
 */
export function videoDeliveryPackageFields(prospect = {}, fit = {}) {
  const warn = fit.unverified
    ? ` The recording is ${fit.tier} tier, so nobody has confirmed on screen what it shows. Watch it before approving.`
    : '';
  return {
    status: STATUS.READY,
    statusReason:
      `Handing over a video that was already offered and rendered. One email, then nothing.${warn}`,
    playbook: VIDEO_DELIVERY_PLAYBOOK,
    whyContact:
      `A recording was made for them on ${clean(prospect.video_url) ? 'file' : 'record'} and never sent. `
      + 'This delivers it and closes the loop that the offer opened.',
    contactEmail: clean(prospect.email),
    contactSource: 'video-delivery',
    emailSubject: fit.email.subject,
    emailBody: fit.email.body,
    followups: [],
    // One. A delivery never becomes a sequence.
    allowedLength: 1,
    priorityBand: clean(prospect.priority_band) || null,
    bandWasProvisional: 0,
    generatorVersion: VIDEO_DELIVERY_GENERATOR_VERSION,
    model: null,
  };
}
