import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { NextResponse } from 'next/server';
import { removeServiceAssignment, updateServiceAssignment } from '@/lib/bloomops/assignments.mjs';
import { domainProblem, pick, readBody, requireService } from '../../../../../_shared.mjs';

export const dynamic = 'force-dynamic';

// PATCH -> change the role somebody holds on this engagement.
async function handlePATCH(req, { params }) {
  const { id, serviceId, assignmentId } = await params;
  const { access, service, response } = await requireService(req, id, serviceId, 'service.assign');
  if (response) return response;
  const body = await readBody(req);
  const input = pick(body, ['assignmentRole']);
  const result = await updateServiceAssignment(access.db, {
    workspaceId: access.workspace.id,
    clientId: String(id),
    serviceEngagementId: service.id,
    serviceTypeName: service.serviceTypeName,
    assignmentId,
    input,
    actorMembershipId: access.membership.id,
    actorUserId: access.user.id,
  });
  if (!result.ok) return domainProblem(result);
  return NextResponse.json({ ok: true, unchanged: Boolean(result.unchanged) });
}

// DELETE -> take somebody off this engagement.
//
// Removing the narrower assignment never revokes broader access that still
// exists: somebody who is also assigned to the client as a whole keeps this
// engagement through that row. The engine works it out from the rows on the
// next request; nothing here cascades.
async function handleDELETE(req, { params }) {
  const { id, serviceId, assignmentId } = await params;
  const { access, service, response } = await requireService(req, id, serviceId, 'service.assign');
  if (response) return response;
  const result = await removeServiceAssignment(access.db, {
    workspaceId: access.workspace.id,
    clientId: String(id),
    serviceEngagementId: service.id,
    serviceTypeName: service.serviceTypeName,
    assignmentId,
    actorMembershipId: access.membership.id,
    actorUserId: access.user.id,
  });
  if (!result.ok) return domainProblem(result);
  return NextResponse.json({ ok: true, removed: result.removed });
}

export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
