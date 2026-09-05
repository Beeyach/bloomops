/**
 * bloomwired-review
 *
 * Serves prospect assets from R2 at clean, branded URLs:
 *   GET  /review/{slug}   → streams the PDF inline (opens in the browser)
 *   PUT  /review/{slug}   → uploads a PDF (requires the bearer secret)
 *   GET  /video/{slug}    → streams the audit mp4, seekable
 *   PUT  /video/{slug}    → uploads an mp4 (requires the bearer secret)
 *   GET  /shot/{slug}     → serves an evidence screenshot
 *   PUT  /shot/{slug}     → uploads one (requires the bearer secret)
 *   GET  /watch/{slug}    → branded watch page around the video, with a CTA
 *
 * Slugs are lowercase-hyphenated names, e.g. /review/renee-zaia
 *
 * One worker, one bucket, one secret. A separate video.gobloomwired.com would
 * be a custom domain pointed at this same worker, which is a dashboard change
 * rather than a code one, so nothing here forecloses it.
 */

// Only lowercase letters, digits and hyphens. This is the security boundary:
// without it a caller could PUT/GET arbitrary R2 keys (../, leading slashes,
// or overwrite unrelated objects in a shared bucket).
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;

// The only paths that exist. Anything else is a 404 before a bucket is
// touched, so a new kind has to be added here deliberately rather than by
// someone guessing a URL.
const KINDS = {
  review: { ext: 'pdf', type: 'application/pdf', suffix: '-review.pdf' },
  video: { ext: 'mp4', type: 'video/mp4', suffix: '-audit.mp4' },
  // The email thumbnail: a frame of the audit video with a play button baked
  // in, pasted into Gmail as a linked image. Same rules as the others — GET
  // is public, PUT needs the bearer secret.
  thumb: { ext: 'png', type: 'image/png', suffix: '-thumb.png' },
  // Evidence screenshots: what a prospect's page actually looked like, at a
  // stated viewport, at a stated moment. Kept apart from `thumb` because they
  // are a different thing with a different lifetime — a thumbnail is a picture
  // of our own video, and these are the proof behind a sentence in an email.
  //
  // Public on GET, like the others. That is required rather than incidental:
  // the vision model is handed the URL rather than several megabytes of
  // base64, so the image has to be fetchable. The slug carries a content hash,
  // so a URL cannot be guessed from a domain name, and the content is a
  // screenshot of a page that is already public.
  shot: { ext: 'png', type: 'image/png', suffix: '-shot.png' },
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

// Constant-time-ish comparison so a wrong secret can't be discovered by
// timing the response. Not strictly necessary here, but it's one line.
function secretsMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Splits /video/some-slug into its kind and slug, or null if the shape is wrong.
function parsePath(pathname) {
  const m = pathname.match(/^\/([a-z]+)\/(.+?)\/*$/);
  if (!m) return null;
  const kind = KINDS[m[1]];
  if (!kind) return null;
  let slug;
  try {
    slug = decodeURIComponent(m[2]);
  } catch {
    return null;
  }
  if (!SLUG_RE.test(slug)) return null;
  return { kind, slug, key: `${slug}.${kind.ext}` };
}

// Parses a single "bytes=start-end" range against a known size. Returns null
// for anything unsatisfiable or multi-range, which the caller answers whole.
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || '').trim());
  if (!m) return null;
  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return null;

  let start;
  let end;
  if (rawStart === '') {
    // "bytes=-500" means the last 500 bytes.
    const tail = Number(rawEnd);
    if (!Number.isFinite(tail) || tail <= 0) return null;
    start = Math.max(0, size - tail);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Number(rawEnd);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

// Turns a slug back into something like a business name for the page title:
// trailing TLD tokens dropped, hyphens to spaces, words capitalised.
// "peopleedge-com" → "Peopleedge", "bloom-salon-com-au" → "Bloom Salon".
// Best effort only — the fallback headline works without a name.
const TLD_TOKENS = new Set(['com', 'net', 'org', 'au', 'ca', 'co', 'us', 'uk', 'io', 'nz', 'biz', 'info', 'www']);
function prettyName(slug) {
  const parts = slug.split('-');
  while (parts.length > 1 && TLD_TOKENS.has(parts[parts.length - 1])) parts.pop();
  // A single long token is a domain with the words mashed together —
  // "doolancoaching" — and capitalising it produces a name nobody has.
  // No name reads better than a wrong one, so those fall back to the
  // generic headline.
  if (parts.length === 1 && parts[0].length > 12) return '';
  return parts.map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');
}

// The watch page. A prospect used to be handed the bare mp4 in a black tab:
// no name on it, no sign a person made it, and when the video asked its
// closing question there was nothing on screen to click. This wraps the same
// stream in one screen with exactly one thing to do after watching.
//
// The beacon tells the tracker the video was watched and how far. Sent as
// text/plain so the browser fires it without a CORS preflight, and via
// sendBeacon so closing the tab does not lose it. Milestones rather than a
// stream: the tracker cares that it was opened and roughly how much got
// watched, not about every second.
function watchPage(slug, env, hasThumb) {
  const name = prettyName(slug);
  const cta = env.CTA_URL || 'mailto:hello@bloomwired.io?subject=My%20website%20video';
  const title = name ? `A short video about the ${name} website` : 'A short video about your website';
  // The email thumbnail doubles as the player's opening frame: their site
  // with a play button, instead of a white void until the stream's first
  // frame arrives. Only when one has actually been generated.
  const poster = hasThumb ? ` poster="/thumb/${slug}"` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="Two minutes on your website: what is quietly costing you enquiries, and what to do about it.">
<meta property="og:type" content="video.other">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;1,500&family=Poppins:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  /* The prospect-PDF design language: cream paper, big serif with a mauve
     italic turn, white cards with soft borders, a dark plum close. */
  :root {
    --rose: #A63D5F; --mauve: #8C5F75; --plum: #241B22;
    --ink: #2B2126; --ink-2: #6E5A63; --line: #EADDE2; --paper: #FBF7F4;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Poppins', system-ui, sans-serif; background: linear-gradient(180deg, #F6EEF0 0%, var(--paper) 220px); color: var(--ink); min-height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 28px 18px 0; }
  .wrap { width: 100%; max-width: 980px; }
  .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 26px; }
  /* The real Bloomwired wordmark, inlined so the page stays one request.
     Extracted from the prospect PDFs, background cleared. */
  .wordmark { height: 26px; width: auto; display: block; }
  .prepared { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 12px 18px; text-align: left; box-shadow: 0 4px 18px rgba(90, 40, 60, 0.06); }
  .prepared .label { font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--mauve); font-weight: 600; margin-bottom: 3px; }
  .prepared .who { font-family: 'Playfair Display', Georgia, serif; font-size: 19px; color: var(--ink); }
  h1 { font-family: 'Playfair Display', Georgia, serif; font-weight: 600; font-size: clamp(28px, 4.6vw, 44px); line-height: 1.12; letter-spacing: -0.01em; margin-bottom: 10px; max-width: 20ch; }
  h1 em { font-style: italic; color: var(--rose); font-weight: 500; }
  .sub { color: var(--ink-2); font-size: 15.5px; margin-bottom: 24px; max-width: 62ch; }
  .player { background: #fff; border: 1px solid var(--line); border-radius: 14px; padding: 10px; box-shadow: 0 14px 40px rgba(90, 40, 60, 0.12); }
  video { width: 100%; border-radius: 8px; background: #000; display: block; }
  .close { background: var(--plum); color: #fff; border-radius: 14px; margin: 30px 0 26px; padding: 26px 30px; display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
  .close .ask { font-family: 'Playfair Display', Georgia, serif; font-size: 22px; }
  .close .ask em { font-style: italic; color: #E8A9BE; }
  .close .why { font-size: 13.5px; color: rgba(255,255,255,0.75); max-width: 40ch; }
  .btn { display: inline-block; background: var(--rose); color: #fff; font-weight: 600; font-size: 15px; padding: 13px 28px; border-radius: 8px; text-decoration: none; white-space: nowrap; }
  .btn:hover { filter: brightness(1.12); }
  .quiet { font-size: 12.5px; color: rgba(255,255,255,0.65); margin-top: 8px; }
  .brand { font-size: 12.5px; color: var(--ink-2); border-top: 1px solid var(--line); padding: 16px 0 26px; width: 100%; max-width: 980px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <img class="wordmark" src="data:image/png;base64,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xGerFa5ASBi+ML/Qj3eaUYI4Jfc/VmSz34JFZm3mEYlA1yfTbN+XyJRJlPyiSCnxsuU6u4mYCI+pd3WdiQsu5b5O2R1iOJXX0u/d8J54oOuDUCtjV81HmARcIKEP0rMBfEuY34aMgz/ZcUYpL/uNm3H6foGlGQaNkCaKBZxW/4PifBXxiSRW0v+/WmLcZyFxQnWKok4/8siWmdjbLTFvka/xkIOzbxViv9p3Eg3QvwvJdUgemOWusXFVN5JuTTcJCXufiD/E0yq49t0FUuJtWcmXzL5nSqlb3ASBvt3UxKVqPgn49oo6em60NPh4Y/mtUstRIqwtw8rKuc2UXoQflMnxPL/AI1luskC+vrWzZlnX9liO44vVM9QEqU1C2OYS6eZJ1DJ9TNCUPnPbKC47RV96wblOfE/z9vKxm6JvvObGWYPr+lanQ/GNNJ5v7AtE5SUMFTs3pFdk6Fm6s/eGnRsS7IBMvZECQhtJvNcQb9zHTfljT2ci8Qcyofi1O9bH2LVSZeUFXHxIhY/TLBSjIL34e+DUuLa25XJspFNlvMj30mRFyUMYH7w3/aqmxrcW146IqNMdGkIub87C1gZMPinetlHCVpSJ8gqK22NLgZXvznbz6GQg/kGqxP+dCkbPTHTElpI0fH4qGD8v0xFfkuowT+/tiH6uJ9zTohLYVJCuE+BDl22XtN91SjLY/TXsQ6O8CH24rJOeJQPRL+A6dzNiWdKNBezuMvvtAsUCDi2k0QEOhLzewtsJigXkN968xSqnlLaYTiS2EIdGOBOQ5wLCKXfR+sB/YDTAVZ9aPszj4/DJd5JyqFgSUD9OtzeMFviVQRzjaR/kO5Zy2mCRZmNjY3Vt7bxziew2Un324qATh2zcIKVlK5wE4YzAdsnnaKQrYUnE2AuvrvZ9F+MbOtLwisZvGjZuhrGV4gh/2qJFnhml1IHUJhkvVCkWf+MAHAKc/flE8igFskJFRs3vqamZ48VJN240JTJejVNxqrgzqKI+hGtkbPHeFuKSwJLbvuy+re2295qbNh2xNbR1Znpt+lizbdMRUkHaipfNui2XJhsFZL9h1Yb3oOF71vQcj4Dybli1Kq9zqaoyGhoTgGryawGkV1fnOczpN7c448gHQhomOKfD0/H07QpYnMmgjqussEazP5dQrNXyfsOzySJdu5K0+rzUDEttCHtepYYxo1Tp9e2ScJ0wBeWdSP1PtO0ms90dPGmVHF8VNMYTX01not84ZePDpfxuevOyjsZLiCrc0nF7PpV1wPJThLe3nRscXMJZFixve+FKxDuqQkvAgVZejYMLU9XvdN/W0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQODDw/wE9qC5c7lVCZAAAAABJRU5ErkJggg==" alt="Bloomwired" height="26">
    ${name ? `<div class="prepared"><div class="label">Prepared for</div><div class="who">${name}</div></div>` : ''}
  </div>
  <h1>Two minutes on your website. <em>What it might be costing you, and the fixes.</em></h1>
  <p class="sub">Everything in here was found on your actual site, checked page by page. The kind of small things visitors notice and owners never get told about.</p>
  <div class="player">
    <video controls preload="metadata"${poster} src="/video/${slug}" id="v"></video>
  </div>
  <div class="close">
    <div>
      <div class="ask">Worth fixing? <em>That's the part we do.</em></div>
      <div class="quiet">Or just reply to the email this came from. Either works.</div>
    </div>
    <a class="btn" href="${cta}">Get these fixed</a>
  </div>
</div>
<div class="brand"><span>bloomwired.io</span><span>prepared by Bloomwired</span></div>
<script>
(function () {
  var v = document.getElementById('v');
  var sent = {};
  var API = 'https://leadsthatbloom.com/api/public/video-view';
  // Ary checking her own work must never count as the prospect watching.
  // The tracker's own links carry ?preview=1; the flag is then remembered
  // for this browser, so pasting the plain link here later stays silent too.
  var OWNER_KEY = 'bw_owner_preview';
  var isOwner = false;
  try {
    if (/[?&]preview=1/.test(location.search)) localStorage.setItem(OWNER_KEY, '1');
    isOwner = localStorage.getItem(OWNER_KEY) === '1';
  } catch (e) {}
  function ping(pct) {
    if (isOwner) return;
    if (sent[pct]) return;
    sent[pct] = true;
    var body = JSON.stringify({ slug: ${JSON.stringify(slug)}, pct: pct });
    try {
      if (navigator.sendBeacon) navigator.sendBeacon(API, new Blob([body], { type: 'text/plain' }));
      else fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body, keepalive: true });
    } catch (e) {}
  }
  // Time actually watched, not where the scrubber is sitting. Dragging to the
  // end used to report "Watched the video to the end", and that line is what
  // puts a prospect at the top of Ary's day. Counted from the gaps between
  // timeupdate events, which only fire while the video is playing, and only
  // when the gap is small enough to have been playback rather than a jump.
  var watched = 0;
  var last = null;
  v.addEventListener('play', function () { ping(1); }, { once: true });
  v.addEventListener('seeking', function () { last = null; });
  v.addEventListener('pause', function () { last = null; });
  v.addEventListener('timeupdate', function () {
    if (!v.duration) return;
    var now = v.currentTime;
    if (last !== null) {
      var step = now - last;
      if (step > 0 && step < 1.5) watched += step;
    }
    last = now;
    var pct = (watched / v.duration) * 100;
    if (pct >= 95) ping(95);
    else if (pct >= 75) ping(75);
    else if (pct >= 50) ping(50);
    else if (pct >= 25) ping(25);
  });
})();
</script>
</body>
</html>`;
}

// The thing that makes LeadsThatBloom autonomous.
//
// Cron's only job is to wake the queue. It does no prospect work itself: it
// posts to the app, which claims one bounded batch and stops. A cron that did
// the work would be a cron nobody could bound, and Cloudflare would kill it
// mid-job with no record of where it got to.
//
// Two schedules, two rhythms:
//   every 5 minutes  drain approved sends
//   once a day       the bookkeeping: prospect-facts reconcile + tripwire
//
// Failure is loud in the log rather than silent, because a scheduled run that
// quietly does nothing is indistinguishable from a quiet day.
async function wakeQueue(env, { daily = false } = {}) {
  const base = env.APP_URL || 'https://leadsthatbloom.com';
  const secret = env.CRON_SECRET;
  if (!secret) {
    console.log('cron: CRON_SECRET is not set on the worker, nothing to do');
    return;
  }
  const url = `${base}/api/cron/drain`;
  try {
    const res = await fetch(url, {
      method: daily ? 'PUT' : 'POST',
      headers: { 'x-cron-secret': secret, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.log(`cron: drain answered ${res.status}`, JSON.stringify(body).slice(0, 300));
      return;
    }
    if (daily) {
      console.log('cron: daily bookkeeping', JSON.stringify({ outcome: body.outcome, reconcile: body.prospectFacts || null }));
      return;
    }
    // One line per invocation, short enough to scan a day of them.
    console.log(
      `cron: ran ${body.ran} job(s) in ${body.elapsedMs}ms across ${Object.keys(body.workspaces || {}).length} workspace(s)` +
      (body.moreWaiting ? ' — more waiting' : '')
    );
  } catch (err) {
    console.log('cron: could not reach the app:', String(err && err.message || err));
  }
}

export default {
  async scheduled(event, env, ctx) {
    // Anything that is not the five-minute drain is the daily wake. Matching
    // the drain rather than the daily one means moving the daily schedule
    // never silently turns it into a drain that does no sweeping.
    const daily = String(event.cron || '').trim() !== '*/5 * * * *';
    ctx.waitUntil(wakeQueue(env, { daily }));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // The watch page sits outside KINDS: it is a page about an asset rather
    // than an asset, and it must never be PUTtable.
    const watch = url.pathname.match(/^\/watch\/(.+?)\/*$/);
    if (watch && (request.method === 'GET' || request.method === 'HEAD')) {
      let slug;
      try {
        slug = decodeURIComponent(watch[1]);
      } catch {
        return new Response('Not found', { status: 404, headers: CORS });
      }
      // Tolerate a pasted mp4 link: /watch/kym.mp4 means /watch/kym.
      slug = slug.replace(/\.mp4$/, '');
      if (!SLUG_RE.test(slug)) {
        return new Response('Not found', { status: 404, headers: CORS });
      }
      // 404 when there is no video rather than a player pointed at nothing:
      // a prospect following a stale link should not see a broken page with
      // their name on it.
      const [head, thumbHead] = await Promise.all([
        env.PDF_BUCKET.head(`${slug}.mp4`),
        env.PDF_BUCKET.head(`${slug}.png`),
      ]);
      if (!head) return new Response('Not found', { status: 404, headers: CORS });
      return new Response(request.method === 'HEAD' ? null : watchPage(slug, env, !!thumbHead), {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300' },
      });
    }

    const target = parsePath(url.pathname);
    if (!target) {
      return new Response('Not found', { status: 404, headers: CORS });
    }
    const { kind, slug, key } = target;

    // ── Serve ────────────────────────────────────────────────────────────
    if (request.method === 'GET' || request.method === 'HEAD') {
      const rangeHeader = request.headers.get('Range');

      // Video needs range support or the browser cannot scrub, and some
      // players will not start at all. A PDF is fetched whole.
      if (rangeHeader && kind.ext === 'mp4') {
        const head = await env.PDF_BUCKET.head(key);
        if (!head) return new Response('Not found', { status: 404, headers: CORS });

        const range = parseRange(rangeHeader, head.size);
        if (!range) {
          return new Response('Range not satisfiable', {
            status: 416,
            headers: { ...CORS, 'Content-Range': `bytes */${head.size}` },
          });
        }

        const length = range.end - range.start + 1;
        const object = await env.PDF_BUCKET.get(key, { range: { offset: range.start, length } });
        if (!object) return new Response('Not found', { status: 404, headers: CORS });

        const headers = new Headers(CORS);
        headers.set('Content-Type', kind.type);
        headers.set('Content-Range', `bytes ${range.start}-${range.end}/${head.size}`);
        headers.set('Content-Length', String(length));
        headers.set('Accept-Ranges', 'bytes');
        headers.set('Cache-Control', 'public, max-age=86400');
        return new Response(request.method === 'HEAD' ? null : object.body, { status: 206, headers });
      }

      const object = await env.PDF_BUCKET.get(key);
      if (!object) {
        return new Response('Not found', { status: 404, headers: CORS });
      }

      const headers = new Headers(CORS);
      headers.set('Content-Type', kind.type);
      // `inline` so it opens in the browser rather than downloading.
      headers.set('Content-Disposition', `inline; filename="${slug}${kind.suffix}"`);
      headers.set('Cache-Control', 'public, max-age=86400');
      headers.set('Accept-Ranges', 'bytes');
      if (object.httpEtag) headers.set('ETag', object.httpEtag);

      return new Response(request.method === 'HEAD' ? null : object.body, { headers });
    }

    // ── Upload ───────────────────────────────────────────────────────────
    if (request.method === 'PUT') {
      // Fail closed: an unset secret must never mean "anyone may upload".
      if (!env.UPLOAD_SECRET) {
        return new Response('Upload not configured', { status: 500, headers: CORS });
      }
      const auth = request.headers.get('Authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!secretsMatch(token, env.UPLOAD_SECRET)) {
        return new Response('Unauthorized', { status: 401, headers: CORS });
      }

      // Streamed rather than buffered. An mp4 is tens of megabytes and
      // arrayBuffer() would hold all of it in the isolate's memory at once.
      if (!request.body) {
        return new Response('Empty body', { status: 400, headers: CORS });
      }

      await env.PDF_BUCKET.put(key, request.body, {
        httpMetadata: { contentType: kind.type },
      });

      return Response.json({ ok: true, slug, url: `${url.origin}${url.pathname}` }, { headers: CORS });
    }

    return new Response('Method not allowed', { status: 405, headers: CORS });
  },
};
