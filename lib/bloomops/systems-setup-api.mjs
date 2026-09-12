import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json, requireAuthorized } from '@/lib/bloomops/access.mjs';
import { workQueryAccess } from '@/lib/bloomops/work-api-input.mjs';
import { projectBody } from '@/lib/bloomops/project-api.mjs';
import { systemsBlueprintSetupOptions } from '@/lib/bloomops/systems-blueprint-setup.mjs';
const accessFor = req => workQueryAccess(req, requireAuthorized(req, { action: 'templates.manage' }));
function respond(result, platform) {
  if (result.ok) return json(result);
  if (result.reason === 'forbidden') return json({ error: `You do not have permission to manage ${platform} setup.` }, 403);
  if (result.reason === 'not_found') return json({ error: 'That service type is unavailable.' }, 404);
  if (result.reason === 'invalid') return json({ error: 'Choose a service type and use its current configuration.' }, 400);
  if (result.reason === 'other_blueprint') return json({ error: 'Another blueprint is already configured for this service type.' }, 409);
  return json({ error: `This configuration changed or its ${platform} blueprint is unavailable. Refresh the configuration before trying again.` }, 409);
}
export function systemsSetupHandlers({ configure, blueprintKey, platform }) {
  const GET = withApiErrors(async req => {
    const { access, response } = await accessFor(req);
    return response || respond(await systemsBlueprintSetupOptions(access.db, { actor: access.actor, blueprintKey }), platform);
  });
  const POST = withApiErrors(async req => {
    const { access, response } = await accessFor(req); if (response) return response;
    const parsed = await projectBody(req, ['serviceTypeId', 'enabled', 'expectedBinding']); if (parsed.response) return parsed.response;
    return respond(await configure(access.db, { actor: access.actor, input: parsed.body }), platform);
  });

  return { GET, POST };
}
