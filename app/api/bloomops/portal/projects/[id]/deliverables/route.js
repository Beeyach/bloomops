import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { projectAccess } from '@/lib/bloomops/project-api.mjs';
import { portalDeliverables } from '@/lib/bloomops/deliverables.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'deliverable.view', { portal: true });
  if (response) return response;
  const summary = await portalDeliverables(access.db, access.actor, id);
  return summary ? json(summary) : json({ error: 'Not found.' }, 404);
});
