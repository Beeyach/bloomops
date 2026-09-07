import { NextResponse } from 'next/server';
import { resolveAppUrl } from '@/lib/bloomops/auth-config.mjs';
import { createMailer, invitationEmail } from '@/lib/bloomops/mail.mjs';
import { ROLE_LABELS } from '@/lib/bloomops/membership.mjs';

// What an admin sees of an invitation. Never the token or its hash.
export function publicInvitation(row) {
  const { tokenHash, ...rest } = row;
  return rest;
}

const REASONS = {
  activation_managed: [409, 'Retry this invitation from the client’s activation section.'],
  invalid_email: [400, 'Enter a valid email address.'],
  invalid_role: [400, 'Choose a valid role.'],
  client_required: [400, 'A client invitation needs a client.'],
  client_not_allowed: [400, 'Only a client invitation can name a client.'],
  already_member: [409, 'That person is already an active member of this workspace.'],
  not_found: [404, 'Invitation not found.'],
  accepted: [409, 'That invitation was already accepted.'],
  revoked: [409, 'That invitation was revoked.'],
  expired: [409, 'That invitation has expired.'],
  conflict: [409, 'The invitation changed while you were working. Reload and try again.'],
};

export function invitationError(reason) {
  const [status, message] = REASONS[reason] || [400, 'The invitation could not be processed.'];
  return NextResponse.json({ error: message, reason }, { status });
}

// Send (or re-send) the invitation email. Delivery problems are reported to
// the caller as delivered:false and logged without recipient or link.
export async function sendInvitationEmail({ req, access, invitation, token }) {
  try {
    const appUrl = resolveAppUrl(access.env, req.url);
    const mailer = createMailer(access.env);
    await mailer.send({
      to: invitation.email,
      ...invitationEmail({
        url: `${appUrl}/invite/${token}`,
        workspaceName: access.workspace.name,
        roleLabel: ROLE_LABELS[invitation.role] || invitation.role,
        inviterName: access.user.name || null,
      }),
    });
    return { ok: true };
  } catch (err) {
    console.error('[bloomops-invitations] invitation email failed', { status: err?.status || 0, error: err?.errorName || err?.name || 'error' });
    return { ok: false };
  }
}
