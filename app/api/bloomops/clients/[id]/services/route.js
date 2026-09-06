import { NextResponse } from 'next/server';
import { createServiceEngagement } from '@/lib/bloomops/services.mjs';
import { domainProblem, pick, readBody, requireClient } from '../../_shared.mjs';

export const dynamic = 'force-dynamic';

// POST -> add one purchased service to one client.
//
// `service.create` names the client, not the engagement: the engagement
// does not exist yet, and asking only about the role would let a manager
// add a service to a client they cannot otherwise reach. `requireClient`
// loads the client as an internal record, so a Client membership gets the
// same 404 a client in another workspace gets, and a Team Member assigned
// to the client gets a plain 403.
//
// `status` is not among the keys read from the body. A new engagement is
// always Planned; Onboarding and Active describe work that activation (A9)
// coordinates. Nothing here changes the client's own lifecycle, generates
// onboarding, instantiates a template, invites anyone, or sends mail.
export async function POST(req, { params }) {
  const { id } = await params;
  const { access, client, response } = await requireClient(req, id, 'service.create');
  if (response) return response;
  const body = await readBody(req);
  const input = pick(body, ['serviceTypeId', 'packageName', 'startDate', 'scopeNotes']);
  const result = await createServiceEngagement(access.db, {
    workspaceId: access.workspace.id,
    clientId: client.id,
    input,
    actorMembershipId: access.membership.id,
    actorUserId: access.user.id,
  });
  if (!result.ok) return domainProblem(result);
  return NextResponse.json({ service: { id: result.serviceEngagementId } }, { status: 201 });
}
