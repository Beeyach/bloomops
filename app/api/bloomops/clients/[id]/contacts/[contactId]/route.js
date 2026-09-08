import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { NextResponse } from 'next/server';
import { removeContact, updateContact } from '@/lib/bloomops/client-contacts.mjs';
import { domainProblem, pick, readBody, requireClient } from '../../../_shared.mjs';

export const dynamic = 'force-dynamic';

// PATCH -> edit one contact, or move the primary marker to or away from
// them. The contact is looked up by client and id together, so a contact
// belonging to another client of this workspace is not found here, exactly
// as an unknown id is.
async function handlePATCH(req, { params }) {
  const { id, contactId } = await params;
  const { access, client, response } = await requireClient(req, id);
  if (response) return response;
  const body = await readBody(req);
  const input = pick(body, ['name', 'email', 'phone', 'title', 'isPrimary']);
  const result = await updateContact(access.db, {
    workspaceId: access.workspace.id,
    clientId: client.id,
    contactId,
    input,
    actorMembershipId: access.membership.id,
    actorUserId: access.user.id,
  });
  if (!result.ok) return domainProblem(result);
  return NextResponse.json({ ok: true, unchanged: Boolean(result.unchanged) });
}

// DELETE -> remove one contact. A contact who can sign in to the client
// portal is refused with 409: ending that person's relationship with the
// agency is A9/A10's, not a side effect of tidying an address book.
async function handleDELETE(req, { params }) {
  const { id, contactId } = await params;
  const { access, client, response } = await requireClient(req, id);
  if (response) return response;
  const result = await removeContact(access.db, {
    workspaceId: access.workspace.id,
    clientId: client.id,
    contactId,
    actorMembershipId: access.membership.id,
    actorUserId: access.user.id,
  });
  if (!result.ok) return domainProblem(result);
  return NextResponse.json({ ok: true });
}

export const PATCH = withApiErrors(handlePATCH);
export const DELETE = withApiErrors(handleDELETE);
