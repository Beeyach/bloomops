import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { NextResponse } from 'next/server';
import { getAccessOrProblem, getActor, notConfigured, unauthenticated } from '@/lib/bloomops/access.mjs';
import { hasCapability, listCapabilities } from '@/lib/bloomops/authorization.mjs';
import { ROLE_LABELS } from '@/lib/bloomops/membership.mjs';
import { legacyAppAllowed } from '@/lib/workspace.mjs';

export const dynamic = 'force-dynamic';

// GET /api/bloomops/me -> who is signed in and, if they have one, which
// workspace they are acting in, with the capabilities the engine gives
// them there. An identity without an active membership is told so here
// (200 with workspace: null) so the sign-in screen can explain; every other
// route refuses such a caller with 403. Nothing about scope (assignments,
// client links) is listed: a screen learns what it may show by asking for
// it and being refused, never from a list it could use to enumerate.
async function handleGET(req) {
  const { access, configured } = await getAccessOrProblem(req);
  if (!configured) return notConfigured();
  if (!access) return unauthenticated();
  const { user, workspace, membership } = access;
  const actor = await getActor(access);
  return NextResponse.json(
    {
      user: { id: user.id, name: user.name, email: user.email },
      workspace: workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null,
      membership: membership
        ? {
            id: membership.id,
            role: membership.role,
            roleLabel: ROLE_LABELS[membership.role],
            status: membership.status,
            capabilities: listCapabilities(actor),
            canManageMembers: hasCapability(actor, 'members.manage'),
            legacyApp: legacyAppAllowed(access),
          }
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const GET = withApiErrors(handleGET);
