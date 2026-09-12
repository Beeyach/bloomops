import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { projectAccess } from '@/lib/bloomops/project-api.mjs';
import { blueprintResponse } from '@/lib/bloomops/systems-blueprint-api.mjs';
import { systemsBlueprintOptions } from '@/lib/bloomops/systems-blueprint-preparation.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'project.manage');
  if (response) return response;
  const result = await systemsBlueprintOptions(access.db, { actor: access.actor, projectId: id });
  return blueprintResponse(result);
});
