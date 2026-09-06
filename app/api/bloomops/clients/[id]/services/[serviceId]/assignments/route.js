import { NextResponse } from 'next/server';
import { addServiceAssignment } from '@/lib/bloomops/assignments.mjs';
import { domainProblem, pick, readBody, requireService } from '../../../../_shared.mjs';

export const dynamic = 'force-dynamic';

// POST -> put one internal person on this service engagement only.
//
// The narrower of the two assignments, and the one contractor scope is
// built on: the A4 engine gives this row exactly one engagement. A Team
// Member with only this row does not reach the client record and does not
// reach the client's other engagements, and A7 did not weaken that to make
// navigation easier.
//
// `service.assign` names the engagement, which `requireService` loads as an
// internal record scoped to both the client and the engagement in the
// route, so an engagement under a different client is 404.
export async function POST(req, { params }) {
  const { id, serviceId } = await params;
  const { access, service, response } = await requireService(req, id, serviceId, 'service.assign');
  if (response) return response;
  const body = await readBody(req);
  const input = pick(body, ['membershipId', 'assignmentRole']);
  const result = await addServiceAssignment(access.db, {
    workspaceId: access.workspace.id,
    clientId: String(id),
    serviceEngagementId: service.id,
    serviceTypeName: service.serviceTypeName,
    input,
    actorMembershipId: access.membership.id,
    actorUserId: access.user.id,
  });
  if (!result.ok) return domainProblem(result);
  // 201 only when a row was created. Re-assigning somebody who is
  // already here changes their role or changes nothing, and neither of
  // those made anything.
  return NextResponse.json(
    { assignment: { id: result.assignmentId }, unchanged: Boolean(result.unchanged) },
    { status: result.created ? 201 : 200 },
  );
}
