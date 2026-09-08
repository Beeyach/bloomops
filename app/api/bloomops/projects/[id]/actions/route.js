import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { projectAccess } from '@/lib/bloomops/project-api.mjs';
import { actionBody, actionResponse } from '@/lib/bloomops/action-api.mjs';
import { createAction, listActions } from '@/lib/bloomops/actions.mjs';
import { ACTION_DETAIL_FIELDS } from '@/lib/bloomops/action-values.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'action.view');
  return response || actionResponse(await listActions(access.db, access.actor, { projectId: id, view: 'all' }));
});
export const POST = withApiErrors(async (req, context) => {
  const { id } = await context.params;
  const { access, response } = await projectAccess(req, id, 'action.manage');
  if (response) return response;
  const parsed = await actionBody(req, [...ACTION_DETAIL_FIELDS, 'requestId']);
  if (parsed.response) return parsed.response;
  const { requestId, ...input } = parsed.body;
  return actionResponse(await createAction(access.db, { actor: access.actor, projectId: id, requestId, input }), 201);
});
