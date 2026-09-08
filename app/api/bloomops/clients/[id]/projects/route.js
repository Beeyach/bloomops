import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { createProject, listProjects } from '@/lib/bloomops/projects.mjs';
import { projectResponse } from '@/lib/bloomops/project-api.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { requireClient, readBody, pick } from '../../_shared.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await requireClient(req, id, 'project.create');
  if (response) return response;
  const input = pick(await readBody(req), ['name', 'clientLabel', 'serviceEngagementId', 'departmentId', 'ownerMembershipId', 'health', 'visibility', 'startDate', 'targetDate']);
  return projectResponse(await createProject(access.db, { actor: access.actor, clientId: id, input }), 201);
});
export const GET = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await requireClient(req, id, 'client.view');
  return response || json(await listProjects(access.db, access.actor, { clientId: id }));
});
