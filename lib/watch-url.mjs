// The link a prospect should ever be given: the branded watch page wrapped
// around the video, not the bare mp4. Stored video_url values stay exactly as
// they are (window.bloom's contract validates the /video/ form), so this is a
// display-time transform only.
//
// "kym.mp4" and "kym" both map to /watch/kym — the worker tolerates the .mp4
// form too, but the clean one is what goes in an email.
export function watchUrl(videoUrl) {
  if (!videoUrl) return videoUrl;
  return String(videoUrl).replace('/video/', '/watch/').replace(/\.mp4$/, '');
}

// The same page, opened by Ary to check her own work. `?preview=1` tells the
// watch page not to report the view, and to remember this browser as hers so
// later visits stay silent too. Every link SHE clicks uses this; every link a
// prospect gets uses the clean form above. Without it, checking a video
// marked the prospect as having watched it, which is the one signal in the
// app that has to stay true.
export function watchPreviewUrl(videoUrl) {
  const u = watchUrl(videoUrl);
  return u ? `${u}?preview=1` : u;
}

// The most recent view event in full: when it happened and what it said.
// Today's "watched your video" pile needs the timestamp, which the cheap
// string check below does not surface.
export function lastVideoView(activityLog) {
  let log;
  try {
    log = JSON.parse(activityLog || '[]');
  } catch {
    return null;
  }
  if (!Array.isArray(log)) return null;
  const views = log
    .filter((e) => e && e.tag === 'VIDEOVIEW' && e.ts)
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  if (!views.length) return null;
  const last = views[views.length - 1];
  return {
    ts: String(last.ts),
    // "Watched 75% of the video" is log wording; in a row note the subject is
    // already obvious, so the tail comes off.
    text: String(last.text || 'Opened the video').replace(' of the video', ''),
  };
}

// Whether the activity log records the prospect opening the video, and the
// furthest they got. Cheap string checks on the raw JSON column rather than a
// full parse, because this runs once per table row per render.
export function videoSeen(activityLog) {
  const raw = String(activityLog || '');
  if (!raw.includes('"VIDEOVIEW"')) return null;
  if (raw.includes('Watched the video to the end')) return { pct: 95, label: 'Watched it all' };
  const pcts = [...raw.matchAll(/Watched (\d+)% of the video/g)].map((m) => Number(m[1]));
  if (pcts.length) {
    const top = Math.max(...pcts);
    return { pct: top, label: `Watched ${top}%` };
  }
  return { pct: 1, label: 'Opened it' };
}
