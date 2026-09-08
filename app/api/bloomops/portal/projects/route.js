import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { projectListAccess } from '@/lib/bloomops/project-api.mjs';
import { portalProjects } from '@/lib/bloomops/projects.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req) => {
  const { access, response } = await projectListAccess(req, { portal: true });
  return response || json({ projects: await portalProjects(access.db, access.actor) });
});
