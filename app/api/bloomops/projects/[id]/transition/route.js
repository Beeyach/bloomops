import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { projectAccess, projectResponse } from '@/lib/bloomops/project-api.mjs';
import { transitionProject } from '@/lib/bloomops/projects.mjs';
import { readBody } from '../../../clients/_shared.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'project.manage');
  if (response) return response;
  const body = await readBody(req);
  return projectResponse(await transitionProject(access.db, { actor: access.actor, projectId: id,
    toStatus: body.toStatus, reason: body.reason, expectedRevision: body.expectedRevision }));
});
