// Whether this workspace may run the Hive bees, fetched once and cached for
// the session. The server is the real gate (/api/ai refuses without an
// allowance); this only decides whether to draw the buttons, so a workspace
// with no allowance sees a plain explanation instead of dead controls.

let CACHE = null; // { allowed, perDay, isAdmin }

export async function beeAccess() {
  if (CACHE) return CACHE;
  try {
    const d = await fetch('/api/limits').then((r) => r.json());
    const perDay = Number(d?.limits?.beesPerDay || 0);
    const isAdmin = Boolean(d?.isAdmin);
    CACHE = { allowed: isAdmin || perDay > 0, perDay, isAdmin };
  } catch {
    // A failed check must not hide the feature from the person who has it:
    // the server refuses anyway, so assume allowed and let it answer.
    CACHE = { allowed: true, perDay: 0, isAdmin: false };
  }
  return CACHE;
}
