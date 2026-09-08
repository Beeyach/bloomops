import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { projectAccess, projectResponse } from '@/lib/bloomops/project-api.mjs';
import { getProject, updateProject } from '@/lib/bloomops/projects.mjs';
import { readBody, pick } from '../../clients/_shared.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id);
  if (response) return response;
  const project = await getProject(access.db, access.actor, id);
  return project ? json({ project }) : json({ error: 'Not found.' }, 404);
});
export const PATCH = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'project.manage');
  if (response) return response;
  const body = await readBody(req);
  const input = pick(body, ['name', 'clientLabel', 'departmentId', 'ownerMembershipId', 'health', 'visibility', 'startDate', 'targetDate', 'status', 'completedAt', 'statusReason', 'serviceEngagementId']);
  return projectResponse(await updateProject(access.db, { actor: access.actor, projectId: id, input, expectedRevision: body.expectedRevision }));
});
