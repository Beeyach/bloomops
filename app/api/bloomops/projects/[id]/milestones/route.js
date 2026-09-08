import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { projectAccess } from '@/lib/bloomops/project-api.mjs';
import { milestoneBody, milestoneResponse } from '@/lib/bloomops/milestone-api.mjs';
import { createMilestone, listMilestones } from '@/lib/bloomops/milestones.mjs';
import { MILESTONE_DETAIL_FIELDS } from '@/lib/bloomops/milestone-values.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'milestone.view');
  return response || json(await listMilestones(access.db, access.actor, id));
});
export const POST = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'milestone.manage');
  if (response) return response;
  const parsed = await milestoneBody(req, [...MILESTONE_DETAIL_FIELDS, 'requestId']);
  if (parsed.response) return parsed.response;
  const { requestId, ...input } = parsed.body;
  return milestoneResponse(await createMilestone(access.db, { actor: access.actor, projectId: id, requestId, input }), 201);
});
