# audit-render

Takes a prospect's URL, returns a narrated mp4 audit in Ary's cloned voice.

Runs on **Cloud Run**, not on the app's Cloudflare Worker — Workers have no
browser, no ffmpeg, and nowhere near the CPU time this needs.

```
POST /render   { url, name?, script?, dryRun?, voice? }  → video/mp4
POST /say      { text?, voice? }                         → audio/mpeg
GET  /health                                             → { ok: true }
```

`dryRun` returns the findings and the script and spends nothing. `/say` speaks
one short line for about 90 credits, for judging a voice without rendering a
video.

Locked behind an `x-render-secret` header. That is guarding **money**, not
data: without it, anyone who finds the URL can spend your ElevenLabs credits
and CPU.

## Pipeline

1. **capture.mjs → probe()** — loads the site, follows the contact link,
   decides the findings. No recording, so it is fast and free to repeat.
2. **narrate.mjs** — turns the findings into a script, then ElevenLabs speaks it
3. **capture.mjs → walkthrough()** — records the video, stretching each hold so
   the picture runs as long as the audio
4. **mux.mjs** — ffmpeg combines the two into an mp4

The order matters. The script cannot be written until the findings are known,
and the walkthrough cannot be paced until the audio has been measured.
Recording first meant the video was whatever length it happened to be, and the
mux padded the difference, so the voice carried on over a frozen frame.

Only things read off the live rendered DOM are ever reported. This gets
narrated at a prospect, so being confidently wrong is the one failure that
actually costs something.

## Deploy

Once, per machine:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

Then from this folder:

```bash
gcloud run deploy audit-render \
  --source . \
  --region us-east1 \
  --memory 4Gi \
  --cpu 2 \
  --timeout 600 \
  --concurrency 1 \
  --max-instances 3 \
  --no-allow-unauthenticated \
  --set-env-vars RENDER_SECRET=pick-a-long-random-string \
  --set-env-vars ELEVENLABS_API_KEY=your-key \
  --set-env-vars ELEVENLABS_VOICE_ID=your-cloned-voice-id
```

Why those flags:

- `--memory 4Gi` — Chromium and ffmpeg together will OOM below this
- `--concurrency 1` — one render per instance; two browsers in one container
  fight over memory
- `--timeout 600` — a render is 1–3 minutes; the default 300s is too tight
- `--max-instances 3` — a ceiling on what a runaway loop can spend
- `--no-allow-unauthenticated` — belt and braces alongside the secret. Drop it
  only if the app calls this without a Google identity token, and rely on the
  secret then.

## Test it

Script and findings only, **no ElevenLabs call, no credits spent**:

```bash
curl -X POST "$URL/render" \
  -H "x-render-secret: $SECRET" -H "Content-Type: application/json" \
  -d '{"url":"https://someprospect.com","dryRun":true}'
```

Use `dryRun` while iterating on wording or pacing. Only drop it once the script
reads the way you want.

The real thing:

```bash
curl -X POST "$URL/render" \
  -H "x-render-secret: $SECRET" -H "Content-Type: application/json" \
  -d '{"url":"https://someprospect.com","name":"Dave"}' \
  --output audit.mp4
```

## Voice

Settled by ear over a long day of auditions. Do not change these casually;
each one was chosen against a specific fault.

| setting | value | why |
| --- | --- | --- |
| model | `eleven_turbo_v2_5` | v3 phrases better but cannot hold a cloned accent. It read strongly British on a voice that is not, on both an instant and a professional clone, at every stability, with and without a language code, and with accent tags. Turbo held the real accent throughout. |
| speed | 0.9 | 1.0 ran too fast to follow once style was up |
| stability | 0.45 | generation is per segment, and this is what makes segment three sound like segment one |
| similarity | 0.8 | 0.95 was so faithful it reproduced "the" as "da"; 0.6 went toneless |
| style | 0.2 | 0.4 and up read as performing, and made one sentence race the next |
| language_code | none | does not affect accent, and is unsupported on multilingual_v2 |
| accent tag | none | not obeyed on this voice; a single tag and a per-segment tag both failed |

Generated **per segment**, not as one call, with a **0.7s** pause between.
ElevenLabs' guidance is that a voice drifts and degrades "over longer audio
generations", which is exactly what a 600-character script did: it started well
and went limp by the end. Each sentence group is now its own short generation,
about the length of a `/say` audition.

The pause is a constant and must stay one. Two renders of the same script have
to be identical, and a pause that moves reads as a glitch.

`/say` splits on sentence boundaries the same way, so an audition and a render
run the same code. They did not for most of a day, which is why short tests
kept sounding right and long renders did not.

## Credits

Turbo bills at **0.5 credits per character**, half what v2 and v3 cost, so
choosing it for the accent halved the price of a video as well.

| | credits |
| --- | ---: |
| a typical render (~630 chars) | ~315 |
| a `/say` audition | ~90 |
| `dryRun` | 0 |
| re-render, script unchanged | 0 |

About 120 videos per 10k credits.

Audio is cached **per segment**, by hash of that segment's text plus every
voice setting. Editing one sentence re-bills that sentence rather than the
whole script, and re-rendering an unchanged prospect costs nothing. Changing
any voice setting invalidates everything, which is deliberate: a stale hit
while tuning looks exactly like the change having no effect.

**Note:** the cache lives on the instance's local disk, so it is lost when
Cloud Run scales to zero. It saves credits within a session, not across days.
Point `AUDIO_CACHE_DIR` at persistent storage if that ever matters.

## Known limits

- Sites that block headless browsers, or sit behind a consent wall, get that
  recorded. Watch a video before sending it.
- Pacing is clamped to 0.6x–3x. A script far outside the usual length will hit
  the clamp and the mux will pad the rest. `X-Audit-Pad-Seconds` on the
  response says how much padding was actually needed; near zero means the
  pacing worked.
- The mp4 comes back in the response body. Fine for one-at-a-time. Uploading
  to R2 and returning a link is the next step, and is what the app will want.
