import {requireAuthorized,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {listWorkspacePages,createWorkspacePage} from '@/lib/bloomops/pages.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{const {access,response}=await requireAuthorized(req,{action:'pages.shared'});if(response)return response;return json(await listWorkspacePages(access.db,access.actor,Number(new URL(req.url).searchParams.get('page')||1)));});
export const POST=withApiErrors(async req=>{const {access,response}=await requireAuthorized(req,{action:'pages.manage'});if(response)return response;const result=await createWorkspacePage(access.db,access.actor,await readStructuredBody(req,{maxBytes:4096}));return result.reason==='not_found'?notFound():json(result,result.ok?201:result.reason==='conflict'?409:400);});
