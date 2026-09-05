import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { authStatus, environmentName } from '@/lib/bloomops/auth-config.mjs';

export const dynamic = 'force-dynamic';

// GET /api/health -> { ok, environment, auth: { configured, mail }, schema }
//
// Deliberately unauthenticated, like /api/version: it tells a deploy
// verifier whether this environment can sign anybody in at all, with
// booleans and names only. No secret value, id, or address ever appears.
export async function GET() {
  let env = {};
  try { env = getCloudflareContext().env || {}; } catch {}
  const auth = authStatus(env);
  const schema = { migrations: 0, ok: false };
  if (env.DB && typeof env.DB.prepare === 'function') {
    try {
      const ledger = await env.DB.prepare('SELECT COUNT(*) AS n FROM d1_migrations').first();
      schema.migrations = Number(ledger?.n) || 0;
      const anchors = await env.DB
        .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('workspaces', 'user', 'session', 'workspace_memberships', 'workspace_invitations')")
        .first();
      schema.ok = Number(anchors?.n) === 5 && schema.migrations >= 3;
    } catch {}
  }
  return NextResponse.json(
    { ok: auth.configured && schema.ok, environment: environmentName(env), auth, schema },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
