'use client';

import { useEffect, useState } from 'react';

// The stop that Cloudflare's alerts are not.
//
// Alerts fire after money is already gone and stop nothing; there is no hard
// spend cap on a paid plan. This is the actual stop: one press writes the
// pause flag, and every autonomous behavior halts at the next drain, within
// five minutes - the bookkeeping, the cleanup, and any approved sending.
// Nothing is lost while paused, and Resume picks up exactly where things
// stopped. The drain pulls the same flag by itself if one of its own runs
// ever reads like the August 2026 burns, so the worst case for the next bug
// of that class is five minutes and a fraction of a cent, not six days and
// an invoice.
//
// Deliberately its own component: the summary panels beside it are bound by
// a tested invariant to only read, and an emergency stop genuinely writes.
export default function SpendBreaker() {
  const [state, setState] = useState(null);
  const [flipping, setFlipping] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/system-pause')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d) setState(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  if (!state) return null;

  async function flip(next) {
    setFlipping(true);
    setErr('');
    try {
      const res = await fetch('/api/system-pause', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ paused: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) setErr(json?.error || 'That did not save. Try again.');
      else setState({ paused: next, reason: next ? 'paused by you' : '' });
    } catch {
      setErr('That did not save. Try again.');
    } finally {
      setFlipping(false);
    }
  }

  const paused = Boolean(state.paused);
  const selfTripped = paused && String(state.reason || '').startsWith('self-tripped');

  return (
    <section
      aria-label="Emergency stop"
      className={`border rounded-xl px-4 py-3 shadow-card ${paused ? 'border-poppy-text/40 bg-poppy-wash' : 'border-line-strong bg-panel'}`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">
            {paused ? 'Everything automatic is paused' : 'Emergency stop'}
          </h2>
          <p className="mt-0.5 text-[13px] text-ink-2 leading-relaxed max-w-[46ch]">
            {paused
              ? selfTripped
                ? `The app paused itself: ${state.reason}. Ask Claude to look before resuming.`
                : 'Nothing runs and nothing sends until you resume. Nothing is lost while paused.'
              : 'One press stops every automatic behavior within five minutes, sending included. Nothing is lost, and resuming picks up where things stopped.'}
          </p>
        </div>
        <button
          onClick={() => flip(!paused)}
          disabled={flipping}
          className={`text-[13px] font-semibold px-4 py-2 rounded-[8px] border transition ${
            paused
              ? 'border-leaf-text/40 bg-leaf-wash text-leaf-text hover:opacity-85'
              : 'border-poppy-text/40 bg-poppy-wash text-poppy-text hover:opacity-85'
          }`}
        >
          {flipping ? 'Saving…' : paused ? 'Resume' : 'Pause everything'}
        </button>
      </div>
      {err ? <p className="mt-1.5 text-[13px] text-poppy-text">{err}</p> : null}
    </section>
  );
}
