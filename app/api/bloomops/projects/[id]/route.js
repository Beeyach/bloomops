import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { projectAccess, projectResponse, projectBody } from '@/lib/bloomops/project-api.mjs';
import { getProject, updateProject } from '@/lib/bloomops/projects.mjs';
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
  const parsed = await projectBody(req, ['name', 'clientLabel', 'departmentId', 'ownerMembershipId', 'health', 'visibility', 'startDate', 'targetDate', 'expectedRevision']);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  const { expectedRevision, ...input } = body;
  return projectResponse(await updateProject(access.db, { actor: access.actor, projectId: id, input, expectedRevision }));
});
