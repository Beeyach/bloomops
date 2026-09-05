'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import BloomSpinner from './BloomSpinner';
import {
  addRender,
  removeRender,
  getRender,
  isRendering,
  listRenders,
  queueRenders,
  MAX_CONCURRENT,
} from '@/lib/renderQueue.mjs';
import { watchUrl, watchPreviewUrl } from '@/lib/watch-url.mjs';
import { ensureThumb, linkedImageHtml } from '@/lib/thumb-client.mjs';

// The audit video for one prospect: a narrated walkthrough of their own site,
// recorded by services/audit-render and hosted on R2.
//
// A render takes two to four minutes, which is longer than Cloudflare will hold
// a request open, so POST only starts it. The service names the file from the
// domain, so the address is known before the render finishes and this polls a
// known URL rather than waiting on a job id.
//
// Because the address is fixed, a render survives closing the drawer. Opening
// it again checks once on mount and picks up anything that landed meanwhile.

const POLL_MS = 8000;
// The drawer used to keep its own six-minute deadline, which was shorter than
// the queue's, so at eleven minutes it said the render had failed while the
// card in the corner was still counting. Two parts of the same screen
// disagreeing about one render. The queue owns the lifetime now; the drawer
// only reports what the queue already decided.
//
// The one exception is a queue that could not be written at all, in private
// browsing or a full quota, where isRendering is false from the first tick. A
// minute's grace keeps that from reading as an instant failure.
const NO_QUEUE_GRACE_MS = 60 * 1000;

// The tier ranks one thing: whether a video has anything real to show. It says
// nothing about whether the prospect is worth pursuing, and everyone here still
// gets the full email sequence. The scanner used to call the bottom tier SKIP,
// which read as skip the prospect, so it is displayed in plain words now. Old
// scans still hold the literal 'SKIP', which means the same thing.
const TIER_LABEL = {
  SEND: 'Worth a video',
  MAYBE: 'Borderline',
  NO_VIDEO: 'Nothing to show',
  SKIP: 'Nothing to show',
  BLOCKED: 'Could not read their site',
};

const TIER_NOTE = {
  SEND: 'Something on their site is visibly broken. A video has something real to show.',
  MAYBE: 'A few small things. Worth a look before spending the credits.',
  NO_VIDEO: 'Their site is in good order, so a video would have to invent a problem. Email them as normal.',
  SKIP: 'Their site is in good order, so a video would have to invent a problem. Email them as normal.',
  BLOCKED: 'Their site refused to load for the scanner, so nothing was checked. Worth looking yourself.',
};

// Every problem the scan finds carries a weight, and the score is their sum.
// The weights are how much the problem actually costs the owner, not how easy
// it is to spot: a captcha erroring so nobody can send the form is 10, a form
// with no contact details anywhere is 8, a copyright still reading 2019 is 6,
// and a missing "we reply within a day" line is 1. Eight and up is worth
// recording, four to seven is worth a look first.
const SCORE_HELP =
  'The weights of everything found on their site, added up. A broken captcha alone is 10, no contact details is 8, a stale copyright year is 6. Eight or more is worth recording.';

// One tone per verdict, used by the chip, the advice line, and the panel's
// edge stripe together — the state should be readable from color and symbol
// before any words are. "Nothing to show" is GOOD news, so it wears leaf.
const TIER_TONE = {
  SEND:     { icon: 'flame',          color: 'var(--rose-text)', border: 'var(--rose-line)' },
  MAYBE:    { icon: 'search',         color: 'var(--gold-text)', border: 'var(--gold)' },
  NO_VIDEO: { icon: 'check',          color: 'var(--leaf-text)', border: 'var(--leaf)' },
  SKIP:     { icon: 'check',          color: 'var(--leaf-text)', border: 'var(--leaf)' },
  BLOCKED:  { icon: 'alert-triangle', color: 'var(--poppy-text)', border: 'var(--poppy)' },
};

