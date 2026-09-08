import { json, requireAuthorized } from './access.mjs';
import { loadDeliverableResource } from './deliverable-access.mjs';
import { readBody } from '../../app/api/bloomops/clients/_shared.mjs';

export const deliverableAccess = (req, projectId, deliverableId, action = 'deliverable.view', options = {}) => requireAuthorized(req,
  { action, resource: access => loadDeliverableResource(access.db, access.actor, projectId, deliverableId, options) });

export async function deliverableBody(req, allowed) {
  const body = await readBody(req);
  return Object.keys(body).some(key => !allowed.includes(key))
    ? { response: json({ error: 'Only the fields in this form can be changed.' }, 400) } : { body };
}

export function deliverableResponse(result, status = 200) {
  if (result.ok) return json(result, status);
  if (result.reason === 'not_found') return json({ error: 'Not found.' }, 404);
  if (result.reason === 'forbidden') return json({ error: 'You do not have permission to do that.' }, 403);
  if (result.reason === 'conflict') return json({ error: 'This Deliverable changed or could not be saved. Refresh the project and try again.' }, 409);
  if (result.reason === 'invalid_transition') return json({ error: 'That status change is not available from the current status.' }, 409);
  return json({ error: 'Some of what you entered needs a change.', errors: result.errors || {} }, 400);
}
