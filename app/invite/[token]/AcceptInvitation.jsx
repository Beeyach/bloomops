'use client';

import { useState } from 'react';

export default function AcceptInvitation({ token, workspaceName, roleLabel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function accept() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/bloomops/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'The invitation could not be accepted.');
      window.location.href = '/';
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="text-center">
      <p className="text-[14px] text-ink-2 text-balance">
        You have been invited to join <span className="text-ink font-medium">{workspaceName}</span> as {roleLabel}.
      </p>
      {error && <p role="alert" className="text-[13px] text-poppy-text mt-3">{error}</p>}
      <button
        type="button"
        onClick={accept}
        disabled={busy}
        className="w-full mt-4 btn-bloom font-medium rounded-[10px] py-3 text-[14px] transition disabled:opacity-40"
      >
        {busy ? 'Joining…' : 'Accept and continue'}
      </button>
    </div>
  );
}
