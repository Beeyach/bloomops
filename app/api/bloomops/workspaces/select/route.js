import { requireIdentity, json, notFound } from '@/lib/bloomops/access.mjs';
import { resolveWorkspaceAccess } from '@/lib/bloomops/membership.mjs';
import { workspaceCookie } from '@/lib/bloomops/workspace-selection.mjs';
import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async req=>{
  const {access,response}=await requireIdentity(req);if(response)return response;
  const body=await readStructuredBody(req);
  if(!body||Object.keys(body).length!==1||typeof body.workspaceId!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(body.workspaceId))return json({error:'Choose a workspace.'},400);
  const resolved=await resolveWorkspaceAccess(access.db,access.user.id,{workspaceId:body.workspaceId});if(!resolved)return notFound();
  const redirect=resolved.membership.role==='client'?'/portal':resolved.workspace.purpose==='prospecting'?'/prospecting':'/';
  const result=json({redirect});result.headers.set('set-cookie',workspaceCookie(resolved.workspace.id,new URL(req.url).protocol==='https:'));return result;
});
