// Does this prospect have a video at all?
//
// Chapter 9 gives the drawer a Video tab, and a tab that is always there is a
// promise the record cannot always keep: most prospects have never had a
// video near them. So the tab is conditional, and this is the single answer
// to whether it should exist.
//
// Deliberately strict about what counts. "There is a video" means one of
// these is true on the record itself:
//
//   video_url        a recording exists
//   video_sent_at    one went out, even if the link has since been cleared
//   a video view     they opened one, which is recorded in the activity log
//
// What does NOT count: video_tier, video_score and video_reasons. Those are
// the scanner's opinion about whether a video would be worth making, which
// every scanned prospect has and which is evidence, not video. Counting them
// would put an empty Video tab on almost everybody — exactly the fake state
// the brief says not to invent.

import { lastVideoView } from './watch-url.mjs';

export function hasVideo(prospect) {
  if (!prospect) return false;
  const p = prospect;
  if (p.video_url) return true;
  if (p.video_sent_at) return true;
  if (lastVideoView(p.activity_log)) return true;
  return false;
}

// Why the tab is there, in one line, so the panel can open by saying what it
// is rather than making somebody work it out from three controls.
export function videoState(prospect) {
  if (!hasVideo(prospect)) return null;
  const p = prospect;
  const viewed = lastVideoView(p.activity_log);
  if (viewed) return { key: 'watched', label: 'They watched it' };
  if (p.video_sent_at) return { key: 'sent', label: 'Sent, not opened yet' };
  return { key: 'ready', label: 'Recorded, not sent' };
}
