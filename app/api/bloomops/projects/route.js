import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { projectListAccess } from '@/lib/bloomops/project-api.mjs';
import { listProjects } from '@/lib/bloomops/projects.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req) => {
  const { access, response } = await projectListAccess(req);
  if (response) return response;
  const query = new URL(req.url).searchParams;
  return json(await listProjects(access.db, access.actor, { status: query.get('status'), clientId: query.get('clientId') }));
});
