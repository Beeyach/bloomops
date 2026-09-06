import { NextResponse } from 'next/server';
import { requireAuthorized } from '@/lib/bloomops/access.mjs';
import { setMembershipStatus } from '@/lib/bloomops/membership.mjs';

export const dynamic = 'force-dynamic';

const REASONS = {
  invalid_status: [400, 'Status must be active, suspended, or removed.'],
  not_found: [404, 'Member not found.'],
  self: [400, 'You cannot change your own membership.'],
  removed: [409, 'That membership was removed. Send a new invitation to bring the person back.'],
  not_joined: [409, 'That person has not joined yet.'],
  last_owner: [409, 'The last active Owner cannot be suspended or removed.'],
  conflict: [409, 'The membership changed while you were working. Reload and try again.'],
};

// PATCH { status } -> suspend, reinstate, or remove a member. Suspended and
// removed members lose workspace access on their next request even if their
// identity session is still valid.
export async function PATCH(req, { params }) {
  const { access, response } = await requireAuthorized(req, { action: 'members.manage' });
  if (response) return response;
  const { id } = await params;
  let body;
  try { body = await req.json(); } catch { body = null; }
  const result = await setMembershipStatus(access.db, {
    workspaceId: access.workspace.id,
    membershipId: String(id || ''),
    status: String(body?.status || ''),
    actorMembership: access.membership,
  });
  if (!result.ok) {
    const [status, message] = REASONS[result.reason] || [400, 'The membership could not be changed.'];
    return NextResponse.json({ error: message, reason: result.reason }, { status });
  }
  return NextResponse.json({ membership: result.membership, unchanged: Boolean(result.unchanged) });
}
