import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { actionAccess, actionBody, actionResponse } from '@/lib/bloomops/action-api.mjs';
import { addActionDependency, listActionDependencies } from '@/lib/bloomops/action-dependencies.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { actionId } = await context.params;
  const { access, response } = await actionAccess(req, actionId);
  return response || actionResponse(await listActionDependencies(access.db, access.actor, actionId));
});
export const POST = withApiErrors(async (req, context) => {
  const { actionId } = await context.params;
  const { access, response } = await actionAccess(req, actionId, 'action.dependencies');
  if (response) return response;
  const parsed = await actionBody(req, ['dependsOnActionId', 'expectedRevision']);
  if (parsed.response) return parsed.response;
  return actionResponse(await addActionDependency(access.db, { actor: access.actor, actionId, ...parsed.body }));
});
