import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json, requireAuthorized } from '@/lib/bloomops/access.mjs';
import { actionResponse } from '@/lib/bloomops/action-api.mjs';
import { listActions } from '@/lib/bloomops/actions.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async req => {
  const { access, response } = await requireAuthorized(req, { action: 'action.list' });
  if (response) return response;
  const params = new URL(req.url).searchParams;
  if ([...params.keys()].some(key => params.getAll(key).length !== 1)) return json({ error: 'Choose one value per filter.' }, 400);
  return actionResponse(await listActions(access.db, access.actor, Object.fromEntries(params)));
});
