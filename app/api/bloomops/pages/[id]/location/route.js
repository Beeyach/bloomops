import {requireAuthorized,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {moveWorkspacePage} from '@/lib/bloomops/page-hierarchy.mjs';
export const dynamic='force-dynamic';
export const PUT=withApiErrors(async(req,{params})=>{const {access,response}=await requireAuthorized(req,{action:'pages.manage'});if(response)return response;const result=await moveWorkspacePage(access.db,access.actor,(await params).id,await readStructuredBody(req,{maxBytes:4096}));return result.reason==='not_found'?notFound():json(result,result.ok?200:result.reason==='conflict'?409:400);});
