import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';
import { readStored } from '@/lib/conversation-store.mjs';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// The stored conversation for one prospect. Stored only.
//
// This used to sync from Gmail when the copy looked behind or when the
// Update now button asked. Ary shut the app's Gmail reading down on
// 2026-08-27, so the recorded history is now the whole answer: everything
// synced before the shutdown stays readable, nothing new is fetched, and
// ?refresh=1 is accepted and ignored rather than breaking the button.
// What the skills record from here on lands in reply_events, not here.
export async function GET(req, { params }) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  const { id } = await params;
  const prospectId = Number(id);
  if (!Number.isFinite(prospectId)) {
    return NextResponse.json({ error: 'Which conversation?' }, { status: 400 });
  }

  const db = getDb();
  const stored = await readStored(db, { workspace: ctx.workspace, prospectId })
    .catch(() => ({ messages: [], syncedAt: null }));
  return NextResponse.json(
    { ...stored, source: 'stored', unavailable: stored.messages.length ? null : 'gmail-reading-off' },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
