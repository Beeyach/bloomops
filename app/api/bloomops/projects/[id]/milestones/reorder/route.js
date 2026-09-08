import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { projectAccess } from '@/lib/bloomops/project-api.mjs';
import { milestoneBody, milestoneResponse } from '@/lib/bloomops/milestone-api.mjs';
import { reorderMilestones } from '@/lib/bloomops/milestones.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'milestone.manage');
  if (response) return response;
  const parsed = await milestoneBody(req, ['orderedIds', 'expected']);
  if (parsed.response) return parsed.response;
  return milestoneResponse(await reorderMilestones(access.db, { actor: access.actor, projectId: id, ...parsed.body }));
});
