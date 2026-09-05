// The render service. One endpoint: give it a URL, get back a narrated mp4.
//
// Runs on Cloud Run, NOT on the app's Cloudflare Worker — Workers have no
// browser, no ffmpeg, and nothing like the CPU time this needs.
//
// Locked behind a shared secret. Without it, anyone who finds the URL can
// spend ElevenLabs credits and CPU on your account, which is the actual risk
// here — not data, money.

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { probe, walkthrough, screenshots } from './capture.mjs';
import { buildInfo, worthRecording } from './findings.mjs';
import { buildScript, buildSegments, narrate, cacheEntries, dropCached, cacheFileFor, sweepRetryCache } from './narrate.mjs';
import { mux, duration } from './mux.mjs';
import { secretOk } from './access.mjs';


// A slug for the hosted URL, derived from the prospect's domain so it is
// stable: rendering the same site twice overwrites rather than accumulating.
// Must satisfy the worker's SLUG_RE, which is that worker's security boundary,
// so anything outside [a-z0-9-] is dropped rather than escaped.
// The whole hostname, dots turned into dashes, because the TLD is part of who
// somebody is. It used to be stripped: bodyworks.ca and bodyworks.com both
// became "bodyworks", and the slug is the address the video is stored at and
// the name the watch page is served under. One prospect's recording overwrote
// the other's at a link that had already been emailed, the readiness check
// found the wrong video sitting at the right address and stamped it onto the
// wrong row, and the view beacon credited whichever of the two the database
// returned first. Prospects on the same base name are not rare: a business and
// its .ca, a clinic and its booking subdomain.
function slugFor(target) {
  let host;
  try {
    host = new URL(target).hostname;
  } catch {
    host = String(target || '');
  }
  const slug = host
    .replace(/^www\./, '')
    .toLowerCase()
    // Dashes are doubled BEFORE dots become dashes, so my-clinic.com and
    // my.clinic.com cannot land on the same name.
    .replace(/-/g, '--')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return slug || null;
}

// Nothing in this service ever gave up.
//
// There was not one timeout anywhere in the render path, so Cloud Run's 900
// second request ceiling was the only thing that ended a stalled job. A page
// that never fires load, an ElevenLabs request that hangs, an ffmpeg that sits
// on a broken stream: all of them ran for fifteen minutes and then died with
// no indication of which stage had been stuck. Measured over 90 days, 14% of
// render attempts ended that way, and because audio is generated before the
// walkthrough is recorded, most of them had already paid ElevenLabs.
//
// Each stage now carries its own deadline, sized from the measured p90 of a
// healthy render (134s end to end) with generous headroom. Two things change:
// a stalled job fails in minutes instead of a quarter of an hour, and the
// error names the stage, so the next one of these is diagnosable instead of
// being another silent 504.
//
// The budgets deliberately sum to less than 900: if they are ever all hit at
// once the request still fails on our terms, with a stage name, rather than on
// Cloud Run's with nothing.
const STAGE_BUDGET_MS = {
  probe: 240_000,       // visits subpages, follows dead links, measures load
  narrate: 150_000,     // ElevenLabs, plus cache reads over a FUSE mount
  walkthrough: 300_000, // records a ~90s video in real time, plus browser start
  mux: 120_000,         // ffmpeg over a local file
  upload: 90_000,       // one PUT of ~10MB
};

class StageTimeout extends Error {
  constructor(stage, ms) {
    super(`The ${stage} stage did not finish within ${Math.round(ms / 1000)}s and was given up on.`);
    this.stage = stage;
    this.timedOut = true;
  }
}

