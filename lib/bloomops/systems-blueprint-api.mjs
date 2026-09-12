import { json } from './access.mjs';

export function blueprintResponse(result, status = 200) {
  if (result.ok) return json(result, status);
  if (result.reason === 'not_found') return json({ error: 'Not found.' }, 404);
  if (result.reason === 'forbidden') return json({ error: 'You do not have permission to do that.' }, 403);
  if (result.reason === 'conflict') return json({ error: 'This project or its build setup changed. Refresh the project before starting a new build.', restartAllowed: true }, 409);
  if (result.reason === 'not_eligible') return json({ error: 'A Systems build is available only for an empty planned project with an enabled supported blueprint.', restartAllowed: true }, 409);
  if (result.reason === 'invalid_input' || result.reason === 'invalid_selection') return json({ error: 'Choose at least one available component and use the current preview.', restartAllowed: true }, 400);
  // Definition/receipt integrity and compiler details are internal only.
  return json({ error: 'The build could not be verified. Ask your workspace administrator to check its setup.' }, 409);
}
