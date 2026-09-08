import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { deliverableAccess, deliverableBody, deliverableResponse } from '@/lib/bloomops/deliverable-api.mjs';
import { getDeliverable, updateDeliverable } from '@/lib/bloomops/deliverables.mjs';
import { DELIVERABLE_DETAIL_FIELDS } from '@/lib/bloomops/deliverable-values.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { id, deliverableId } = await context.params;
  const { access, response } = await deliverableAccess(req, id, deliverableId);
  if (response) return response;
  const deliverable = await getDeliverable(access.db, access.actor, id, deliverableId);
  return deliverable ? json({ deliverable }) : json({ error: 'Not found.' }, 404);
});
export const PATCH = withApiErrors(async (req, context) => {
  const { id, deliverableId } = await context.params;
  const { access, response } = await deliverableAccess(req, id, deliverableId, 'deliverable.manage');
  if (response) return response;
  const parsed = await deliverableBody(req, [...DELIVERABLE_DETAIL_FIELDS, 'expectedRevision']);
  if (parsed.response) return parsed.response;
  const { expectedRevision, ...input } = parsed.body;
  return deliverableResponse(await updateDeliverable(access.db, { actor: access.actor, projectId: id, deliverableId, input, expectedRevision }));
});
