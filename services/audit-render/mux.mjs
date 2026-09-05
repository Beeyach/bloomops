// Combines the walkthrough with the narration into an mp4.
//
// The two rarely match in length, so whichever is shorter is padded rather
// than the longer one being cut: padding the video freezes the last frame,
// padding the audio adds silence. Cutting would either talk over a missing
// picture or end mid-sentence, and both look broken.

import { spawn } from 'node:child_process';
import path from 'node:path';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let err = '';
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-600)}`))));
    p.on('error', reject);
  });
}

export async function duration(file) {
  // ffprobe's exit code and stderr are both reported. Swallowing them cost an
  // afternoon: a missing file surfaced as "could not read duration", which
  // reads like a codec problem, so the container got investigated instead of
  // the path. Let the tool say what actually went wrong.
  const { out, err, code } = await new Promise((resolve, reject) => {
    const p = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      file,
    ]);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => { out += d.toString(); });
    p.stderr.on('data', (d) => { err += d.toString(); });
    p.on('close', (code) => resolve({ out, err, code }));
    p.on('error', reject);
  });
  if (code !== 0) throw new Error(`ffprobe failed on ${path.basename(file)}: ${err.trim() || `exit ${code}`}`);
  const n = parseFloat(out.trim());
  if (!Number.isFinite(n)) {
    throw new Error(`no duration in ${path.basename(file)} (ffprobe returned "${out.trim()}")`);
  }
  return n;
}

// `leadInSec` is how long the recording spent loading the page before the
// walkthrough proper began. The cues are measured from that moment, so the
// audio has to start there too; without the delay everything is early by the
// page load time and the careful per-beat timing is thrown away.
// `recWallSec` is how long the recording actually ran on the wall clock.
// Playwright stamps the webm with a clock that runs slow — a measured 71.1s
// take came back labelled 80.0s — and every cue in the walkthrough was
// measured against the wall. Playing the stretched file against wall-timed
// audio drags the picture further behind the voice the deeper into the video
// it gets, while the beat table swears every beat landed on its line. So when
// the two clocks disagree, the video's timeline is squeezed back onto the
// wall before anything else happens: after the correction, second N of the
// file is second N of the take, and the cues mean what they say.
export async function mux(videoPath, audioPath, outPath, leadInSec = 0, recWallSec = 0) {
  const [vDurRaw, aDur0] = await Promise.all([duration(videoPath), duration(audioPath)]);
  const lead = Math.max(0, Number(leadInSec) || 0);
  const aDur = aDur0 + lead;
  const wall = Math.max(0, Number(recWallSec) || 0);
  // Only correct a real disagreement. Under 2% is inside ffprobe's own noise,
  // and stretching by a factor of 1.001 buys nothing but re-encoding wobble.
  const clockRatio = wall > 5 && vDurRaw > 5 ? wall / vDurRaw : 1;
  const retime = Math.abs(clockRatio - 1) > 0.02;
  const vDur = retime ? wall : vDurRaw;
  // A beat at the end so it does not cut the instant she stops. 0.6s was not
  // enough and the ending landed abruptly.
  //
  // The narration decides the length, not the recording.
  //
  // It used to be the longer of the two, which trusted the webm's own duration,
  // and that number is not trustworthy. Playwright writes at a variable frame
  // rate, so a page that sits still between beats produces a file whose stated
  // length runs well ahead of the content in it. Measured on holyshiftcoaching:
  // the walkthrough ran 68.4s from the first word after a 2.7s page load, which
  // is 71.1s of recording, and ffprobe reported the file as 80.0s. The mux took
  // the 80, stretched the output to match, and filled the difference with nine
  // seconds of silence on the end.
  //
  // That silence was read as a sync problem and chased through four separate
  // fixes to the walkthrough's timing. The beat table settled it: every beat
  // landed on its line, some early, none late. Nothing was ever out of step.
  // The video was simply being told to be longer than it was.
  const target = aDur + 1.2;
  // The last word also stopped dead. A short fade off the end of the audio is
  // what makes it feel like someone finished talking rather than the file
  // running out.
  const fadeStart = Math.max(0, aDur - 0.35);
  const padV = Math.max(0, target - vDur);
  const padA = Math.max(0, target - aDur);

  await run('ffmpeg', [
    '-y',
    '-i', videoPath,
    '-i', audioPath,
    '-filter_complex',
    `[0:v]${retime ? `setpts=PTS*${clockRatio.toFixed(5)},` : ''}tpad=stop_mode=clone:stop_duration=${padV.toFixed(2)}[v];[1:a]adelay=${Math.round(lead * 1000)}:all=1,afade=t=out:st=${fadeStart.toFixed(2)}:d=0.35,apad=pad_dur=${padA.toFixed(2)}[a]`,
    '-map', '[v]',
    '-map', '[a]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '24',
    '-pix_fmt', 'yuv420p', // required or Safari/QuickTime will not play it
    '-movflags', '+faststart', // so it starts playing before it fully downloads
    '-c:a', 'aac',
    '-b:a', '128k',
    '-t', target.toFixed(2),
    outPath,
  ]);

  return {
    outPath,
    videoSeconds: vDur,
    audioSeconds: aDur,
    leadInSec: lead,
    finalSeconds: target,
    // How far the file's clock was from the wall, so a render log can say
    // whether this take needed the correction and by how much.
    clockRatio: Math.round(clockRatio * 1000) / 1000,
    retimed: retime,
  };
}
