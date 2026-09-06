import { NextResponse } from 'next/server';
import { updateClient } from '@/lib/bloomops/clients.mjs';
import { domainProblem, pick, readBody, requireClient } from '../_shared.mjs';

export const dynamic = 'force-dynamic';

// PATCH -> change the identity fields, the health, or the internal owner of
// one client. `client.manage` is Owner, Admin, and Project Manager; a Team
// Member assigned to the client may read it and gets a plain 403 here.
//
// relationshipStatus is not in the list of keys read from the body, and
// updateClient refuses it explicitly if one arrives, because moving a
// client through its lifecycle is A9's activation transaction and not a
// field edit. See lib/bloomops/clients.mjs.
export async function PATCH(req, { params }) {
  const { id } = await params;
  const { access, client, response } = await requireClient(req, id);
  if (response) return response;
  const body = await readBody(req);
  const input = pick(body, ['name', 'company', 'website', 'timezone', 'startDate', 'endDate', 'health', 'ownerMembershipId', 'relationshipStatus']);
  const result = await updateClient(access.db, {
    workspaceId: access.workspace.id,
    client,
    input,
    actorMembershipId: access.membership.id,
    actorUserId: access.user.id,
  });
  if (!result.ok) return domainProblem(result);
  return NextResponse.json({ ok: true, unchanged: Boolean(result.unchanged), changed: result.changed || null });
}
