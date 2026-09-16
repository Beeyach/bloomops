import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { NextResponse } from 'next/server';
import { readClientEdit, saveClientEdit } from '@/lib/bloomops/client-edit.mjs';
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
async function handlePATCH(req, { params }) {
  const { id } = await params;
  const { access, response } = await requireClient(req, id);
  if (response) return response;
  const body = await readBody(req);
  const input = pick(body, ['name', 'company', 'website', 'timezone', 'startDate', 'endDate', 'health', 'ownerMembershipId', 'relationshipStatus', 'expected', 'editorScope']);
  const result = await saveClientEdit(access.db, access.actor, id, input);
  if (!result.ok) return domainProblem(result);
  return NextResponse.json({ scope: {userId: access.user.id, workspaceId: access.workspace.id}, clientId: id, ok: true, unchanged: Boolean(result.unchanged), changed: result.changed || null });
}

export const PATCH = withApiErrors(handlePATCH);

export const GET = withApiErrors(async (req, {params}) => {
  const {id} = await params;
  const {access,response} = await requireClient(req,id);
  if(response) return response;
  const snapshot = await readClientEdit(access.db,access.actor,id);
  if(!snapshot) return NextResponse.json({error:'Not found.'},{status:404});
  return NextResponse.json({scope:{userId:access.user.id,workspaceId:access.workspace.id},clientId:id,snapshot});
});
