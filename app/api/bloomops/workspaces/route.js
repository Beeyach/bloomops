import { requireAuthorized, requireIdentity, json } from '@/lib/bloomops/access.mjs';
import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { createProspectingWorkspace, listMyWorkspaces } from '@/lib/bloomops/workspaces.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{
  const {access,response}=await requireIdentity(req);if(response)return response;
  const page=Number(new URL(req.url).searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>10000)return json({error:'Choose a valid page.'},400);
  const rows=await listMyWorkspaces(access.db,access.user.id,{page});return json({workspaces:rows.slice(0,100),more:rows.length>100,page});
});
export const POST=withApiErrors(async req=>{
  const {access,response}=await requireAuthorized(req,{action:'workspace.create'});if(response)return response;
  const input=await readStructuredBody(req);
  const result=await createProspectingWorkspace(access.db,{actor:access.actor,input});
  return result.ok?json(result,result.unchanged?200:201):json({error:result.reason==='conflict'?'This request changed or access is no longer available. Reload to continue.':'Enter a valid workspace name.'},result.reason==='invalid'?400:409);
});
