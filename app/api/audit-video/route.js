import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getDb } from '@/lib/db';
// From the service's own directory, not lib/. The Docker build context is
// services/audit-render, so a file outside it is not in the image and the
// container failed to start. Next can import it from here without trouble.
import { greetingFor } from '@/services/audit-render/greeting.mjs';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { spendCredits, refundCredits, OUT_OF_CREDITS } from '@/lib/credits.mjs';

export const dynamic = 'force-dynamic';

// Kicks off an audit video for one prospect, and reports whether it has landed.
//
// Admin only, and checked here on the server rather than by hiding a button.
// Two reasons: the render spends real ElevenLabs credits from Ary's account,
// and this route holds the render secret. A client-side gate protects neither.
//
// The render takes about three minutes, which is longer than Cloudflare will
// hold a request open, so this does not wait for it. It fires the render and
// returns the URL the video WILL have. The browser then polls GET on this same
// route until the file exists.
//
// That works because the service names videos deterministically from the
// domain, so the address is known before the render finishes. No job table, no
// queue, no callback.

// Mirrors slugFor() in services/audit-render/server.mjs, and must keep mirroring
// it: the whole design rests on both sides deriving the same name from the same
// domain. It also has to satisfy the review worker's SLUG_RE, which is that
// worker's security boundary.
// The whole hostname, dots turned into dashes, because the TLD is part of who
// somebody is. It used to be stripped: bodyworks.ca and bodyworks.com both
// became "bodyworks", and the slug is the address the video is stored at and
// the name the watch page is served under. One prospect's recording overwrote
// the other's at a link that had already been emailed, the readiness check
// found the wrong video sitting at the right address and stamped it onto the
// wrong row, and the view beacon credited whichever of the two the database
// returned first. Prospects on the same base name are not rare: a business and
// its .ca, a clinic and its booking subdomain.
function slugFor(domain) {
  let host = String(domain || '').trim();
  try {
    host = new URL(host.startsWith('http') ? host : `https://${host}`).hostname;
  } catch {
    // Fall through and slugify whatever was given.
  }
  return (
    host
      .replace(/^www\./, '')
      .toLowerCase()
      // Dashes are doubled BEFORE dots become dashes, so my-clinic.com and
      // my.clinic.com cannot land on the same name.
      .replace(/-/g, '--')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || null
  );
}

// Bindings and vars come off the request context on Pages. process.env works
// for wrangler.toml vars in this setup but not for everything, so read the
// context first and fall back, the same way every other route here does.
function env() {
  try {
    return { ...process.env, ...(getCloudflareContext().env || {}) };
  } catch {
    return process.env || {};
  }
}

function videoUrl(slug) {
  const base = (env().VIDEO_BASE_URL || 'https://file.gobloomwired.com').replace(/\/+$/, '');
  return `${base}/video/${slug}`;
}

async function loadProspect(db, id, workspace) {
  return db
    .prepare('SELECT id, domain, name, business_name, video_url, stage, next_action_date, video_sent_at, own_findings FROM prospects WHERE id = ? AND workspace = ?')
    .bind(id, workspace)
    .first();
}

