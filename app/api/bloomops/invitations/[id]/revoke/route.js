import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { NextResponse } from 'next/server';
import { requireAuthorized } from '@/lib/bloomops/access.mjs';
import { revokeInvitation } from '@/lib/bloomops/invitations.mjs';
import { invitationError, publicInvitation } from '../../_shared.mjs';

export const dynamic = 'force-dynamic';

// POST -> the pending invitation becomes revoked and its link stops working.
async function handlePOST(req, { params }) {
  const { access, response } = await requireAuthorized(req, { action: 'invitations.manage' });
  if (response) return response;
  const { id } = await params;
  const result = await revokeInvitation(access.db, {
    workspaceId: access.workspace.id,
    invitationId: String(id || ''),
    actorMembershipId: access.membership.id,
  });
  if (!result.ok) return invitationError(result.reason);
  return NextResponse.json({ invitation: publicInvitation(result.invitation) });
}

export const POST = withApiErrors(handlePOST);
