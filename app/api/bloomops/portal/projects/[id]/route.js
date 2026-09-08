import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { projectAccess } from '@/lib/bloomops/project-api.mjs';
import { portalProjects } from '@/lib/bloomops/projects.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'project.view', { portal: true });
  if (response) return response;
  const [project] = await portalProjects(access.db, access.actor, { projectId: id });
  return project ? json({ project }) : json({ error: 'Not found.' }, 404);
});
