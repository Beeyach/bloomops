import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { projectAccess, projectResponse, projectBody } from '@/lib/bloomops/project-api.mjs';
import { transitionProject } from '@/lib/bloomops/projects.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'project.manage');
  if (response) return response;
  const parsed = await projectBody(req, ['toStatus', 'reason', 'expectedRevision']);
  if (parsed.response) return parsed.response;
  const body = parsed.body;
  return projectResponse(await transitionProject(access.db, { actor: access.actor, projectId: id,
    toStatus: body.toStatus, reason: body.reason, expectedRevision: body.expectedRevision }));
});
