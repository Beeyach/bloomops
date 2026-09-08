import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { deliverableAccess } from '@/lib/bloomops/deliverable-api.mjs';
import { portalDeliverables } from '@/lib/bloomops/deliverables.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { id, deliverableId } = await context.params;
  const { access, response } = await deliverableAccess(req, id, deliverableId, 'deliverable.view', { portal: true });
  if (response) return response;
  const deliverable = (await portalDeliverables(access.db, access.actor, id))?.items.find(item => item.id === deliverableId);
  return deliverable ? json({ deliverable }) : json({ error: 'Not found.' }, 404);
});
