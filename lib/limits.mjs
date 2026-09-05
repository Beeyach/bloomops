// Per-workspace feature allowances (settings key 'limits'), admin-set.
// Shared by /api/limits (read/write) and /api/scan (enforcement).

// aiCallsPerDay guards the one route that spends the user's own AI credit:
// generous enough that a full Guard-Bee sweep fits, finite so a runaway
// loop can't drain a key. Admin-adjustable via /api/limits like the rest.
// beesPerDay is the Hive bees (reply coach, call prep, best five, proposal,
// objections, voice note). They are the most expensive calls in the app —
// every one carries a full prospect context — so a workspace gets zero until
// an admin grants an allowance. An admin's own workspace is never capped,
// same rule the ad scans already follow.
export const DEFAULT_LIMITS = { adScansPerWeek: 0, aiCallsPerDay: 300, beesPerDay: 0 };

export function sanitizeLimits(l) {
  const out = { ...DEFAULT_LIMITS, ...(l && typeof l === 'object' ? l : {}) };
  const n = Number(out.adScansPerWeek);
  out.adScansPerWeek = Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), 1000) : 0;
  const a = Number(out.aiCallsPerDay);
  out.aiCallsPerDay = Number.isFinite(a) && a >= 0 ? Math.min(Math.round(a), 10000) : DEFAULT_LIMITS.aiCallsPerDay;
  const b = Number(out.beesPerDay);
  out.beesPerDay = Number.isFinite(b) && b >= 0 ? Math.min(Math.round(b), 1000) : 0;
  return out;
}

export async function loadLimits(db, workspace) {
  const row = await db
    .prepare(`SELECT value FROM settings WHERE workspace = ? AND key = 'limits'`)
    .bind(workspace)
    .first();
  let stored = {};
  if (row && row.value) {
    try { stored = JSON.parse(row.value); } catch { stored = {}; }
  }
  return sanitizeLimits(stored);
}

// Count-and-increment for today's AI calls, atomically. Returns the count
// AFTER this call, so the caller compares against the cap in one round
// trip. The day key is UTC — a cap boundary, not a user-facing date, so
// the app's Pacific pinning doesn't apply here.
// `bucket` keeps a separate tally in the same table: bee runs count against
// their own allowance as well as the day's AI ceiling, and one table with a
// prefixed key beats a migration for a second counter.
export async function bumpAiCalls(db, workspace, bucket = '') {
  const stamp = new Date().toISOString().slice(0, 10);
  const day = bucket ? `${bucket}:${stamp}` : stamp;
  const row = await db
    .prepare(
      `INSERT INTO ai_calls (workspace, day, count) VALUES (?, ?, 1)
       ON CONFLICT(workspace, day) DO UPDATE SET count = count + 1
       RETURNING count`
    )
    .bind(workspace, day)
    .first();
  return row?.count || 1;
}

// Today's count without touching it. The gates read; only a request that is
// actually going to run increments. Reading and bumping in one call meant a
// request refused for having no credits still spent one of the day's calls,
// and a user out of credits could burn a whole day's allowance on 402s.
export async function readAiCalls(db, workspace, bucket = '') {
  const stamp = new Date().toISOString().slice(0, 10);
  const day = bucket ? `${bucket}:${stamp}` : stamp;
  const row = await db
    .prepare(`SELECT count FROM ai_calls WHERE workspace = ? AND day = ?`)
    .bind(workspace, day)
    .first();
  return row?.count || 0;
}

// Scans used in the trailing 7 days (failed runs don't count against the
// allowance — a failure shouldn't eat the week).
export async function scansUsedThisWeek(db, workspace) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) n FROM scan_runs WHERE workspace = ? AND created_at >= datetime('now', '-7 days') AND status <> 'failed'`
    )
    .bind(workspace)
    .first();
  return row?.n || 0;
}
