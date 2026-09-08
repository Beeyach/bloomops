import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { milestoneAccess, milestoneBody, milestoneResponse } from '@/lib/bloomops/milestone-api.mjs';
import { getMilestone, updateMilestone } from '@/lib/bloomops/milestones.mjs';
import { MILESTONE_DETAIL_FIELDS } from '@/lib/bloomops/milestone-values.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { id, milestoneId } = await context.params;
  const { access, response } = await milestoneAccess(req, id, milestoneId);
  if (response) return response;
  const milestone = await getMilestone(access.db, access.actor, id, milestoneId);
  return milestone ? json({ milestone }) : json({ error: 'Not found.' }, 404);
});
export const PATCH = withApiErrors(async (req, context) => {
  const { id, milestoneId } = await context.params;
  const { access, response } = await milestoneAccess(req, id, milestoneId, 'milestone.manage');
  if (response) return response;
  const parsed = await milestoneBody(req, [...MILESTONE_DETAIL_FIELDS, 'expectedRevision']);
  if (parsed.response) return parsed.response;
  const { expectedRevision, ...input } = parsed.body;
  return milestoneResponse(await updateMilestone(access.db, { actor: access.actor, projectId: id, milestoneId, input, expectedRevision }));
});
