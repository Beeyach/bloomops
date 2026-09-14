import {requireAuthorized,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getPageSharing,updatePageSharing} from '@/lib/bloomops/page-sharing.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{const {access,response}=await requireAuthorized(req,{action:'pages.manage'});if(response)return response;const result=await getPageSharing(access.db,access.actor,(await params).id);return result?json(result):notFound();});
export const PUT=withApiErrors(async(req,{params})=>{const {access,response}=await requireAuthorized(req,{action:'pages.manage'});if(response)return response;const result=await updatePageSharing(access.db,access.actor,(await params).id,await readStructuredBody(req,{maxBytes:4096}));return result.reason==='not_found'?notFound():json(result,result.ok?200:result.reason==='conflict'?409:400);});
