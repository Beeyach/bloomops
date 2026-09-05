import { NextResponse } from 'next/server';
import { getWorkspace, unauthorized } from '@/lib/workspace.mjs';

export const dynamic = 'force-dynamic';

// Retired by Ary's instruction (2026-08-27): the app no longer writes email.
//
// This endpoint wrote a throwaway follow-up draft with the app's own AI
// spend so the Follow-ups tab could show what would go. Sequences are
// written by the skills now, for free, and what sends is always the stored
// package copy — so a preview the app composes has nothing left to preview.
export async function POST(req) {
  const ctx = await getWorkspace(req);
  if (!ctx) return unauthorized();
  return NextResponse.json(
    { error: 'LTB does not write drafts anymore. Follow-up copy comes from your skills, and what sends is exactly what you approved.' },
    { status: 410 }
  );
}
