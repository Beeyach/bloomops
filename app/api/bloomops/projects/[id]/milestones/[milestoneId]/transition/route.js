import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { milestoneAccess, milestoneBody, milestoneResponse } from '@/lib/bloomops/milestone-api.mjs';
import { transitionMilestone } from '@/lib/bloomops/milestones.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req, context) => {
  const { id, milestoneId } = await context.params;
  const { access, response } = await milestoneAccess(req, id, milestoneId, 'milestone.manage');
  if (response) return response;
  const parsed = await milestoneBody(req, ['toStatus', 'reason', 'expectedRevision']);
  if (parsed.response) return parsed.response;
  return milestoneResponse(await transitionMilestone(access.db, { actor: access.actor, projectId: id, milestoneId, ...parsed.body }));
});