// GET ?id=123 — has the video landed yet?
export async function GET(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can render audit videos.' }, { status: 403 });
  }

  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const db = getDb();
  const row = await loadProspect(db, id, ctx.workspace);
  if (!row) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

  const slug = slugFor(row.domain);
  if (!slug) return NextResponse.json({ ready: false, error: 'This prospect has no usable domain.' });

  const url = videoUrl(slug);
  // HEAD rather than GET: an mp4 is tens of megabytes and we only want to know
  // whether it exists.
  //
  // The ETag rides along because existence alone cannot answer "has the NEW one
  // landed?". A re-record writes over the same address, so a caller watching
  // for the file to appear sees the old one still sitting there and calls the
  // render finished the instant it starts. The ETag changes when the bytes do,
  // which is the only way to tell the second recording from the first.
  let ready = false;
  let etag = null;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    ready = res.ok;
    if (ready) etag = res.headers.get('etag');
  } catch {
    ready = false;
  }

  // Did the render already give up? A refusal cannot come back inside the six
  // second window the POST waits: probe() alone spends a minute or more before
  // it can decide, so the POST always answers "started" and the browser then
  // polled an address that would never answer for the full twelve minutes.
  //
  // The background writer does record the refusal on the row. This reads it
  // back, so the card says what happened in about a minute instead of spinning
  // out the timeout. `since` is the moment this render started, so a NO_VIDEO
  // left by an earlier precheck is not mistaken for today's answer.
  if (!ready) {
    const since = String(new URL(req.url).searchParams.get('since') || '');
    const stoppedTier = row.video_tier === 'BLOCKED' || row.video_tier === 'NO_VIDEO';
    if (since && stoppedTier && String(row.updated_at || '') > since) {
      let why = '';
      try {
        const list = JSON.parse(row.video_reasons || '[]');
        if (Array.isArray(list) && list.length) why = String(list[0]);
      } catch {}
      return NextResponse.json({
        ready: false,
        stopped: true,
        error: why || 'The render stopped without producing a video.',
      });
    }
  }

  // Record it the first time it appears, so the link survives a page reload
  // without another poll.
  if (ready && row.video_url !== url) {
    // A video for someone the sequence has finished with needs a date, or it is
    // never sent.
    //
    // Email 5 and Finished have no due cadence of their own — that is what
    // finished means — so the row only comes back if next_action_date puts it
    // there. window.bloom.setVideoUrl has always done this, but that is the
    // path a skill takes. A render started from the app wrote the link and
    // nothing else, so the video landed, the row stayed invisible, and the
    // sweep never saw it. Personal Training by Miles & Co sat like that from
    // the 16th with a finished video nobody could send.
    //
    // Only ever moves the date closer. A prospect already due sooner keeps
    // their date, because a video is a reason to reach out earlier and never a
    // reason to wait longer. Skipped when a video has already gone out.
    const POST_SEQUENCE = new Set(['Email 5', 'Finished']);
    const VIDEO_FOLLOWUP_DAYS = 5;
    const iso = (d) => d.toISOString().slice(0, 10);
    const alreadySent = !!String(row.video_sent_at || '').trim();
    let dateSql = '';
    const binds = [url, new Date().toISOString()];
    if (!alreadySent && POST_SEQUENCE.has(row.stage)) {
      const target = iso(new Date(Date.now() + VIDEO_FOLLOWUP_DAYS * 86400000));
      const current = String(row.next_action_date || '').trim();
      if (!current || current > target) {
        dateSql = ', next_action_date = ?';
        binds.splice(1, 0, target);
      }
    }
    await db
      .prepare(`UPDATE prospects SET video_url = ?${dateSql}, updated_at = ? WHERE id = ? AND workspace = ?`)
      .bind(...binds, id, ctx.workspace)
      .run();
  }

  return NextResponse.json({ ready, url: ready ? url : null, slug, etag });
}

