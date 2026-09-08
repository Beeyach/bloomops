import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { actionAccess, actionBody, actionResponse } from '@/lib/bloomops/action-api.mjs';
import { transitionAction } from '@/lib/bloomops/actions.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req, context) => {
  const { actionId } = await context.params;
  const { access, response } = await actionAccess(req, actionId, 'action.progress');
  if (response) return response;
  const parsed = await actionBody(req, ['toStatus', 'waitingType', 'waitingReason', 'expectedRevision']);
  if (parsed.response) return parsed.response;
  return actionResponse(await transitionAction(access.db, { actor: access.actor, actionId, ...parsed.body }));
});
