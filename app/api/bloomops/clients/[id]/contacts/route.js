import { NextResponse } from 'next/server';
import { addContact } from '@/lib/bloomops/client-contacts.mjs';
import { domainProblem, pick, readBody, requireClient } from '../../_shared.mjs';

export const dynamic = 'force-dynamic';

// POST -> add a contact to one client.
//
// `userId` is not among the keys read from the body and is never written:
// whether a contact can sign in to the client portal is decided by A9/A10
// on invitation acceptance, never by this route and never by a matching
// email address.
export async function POST(req, { params }) {
  const { id } = await params;
  const { access, client, response } = await requireClient(req, id);
  if (response) return response;
  const body = await readBody(req);
  const input = pick(body, ['name', 'email', 'phone', 'title', 'isPrimary']);
  const result = await addContact(access.db, {
    workspaceId: access.workspace.id,
    clientId: client.id,
    input,
    actorMembershipId: access.membership.id,
    actorUserId: access.user.id,
  });
  if (!result.ok) return domainProblem(result);
  return NextResponse.json({ contact: { id: result.contactId } }, { status: 201 });
}
