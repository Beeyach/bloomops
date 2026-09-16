import {requireAuthorized,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {saveServiceOffering} from '@/lib/bloomops/service-offerings.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async req=>{
 const {access,response}=await requireAuthorized(req,{action:'workspace.settings'});if(response)return response;
 const result=await saveServiceOffering(access.db,access.actor,await readStructuredBody(req,{maxBytes:4096}));
 return result.reason==='not_found'?notFound():json(result,result.ok?200:result.reason==='conflict'?409:400);
});
