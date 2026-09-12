import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { projectAccess, projectBody } from '@/lib/bloomops/project-api.mjs';
import { blueprintResponse } from '@/lib/bloomops/systems-blueprint-api.mjs';
import { prepareSystemsBlueprint } from '@/lib/bloomops/systems-blueprint-preparation.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'project.manage');
  if (response) return response;
  const parsed = await projectBody(req, ['selectedComponentKeys']);
  if (parsed.response) return parsed.response;
  const result = await prepareSystemsBlueprint(access.db, { actor: access.actor, projectId: id, selectedComponentKeys: parsed.body.selectedComponentKeys });
  return blueprintResponse(result);
});
