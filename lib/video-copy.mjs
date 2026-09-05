// Whether this send carries the audit video, and what it says when it does.
//
// The video is not a fourth email. It rides one of the touches the band already
// allows: Email 1 offers it, and if nobody answers, a later allowed step sends
// it. That is the whole reason this is a copy decision rather than a scheduling
// one, and why it lives next to the send instead of next to the sequence.
//
// Two failures this exists to prevent, both of which are worse than sending the
// plain wording:
//
//   1. Promising a video that does not exist. The render happens after the
//      package is staged, so a follow-up can come due before the file is there.
//      No URL means the standard body goes out, every time.
//   2. Sending a second video. A prospect gets exactly one. `video_sent_at` is
//      the record of that, and once it is stamped every later step reverts to
//      its standard wording on its own.
//
// Pure, so both can be tested without a mailbox.

export const VIDEO_LINK_LABEL = "Here's the link to it:";

export const NO_VIDEO = {
  NO_URL: 'no-video-url',
  ALREADY_SENT: 'video-already-sent',
  NO_COPY: 'no-video-copy-for-this-step',
};

// Does this text already carry the link itself? A skill is allowed to write the
// URL into the wording where it reads better, and appending a second copy of it
// under a label would look like a mistake.
const hasLink = (body, url) => Boolean(url) && String(body || '').includes(url);

/**
 * The link, added after the sign-off and never into the middle of the wording.
 *
 * The label sits on its own line above the URL because a bare link under a
 * signature reads as a tracking pixel, and because that is the shape the
 * follow-up sweep has always used.
 */
export function withVideoLink(body, url) {
  const text = String(body || '').replace(/\s+$/, '');
  const link = String(url || '').trim();
  if (!link) return text;
  if (hasLink(text, link)) return text;
  return `${text}\n\n${VIDEO_LINK_LABEL}\n${link}`;
}

/**
 * Which wording goes out for one step.
 *
 * @param {object} step      the approved step: { subject, body, subjectVideo, bodyVideo }
 * @param {object} prospect  needs video_url and video_sent_at
 * @returns {{useVideo: boolean, subject: string, body: string, url: string|null, why: string|null}}
 */
export function videoCopyFor(step = {}, prospect = {}) {
  const subject = String(step?.subject ?? '');
  const body = String(step?.body ?? '');
  const plain = { useVideo: false, subject, body, url: null };

  const url = String(prospect?.video_url || '').trim();
  if (!url) return { ...plain, why: NO_VIDEO.NO_URL };

  // One video per prospect, ever. Stamped on the send that carried it.
  if (String(prospect?.video_sent_at || '').trim()) {
    return { ...plain, why: NO_VIDEO.ALREADY_SENT };
  }

  // This step was not written to carry a video. Most are not: the offer email
  // has no link in it, and only the delivery step has video wording.
  const videoBody = String(step?.bodyVideo ?? '').trim();
  if (!videoBody) return { ...plain, why: NO_VIDEO.NO_COPY };

  const videoSubject = String(step?.subjectVideo ?? '').trim();
  return {
    useVideo: true,
    subject: videoSubject || subject,
    body: withVideoLink(videoBody, url),
    url,
    why: null,
  };
}
