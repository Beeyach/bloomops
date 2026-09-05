'use client';

import { useState } from 'react';

export default function SignOutButton({ next = '/sign-in', label = 'Sign out' }) {
  const [busy, setBusy] = useState(false);
  async function signOut() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    } catch {}
    window.location.href = next;
  }
  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="w-full btn-bloom font-medium rounded-[10px] py-3 text-[14px] transition disabled:opacity-40"
    >
      {busy ? 'Signing out…' : label}
    </button>
  );
}