// The score bands match the scan's own cutoffs: eight and up is worth recording,
// four to seven is worth a look, below that is quiet. The colour carries the
// band so the number does not have to be read to know where it sits.
// Accepts an array (enriched prospect) or a JSON string (raw store row) and
// always returns an array, so the reasons list renders in either context.
function normalizeReasons(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function severityStyle(score) {
  if (score >= 8) return 'border-rose bg-blush-soft text-rose-text';
  if (score >= 4) return 'border-gold bg-hover-wash-soft text-gold-text';
  return 'border-line text-ink-3';
}

// What Ary noticed herself, stored as [{ text, where }].
//
// Kept separate from video_reasons, which records what the audit concluded and
// feeds the email. This is a person overriding that, and keeping the two apart
// means neither can later be mistaken for the other.
function parseOwnFindings(raw) {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x) => x && String(x.text || '').trim()) : [];
  } catch {
    return [];
  }
}

// Where to point the camera. Writing a CSS selector is not a reasonable thing
// to ask of somebody describing a problem, and roughly where it sits turns out
// to be enough.
const WHERE_OPTIONS = [
  ['', 'anywhere'],
  ['top', 'top of the page'],
  ['middle', 'middle'],
  ['bottom', 'bottom'],
  ['contact', 'contact page'],
];

