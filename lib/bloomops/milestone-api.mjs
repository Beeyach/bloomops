import { workQueryAccess } from './work-api-input.mjs';
import { json, requireAuthorized } from './access.mjs';
import { loadMilestoneResource } from './milestone-access.mjs';
import { readBody } from '../../app/api/bloomops/clients/_shared.mjs';

export const milestoneAccess = (req, projectId, milestoneId, action = 'milestone.view', options = {}) => workQueryAccess(req, requireAuthorized(req,
  { action, resource: access => loadMilestoneResource(access.db, access.actor, projectId, milestoneId, options) }));

export async function milestoneBody(req, allowed) {
  const body = await readBody(req);
  return Object.keys(body).some(key => !allowed.includes(key))
    ? { response: json({ error: 'Only the fields in this form can be changed.' }, 400) } : { body };
}

export function milestoneResponse(result, status = 200) {
  if (result.ok) return json(result, status);
  if (result.reason === 'not_found') return json({ error: 'Not found.' }, 404);
  if (result.reason === 'forbidden') return json({ error: 'You do not have permission to do that.' }, 403);
  if (result.reason === 'conflict') return json({ error: 'These milestones changed or could not be saved. Refresh the project and try again.' }, 409);
  if (result.reason === 'invalid_transition') return json({ error: 'That status change is not available from the current status.' }, 409);
  return json({ error: 'Some of what you entered needs a change.', errors: result.errors || {} }, 400);
}
