import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { deliverableAccess, deliverableBody, deliverableResponse } from '@/lib/bloomops/deliverable-api.mjs';
import { transitionDeliverable } from '@/lib/bloomops/deliverables.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req, context) => {
  const { id, deliverableId } = await context.params;
  const { access, response } = await deliverableAccess(req, id, deliverableId, 'deliverable.manage');
  if (response) return response;
  const parsed = await deliverableBody(req, ['toStatus', 'expectedRevision']);
  if (parsed.response) return parsed.response;
  return deliverableResponse(await transitionDeliverable(access.db, { actor: access.actor, projectId: id, deliverableId, ...parsed.body }));
});
