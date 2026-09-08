import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { actionAccess, actionBody, actionResponse } from '@/lib/bloomops/action-api.mjs';
import { removeActionDependency } from '@/lib/bloomops/action-dependencies.mjs';
export const dynamic = 'force-dynamic';
export const DELETE = withApiErrors(async (req, context) => {
  const { actionId, dependencyId } = await context.params;
  const { access, response } = await actionAccess(req, actionId, 'action.dependencies');
  if (response) return response;
  const parsed = await actionBody(req, ['expectedRevision']);
  if (parsed.response) return parsed.response;
  return actionResponse(await removeActionDependency(access.db, { actor: access.actor, actionId, dependencyId, ...parsed.body }));
});
