// The spend breaker: the difference between an alert and a stop.
//
// Cloudflare's usage alerts fire after money is already gone and stop
// nothing; there is no hard cap on a paid plan. Ary asked for a stop. This
// is it, and it has two hands on it:
//
//   - hers: a pause control in Settings writes the flag, and every
//     autonomous behavior halts on the next drain, within five minutes.
//   - its own: the drain measures the rows its own bookkeeping read, and
//     trips the flag itself the first time a run looks like the Aug 2026
//     burn instead of the six days and ~$50 that one took to notice.
//
// Paused means paused. Approved sends wait too - a panic switch that lets
// some category keep running is a switch nobody can reason about mid-panic.
// Nothing is lost while paused: jobs stay queued, packages stay approved,
// and clearing the flag resumes exactly where things stopped.

export const AUTONOMY_FLAG = 'autonomy-paused';

// A normal drain's bookkeeping reads twenty to forty thousand rows. The two
// burns read 24 million per run. A hundred times normal is unambiguous.
export const ROWS_TRIPWIRE = 2_000_000;

export async function autonomyPaused(db) {
  const row = await db
    .prepare(`SELECT value, reason, updated_at FROM system_flags WHERE name = ?`)
    .bind(AUTONOMY_FLAG)
    .first()
    .catch(() => null);
  if (!row || row.value !== '1') return null;
  return { reason: row.reason || 'paused', since: row.updated_at };
}

export async function setAutonomyPaused(db, paused, reason = '') {
  await db
    .prepare(
      `INSERT INTO system_flags (name, value, reason, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET value = excluded.value, reason = excluded.reason, updated_at = excluded.updated_at`
    )
    .bind(AUTONOMY_FLAG, paused ? '1' : '0', reason)
    .run();
}

// Called by the drain with the rows its own run read. Returns true if this
// tripped the breaker. The write is the same flag Ary's control writes, so
// there is exactly one way to be paused and one place to look.
export async function tripIfBurning(db, rowsRead) {
  if (!Number.isFinite(rowsRead) || rowsRead < ROWS_TRIPWIRE) return false;
  await setAutonomyPaused(
    db,
    true,
    `self-tripped: a drain read ${rowsRead.toLocaleString()} rows, over the ${ROWS_TRIPWIRE.toLocaleString()} tripwire`
  ).catch(() => {});
  return true;
}
