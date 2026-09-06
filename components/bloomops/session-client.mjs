// Sign out from the browser: end the Better Auth session, then go to the
// sign-in screen. Shared by the account menus and the sign-out buttons so
// there is one way to leave.
export async function signOutAndLeave(next = '/sign-in') {
  try {
    await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  } catch {}
  window.location.href = next;
}

// The first letters of a person's name (or their address), for the
// avatar. Never an image, never generated.
export function initialsOf(name, email = '') {
  const source = String(name || '').trim() || String(email || '').split('@')[0];
  const parts = source.replace(/[._-]+/g, ' ').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
