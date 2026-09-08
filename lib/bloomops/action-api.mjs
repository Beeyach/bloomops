import { json, requireAuthorized } from './access.mjs';
import { loadActionResource } from './action-access.mjs';
import { readBody } from '../../app/api/bloomops/clients/_shared.mjs';

export const actionAccess = (req, actionId, action = 'action.view') => requireAuthorized(req,
  { action, resource: access => loadActionResource(access.db, access.actor, actionId) });

export async function actionBody(req, allowed) {
  const body = await readBody(req);
  return Object.keys(body).some(key => !allowed.includes(key))
    ? { response: json({ error: 'Only the fields in this form can be changed.' }, 400) } : { body };
}

export function actionResponse(result, status = 200) {
  if (result.ok) return json(result, status);
  if (result.reason === 'not_found') return json({ error: 'Not found.' }, 404);
  if (result.reason === 'forbidden') return json({ error: 'You do not have permission to do that.' }, 403);
  if (result.reason === 'conflict') return json({ error: 'This Action changed or could not be saved. Refresh and try again.' }, 409);
  if (result.reason === 'cycle') return json({ error: 'That dependency would create a cycle. Choose another prerequisite.' }, 409);
  if (result.reason === 'invalid_transition') return json({ error: 'That status change is not available from the current status.' }, 409);
  return json({ error: 'Some of what you entered needs a change.', errors: result.errors || {} }, 400);
}
