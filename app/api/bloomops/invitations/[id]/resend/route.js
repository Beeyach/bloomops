import { NextResponse } from 'next/server';
import { requireAuthorized } from '@/lib/bloomops/access.mjs';
import { resendInvitation } from '@/lib/bloomops/invitations.mjs';
import { sendInvitationEmail, invitationError, publicInvitation } from '../../_shared.mjs';

export const dynamic = 'force-dynamic';

// POST -> a fresh token and expiry for a pending invitation (the old link
// stops working) or a replacement for an expired one, then the email.
export async function POST(req, { params }) {
  const { access, response } = await requireAuthorized(req, { action: 'invitations.manage' });
  if (response) return response;
  const { id } = await params;
  const result = await resendInvitation(access.db, {
    workspaceId: access.workspace.id,
    invitationId: String(id || ''),
    actorMembershipId: access.membership.id,
  });
  if (!result.ok) return invitationError(result.reason);
  const delivery = await sendInvitationEmail({ req, access, invitation: result.invitation, token: result.token });
  return NextResponse.json({ invitation: publicInvitation(result.invitation), delivered: delivery.ok });
}
