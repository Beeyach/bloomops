import { requireAuthorized } from './access.mjs';
import { workQueryAccess } from './work-api-input.mjs';
import { loadPortalContentResource } from './content-access.mjs';

export const portalContentListAccess = req => workQueryAccess(req, requireAuthorized(req, { action: 'portal.content.list' }), ['view', 'page']);
export const portalContentAccess = (req, contentId) => workQueryAccess(req, requireAuthorized(req, {
  action: 'portal.content.view', resource: access => loadPortalContentResource(access.db, access.actor, contentId),
}));
