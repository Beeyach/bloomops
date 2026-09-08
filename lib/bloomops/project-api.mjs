import { getActor, json, requireAccess, requireAuthorized } from './access.mjs';
import { loadProjectResource } from './project-access.mjs';
import { workQueryAccess } from './work-api-input.mjs';
import { readBody } from '../../app/api/bloomops/clients/_shared.mjs';

export async function projectAccess(req, projectId, action = 'project.view', { portal = false } = {}) {
  return workQueryAccess(req, requireAuthorized(req, { action, resource: (access) => loadProjectResource(access.db, access.actor, projectId, { portal }) }));
}

export async function projectListAccess(req, { portal = false, queryKeys = [] } = {}) {
  const result = await requireAccess(req);
  if (result.response) return result;
  const actor = await getActor(result.access);
  if (portal ? actor.role !== 'client' : actor.role === 'client') return { response: json({ error: 'You do not have permission to do that.' }, 403) };
  return workQueryAccess(req, result, queryKeys);
}

export async function projectBody(req, allowed) {
  const body = await readBody(req);
  return Object.keys(body).some(key => !allowed.includes(key))
    ? { response: json({ error: 'Only the fields in this form can be changed.' }, 400) } : { body };
}

export function projectResponse(result, status = 200) {
  if (result.ok) return json(result, status);
  if (result.reason === 'not_found') return json({ error: 'Not found.' }, 404);
  if (result.reason === 'forbidden') return json({ error: 'You do not have permission to do that.' }, 403);
  if (result.reason === 'conflict') return json({ error: 'This project changed while you were working. Refresh it and try again.' }, 409);
  if (result.reason === 'invalid_transition') return json({ error: 'That status change is not available from the current status.' }, 409);
  return json({ error: 'Some of what you entered needs a change.', errors: result.errors || {} }, 400);
}
