'use client';

import { useEffect, useState } from 'react';
import { sendingState, MODE } from '@/lib/sending-state.mjs';

// The same answer as Start here, on the screen where somebody would go looking
// for it.
//
// There is no switch here, on purpose. Turning automatic sending on is not a
// thing to do while scrolling past; it is a deliberate act, and this pass is
// not the place to add the control for it. What this does is stop Settings
// being a screen full of dials that never says what the dials are currently
// doing.

export default function SendingSummary({ onNavigate }) {
  const [settings, setSettings] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) setSettings(d.settings || {}); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  if (failed) return null;
  const send = settings ? sendingState(settings) : null;

  const Line = ({ label, mode, text }) => (
    <div className="py-2.5 border-b border-line last:border-b-0">
      <div className="flex items-center gap-2.5 flex-wrap">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[8px] border text-[11.5px] font-semibold ${
            mode === MODE.AUTOMATIC
              ? 'bg-poppy-wash text-poppy-text border-poppy-text/30'
              : mode === MODE.MANUAL
                ? 'bg-leaf-wash text-leaf-text border-leaf-text/30'
                : 'bg-control-bg text-ink-2 border-line-strong'
          }`}
        >
          <span aria-hidden="true">{mode === MODE.AUTOMATIC ? '▶' : mode === MODE.MANUAL ? '✓' : '◦'}</span>
          {mode}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] text-ink-2 leading-relaxed">{text}</p>
    </div>
  );

  return (
    <section aria-label="What sends email right now" className="border border-line-strong rounded-xl bg-panel shadow-card px-4 py-3">
      <h2 className="text-[15px] font-semibold text-ink">What sends email right now</h2>
      <p className="mt-0.5 mb-1 text-[13px] text-ink-2">
        Read from this workspace's settings, so it cannot go out of date.
      </p>
      {!send ? (
        <p className="py-2.5 text-[13px] text-ink-3">Checking…</p>
      ) : (
        <>
          <Line label="First emails" mode={send.first.mode} text={send.first.detail} />
          <Line label="Follow-ups" mode={send.followups.mode} text={send.followups.detail} />
          <p className="pt-2.5 text-[12.5px] text-ink-2 leading-relaxed">
            Anything that does send goes out {send.window.text} ({send.window.timezone}) only, and never
            more than {send.caps.text}.
          </p>
        </>
      )}
      {onNavigate ? (
        <button
          onClick={() => onNavigate('start')}
          className="mt-2 text-[12.5px] font-medium px-3 py-1.5 rounded-[8px] border border-line-strong text-ink hover:bg-hover-wash-soft transition"
        >
          What all this means
        </button>
      ) : null}
    </section>
  );
}
