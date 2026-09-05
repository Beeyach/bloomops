import { NextResponse } from 'next/server';
import { requireAccess } from '@/lib/bloomops/access.mjs';
import { ROLE_LABELS, listWorkspaceMembers } from '@/lib/bloomops/membership.mjs';

export const dynamic = 'force-dynamic';

// GET -> members of the caller's workspace with role and state. Owner or
// Admin only; the list names people and that is not for everyone.
export async function GET(req) {
  const { access, response } = await requireAccess(req, { manageMembers: true });
  if (response) return response;
  const members = await listWorkspaceMembers(access.db, access.workspace.id);
  return NextResponse.json(
    { members: members.map((m) => ({ ...m, roleLabel: ROLE_LABELS[m.role] || m.role })) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