// Races a stage against its budget. The underlying work is NOT cancelled —
// Playwright and ffmpeg own their own processes and the container is about to
// be torn down anyway — but the request stops waiting on it, which is the part
// that was costing fifteen minutes.
async function stage(name, work) {
  const ms = STAGE_BUDGET_MS[name] || 300_000;
  const startedAt = Date.now();
  let timer;
  try {
    const result = await Promise.race([
      work(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new StageTimeout(name, ms)), ms); }),
    ]);
    console.log(`stage ${name} ok in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
    return result;
  } catch (err) {
    console.log(`stage ${name} FAILED after ${((Date.now() - startedAt) / 1000).toFixed(1)}s: ${err.message}`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Uploads the finished mp4 and returns its public URL, or null if hosting is
// not configured. Never throws into the render: a video that exists locally but
// failed to upload is still a video, and losing it to a hosting error would be
// worse than returning it without a link.
async function hostVideo(mp4, slug) {
  const base = (process.env.UPLOAD_BASE_URL || '').replace(/\/+$/, '');
  const secret = process.env.UPLOAD_SECRET;
  if (!base || !secret || !slug) return null;

  const url = `${base}/video/${slug}`;
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'video/mp4' },
      body: mp4,
    });
    if (!res.ok) {
      return { error: `upload failed ${res.status}: ${(await res.text().catch(() => '')).slice(0, 120)}` };
    }
    return { url };
  } catch (e) {
    return { error: String(e.message).slice(0, 160) };
  }
}

// Uploads one evidence screenshot and returns its public URL.
//
// Same PUT path and same secret as the video, into the `shot` kind the worker
// gained for this. Never throws into a capture: a picture that exists but could
// not be hosted is still worth reporting as "taken and unstorable", which is a
// different fact from "not taken".
async function hostShot(png, slug) {
  const base = (process.env.UPLOAD_BASE_URL || '').replace(/\/+$/, '');
  const secret = process.env.UPLOAD_SECRET;
  if (!base || !secret || !slug) return { error: 'hosting not configured' };
  try {
    const res = await fetch(`${base}/shot/${slug}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'image/png' },
      body: png,
    });
    if (!res.ok) return { error: `upload failed ${res.status}` };
    return { url: `${base}/shot/${slug}` };
  } catch (e) {
    return { error: String(e.message).slice(0, 160) };
  }
}