// POST { id } — start a render.
export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  if (ctx.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can render audit videos.' }, { status: 403 });
  }

  const e = env();
  const service = (e.RENDER_URL || '').replace(/\/+$/, '');
  const secret = e.RENDER_SECRET;
  if (!service || !secret) {
    return NextResponse.json({ error: 'Video rendering is not configured on this deployment.' }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const id = Number(body?.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const db = getDb();
  const row = await loadProspect(db, id, ctx.workspace);
  if (!row) return NextResponse.json({ error: 'Prospect not found' }, { status: 404 });

  const slug = slugFor(row.domain);
  if (!slug) return NextResponse.json({ error: 'This prospect has no usable domain.' }, { status: 400 });

  // Recording is the most expensive thing the app does, so it is charged up
  // front and given straight back if the service refuses to record.
  const charge = await spendCredits(db, ctx.workspace, 'video');
  if (!charge.ok) {
    return NextResponse.json(
      { error: `${OUT_OF_CREDITS} A video costs ${charge.price} credits and there are ${charge.balance} left.`, outOfCredits: true },
      { status: 402 }
    );
  }

  // A first name only when we are sure we have one. About a quarter of the
  // prospect list carries the business in the name field, and this used to
  // compare the first WORD of the name against the WHOLE business name, so
  // "Total Body Training" against "Total Body Training" did not match and the
  // video opened with "Hey Total".
  //
  // greetingFor lives with the narration so the app and the CLI cannot drift
  // apart on it, and returns a first name, a business to address as a team, or
  // neither.
  const greeting = greetingFor(row.name, row.business_name);

  // The narrating voice for this workspace, if one has been cloned. Without it
  // the render falls back to its default voice, so a workspace that has not set
  // one up is unaffected. This is what makes a client's videos sound like the
  // client rather than like Ary.
  let voice = null;
  try {
    const vrow = await db
      .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'voice'`)
      .bind(ctx.workspace)
      .first();
    const parsed = vrow?.value ? JSON.parse(vrow.value) : null;
    if (parsed?.voiceId) voice = { voiceId: parsed.voiceId };
  } catch {
    // Any trouble reading it just means the default voice is used.
  }

  // Deliberately not awaited to completion. A render is about three minutes and
  // Cloudflare closes a request at 100 seconds, so waiting would fail every
  // time. Cloud Run finishes the work and uploads the result regardless of
  // whether we are still listening, and the URL is already known, so the
  // browser polls GET for it.
  //
  // But "not awaited at all" meant a render that was refused outright looked
  // identical to one that started: Cloud Run answers 429 in milliseconds when
  // every instance is busy, nothing read that, and the browser sat on a
  // spinner for twenty minutes waiting for a video nobody was making. So the
  // first few seconds ARE waited on. A refusal arrives in that window; a real
  // render is still going, which is what tells us it started.
  const settled = fetch(`${service}/render`, {
    method: 'POST',
    headers: { 'x-render-secret': secret, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: row.domain,
      name: greeting.name || null,
      team: greeting.team || null,
      // Set when the name carries a title, so the greeting opens with Hi
      // rather than Hey against a formal address.
      formal: greeting.formal || false,
      // What Ary noticed herself, spoken before anything measured. Parsed here
      // rather than sent raw so a malformed value cannot reach the renderer.
      ownFindings: (() => {
        try {
          const v = JSON.parse(row.own_findings || '[]');
          return Array.isArray(v)
            ? v.filter((x) => x && String(x.text || '').trim()).slice(0, 3)
            : [];
        } catch {
          return [];
        }
      })(),
      // The tracker's business name, so the script does not have to infer one
      // from the page title. That inference called a Boston studio "Boston".
      business: row.business_name || null,
      upload: true,
      slug,
      ...(voice ? { voice } : {}),
    }),
  })
    // Read to a plain object once, here. Two things below need the outcome —
    // the early check and the failure recorder — and a Response body can only
    // be read once, so letting both call res.json() would have starved one of
    // them of the reason it was reporting.
    .then(async (res) => {
      if (!res) return { ok: false, status: 0, error: 'Could not reach the render service.' };
      if (res.ok) return { ok: true, status: res.status };
      const body = await res.json().catch(() => ({}));
      // `blocked` rides along, because it is the only thing that actually says
      // the verdict is about their site rather than about us.
      return {
        ok: false,
        status: res.status,
        error: body.error || null,
        blocked: body.blocked || null,
        // The verdict rides along too: it carries the plain-word findings the
        // recorder judged too small, which is what the card should show.
        verdict: body.verdict || null,
        // Same reason `blocked` rides along: it names which kind of refusal
        // this was, and the recorder routes it to Setup Check on that.
        nothingToSay: body.nothingToSay || null,
      };
    })
    .catch((e) => ({ ok: false, status: 0, error: String(e?.message || e).slice(0, 200) }));

  // Keeps the subrequest alive after this response is sent. Without it the
  // runtime cancels the fetch the moment this function returns, and the render
  // is never even requested — the symptom being a spinner that runs its whole
  // timeout while Cloud Run's logs show no request from Cloudflare at all.
  //
  // This used to reach for globalThis[Symbol.for('__cloudflare_context__')],
  // which is not the API on Pages: the lookup returned undefined, the optional
  // chaining swallowed it, and the catch made the failure invisible. Every
  // other route here reads the context through getCloudflareContext, so this does
  // too, and a missing waitUntil is now logged rather than ignored.
  //
  // It now also carries the failure to the prospect. A render that fails does
  // so quickly — a page that will not load gives up at the 45 second
  // navigation timeout — but the reply landed somewhere nobody was listening,
  // so a dead site looked exactly like a slow one and the browser waited out
  // its full twenty minutes to learn nothing.
  //
  // Written as BLOCKED with the reason in video_reasons rather than into a new
  // column: that tier already means "their site would not load for us", which
  // is exactly this, and the drawer already shows both.
  const recorded = settled.then(async (r) => {
    if (r.ok) return;
    // Nothing was recorded, so nothing is owed.
    await refundCredits(db, ctx.workspace, charge.price).catch(() => {});
    // Only when the failure is about THEIR site, and that is now decided by
    // what the service reported rather than by which of our own faults we
    // remembered to exclude.
    //
    // The old test listed the statuses that were ours: 429, 503, and a 500 whose
    // message mentioned configuration. Every other failure was assumed to be the
    // prospect's, so a 500 from a busy service wrote "could not read their site"
    // onto empoweringhealth.clinic, whose site is fine and had just rendered.
    // A deny-list of our own failure modes can only ever be as complete as the
    // failures already seen, and each new one lands on a prospect.
    //
    // The service says so explicitly when a site is at fault: it returns 422
    // with a `blocked` payload naming the reason, parked or empty or refusing.
    // Nothing else is evidence about them. Wrong in the tracker is worse than
    // absent from it, because absent gets retried and wrong gets believed.
    // Nothing verifiable to say. Not a fault on either side: their site is
    // fine as far as a headless browser can tell, and the audit's own
    // findings live in the tracker where the renderer cannot see them. This
    // needs Ary's eyes, so it goes to Setup Check, which always surfaces in
    // Today's "Needs you" list. A toast would have been the only trace, and
    // toasts do not survive a closed tab.
    if (r.status === 422 && r.nothingToSay) {
      // Keep what it DID find, in plain words, so the card shows the small
      // things it judged not worth two minutes rather than going blank. The
      // note explains the verdict; the findings explain the note.
      const found = Array.isArray(r.verdict?.reasons) ? r.verdict.reasons : [];
      const note = found.length
        ? `Not worth a video: ${r.verdict.why}`
        : 'Video not recorded: the probe could not verify anything on their site. Add what you noticed under "What you noticed" and record again.';
      await db
        .prepare(
          `UPDATE prospects SET stage = 'Setup Check', video_tier = 'NO_VIDEO', video_score = ?, video_reasons = ?, updated_at = ?
           WHERE id = ? AND workspace = ?`
        )
        .bind(
          Math.round(Number(r.verdict?.score) || 0),
          JSON.stringify([note, ...found].slice(0, 6)),
          new Date().toISOString(),
          id,
          ctx.workspace
        )
        .run()
        .catch(() => {});
      return;
    }
    const theirs = r.status === 422 && r.blocked;
    if (!theirs) return;
    const reason = String(r.error || 'That site could not be read.').slice(0, 300);
    await db
      .prepare(
        `UPDATE prospects SET video_tier = 'BLOCKED', video_reasons = ?, updated_at = ?
         WHERE id = ? AND workspace = ?`
      )
      .bind(JSON.stringify([reason]), new Date().toISOString(), id, ctx.workspace)
      .run()
      .catch(() => {});
  }).catch(() => {});

  try {
    const rc = getCloudflareContext()?.ctx;
    if (rc?.waitUntil) rc.waitUntil(recorded);
    else console.warn('audit-video: no waitUntil available; the render may be cancelled');
  } catch (err) {
    console.warn('audit-video: could not get the request context', String(err));
  }

  // Long enough for a refusal to come back, far short of a render. Whichever
  // resolves first wins: a rejection means it never started and the caller is
  // told so instead of being left watching nothing, and the timeout winning is
  // the normal, healthy case.
  const early = await Promise.race([
    settled.then((r) => (r.ok ? null : r)),
    new Promise((r) => setTimeout(() => r(null), 6000)),
  ]);

  if (early) {
    const message =
      early.status === 429
        ? 'The render service is busy with other videos right now. Try again in a few minutes.'
        : early.error || `The render service refused this one (HTTP ${early.status}).`;
    return NextResponse.json({ error: message, status: early.status }, { status: 503 });
  }

  return NextResponse.json({
    started: true,
    slug,
    url: videoUrl(slug),
    // A render is 2 to 4 minutes depending on how many pages the crawl opens.
    estimateSeconds: 200,
  });
}
