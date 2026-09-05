import { NextResponse } from 'next/server';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Retired by Ary's instruction (2026-08-27): the app no longer writes email.
//
// This endpoint drafted replies with the app's own AI spend, reading the
// synced Gmail thread for context. Both halves of that are over — the app
// neither reads Gmail nor composes. Reply drafting lives in the daily-reply-
// sync skill now, where the thread is read in her own Chrome and the drafting
// costs nothing.
//
// The route answers instead of vanishing so the button, wherever it still
// exists, explains itself rather than throwing.
export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  return NextResponse.json(
    { error: 'LTB does not write drafts anymore. Say "any replies?" in Cowork and the reply-sync skill drafts it for you.' },
    { status: 410 }
  );
}
