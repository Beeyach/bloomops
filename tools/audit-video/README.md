# Audit video — capture tool

Records a walkthrough video of a prospect's site and reports what it actually
found, so the tedious part of a video audit is done before you hit record.

```
cd tools/audit-video
npm install
npx playwright install chromium   # first time only
node record.mjs https://theirsite.com
```

Outputs into `out/`:

- `theirsite-com.webm` — the walkthrough
- `theirsite-com.findings.json` — what was checked, for `audit_notes`

## The workflow this is built for

Play the video back and record yourself talking over it (Loom, or anything).
The capture is automated; your voice is not. That is deliberate — the scrolling
and pointing is the boring part, and the voice is the part that gets replies.

Full automation (synthetic narration, hosted, a button in the app) needs a
render service, R2, and TTS. Worth doing only if this format proves itself
first — see the notes in the chat history.

## What it checks

Only things read off the live rendered DOM, never assumed:

- A call to action above the fold (word-boundaried match, so "Playbook" is not
  mistaken for "Book")
- A tappable `tel:` link
- A contact form, or an email link if there is no form
- A mobile viewport meta tag

Findings are labelled on screen only when the element was genuinely located —
each one is tagged with `data-aud` and boxed by that tag, so a callout can never
point at the wrong element.

## Notes

- Standalone by design: its own `package.json`, so nothing here reaches the app's
  dependencies or the Cloudflare build.
- Output is `.webm` (Playwright's format). It plays in Chrome, which is all the
  record-over-it workflow needs. Converting to `.mp4` would mean adding ffmpeg.
- Sites that block headless browsers, or sit behind a consent wall, will record
  whatever the wall shows. Check the video before sending it.
