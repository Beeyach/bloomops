import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { actionAccess, actionBody, actionResponse } from '@/lib/bloomops/action-api.mjs';
import { getAction, updateAction } from '@/lib/bloomops/actions.mjs';
import { ACTION_DETAIL_FIELDS } from '@/lib/bloomops/action-values.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { actionId } = await context.params;
  const { access, response } = await actionAccess(req, actionId);
  if (response) return response;
  const action = await getAction(access.db, access.actor, actionId);
  return action ? json({ action }) : json({ error: 'Not found.' }, 404);
});
export const PATCH = withApiErrors(async (req, context) => {
  const { actionId } = await context.params;
  const { access, response } = await actionAccess(req, actionId, 'action.manage');
  if (response) return response;
  const parsed = await actionBody(req, [...ACTION_DETAIL_FIELDS, 'expectedRevision']);
  if (parsed.response) return parsed.response;
  const { expectedRevision, ...input } = parsed.body;
  return actionResponse(await updateAction(access.db, { actor: access.actor, actionId, expectedRevision, input }));
});
