import {requireAuthorized,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {createPageFromTemplate} from '@/lib/bloomops/page-templates.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async req=>{const {access,response}=await requireAuthorized(req,{action:'pages.manage'});if(response)return response;const result=await createPageFromTemplate(access.db,access.actor,await readStructuredBody(req,{maxBytes:4096}));return result.reason==='not_found'?notFound():json({...result,scope:{userId:access.user.id,workspaceId:access.workspace.id}},result.ok?201:result.reason==='conflict'?409:400);});
