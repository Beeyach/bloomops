// Reports which BloomOps environment is serving a request and whether that
// environment's own D1 and R2 bindings resolve. Names and booleans only: no
// database ids, bucket ids, or secrets ever leave this function. A1 uses it to
// prove per-environment isolation; later phases can keep it as a health probe.
export async function infraStatus(env = {}) {
  const status = {
    environment: String(env.BLOOMOPS_ENV || 'unknown'),
    d1: { binding: 'DB', bound: false, ok: false },
    r2: { binding: 'FILES', bound: false, ok: false },
  };

  if (env.DB && typeof env.DB.prepare === 'function') {
    status.d1.bound = true;
    try {
      const row = await env.DB.prepare('SELECT 1 AS ok').first();
      status.d1.ok = Number(row?.ok) === 1;
    } catch (err) {
      status.d1.error = String(err?.message || err);
    }
  }

  if (env.FILES && typeof env.FILES.list === 'function') {
    status.r2.bound = true;
    try {
      await env.FILES.list({ limit: 1 });
      status.r2.ok = true;
    } catch (err) {
      status.r2.error = String(err?.message || err);
    }
  }

  // The BloomOps domain schema (A2) is applied with `wrangler d1 migrations
  // apply`, which keeps its ledger in d1_migrations. Report how many of those
  // migrations this environment's database has, and whether the anchor tables
  // of the domain exist. Counts and booleans only.
  status.domain = { migrations: 0, ok: false };
  if (status.d1.bound) {
    try {
      const ledger = await env.DB.prepare('SELECT COUNT(*) AS n FROM d1_migrations').first();
      status.domain.migrations = Number(ledger?.n) || 0;
      const anchors = await env.DB
        .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('workspaces', 'bloomops_clients', 'activity_events')")
        .first();
      status.domain.ok = Number(anchors?.n) === 3 && status.domain.migrations >= 1;
    } catch (err) {
      status.domain.error = String(err?.message || err);
    }
  }

  return status;
}
