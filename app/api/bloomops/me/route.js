import { NextResponse } from 'next/server';
import { getAccessOrProblem, notConfigured, unauthenticated } from '@/lib/bloomops/access.mjs';
import { ROLE_LABELS, canManageMembers } from '@/lib/bloomops/membership.mjs';

export const dynamic = 'force-dynamic';

// GET /api/bloomops/me -> who is signed in and, if they have one, which
// workspace they are acting in. An identity without an active membership
// is told so here (200 with workspace: null) so the sign-in screen can
// explain; every other route refuses such a caller with 403.
export async function GET(req) {
  const { access, configured } = await getAccessOrProblem(req);
  if (!configured) return notConfigured();
  if (!access) return unauthenticated();
  const { user, workspace, membership } = access;
  return NextResponse.json(
    {
      user: { id: user.id, name: user.name, email: user.email },
      workspace: workspace ? { id: workspace.id, name: workspace.name, slug: workspace.slug } : null,
      membership: membership
        ? { id: membership.id, role: membership.role, roleLabel: ROLE_LABELS[membership.role], status: membership.status, canManageMembers: canManageMembers(membership) }
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
