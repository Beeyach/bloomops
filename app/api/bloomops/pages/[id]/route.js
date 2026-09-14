import {requireAuthorized,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getWorkspacePage,saveWorkspacePage} from '@/lib/bloomops/pages.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{const {access,response}=await requireAuthorized(req,{action:'pages.shared'});if(response)return response;const page=await getWorkspacePage(access.db,access.actor,(await params).id);return page?json({page}):notFound();});
export const PUT=withApiErrors(async(req,{params})=>{const {access,response}=await requireAuthorized(req,{action:'pages.edit'});if(response)return response;const result=await saveWorkspacePage(access.db,access.actor,(await params).id,await readStructuredBody(req,{maxBytes:4000000}));return result.reason==='not_found'?notFound():json(result,result.ok?200:result.reason==='conflict'?409:400);});
