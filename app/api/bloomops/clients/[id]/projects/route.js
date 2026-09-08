import { workQueryAccess } from '@/lib/bloomops/work-api-input.mjs';
import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { createProject, listProjects } from '@/lib/bloomops/projects.mjs';
import { projectResponse, projectBody } from '@/lib/bloomops/project-api.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { requireClient } from '../../_shared.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await workQueryAccess(req, requireClient(req, id, 'project.create'));
  if (response) return response;
  const parsed = await projectBody(req, ['name', 'clientLabel', 'serviceEngagementId', 'departmentId', 'ownerMembershipId', 'health', 'visibility', 'startDate', 'targetDate']);
  if (parsed.response) return parsed.response;
  const input = parsed.body;
  return projectResponse(await createProject(access.db, { actor: access.actor, clientId: id, input }), 201);
});
export const GET = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await workQueryAccess(req, requireClient(req, id, 'client.view'));
  return response || json(await listProjects(access.db, access.actor, { clientId: id }));
});
