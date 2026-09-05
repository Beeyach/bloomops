'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icons';
import BloomSpinner from './BloomSpinner';
import {
  listRenders,
  removeRender,
  onRendersChanged,
  markRunning,
  markFailed,
  markPending,
  clearQueue,
  MAX_CONCURRENT,
} from '@/lib/renderQueue.mjs';

// Says when an audit video lands, wherever you happen to be by then.
//
// A render outlives the drawer that started it, so the drawer cannot be what
// watches for it. This sits at the app level, polls whatever the render queue
// holds, and puts the finished link in front of you rather than leaving you to
// remember to go back and look.

const POLL_MS = 10000;

function minutesSince(t) {
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}

export default function RenderWatcher() {
  const [queue, setQueue] = useState([]);
  const [done, setDone] = useState([]); // landed, not yet dismissed
  const [copied, setCopied] = useState(null);
  const [, setTick] = useState(0);
  // Renders this tab has begun starting but has not yet written to the queue.
  const claiming = useRef(new Set());

  useEffect(() => {
    const sync = () => setQueue(listRenders());
    sync();
    return onRendersChanged(sync);
  }, []);

  // Start queued renders as slots free up. This is the whole batch runner: the
  // service holds two at a time, so anything past that waits here rather than
  // queueing on Cloud Run and timing out.
  const pump = useCallback(async (q) => {
    const running = q.filter((r) => r.state === 'running');
    const pending = q.filter((r) => r.state === 'pending');
    const slots = MAX_CONCURRENT - running.length;
    if (slots <= 0 || !pending.length) return;
    for (const entry of pending.slice(0, slots)) {
      // Claimed in memory first. markRunning used to be the thing that stopped
      // a second tick starting the same render, but the baseline has to be read
      // before that, and an await in between would leave the entry startable
      // twice. This closes that window without depending on the write landing.
      if (claiming.current.has(entry.id)) continue;
      claiming.current.add(entry.id);
      // Publish the claim before doing anything that waits.
      //
      // `claiming` only exists inside this tab, and the queue lives in
      // localStorage, which every tab shares. With the app open twice both
      // watchers saw the same pending row, each claimed it in its own memory,
      // and the only thing another tab could have seen — the entry turning
      // `running` — did not happen until after the baseline fetch below. Both
      // posted the render. revivalcoaching was recorded three times inside two
      // minutes and raysoflifecoaching twice, each one a full render and a
      // fresh greeting off ElevenLabs.
      //
      // Writing the state first closes that window: localStorage is
      // synchronous, so a second tab reading the queue on its next tick sees
      // `running` and leaves it alone.
      markRunning(entry.id);
      // And if another tab got there in the same instant, its write lands too.
      // Whoever sees a startedAt that is not their own steps back rather than
      // both pressing on.
      const mine = listRenders().find((r) => r.id === entry.id);
      if (!mine || mine.state !== 'running') {
        claiming.current.delete(entry.id);
        continue;
      }
      // What is already at this video's address. On a re-record that is the
      // recording being replaced, and without it the watcher would announce
      // that file as the finished result the moment the render started.
      let baselineEtag = null;
      try {
        const pre = await fetch(`/api/audit-video?id=${entry.id}`);
        if (pre.ok) {
          const d = await pre.json();
          baselineEtag = d.ready ? d.etag || null : null;
        }
      } catch {
        // Unreadable baseline means this behaves as it always did.
      }
      markRunning(entry.id, baselineEtag);
      try {
        const res = await fetch('/api/audit-video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: entry.id }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          // Busy is not failed. The service takes two renders at a time and
          // refuses a third; with a long queue every entry is a third request
          // at some point, so this is the ordinary way a batch paces itself.
          // Sending it back to pending lets the watcher start it when a slot
          // frees, instead of putting a red line through a video nobody tried.
          // 409 means the service is already recording this exact site, so
          // this request was ignored rather than doubling it. Waiting is right:
          // the render that is running will finish and the watcher will see the
          // finished video the same as if this request had done the work.
          if (res.status === 409) markPending(entry.id);
          else if (res.status === 429 || res.status === 503) markPending(entry.id);
          else markFailed(entry.id, d.error || `HTTP ${res.status}`);
        }
      } catch (e) {
        markFailed(entry.id, e.message);
      } finally {
        // The queue entry is authoritative from here on, so the in-memory
        // claim is only needed for the gap above.
        claiming.current.delete(entry.id);
      }
    }
  }, []);

  const check = useCallback(async (entry) => {
    try {
      // `since` lets the route tell us the render already gave up, which is
      // the difference between a card that says why in a minute and one that
      // spins for twelve.
      const since = entry.startedAt ? new Date(entry.startedAt).toISOString() : '';
      const res = await fetch(`/api/audit-video?id=${entry.id}&since=${encodeURIComponent(since)}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.stopped) {
        markFailed(entry.id, data.error || 'The render stopped without producing a video.');
        return;
      }
      if (!data.ready || !data.url) return;
      // A re-record writes over the same address, so a file being there is not
      // the question — whether it is a DIFFERENT file is. baselineEtag is what
      // was at that address when this render started: without this the watcher
      // finds the recording being replaced and announces it as ready the
      // instant the render begins. Entries with no baseline are first renders,
      // where anything that appears is the one we asked for.
      if (entry.baselineEtag && (!data.etag || data.etag === entry.baselineEtag)) return;
      removeRender(entry.id);
      setDone((d) => (d.some((x) => x.id === entry.id) ? d : [...d, { ...entry, url: data.url }]));
    } catch {
      // Offline, or the app is mid-deploy. Try again on the next tick.
    }
  }, []);

  useEffect(() => {
    if (!queue.length) return;
    const run = () => {
      setTick((t) => t + 1); // refresh the elapsed minutes on screen
      // Only poll the ones actually rendering. A pending entry has no video to
      // look for yet, and polling it would waste a request per tick per row.
      queue.filter((r) => r.state === 'running').forEach(check);
      pump(queue);
    };
    const id = setInterval(run, POLL_MS);
    run();
    return () => clearInterval(id);
  }, [queue, check, pump]);

  async function copy(url, id) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      // Clipboard blocked. The link is on screen and selectable.
    }
  }

  if (!queue.length && !done.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[280px] space-y-2">
      {done.slice(-3).map((r) => (
        <div
          key={`done-${r.id}`}
          className="rounded-[10px] border border-rose bg-panel shadow-card px-3 py-2.5"
        >
          <div className="flex items-start justify-between gap-2">
            <span className="text-[13px] font-medium text-ink">{r.name} is ready</span>
            <button
              onClick={() => setDone((d) => d.filter((x) => x.id !== r.id))}
              aria-label="Dismiss"
              className="shrink-0 text-ink-3 hover:text-ink transition"
            >
              <Icon name="x" className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-rose-text hover:underline"
            >
              <Icon name="external-link" className="w-3.5 h-3.5" />
              Watch
            </a>
            <button
              onClick={() => copy(r.url, r.id)}
              className="text-[12px] px-2 py-0.5 rounded-[6px] border border-line-strong text-ink hover:border-rose hover:text-rose-text transition"
            >
              {copied === r.id ? 'Copied' : 'Copy link'}
            </button>
          </div>
        </div>
      ))}

      {queue.length > 0 && (() => {
        const running = queue.filter((r) => r.state === 'running');
        const pending = queue.filter((r) => r.state === 'pending');
        const failed = queue.filter((r) => r.state === 'failed');
        // One card for the batch. Seventy eight of them stacked would bury the
        // app, and the only thing worth knowing is how far along it is.
        return (
          <div className="rounded-[10px] border border-line bg-panel shadow-card px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <BloomSpinner size={24} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ink truncate">
                  {running.length === 1 && !pending.length
                    ? `Recording ${running[0].name}`
                    : `Recording ${running.length}, ${pending.length} waiting`}
                </div>
                <div className="text-[11px] text-ink-3">
                  {running.length === 1 && !pending.length
                    ? minutesSince(running[0].startedAt) < 1
                      ? 'Just started'
                      : `${minutesSince(running[0].startedAt)} min so far`
                    : `About ${Math.max(1, Math.ceil((running.length + pending.length) / MAX_CONCURRENT) * 3)} min left`}
                </div>
              </div>
              {(pending.length > 0 || queue.length > 1) && (
                <button
                  onClick={() => { clearQueue(); setQueue([]); }}
                  title="Stops the queue. Anything already recording still finishes and still costs its credits."
                  className="shrink-0 text-[11px] text-ink-3 underline decoration-dotted hover:text-ink"
                >
                  Stop
                </button>
              )}
            </div>
            {running.length > 0 && (running.length > 1 || pending.length > 0) && (
              <div className="mt-1.5 text-[11px] text-ink-3 truncate">
                {running.map((r) => r.name).join(', ')}
              </div>
            )}
            {/* Named, because "1 could not start" tells you a render failed and
                not which one, and with a batch running that is the only thing
                you need to know to queue it again. */}
            {failed.length > 0 && (
              <div className="mt-1.5 text-[11px] text-rose-text">
                <div>{failed.map((r) => r.name).join(', ')}</div>
                <div className="text-ink-3">{failed[0].error || 'could not start'}</div>
                <button
                  onClick={() => { failed.forEach((r) => removeRender(r.id)); setQueue(listRenders()); }}
                  className="mt-1 underline decoration-dotted hover:text-ink"
                >
                  Clear {failed.length === 1 ? 'it' : 'them'}
                </button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
