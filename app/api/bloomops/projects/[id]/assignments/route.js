import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { projectAccess, projectResponse } from '@/lib/bloomops/project-api.mjs';
import { addProjectAssignment, listProjectAssignments } from '@/lib/bloomops/project-assignments.mjs';
import { readBody } from '../../../clients/_shared.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id);
  return response || json({ assignments: await listProjectAssignments(access.db, access.actor, id) });
});
export const POST = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'project.assign');
  if (response) return response;
  const body = await readBody(req);
  return projectResponse(await addProjectAssignment(access.db, { actor: access.actor, projectId: id,
    membershipId: body.membershipId, assignmentRole: body.assignmentRole }));
});
