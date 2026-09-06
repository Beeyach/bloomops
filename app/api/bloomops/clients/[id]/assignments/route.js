import { NextResponse } from 'next/server';
import { addClientAssignment } from '@/lib/bloomops/assignments.mjs';
import { domainProblem, pick, readBody, requireClient } from '../../_shared.mjs';

export const dynamic = 'force-dynamic';

// POST -> put one internal person on this client as a whole.
//
// This is real access: the A4 engine reads client_assignments, so the row
// gives a Team Member the client record and every service engagement under
// it, from their next request. `client.assign` is Owner, Admin, and Project
// Manager, and the client is loaded as an internal record, so a Team Member
// who can read the client gets 403 and a Client membership gets 404.
//
// Only a membership id is accepted, never a user id, an email address, or a
// workspace id, and the domain checks it against this workspace's active
// internal memberships. Re-posting the same person is not a second row: the
// same role is a no-op, a different role is a role change.
//
// Assigning somebody does not make them the client's internal owner. The
// two are different facts (A6) and neither writes the other.
export async function POST(req, { params }) {
  const { id } = await params;
  const { access, client, response } = await requireClient(req, id, 'client.assign');
  if (response) return response;
  const body = await readBody(req);
  const input = pick(body, ['membershipId', 'assignmentRole']);
  const result = await addClientAssignment(access.db, {
    workspaceId: access.workspace.id,
    clientId: client.id,
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
