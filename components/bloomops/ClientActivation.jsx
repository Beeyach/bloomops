'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Notice } from './Primitives';

export default function ClientActivation({ clientId, draft, activation }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const current = outcome || activation;
  const activated = Boolean(current);
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/bloomops/clients/${clientId}/${activated ? 'retry-invitation' : 'activate'}`,
        { method: 'POST' },
      );
      const data = await response.json();
      if (!response.ok) {
        setError(data.error);
        return;
      }
      setOutcome({
        ...data,
        retryAvailable: data.deliveryStatus === 'failed' || data.deliveryStatus === 'pending',
      });
      router.refresh();
    } catch {
      setError('We could not confirm the result. Reload to check the client before trying again.');
    } finally {
      setBusy(false);
    }
  }
  if (!draft && !activated) return null;
  return (
    <form onSubmit={submit} className="bo-stack" aria-label="Client activation">
      {!activated && (
        <p className="bo-body">
          Activate when the purchased services and contact details are ready. Onboarding will be created and
          the primary contact will receive a portal invitation.
        </p>
      )}
      {activated && (
        <div role="status">
          <Notice tone={current.deliveryStatus === 'sent' ? 'success' : 'warning'}>
            {current.deliveryStatus === 'sent'
              ? 'Client activated. The portal invitation has been sent.'
              : current.deliveryStatus === 'sending'
                ? 'Client activated. The invitation is being sent. Reload to check its progress.'
                : 'Client activated. The invitation could not be sent. You can retry it safely.'}
          </Notice>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {(!activated || current.retryAvailable) && (
        <Button type="submit" variant="primary" loading={busy} disabled={busy}>
          {activated ? 'Retry invitation' : 'Activate Client'}
        </Button>
      )}
    </form>
  );
}
