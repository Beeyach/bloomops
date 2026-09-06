'use client';

import { useState } from 'react';

// Email in, magic link out. The response is the same whether or not the
// address is known, and the copy says so: the person is told to check their
// mail, never that an account exists or does not.
export default function SignInForm({ next = '/', buttonLabel = 'Email me a sign-in link' }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    const address = email.trim();
    if (!address || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/sign-in/magic-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address, callbackURL: next, newUserCallbackURL: next, errorCallbackURL: '/sign-in' }),
      });
      if (res.status === 429) throw new Error('Too many attempts. Wait a minute and try again.');
      if (res.status === 503) throw new Error('Sign-in email is not set up on this deployment yet.');
      if (!res.ok) throw new Error('That did not work. Check the address and try again.');
      setSent(true);
    } catch (err) {
      setError(err.message || 'That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center" role="status">
        <p className="text-[15px] text-ink font-medium">Check your email</p>
        <p className="text-[13.5px] text-ink-3 mt-2 text-balance">
          If <span className="text-ink-2">{email.trim()}</span> belongs to a BloomOps workspace, a sign-in link is on its way.
          It works once and expires in 15 minutes.
        </p>
        <button
          type="button"
          onClick={() => { setSent(false); }}
          className="mt-4 text-[12.5px] text-ink-2 hover:text-rose-text underline underline-offset-2"
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="sign-in-email" className="block text-[12.5px] text-ink-3 mb-1.5">Email address</label>
      <input
        id="sign-in-email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        autoFocus
        required
        className="w-full bg-input border border-line rounded-[10px] px-3 py-3 text-[15px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-rose"
      />
      {error && <p role="alert" className="text-[13px] text-poppy-text mt-2">{error}</p>}
      <button
        type="submit"
        disabled={busy || !email.trim()}
        className="w-full mt-3 btn-bloom font-medium rounded-[10px] py-3 text-[14px] transition disabled:opacity-40"
      >
        {busy ? 'Sending…' : buttonLabel}
      </button>
    </form>
  );
}
