'use client';

import { useState } from 'react';
import { Button, Field, Notice, fieldAria } from '@/components/bloomops/Primitives';

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
      <div role="status">
        <h2 className="bo-h2" style={{ marginBottom: 8 }}>
          Check your email
        </h2>
        <p className="bo-body">
          If <span className="bo-strong">{email.trim()}</span> belongs to a BloomOps workspace, a sign-in link is on its way. It works once and expires in 15 minutes.
        </p>
        <Button variant="ghost" onClick={() => setSent(false)} style={{ marginTop: 16, marginLeft: -16 }}>
          Use a different address
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bo-stack">
      <Field id="sign-in-email" label="Email address">
        <input
          {...fieldAria({ id: 'sign-in-email' })}
          className="bo-control"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          autoFocus
          required
        />
      </Field>
      {error && <Notice tone="error">{error}</Notice>}
      <Button type="submit" variant="primary" block loading={busy}>
        {buttonLabel}
      </Button>
    </form>
  );
}
