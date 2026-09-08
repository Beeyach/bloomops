import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { projectAccess } from '@/lib/bloomops/project-api.mjs';
import { deliverableBody, deliverableResponse } from '@/lib/bloomops/deliverable-api.mjs';
import { createDeliverable, listDeliverables } from '@/lib/bloomops/deliverables.mjs';
import { DELIVERABLE_DETAIL_FIELDS } from '@/lib/bloomops/deliverable-values.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'deliverable.view');
  return response || json(await listDeliverables(access.db, access.actor, id));
});
export const POST = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'deliverable.manage');
  if (response) return response;
  const parsed = await deliverableBody(req, [...DELIVERABLE_DETAIL_FIELDS, 'requestId']);
  if (parsed.response) return parsed.response;
  const { requestId, ...input } = parsed.body;
  return deliverableResponse(await createDeliverable(access.db, { actor: access.actor, projectId: id, requestId, input }), 201);
});
