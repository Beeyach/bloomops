import { NextResponse } from 'next/server';
import { updateServiceEngagement } from '@/lib/bloomops/services.mjs';
import { domainProblem, pick, readBody, requireService } from '../../../_shared.mjs';

export const dynamic = 'force-dynamic';

// PATCH -> change one engagement's package, dates, scope notes, or status.
//
// The route names both the client and the engagement and `requireService`
// looks them up together, so an engagement under a different client answers
// as absent rather than admitting it exists somewhere else.
//
// `serviceTypeId` is read from the body only so the domain can refuse it in
// words: an engagement is the purchase of one service, and buying a
// different one is a different engagement. A status change here changes the
// service and nothing else; the client's own lifecycle is a separate
// canonical fact and no code path below touches it.
export async function PATCH(req, { params }) {
  const { id, serviceId } = await params;
  const { access, service, response } = await requireService(req, id, serviceId);
  if (response) return response;
  const body = await readBody(req);
  const input = pick(body, ['packageName', 'startDate', 'endDate', 'scopeNotes', 'status', 'serviceTypeId']);
  const result = await updateServiceEngagement(access.db, {
    workspaceId: access.workspace.id,
    clientId: String(id),
    service,
    input,
    actorMembershipId: access.membership.id,
    actorUserId: access.user.id,
  });
  if (!result.ok) return domainProblem(result);
  return NextResponse.json({ ok: true, unchanged: Boolean(result.unchanged), changed: result.changed || null });
}
