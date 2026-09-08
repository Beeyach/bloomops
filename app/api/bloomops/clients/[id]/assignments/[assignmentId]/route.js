import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { NextResponse } from 'next/server';
import { removeClientAssignment, updateClientAssignment } from '@/lib/bloomops/assignments.mjs';
import { domainProblem, pick, readBody, requireClient } from '../../../_shared.mjs';

export const dynamic = 'force-dynamic';

// PATCH -> change the role somebody holds on this client (Lead or Member).
//
// The assignment is looked up by this client and this workspace, so an
// assignment id belonging to another client, another workspace, or nothing
// at all is one answer: 404.
async function handlePATCH(req, { params }) {
  const { id, assignmentId } = await params;
  const { access, client, response } = await requireClient(req, id, 'client.assign');
  if (response) return response;
  const body = await readBody(req);
  const input = pick(body, ['assignmentRole']);
  const result = await updateClientAssignment(access.db, {
    workspaceId: access.workspace.id,
    clientId: client.id,
    assignmentId,
    input,
    actorMembershipId: access.membership.id,
    actorUserId: access.user.id,
  });
  if (!result.ok) return domainProblem(result);
  return NextResponse.json({ ok: true, unchanged: Boolean(result.unchanged) });
}

// DELETE -> take somebody off this client.
//
// This narrows scope and nothing else. Any service assignment the same
// person holds under this client stands, so they keep that one engagement
// and lose the client record and its other engagements on their next
// request. The client's internal owner is untouched, whoever it names.
async function handleDELETE(req, { params }) {
  const { id, assignmentId } = await params;
  const { access, client, response } = await requireClient(req, id, 'client.assign');
  if (response) return response;
  const result = await removeClientAssignment(access.db, {
    workspaceId: access.workspace.id,
    clientId: client.id,
    assignmentId,
    actorMembershipId: access.membership.id,
    actorUserId: access.user.id,
  });
  if (!result.ok) return domainProblem(result);
  return NextResponse.json({ ok: true, removed: result.removed });
}

export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
