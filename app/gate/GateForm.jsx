'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/Icons';

// The greeting name is per-device, the same as the theme. It lives in
// localStorage under ltb_name and TodayView reads it. Asking here means a new
// workspace greets you by name on the very first screen instead of saying
// nothing until someone finds it in Settings.
function storedName() {
  try {
    return localStorage.getItem('ltb_name') || '';
  } catch {
    return '';
  }
}

export default function GateForm() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [askName, setAskName] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Only asked when this device has no name yet. Signing in is something you
  // do repeatedly; a field you have already answered is friction, and Settings
  // remains the place to change it.
  useEffect(() => {
    setAskName(!storedName());
  }, []);

  async function submit(e) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'That code did not work.');
      }
      // Saved only once the code is accepted, so a stranger guessing codes
      // cannot leave their name on someone else's device. Written before the
      // navigation because the next page reads it on mount.
      if (name.trim()) {
        try {
          localStorage.setItem('ltb_name', name.trim().slice(0, 60));
        } catch {}
      }
      // Cookie is set; a full navigation re-runs middleware and lets us in.
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-[380px] rise-in">
      <div className="flex flex-col items-center text-center mb-6">
        <svg viewBox="0 0 32 32" aria-hidden="true" className="w-[44px] h-[44px] mb-3">
          <g fill="var(--rose)">
            <circle cx="16" cy="8.5" r="6" /><circle cx="23.5" cy="13.5" r="6" />
            <circle cx="20.5" cy="22" r="6" /><circle cx="11.5" cy="22" r="6" />
            <circle cx="8.5" cy="13.5" r="6" />
          </g>
          <circle cx="16" cy="15.5" r="4.4" fill="var(--bg)" />
        </svg>
        <h1 className="font-logo text-[30px] text-bright leading-tight">
          Leads <em className="italic text-rose-text">that</em> Bloom
        </h1>
        <p className="text-[13.5px] text-ink-3 mt-1">Enter your access code to open your workspace.</p>
      </div>

      <form onSubmit={submit} className="glass-panel p-4">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access code"
          autoComplete="off"
          autoFocus
          aria-label="Access code"
          className="w-full text-center tracking-[0.06em] bg-input border border-line rounded-[10px] px-3 py-3 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-rose"
        />
        {askName && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="What should we call you? (optional)"
            autoComplete="given-name"
            maxLength={60}
            aria-label="Preferred name"
            className="w-full mt-2 text-center bg-input border border-line rounded-[10px] px-3 py-3 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-rose"
          />
        )}
        {error && <p role="alert" className="text-[13px] text-poppy-text mt-2 text-center">{error}</p>}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="w-full mt-3 btn-bloom font-medium rounded-[10px] py-3 text-[14px] transition disabled:opacity-40"
        >
          {busy ? 'Opening…' : 'Open my workspace'}
        </button>
      </form>

      {/* A stranger (or a member with a typo'd code) shouldn't dead-end.
          text-balance evens the two lines out, and the link is nowrap so it
          breaks as a whole phrase. It was wrapping mid-link and leaving
          "yours." stranded on a line by itself. */}
      <p className="text-center text-[12px] text-ink-3 mt-4 text-balance">
        No access code? Leads That Bloom is invite-only.{' '}
        <span className="whitespace-nowrap">
          <a
            href="https://bloomwired.io/contact"
            target="_blank"
            rel="noreferrer"
            className="text-ink-2 hover:text-rose-text underline underline-offset-2"
          >
            Ask Bloomwired for yours
          </a>.
        </span>
      </p>

      <p className="text-center text-[11.5px] text-ink-3 mt-4">
        Powered by{' '}
        <a
          href="https://bloomwired.io"
          target="_blank"
          rel="noreferrer"
          className="text-ink-2 hover:text-rose-text underline underline-offset-2 decoration-transparent hover:decoration-current transition"
        >
          Bloomwired
        </a>{' '}
        <span className="inline-block align-[-2px] text-rose-text" aria-hidden="true"><Icon name="flower" className="w-3.5 h-3.5" strokeWidth={1.8} /></span>
      </p>
    </div>
  );
}