// A stable, unguessable name for one page at one viewport.
//
// The host and path make it readable in a bucket listing; the content hash
// makes it impossible to guess from a domain name and gives free de-duplication
// — the same page captured twice unchanged lands on the same object rather than
// accumulating.
function shotSlug(url, viewport, png) {
  let readable = 'page';
  try {
    const u = new URL(url);
    readable = `${u.hostname.replace(/^www\./, '')}${u.pathname}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  } catch {}
  const hash = createHash('sha256').update(png).digest('hex').slice(0, 12);
  const slug = `${readable}-${viewport}-${hash}`.replace(/^-+/, '').slice(0, 127);
  return /^[a-z0-9]/.test(slug) ? slug : `s-${slug}`.slice(0, 127);
}

const app = new Hono();
const SECRET = process.env.RENDER_SECRET || '';

// Sites being recorded on this instance right now. Per-instance rather than
// shared, which is enough: Cloud Run holds one request per container, so two
// simultaneous requests for the same site land either on the same instance,
// where this catches them, or on different ones, where the second waits for a
// free slot and this catches it when it starts.
const IN_FLIGHT = new Set();

// Cloud Run pings this; it must not require the secret.
app.get('/health', (c) => c.json({ ok: true }));

// The voice settings a render would use, so the cache browser looks at the same
// keys the renderer writes. Reading them in one place stops the two disagreeing
// about which clip belongs to which voice.
function voiceSettings(voice) {
  const num = (v, f) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : f);
  return {
    voiceId: voice?.voiceId || process.env.ELEVENLABS_VOICE_ID,
    modelId: voice?.modelId || process.env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5',
    speed: num(voice?.speed ?? process.env.ELEVENLABS_SPEED, 0.9),
    stability: num(voice?.stability ?? process.env.ELEVENLABS_STABILITY, 0.45),
    similarity: num(voice?.similarity ?? process.env.ELEVENLABS_SIMILARITY, 0.8),
    style: num(voice?.style ?? process.env.ELEVENLABS_STYLE, 0.2),
    languageCode: voice?.languageCode || process.env.ELEVENLABS_LANGUAGE || null,
    accent: voice?.accent !== undefined ? voice.accent : process.env.ELEVENLABS_ACCENT || null,
  };
}

// The cached voice lines, so a take that came out wrong can be heard and
// thrown away rather than repeating in every video from here on. A cached clip
// is reused forever, which is the point and also the risk.
app.get('/cache', async (c) => {
  if (!SECRET) return c.json({ error: 'RENDER_SECRET is not configured on the server' }, 500);
  if (!secretOk(c.req.header('x-render-secret'), SECRET)) return c.json({ error: 'Forbidden' }, 403);
  const voiceId = c.req.query('voiceId') || undefined;
  return c.json({ entries: await cacheEntries(voiceSettings(voiceId ? { voiceId } : null)) });
});

// Streams one clip so it can be listened to before deciding.
app.get('/cache/audio', async (c) => {
  if (!SECRET) return c.json({ error: 'RENDER_SECRET is not configured on the server' }, 500);
  if (!secretOk(c.req.header('x-render-secret'), SECRET)) return c.json({ error: 'Forbidden' }, 403);
  const id = String(c.req.query('id') || '');
  if (!/^[a-f0-9]{32}$/.test(id)) return c.json({ error: 'Bad id' }, 400);
  try {
    const buf = await readFile(path.join(process.env.AUDIO_CACHE_DIR || '/tmp/audio-cache', `${id}.mp3`));
    c.header('Content-Type', 'audio/mpeg');
    c.header('Cache-Control', 'no-store');
    return c.body(buf);
  } catch {
    return c.json({ error: 'Not cached' }, 404);
  }
});

app.delete('/cache', async (c) => {
  if (!SECRET) return c.json({ error: 'RENDER_SECRET is not configured on the server' }, 500);
  if (!secretOk(c.req.header('x-render-secret'), SECRET)) return c.json({ error: 'Forbidden' }, 403);
  const id = String(c.req.query('id') || '');
  const ok = await dropCached(id);
  return ok ? c.json({ ok: true, id }) : c.json({ error: 'Nothing to delete for that id.' }, 404);
});

// Clone a voice from an audio sample. The render service owns every ElevenLabs
// call, so the app forwards the sample here rather than holding the key itself.
// Returns a voiceId the app stores against the workspace, so that person's
// videos are narrated in their own voice.
//
// Instant Voice Cloning: one sample, a minute or two of clean speech, is
// enough. The voice lives in this account's voice library, so the slot limit of
// the plan caps how many people can have one.
// Does this site earn a video? The probe and the rules, no audio, no
// recording, nothing spent. This is the answer the tracker should be storing:
// the severity that decides whether a prospect gets a video ought to come
// from the thing that would have to record it, not from a separate reading of
// the site that the recorder never sees.
app.post('/precheck', async (c) => {
  if (!SECRET) return c.json({ error: 'RENDER_SECRET is not configured on the server' }, 500);
  if (!secretOk(c.req.header('x-render-secret'), SECRET)) return c.json({ error: 'Forbidden' }, 403);
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body' }, 400); }
  const url = String(body?.url || '').trim();
  if (!url) return c.json({ error: 'url is required' }, 400);
  const own = Array.isArray(body?.ownFindings) ? body.ownFindings : [];
  try {
    const found = await stage('probe', () => probe(url));
    if (found.blocked) {
      return c.json({ blocked: found.blocked, error: found.error || 'That site could not be read.' }, 422);
    }
    const verdict = worthRecording(found.findings, own);
    // The spoken lines are what a video would actually be about, so those are
    // the reasons worth storing, in the plain words the card will show. A
    // finding the video would never mention is not a reason to record one.
    const reasons = verdict.reasons;
    return c.json({
      worth: verdict.worth,
      score: verdict.score,
      why: verdict.why,
      reasons,
      // The machine-readable half of the same findings.
      //
      // These were computed here and never sent, and the tracker stored an
      // empty list every time. Everything downstream keys off them: whether a
      // finding counts as material rather than cosmetic, which outreach angle
      // the evidence supports, whether a finding is visual enough to be worth
      // a video. All three silently answered "nothing" for every prospect
      // that was ever probed, because `reasons` is prose and prose is not
      // something code can reason about.
      keys: verdict.keys || [],
      tier: verdict.worth ? 'SEND' : 'NO_VIDEO',
      pagesChecked: found.checks?.pagesChecked ?? 1,
      // Diagnostic only, off unless asked for. The booking facts were computed
      // and never returned, so working out WHY a finding fired meant reading
      // the source and guessing — which is how a false positive survived two
      // rounds of fixing. This returns what the detector actually saw.
      ...(body?.debug
        ? {
          debug: {
            booking: found.facts?.booking ?? null,
            bookingLink: found.facts?.bookingLink ?? null,
            // Which crawled page the booking chain actually reasoned about.
            bookingResolved: found.facts?.bookingResolved ?? null,
            form: found.facts?.form ?? null,
            homeCalendar: found.facts?.homeCalendar ?? null,
            contact: found.facts?.contact
              ? {
                form: found.facts.contact.form ?? null,
                hasCalendar: found.facts.contact.hasCalendar ?? null,
              }
              : null,
            // The crawled pages with the fields the booking branches read.
            // `bookish` is chosen from this list, so this is the actual input
            // to the decision rather than a summary of it.
            pages: (found.pages || []).slice(0, 10).map((x) => ({
              kind: x?.kind ?? null,
              href: x?.href ?? x?.url ?? null,
              text: x?.text ?? null,
              hasCalendar: x?.hasCalendar ?? null,
              // Which of the three signals earned it. Without this, a page
              // reporting a calendar cannot be told from a page reporting a
              // date field, and they are not the same claim.
              calendar: x?.calendarRaw
                ? {
                  pickers: x.calendarRaw.pickers ?? null,
                  vendorFrame: x.calendarRaw.vendorFrame ?? null,
                  candidates: (x.calendarRaw.candidates || []).map((c) => `${c.tag}.${String(c.cls).slice(0, 40)} ${c.w}x${c.h} choices=${c.choices}`),
                }
                : null,
              asksForTime: x?.asksForTime ?? null,
              furtherStep: x?.furtherStep ?? null,
              behindLogin: x?.behindLogin ?? null,
              clicked: x?.clicked ?? null,
              form: x?.form ? { fields: x.form.fields ?? null, action: x.form.action ?? null } : null,
            })),
          },
        }
        : {}),
    });
  } catch (e) {
    return c.json({ error: String(e?.message || e).slice(0, 300) }, 500);
  }
});

// Photographs of specific pages, for claims that are about what a visitor sees.
//
// The caller says which pages and which viewports, because deciding that here
// would mean screenshotting whole sites, and visual verification that costs a
// full design audit per prospect is verification nobody can afford to run.
//
// Nothing is clicked, nothing is submitted, no popup is dismissed. The response
// is metadata plus a hosted URL per capture; the image itself never travels
// through the app.
app.post('/shots', async (c) => {
  if (!SECRET) return c.json({ error: 'RENDER_SECRET is not configured on the server' }, 500);
  if (!secretOk(c.req.header('x-render-secret'), SECRET)) return c.json({ error: 'Forbidden' }, 403);
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'Invalid JSON body' }, 400); }

  const urls = Array.isArray(body?.urls) ? body.urls.map((u) => String(u || '').trim()).filter(Boolean) : [];
  if (!urls.length) return c.json({ error: 'urls is required' }, 400);
  const viewports = Array.isArray(body?.viewports) && body.viewports.length
    ? body.viewports.filter((v) => v === 'desktop' || v === 'mobile')
    : ['desktop', 'mobile'];

  try {
    const shots = await stage('shots', () => screenshots(urls, { viewports }));
    const artifacts = [];
    for (const shot of shots) {
      const { png, ...meta } = shot;
      if (!png) { artifacts.push({ ...meta, storedAt: null, sha256: null, bytes: 0 }); continue; }
      const sha256 = createHash('sha256').update(png).digest('hex');
      const hosted = await hostShot(png, shotSlug(shot.url, shot.viewport, png));
      artifacts.push({
        ...meta,
        storedAt: hosted.url || null,
        storeError: hosted.error || null,
        sha256,
        bytes: png.length,
      });
    }
    return c.json({ artifacts, captured: artifacts.length });
  } catch (e) {
    return c.json({ error: String(e?.message || e).slice(0, 300) }, 500);
  }
});

app.post('/clone', async (c) => {
  if (!SECRET) return c.json({ error: 'RENDER_SECRET is not configured on the server' }, 500);
  if (!secretOk(c.req.header('x-render-secret'), SECRET)) return c.json({ error: 'Forbidden' }, 403);
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) return c.json({ error: 'ELEVENLABS_API_KEY is not configured on the server' }, 500);

  let form;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: 'Expected multipart form data with an audio file.' }, 400);
  }
  const file = form.get('file');
  const name = String(form.get('name') || '').trim().slice(0, 60) || 'Client voice';
  if (!file || typeof file === 'string') {
    return c.json({ error: 'No audio file was uploaded.' }, 400);
  }
  // A guard on our own credits and their patience: a huge upload is either a
  // mistake or an attempt to clone from an hour of audio, which IVC does not
  // need and which slows this to a crawl.
  if (file.size > 25 * 1024 * 1024) {
    return c.json({ error: 'That audio is over 25MB. A minute or two of speech is all it needs.' }, 400);
  }

  const out = new FormData();
  out.append('name', name);
  out.append('files', file, file.name || 'sample.webm');
  // Removes background noise before cloning. The samples come from phones and
  // browsers, not studios, so this meaningfully improves the result.
  out.append('remove_background_noise', 'true');

  let data;
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': key },
      body: out,
    });
    data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.detail?.message || data?.detail || `ElevenLabs returned HTTP ${res.status}`;
      // The slot-limit case is the one worth naming, since it is a plan
      // decision rather than a bug: the account is out of custom voice slots.
      const s = String(msg);
      const friendly = /maximum|limit|slots?/i.test(s)
        ? 'This ElevenLabs account is out of voice slots. Delete an unused voice or upgrade the plan.'
        : /permission|create_instant_voice_clone/i.test(s)
          ? 'The ElevenLabs API key cannot create voices. In ElevenLabs, edit the key and turn on Voices (read and write) and Instant Voice Cloning, then try again.'
          : s.slice(0, 200);
      return c.json({ error: friendly }, 424);
    }
  } catch (e) {
    return c.json({ error: `Could not reach ElevenLabs: ${e.message}` }, 424);
  }
  if (!data?.voice_id) return c.json({ error: 'ElevenLabs did not return a voice id.' }, 424);
  return c.json({ voiceId: data.voice_id, name });
});

// Voice auditions, without rendering a video.
//
// Comparing voices by rendering a full audit costs about 478 credits and three
// minutes each, and almost all of that is spent on things that have nothing to
// do with how the voice sounds. This speaks one short line and returns the mp3,
// so a voice can be judged for roughly 100 credits and a few seconds.
app.post('/say', async (c) => {
  if (!SECRET) return c.json({ error: 'RENDER_SECRET is not configured on the server' }, 500);
  if (!secretOk(c.req.header('x-render-secret'), SECRET)) return c.json({ error: 'Forbidden' }, 403);

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  const { voice } = body || {};
  // Defaults to a line from a real audit, so the audition is judged on the kind
  // of sentence this actually has to say.
  const text =
    (body?.text && String(body.text).trim()) ||
    `Hey Dennis, so I just took a quick look at your site. The spam check on your contact page is showing an error instead of loading, so the form underneath it can't be sent.`;

  // Split into segments the same way a real script is, so an audition exercises
  // the path a render actually takes. Passing the text as one piece meant /say
  // could never reproduce anything that happens BETWEEN segments, which is
  // exactly where the inconsistent intonation lives.
  const segs = text
    .split(/(?<=[.!?])\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, i) => ({ key: `s${i}`, text: t }));

  const num = (v, f) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : f);
  try {
    const audio = await narrate(text, segs, {
      apiKey: process.env.ELEVENLABS_API_KEY,
      voiceId: voice?.voiceId || process.env.ELEVENLABS_VOICE_ID,
      modelId: voice?.modelId || process.env.ELEVENLABS_MODEL_ID || undefined,
      speed: num(voice?.speed ?? process.env.ELEVENLABS_SPEED, 0.9),
      stability: num(voice?.stability ?? process.env.ELEVENLABS_STABILITY, 0.45),
      similarity: num(voice?.similarity ?? process.env.ELEVENLABS_SIMILARITY, 0.8),
      style: num(voice?.style ?? process.env.ELEVENLABS_STYLE, 0.2),
      languageCode: voice?.languageCode || process.env.ELEVENLABS_LANGUAGE || null,
      accent: voice?.accent !== undefined ? voice.accent : null,
      segmented: voice?.segmented !== false,
    });
    const mp3 = await readFile(audio.audioPath);
    c.header('Content-Type', 'audio/mpeg');
    c.header('X-Audit-Voice', audio.settings);
    c.header('X-Audit-Chars', String(text.length));
    c.header('X-Audit-Segments', String(segs.length));
    return c.body(mp3);
  } catch (e) {
    console.error(`audition failed: ${e.message}`);
    return c.json({ error: e.message }, 500);
  }
});

