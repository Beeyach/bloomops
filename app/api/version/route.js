import { NextResponse } from 'next/server';
import { VERSION } from '@/lib/version.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// What build is serving. Deliberately unauthenticated: it discloses a commit
// hash and a date, nothing about the workspace, and the client badge needs it
// before anything else has loaded to know whether this tab is stale.
export async function GET() {
  return NextResponse.json(VERSION, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
