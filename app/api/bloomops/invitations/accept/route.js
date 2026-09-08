import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { NextResponse } from 'next/server';
import { requireIdentity } from '@/lib/bloomops/access.mjs';
import { acceptInvitation } from '@/lib/bloomops/invitations.mjs';
import { ROLE_LABELS } from '@/lib/bloomops/membership.mjs';

export const dynamic = 'force-dynamic';

const REASONS = {
  invalid: [404, 'This invitation link is not valid.'],
  expired: [410, 'This invitation has expired. Ask your workspace admin to send a new one.'],
  revoked: [410, 'This invitation was withdrawn.'],
  accepted: [409, 'This invitation was already used.'],
  email_mismatch: [403, 'This invitation was sent to a different email address. Sign out and sign in with the invited address.'],
  workspace_inactive: [403, 'This workspace is not active.'],
  conflict: [409, 'Try again.'],
};

// POST { token } -> the signed-in identity becomes (or is confirmed as) an
// active member of the invited workspace. Only identity is required here:
// this is the one route a person with no membership yet may call.
async function handlePOST(req) {
  const { access, response } = await requireIdentity(req);
  if (response) return response;
  let body;
  try { body = await req.json(); } catch { body = null; }
  const token = String(body?.token || '');
  const result = await acceptInvitation(access.db, { token, user: access.user });
  if (!result.ok) {
    const [status, message] = REASONS[result.reason] || [400, 'The invitation could not be accepted.'];
    return NextResponse.json({ error: message, reason: result.reason }, { status });
  }
  return NextResponse.json({
    ok: true,
    alreadyAccepted: Boolean(result.alreadyAccepted),
    workspace: { id: result.workspace.id, name: result.workspace.name, slug: result.workspace.slug },
    membership: { id: result.membership.id, role: result.membership.role, roleLabel: ROLE_LABELS[result.membership.role], status: result.membership.status },
  });
}

export const POST = withApiErrors(handlePOST);
