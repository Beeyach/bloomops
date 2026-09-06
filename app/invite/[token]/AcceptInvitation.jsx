'use client';

import { useState } from 'react';
import { Button, Notice } from '@/components/bloomops/Primitives';

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
    <div className="bo-stack">
      <p className="bo-body">
        You have been invited to join <span className="bo-strong">{workspaceName}</span> as {roleLabel}.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      <Button variant="primary" block loading={busy} onClick={accept}>
        Accept and continue
      </Button>
    </div>
  );
}
