import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { milestoneAccess } from '@/lib/bloomops/milestone-api.mjs';
import { portalMilestones } from '@/lib/bloomops/milestones.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { id, milestoneId } = await context.params;
  const { access, response } = await milestoneAccess(req, id, milestoneId, 'milestone.view', { portal: true });
  if (response) return response;
  const milestone = (await portalMilestones(access.db, access.actor, id))?.items.find(item => item.id === milestoneId);
  return milestone ? json({ milestone }) : json({ error: 'Not found.' }, 404);
});
