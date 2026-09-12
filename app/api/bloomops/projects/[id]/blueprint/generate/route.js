import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { projectAccess, projectBody } from '@/lib/bloomops/project-api.mjs';
import { blueprintResponse } from '@/lib/bloomops/systems-blueprint-api.mjs';
import { generateSystemsBlueprint } from '@/lib/bloomops/systems-blueprint-generation.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'project.manage');
  if (response) return response;
  const parsed = await projectBody(req, ['requestId', 'selectedComponentKeys', 'expected']);
  if (parsed.response) return parsed.response;
  const result = await generateSystemsBlueprint(access.db, { actor: access.actor, projectId: id, input: parsed.body });
  return blueprintResponse(result, result.replayed ? 200 : 201);
});
