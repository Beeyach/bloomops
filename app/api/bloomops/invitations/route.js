import { NextResponse } from 'next/server';
import { requireAuthorized } from '@/lib/bloomops/access.mjs';
import { createInvitation, listInvitations } from '@/lib/bloomops/invitations.mjs';
import { sendInvitationEmail, invitationError, publicInvitation } from './_shared.mjs';

export const dynamic = 'force-dynamic';

// Invitations of the caller's workspace. Needs the members.manage
// capability (Owner and Admin by role).

export async function GET(req) {
  const { access, response } = await requireAuthorized(req, { action: 'invitations.manage' });
  if (response) return response;
  const rows = await listInvitations(access.db, access.workspace.id);
  return NextResponse.json({ invitations: rows.map(publicInvitation) }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST { email, role, name?, clientId? } -> creates the invitation and sends
// the email. If one is already pending for that address it is rotated and
// re-sent, and the previous link stops working. The token is never returned.
export async function POST(req) {
  const { access, response } = await requireAuthorized(req, { action: 'invitations.manage' });
  if (response) return response;
  let body;
  try { body = await req.json(); } catch { body = null; }
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const result = await createInvitation(access.db, {
    workspaceId: access.workspace.id,
    email: body.email,
    role: String(body.role || '').trim(),
    clientId: body.clientId ? String(body.clientId) : null,
    inviteeName: body.name ? String(body.name) : null,
    invitedByMembershipId: access.membership.id,
  });
  if (!result.ok) return invitationError(result.reason);

  const delivery = await sendInvitationEmail({ req, access, invitation: result.invitation, token: result.token });
  return NextResponse.json(
    { invitation: publicInvitation(result.invitation), resent: Boolean(result.resent), delivered: delivery.ok },
    { status: result.resent ? 200 : 201 },
  );
}
