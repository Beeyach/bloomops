import { json, requireAuthorized } from './access.mjs';
import { workQueryAccess } from './work-api-input.mjs';
import { readBody } from '../../app/api/bloomops/clients/_shared.mjs';
import { loadContentResource, loadContentParentResource } from './content-access.mjs';
import { CONTENT_DETAIL_FIELDS, CONTENT_QUERY_FIELDS } from './content-values.mjs';

export const contentListAccess = req => workQueryAccess(req,requireAuthorized(req,{action:'content.list'}),CONTENT_QUERY_FIELDS);
export const contentAccess = (req,id,action='content.view') => workQueryAccess(req,requireAuthorized(req,{action,resource:access=>loadContentResource(access.db,access.actor,id)}));
export const contentParentAccess = (req,clientId,serviceId=null) => workQueryAccess(req,requireAuthorized(req,{action:'content.create',resource:access=>loadContentParentResource(access.db,access.actor,clientId,serviceId)}));
export async function contentBody(req,create=false) {
  const body=await readBody(req), allowed=[...CONTENT_DETAIL_FIELDS,create?'requestId':'expectedRevision'];
  return Object.keys(body).some(k=>!allowed.includes(k))?{response:json({error:'Only the fields in this form can be changed.'},400)}:{body};
}
export function contentResponse(result,status=200) {
  if (result.ok) return json(result,status);
  if (result.reason==='not_found') return json({error:'Not found.'},404);
  if (result.reason==='forbidden') return json({error:'You do not have permission to do that.'},403);
  if (result.reason==='invalid') return json({error:'Check the highlighted fields.',errors:result.errors},400);
  return json({error:'This Content changed or is no longer available. Reload before trying again.'},409);
}
