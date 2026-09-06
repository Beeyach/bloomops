import { NextResponse } from 'next/server';
import { requireAuthorized } from '@/lib/bloomops/access.mjs';
import { createClient } from '@/lib/bloomops/clients.mjs';
import { domainProblem, pick, readBody } from './_shared.mjs';

export const dynamic = 'force-dynamic';

// POST -> create a client and its first contact.
//
// `client.create` is a workspace-level action (Owner, Admin, Project
// Manager): the record it makes does not exist yet, so there is nothing to
// name as a resource. A Team Member and a Client are refused by the engine,
// not here.
//
// The new client is always Draft and On Track. Nothing in the body can
// change that, and nothing here invites anybody: no invitation, no
// membership, no email, no portal link, whatever address the contact has.
export async function POST(req) {
  const { access, response } = await requireAuthorized(req, { action: 'client.create' });
  if (response) return response;
  const body = await readBody(req);
  const input = pick(body, ['name', 'company', 'website', 'timezone', 'startDate', 'ownerMembershipId', 'contactName', 'contactEmail']);
  const result = await createClient(access.db, {
    workspaceId: access.workspace.id,
    input,
    actorMembershipId: access.membership.id,
    actorUserId: access.user.id,
  });
  if (!result.ok) return domainProblem(result);
  return NextResponse.json({ client: { id: result.clientId } }, { status: 201 });
}
