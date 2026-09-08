import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { projectAccess, projectResponse, projectBody } from '@/lib/bloomops/project-api.mjs';
import { updateProjectAssignment, removeProjectAssignment } from '@/lib/bloomops/project-assignments.mjs';
export const dynamic = 'force-dynamic';
export const PATCH = withApiErrors(async (req, context) => {
  const { id, assignmentId } = await context.params;
  const { access, response } = await projectAccess(req, id, 'project.assign');
  if (response) return response;
  const parsed = await projectBody(req, ['assignmentRole']);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  return projectResponse(await updateProjectAssignment(access.db, { actor: access.actor, projectId: id,
    assignmentId, assignmentRole: body.assignmentRole }));
});
export const DELETE = withApiErrors(async (req, context) => {
  const { id, assignmentId } = await context.params;
  const { access, response } = await projectAccess(req, id, 'project.assign');
  return response || projectResponse(await removeProjectAssignment(access.db, { actor: access.actor, projectId: id, assignmentId }));
});