export default function AuditVideo({ prospect: p, onPatch }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [url, setUrl] = useState(p.video_url || null);
  const [state, setState] = useState('idle'); // idle | starting | waiting | timeout
  const [error, setError] = useState(null);
  // Draft of a new point, kept out of the saved list until it is added, so a
  // half-typed sentence is never what a video says.
  const [ownDraft, setOwnDraft] = useState('');
  const [ownWhere, setOwnWhere] = useState('');
  const own = parseOwnFindings(p.own_findings);

  const saveOwn = (next) => onPatch?.({ own_findings: next.length ? JSON.stringify(next) : null });
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  // idle | working | copied — the thumbnail takes a couple of seconds (it
  // seeks the video and uploads a frame), so the button says what it is doing.
  const [thumbState, setThumbState] = useState('idle');
  const startedAt = useRef(null);
  // The ETag of whatever was at the video's address when the current render
  // started. null means nothing was there, so any file that appears is the one.
  const baselineEtag = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/auth')
      .then((r) => r.json())
      .then((d) => { if (alive) setIsAdmin(d.role === 'admin'); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Reset when the drawer switches to a different prospect. If a render for
  // this one is still running, rejoin it rather than offering to start a second
  // one, and rejoin it at its real start time: stamping the clock at the moment
  // the drawer reopened would show a render three minutes in as "0s" and give
  // it a fresh six minutes before giving up.
  useEffect(() => {
    setUrl(p.video_url || null);
    setError(null);
    // Only one that is actually recording. A queued entry has no startedAt yet,
    // and treating it as running showed "Recording their site · NaNs".
    const running = getRender(p.id);
    if (running && running.state === 'running' && running.startedAt) {
      startedAt.current = running.startedAt;
      baselineEtag.current = running.baselineEtag || null;
      setElapsed(Math.round((Date.now() - running.startedAt) / 1000));
      setState('waiting');
    } else {
      startedAt.current = null;
      // A baseline belongs to one render on one prospect. Carrying it across
      // would judge the next prospect's video against the last one's tag.
      baselineEtag.current = null;
      setElapsed(0);
      setState('idle');
    }
  }, [p.id, p.video_url]);

  // Returns { url, etag } for whatever is currently at the address, or null.
  const check = useCallback(async () => {
    const res = await fetch(`/api/audit-video?id=${p.id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Could not check for the video.');
    return data.ready ? { url: data.url, etag: data.etag || null } : null;
  }, [p.id]);

  // One check on mount, so a render started earlier and forgotten shows up.
  useEffect(() => {
    if (!isAdmin || url || !p.domain) return;
    let alive = true;
    check()
      .then((found) => {
        if (!alive || !found) return;
        setUrl(found.url);
        onPatch?.({ video_url: found.url });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [isAdmin, url, p.domain, check, onPatch]);

  // Poll while a render is in flight.
  useEffect(() => {
    if (state !== 'waiting') return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
      try {
        const found = await check();
        if (!alive) return;
        // A re-record overwrites the same address, so "a file is there" is not
        // the question — "is it a different file than the one we started with?"
        // is. baselineEtag holds what was there when this render began: null on
        // a first render (anything counts), or the old recording's tag on a
        // re-record, which must change before this is finished.
        const isNew =
          !!found && (!baselineEtag.current || (found.etag && found.etag !== baselineEtag.current));
        if (isNew) {
          setUrl(found.url);
          setState('idle');
          removeRender(p.id);
          onPatch?.({ video_url: found.url });
          return;
        }
      } catch {
        // A failed poll is not a failed render. Keep waiting.
      }
      if (alive && !isRendering(p.id) && Date.now() - startedAt.current > NO_QUEUE_GRACE_MS) {
        setState('timeout');
      }
    };
    const id = setInterval(tick, POLL_MS);
    tick();
    return () => { alive = false; clearInterval(id); };
  }, [state, check, onPatch, p.id]);

  async function start() {
    setError(null);
    setState('starting');
    // What is at the address right now. On a re-record this is the recording
    // being replaced, and the poll waits for the tag to change rather than
    // declaring victory over the file that is already sitting there.
    try {
      const before = await check();
      baselineEtag.current = before?.etag || null;
    } catch {
      baselineEtag.current = null;
    }

    // Renders run one at a time, because two sharing the audio cache fell over
    // each other. The batch runner already knew that; this button did not, so
    // starting a second one by hand got a 429 from Cloud Run and, because
    // nothing read that reply, a spinner that ran for twenty minutes on a
    // render that had never begun. Past the limit it joins the queue instead,
    // and the watcher starts it when the running one finishes.
    if (listRenders().filter((r) => r.state === 'running' && r.id !== p.id).length >= MAX_CONCURRENT) {
      queueRenders([{ id: p.id, name: p.name || p.business_name || p.domain, baselineEtag: baselineEtag.current }]);
      setState('idle');
      setError('Another video is already recording. This one is queued and will start when it finishes.');
      return;
    }
    try {
      const res = await fetch('/api/audit-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not start the render.');
      startedAt.current = Date.now();
      setElapsed(0);
      setState('waiting');
      // Handed to the app-level watcher, which keeps looking after this drawer
      // is closed and after the page is reloaded.
      // The baseline rides along in the queue entry so it survives a reload:
      // rejoining a re-record without it would compare the new file against
      // nothing and accept the old one immediately.
      addRender({
        id: p.id,
        name: p.name || p.business_name || p.domain,
        baselineEtag: baselineEtag.current,
      });
    } catch (e) {
      setError(e.message);
      setState('idle');
    }
  }

  async function copy() {
    try {
      // The watch page, never the bare mp4: the branded page is the one with
      // her name and a button on it, so it is the only link worth mailing.
      await navigator.clipboard.writeText(watchUrl(url));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Could not copy. Select the link and copy it by hand.');
    }
  }

  // Draw the frame, host it, and put a linked image on the clipboard. Pasted
  // into Gmail, the html flavour is what lands: the image shows in the email
  // and clicking it opens the watch page. The plain flavour is the bare link,
  // for anywhere that does not take rich paste. The canvas and upload live in
  // lib/thumb-client.mjs, shared with the sequence modal's rich copy.
  async function copyThumbnail() {
    try {
      setThumbState('working');
      const thumb = await ensureThumb(url);
      const watch = watchUrl(url);
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([linkedImageHtml(watch, thumb)], { type: 'text/html' }),
          'text/plain': new Blob([watch], { type: 'text/plain' }),
        }),
      ]);
      setThumbState('copied');
      setTimeout(() => setThumbState('idle'), 2500);
    } catch (e) {
      setThumbState('idle');
      setError(`Could not make the thumbnail. ${e.message}`);
    }
  }

  if (!isAdmin) return null;

  const tier = p.video_tier || null;
  const busy = state === 'starting' || state === 'waiting';
  // reasons may arrive as an array (enriched) or a JSON string (raw store row).
  const reasons = normalizeReasons(p.video_reasons);

  const tone = tier ? TIER_TONE[tier] : null;
  return (
    <div
      className="rounded-[10px] border border-line bg-hover-wash-soft px-3.5 py-3 space-y-2.5"
      style={tone ? { boxShadow: `inset 2px 0 0 0 ${tone.border}` } : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-serif text-[14px] text-ink">
          <Icon name="play" className="w-3.5 h-3.5 text-ink-2" />
          Audit video
        </span>
        <div className="flex items-center gap-1.5 flex-wrap justify-end shrink-0">
          {/* Severity only shows when the verdict says there's something to
              record. "Severity 2" next to "Nothing to show" read as the panel
              arguing with itself — the score below the record-threshold is
              exactly why there's nothing to show. */}
          {p.video_score != null && (tier === 'SEND' || tier === 'MAYBE') && (
            <span
              title={SCORE_HELP}
              className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border cursor-help ${severityStyle(p.video_score)}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
              Severity {p.video_score}
            </span>
          )}
          {tier && tone && (
            <span
              title={TIER_NOTE[tier] || ''}
              className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border"
              style={{ color: tone.color, borderColor: tone.border }}
            >
              <Icon name={tone.icon} className="w-3 h-3" />
              {TIER_LABEL[tier] || tier}
            </span>
          )}
        </div>
      </div>

      {/* What the scan actually found worth recording — the "why" behind the
          tier, so the recording session knows what to point the cursor at. The
          drawer passes the raw row, where reasons is still a JSON string, so
          normalize rather than assume it was enriched into an array. */}
      {reasons.length > 0 ? (
        <div>
          <span className="block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3 mb-1">
            What the scan found
          </span>
          <ul className="flex flex-wrap gap-1">
            {reasons.map((r, i) => (
              <li
                key={i}
                className="text-[11px] text-ink-2 bg-hover-wash-soft border border-line rounded-full px-2 py-0.5"
              >
                {r}
              </li>
            ))}
          </ul>
        </div>
      ) : (tier === 'SEND' || tier === 'MAYBE') ? (
        // A tier with no reasons behind it is the state that produced a
        // glazing video: a score says something is wrong and nothing on
        // record says what, so the recorder has nothing to point at either.
        // Say so here rather than letting the severity chip imply otherwise.
        <p className="text-[12px] text-gold-text leading-snug">
          The scan rated this {p.video_score ?? '?'} but did not record what it found, so there is nothing for the video to point at yet.
          Add what you noticed below, or re-run the audit on this prospect first.
        </p>
      ) : null}

      {!p.domain && (
        <p className="text-[12px] leading-relaxed text-ink-3">
          Add a domain first. The video is a recording of their site.
        </p>
      )}

      {p.domain && url && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={watchPreviewUrl(url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-rose-text hover:underline"
            >
              <Icon name="external-link" className="w-3.5 h-3.5" />
              Watch
            </a>
            <button
              onClick={copy}
              className="text-[12px] px-2.5 py-1 rounded-[7px] border border-line-strong text-ink hover:border-rose hover:text-rose-text transition"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              onClick={copyThumbnail}
              disabled={thumbState === 'working'}
              title="Copies a clickable picture of the video. Paste it straight into the Gmail body and the image links to the watch page."
              className="text-[12px] px-2.5 py-1 rounded-[7px] border border-line-strong text-ink hover:border-rose hover:text-rose-text transition disabled:opacity-60"
            >
              {thumbState === 'working' ? 'Making it…' : thumbState === 'copied' ? 'Copied, paste it in Gmail' : 'Copy email thumbnail'}
            </button>
            <button
              onClick={start}
              disabled={busy}
              title="Records it again from scratch. Only worth it if their site has changed."
              className="ml-auto text-[12px] text-ink-3 underline decoration-dotted disabled:opacity-50"
            >
              {busy ? 'Recording…' : 'Re-record'}
            </button>
          </div>
          <div className="text-[11px] font-mono text-ink-3 break-all leading-relaxed">{watchUrl(url)}</div>
        </>
      )}

      {/* Things the checks cannot see.
          
          A hero video that will not play is obvious to anyone looking at the
          page and invisible to every test in the suite, and a video that
          discusses the footer while that sits on screen reads as not having
          looked. These are spoken first and word for word. */}
      {p.domain && !busy && (
        <div className="rounded-[10px] border border-line bg-paper/40 p-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-ink-2">
              <Icon name="mic" className="w-3 h-3" />
              Also mention
            </span>
            <span
              className="text-[10px] text-ink-3 cursor-help border border-line rounded-full px-1.5 py-0.5"
              title="Things YOU noticed on their site. The video opens with these, spoken in your exact words, before the scanner's own findings. Up to 3."
            >{own.length}/3 · said first</span>
          </div>

          {own.map((o, i) => (
            <div key={i} className="flex items-start gap-2 text-[12px]">
              <span className="flex-1 text-ink-2 leading-snug">
                {o.text}
                {o.where ? <span className="text-ink-3"> · {WHERE_OPTIONS.find(([v]) => v === o.where)?.[1] || o.where}</span> : null}
              </span>
              <button
                onClick={() => saveOwn(own.filter((_, n) => n !== i))}
                aria-label="Remove"
                className="shrink-0 text-ink-3 hover:text-rose-text transition"
              >
                ✕
              </button>
            </div>
          ))}

          {own.length < 3 && (
            <div className="space-y-1.5">
              <textarea
                value={ownDraft}
                onChange={(e) => setOwnDraft(e.target.value)}
                rows={2}
                maxLength={200}
                placeholder="the video in your header doesn't play, it just sits black"
                className="w-full px-2 py-1.5 text-[12px] text-charcoal bg-surface border border-line rounded-lg outline-none resize-none leading-relaxed focus:border-mauve-deep transition"
              />
              <div className="flex items-center gap-2">
                <select
                  value={ownWhere}
                  onChange={(e) => setOwnWhere(e.target.value)}
                  className="text-[11px] px-2 py-1 rounded-lg bg-surface border border-line-strong text-ink outline-none"
                >
                  {WHERE_OPTIONS.map(([v, label]) => (
                    <option key={v} value={v}>{label}</option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    const text = ownDraft.trim();
                    if (!text) return;
                    saveOwn([...own, { text, where: ownWhere || undefined }]);
                    setOwnDraft('');
                    setOwnWhere('');
                  }}
                  disabled={!ownDraft.trim()}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-lg border border-line-strong text-ink hover:border-mauve disabled:opacity-40 transition"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {own.length > 0 && (
            <p className="text-[10px] text-ink-3 leading-relaxed">
              Spoken exactly as written, before anything the scan found. They count
              towards the three, so {own.length === 3 ? 'nothing the scan found will be said' : `${3 - own.length} scanned ${3 - own.length === 1 ? 'finding' : 'findings'} will follow`}.
            </p>
          )}
        </div>
      )}

      {/* Reason first, then the action. Reading why before deciding is the
          order the decision actually happens in. */}
      {p.domain && !url && !busy && (
        <>
          <p
            className="flex items-start gap-1.5 text-[12px] leading-relaxed"
            style={{ color: tone ? tone.color : 'var(--ink-3)' }}
          >
            {tone && <Icon name={tone.icon} className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
            <span>
              {tier && TIER_NOTE[tier]
                ? TIER_NOTE[tier]
                : 'Not scanned yet. It will record whatever it finds, or nothing if the site is fine.'}
            </span>
          </p>
          {/* When the scan's own verdict is "nothing worth recording", the
              button stops dressing like the recommended action — a loud rose
              CTA under advice saying don't was the drawer contradicting
              itself. Still clickable: Ary can overrule the scan. */}
          <button
            onClick={start}
            // The Re-record button below has always been guarded and this one
            // never was, so an impatient second click on the main button
            // started a second render and spent a second set of credits.
            disabled={busy}
            className={`text-[13px] font-medium px-3 py-1.5 rounded-[8px] transition disabled:opacity-50 ${
              tier === 'NO_VIDEO' || tier === 'SKIP'
                ? 'border border-line-strong text-ink hover:bg-hover-wash-soft'
                : 'btn-bloom'
            }`}
          >
            {busy ? 'Recording…' : 'Record audit video'}
          </button>
        </>
      )}

      {busy && (
        <div className="flex items-center gap-3">
          <BloomSpinner size={30} />
          <div className="min-w-0">
            <p className="text-[13px] text-ink-2">
              Recording their site{state === 'waiting' && elapsed ? ` · ${elapsed}s` : ''}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-3">
              Usually two to four minutes. Close this and it keeps going, and the app
              tells you when it lands.
            </p>
          </div>
        </div>
      )}

      {state === 'timeout' && (
        <p className="text-[12px] leading-relaxed text-ink-2">
          This one has stopped being tracked. It may still land, so reopen this later to check.
          If it does not, the render failed and the service logs will say why.
        </p>
      )}

      {error && <p className="text-[12px] leading-relaxed text-rose-text">{error}</p>}
    </div>
  );
}
