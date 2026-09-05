import { NextResponse } from 'next/server';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { infraStatus } from '@/lib/infra-status.mjs';

export const dynamic = 'force-dynamic';

// GET /api/infra -> { environment, d1: { bound, ok }, r2: { bound, ok } }
//
// Which BloomOps environment is serving, and whether its own bindings answer.
// Middleware keeps this behind the session gate like every other API route,
// and the payload carries names and booleans only.
export async function GET() {
  let env = {};
  try { env = getCloudflareContext().env || {}; } catch {}
  const status = await infraStatus(env);
  return NextResponse.json(status, { headers: { 'Cache-Control': 'no-store' } });
}
