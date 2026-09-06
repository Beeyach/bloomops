'use client';

import { useState } from 'react';
import { Button } from '@/components/bloomops/Primitives';
import { signOutAndLeave } from '@/components/bloomops/session-client.mjs';

export default function SignOutButton({ next = '/sign-in', label = 'Sign out', block = false }) {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    await signOutAndLeave(next);
  }
  return (
    <Button onClick={signOut} loading={busy} block={block}>
      {label}
    </Button>
  );
}