app.post('/render', async (c) => {
  if (!SECRET) return c.json({ error: 'RENDER_SECRET is not configured on the server' }, 500);
  if (!secretOk(c.req.header('x-render-secret'), SECRET)) return c.json({ error: 'Forbidden' }, 403);

  let body;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { url, name, team, business, formal, ownFindings, script: customScript, dryRun, voice, upload, slug: slugOverride } = body || {};
  if (!url || typeof url !== 'string') return c.json({ error: 'url is required' }, 400);

  // One render per site at a time.
  //
  // shirehypnotherapy.com was recorded twice, the two finishing 200ms apart,
  // and every guess at which client sent it twice was wrong: not two tabs, not
  // two prospect rows, not a second device. The honest answer is that the
  // sender cannot be made reliable from here. A queue lives in one browser's
  // localStorage and cannot see another browser, another machine, or a request
  // already in flight from the same one.
  //
  // So the service refuses it instead. It is the only place that knows what it
  // is working on, and the check costs nothing. A duplicate costs a full render
  // and a fresh greeting off ElevenLabs, since the greeting is the one segment
  // that is never cached.
  //
  // Not applied to a dry run: those are cheap, read-only, and used to check a
  // site while a video of it may legitimately be recording.
  const inFlightKey = String(url).trim().toLowerCase();
  if (!dryRun) {
    if (IN_FLIGHT.has(inFlightKey)) {
      return c.json(
        { error: 'That site is already being recorded right now. This request was ignored so it is not rendered twice.' },
        409
      );
    }
    IN_FLIGHT.add(inFlightKey);
  }

  let shot;
  let outDir;
  const started = Date.now();
  try {
    // Clears held per-prospect clips past their window before anything else,
    // so the holding area cannot grow on a long-lived instance.
    await sweepRetryCache().catch(() => 0);

    // Findings first, with no recording. The script cannot be written until
    // these are known, and the walkthrough cannot be paced until the script
    // has been spoken and measured.
    const found = await stage('probe', () => probe(url));

    // Blocked comes first. probe() returns an empty findings list whenever it
    // could not actually see the site, so a parked domain or a Cloudflare 403
    // used to fall into the refusal below and tell Ary "this probe could not
    // verify a single problem on that site, add what you noticed and record
    // again" about a site that does not exist. /precheck checked blocked first
    // and got it right, so the two endpoints disagreed about the same domain.
    // Nothing past this point checked whether the page was worth auditing.
    // `blocked` was computed, reported in the dry run, and then ignored on the
    // path that actually spends money: a parked domain and a Cloudflare block
    // page both produced a finished video narrating an empty page as though it
    // were the prospect's site. Refusing here costs the render; not refusing
    // costs the relationship the video was meant to open.
    if (found.blocked) {
      const why =
        found.blocked.reason === 'parked'
          ? 'That domain is parked, so there is no site to record.'
          : found.blocked.reason === 'link-in-bio'
            ? `That is a ${found.blocked.host} links page, not their own site. Anything wrong with it belongs to ${found.blocked.host}, so find their real site before recording.`
            : found.blocked.reason === 'empty'
              ? 'That page loaded but has essentially nothing on it, so there is nothing to record.'
              : `That site would not let us look at it (HTTP ${found.blocked.status}), so there is nothing to record.`;
      return c.json({ error: why, blocked: found.blocked }, 422);
    }

    // No glazing. When this probe verifies nothing and Ary has added nothing
    // herself, the only script available is a compliment, the line "I
    // couldn't find anything actually broken", and then the offer. That is a
    // sales video with no reason to exist, and it is worse than no video:
    // precisionpersonaltraining.com went out that way after her own audit had
    // rated it an 8, because the audit's findings live in the tracker and
    // this probe never sees them.
    //
    // So refuse, and say exactly what to do about it. Ary's own findings are
    // spoken in her words and are the intended path for anything a headless
    // browser cannot confirm.
    const verdict = worthRecording(found.findings, ownFindings);
    if (!verdict.worth && !customScript) {
      if (inFlightKey) IN_FLIGHT.delete(inFlightKey);
      return c.json(
        {
          error: verdict.keys.length
            ? `Not worth a video. ${verdict.why} If you saw something a browser cannot, add it under "What you noticed" and record again.`
            : 'Nothing to point at. This probe could not verify a single problem on that site, so the only video it could make is a compliment and a pitch. If your audit found something a browser cannot see, add it under "What you noticed" on the prospect and record again.',
          nothingToSay: true,
          verdict,
          facts: { title: found.facts?.title || null },
        },
        422
      );
    }

    const segments = buildSegments(found.facts, found.findings, { name, team, business, formal, ownFindings, url: found.target });
    const script = (customScript && String(customScript).trim()) || segments.map((x) => x.text).join(' ');
    // A hand-written script has no segment boundaries to align to, so per-beat
    // timing is skipped rather than guessed at.
    const alignable = !customScript;

    // dryRun stops before ElevenLabs. Use it while iterating on the script or
    // the capture so you are not paying for audio you are about to change.
    // It skips recording too, so it is quick.
    if (dryRun) {
      return c.json({
        dryRun: true,
        script,
        chars: script.length,
        findings: found.findings,
        facts: found.facts,
        checks: found.checks,
        pages: found.pages,
        // Pre-formatted for the auto-prospect skill's tracker Info column, so
        // the caller does not have to reassemble it from the raw findings.
        blocked: found.blocked || null,
        info: buildInfo(found.facts, found.checks, found.pages, found.findings),
        seconds: ((Date.now() - started) / 1000).toFixed(1),
      });
    }


    // Voice settings come from the environment so they can be tuned by ear
    // without a rebuild. `voice` in the request body overrides them again, so a
    // single call can be A/B'd without touching the service at all.
    const num = (v, fallback) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback);
    const audio = await stage('narrate', () => narrate(script, alignable ? segments : null, {
      apiKey: process.env.ELEVENLABS_API_KEY,
      voiceId: voice?.voiceId || process.env.ELEVENLABS_VOICE_ID,
      modelId: voice?.modelId || process.env.ELEVENLABS_MODEL_ID || undefined,
      speed: num(voice?.speed ?? process.env.ELEVENLABS_SPEED, 0.9),
      stability: num(voice?.stability ?? process.env.ELEVENLABS_STABILITY, 0.45),
      similarity: num(voice?.similarity ?? process.env.ELEVENLABS_SIMILARITY, 0.8),
      style: num(voice?.style ?? process.env.ELEVENLABS_STYLE, 0.2),
      languageCode: voice?.languageCode || process.env.ELEVENLABS_LANGUAGE || null,
      // Pass accent: null to drop the tag entirely.
      accent: voice?.accent !== undefined ? voice.accent : process.env.ELEVENLABS_ACCENT || null,
      segmented: voice?.segmented !== false && process.env.ELEVENLABS_SEGMENTED !== 'false',
    }));

    // Measure the audio, then record the walkthrough to fit it.
    const audioSeconds = await duration(audio.audioPath);
    shot = await stage('walkthrough', () =>
      walkthrough(found.target, found.facts, found.findings, audioSeconds, audio.cues || [], ownFindings || []));

    outDir = await mkdtemp(path.join(tmpdir(), 'out-'));
    const outPath = path.join(outDir, 'audit.mp4');
    const info = await stage('mux', () => mux(shot.videoPath, audio.audioPath, outPath, shot.leadInSec, shot.recWallSec));
    const mp4 = await readFile(outPath);

    // Opt in with upload: true. Without it the mp4 comes back in the body,
    // which is what the existing -OutFile workflow expects.
    if (upload) {
      const slug = (slugOverride && String(slugOverride).trim()) || slugFor(found.target);
      const hosted = await stage('upload', () => hostVideo(mp4, slug)).catch((e) => ({ error: e.message }));
      const uploadError = hosted?.error || (hosted ? null : 'hosting not configured');
      // Loudly, because the caller cannot see this. The app starts a render and
      // never reads the response (a render outlives the request that asked for
      // it), so a failed upload used to be completely silent: the render
      // succeeded, the file was never written, and the browser polled a URL
      // that would never answer until it gave up twenty minutes later. The one
      // place this can surface is the service log, so it goes there.
      if (uploadError) {
        console.error(`upload FAILED for ${slug}: ${uploadError} (${mp4.length} bytes)`);
      } else {
        // Logged so a drift between the two can be seen without re-rendering.
        // Whichever is longer decides the final length and the other is padded,
        // so a walkthrough overrunning its narration shows up here as silence
        // on the end of the video.
        console.log(
          // `final` is the file that ships. `source` is the raw webm, whose
          // stated duration is not to be trusted: Playwright holds the last
          // frame, so it reads long. This line used to report source as though
          // it were the output, which made a fixed render look broken —
          // kirind logged 80.9s while the mp4 on disk measured 73.1.
          `uploaded ${slug} (${mp4.length} bytes) final=${info.finalSeconds.toFixed(1)}s ` +
          `audio=${info.audioSeconds.toFixed(1)}s tail=${(info.finalSeconds - info.audioSeconds).toFixed(1)}s ` +
          `source=${info.videoSeconds.toFixed(1)}s ` +
          // leadIn is the page load before the first word; walk is the
          // walkthrough measured from that word. video should be leadIn + walk,
          // and walk should be about the length of the narration. Whichever of
          // the two is wrong is the one to fix.
          `leadIn=${(shot.leadInSec || 0).toFixed(1)}s walk=${(shot.walkSec || 0).toFixed(1)}s ` +
          // How far the webm's clock was from the wall and whether the mux
          // squeezed it back. A ratio near 1 with no retime is a healthy take;
          // a large one silently corrected is the drift Ary used to see.
          `clock=${(info.clockRatio || 1).toFixed(3)}${info.retimed ? ' retimed' : ''}`
        );
        // Every beat, when its line was due and when the picture actually got
        // there. Without this the only visible number is the total overrun,
        // which says a video ran long and nothing about which beat spent the
        // time. Four attempts at the padding were made without it.
        if (shot.beats?.length) {
          console.log(
            `beats ${slug}: ` +
            shot.beats.map((b) => `${b.key}@${b.dueAt}->${b.shownAt}(${b.lateBy >= 0 ? '+' : ''}${b.lateBy})`).join(' ')
          );
        }
      }
      return c.json({
        ok: true,
        slug,
        url: hosted?.url || null,
        uploadError,
        bytes: mp4.length,
        seconds: Number(info.finalSeconds.toFixed(1)),
        script,
        findings: found.findings,
        voice: audio.settings,
      });
    }

    c.header('Content-Type', 'video/mp4');
    c.header('Content-Disposition', 'inline; filename="audit.mp4"');
    // The interesting numbers ride along as headers so the caller can log them
    // without the body needing to be JSON.
    c.header('X-Audit-Script-Chars', String(audio.chars));
    c.header('X-Audit-Audio-Cached', String(audio.cached));
    // Which settings produced this file. Tuning by ear across a dozen renders
    // is impossible if you cannot tell afterwards which one you are listening
    // to.
    c.header('X-Audit-Voice', audio.settings);
    c.header('X-Audit-Seconds', info.finalSeconds.toFixed(1));
    // How much padding the mux still had to add. Near zero means the pacing
    // worked; a large number means the walkthrough could not stretch far
    // enough and hit its clamp.
    c.header('X-Audit-Pad-Seconds', Math.abs(info.videoSeconds - info.audioSeconds).toFixed(1));
    // How many beats were timed to the narration rather than merely fitted to
    // its overall length. Zero means the alignment did not come back and the
    // video is only length-matched.
    c.header('X-Audit-Cues', String((audio.cues || []).length));
    c.header('X-Audit-LeadIn', (info.leadInSec || 0).toFixed(1));
    // The worst any beat missed its line by, in seconds. This is the number
    // that actually answers "is it synced", and nothing else does: scene
    // detection and freeze detection each gave a different answer because they
    // measure the picture changing, not the picture matching the words.
    const late = (shot.beats || []).map((b) => b.lateBy);
    if (late.length) {
      c.header('X-Audit-Worst-Drift', Math.max(...late.map(Math.abs)).toFixed(1));
      c.header('X-Audit-Beats', JSON.stringify(shot.beats).slice(0, 1400));
    }
    return c.body(mp4);
  } catch (e) {
    // Logged as well as returned. The reason went back in the response body and
    // nowhere else, so a render that ran for four minutes and threw left an
    // access-log line reading 500 with no hint of what failed. Two of those on
    // tranquilhypno.com.au and revivebodytherapy.com cost most of an hour of
    // guessing at a message that already existed.
    console.error(`render failed for ${url}: ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`);
    return c.json({ error: e.message }, 500);
  } finally {
    IN_FLIGHT.delete(inFlightKey);
    if (shot?.dir) await rm(shot.dir, { recursive: true, force: true }).catch(() => {});
    if (outDir) await rm(outDir, { recursive: true, force: true }).catch(() => {});
  }
});

const port = Number(process.env.PORT) || 8080;
serve({ fetch: app.fetch, port }, () => console.log(`audit-render listening on ${port}`));
