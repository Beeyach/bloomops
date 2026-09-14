import {requireAuthorized,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {readPageRecovery} from '@/lib/bloomops/page-recovery.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async(req,{params})=>{
 const {access,response}=await requireAuthorized(req,{action:'pages.edit'});if(response)return response;
 const result=await readPageRecovery(access.db,access.actor,(await params).id,await readStructuredBody(req,{maxBytes:3000}));
 if(result.status===404)return notFound();
 return result.status===200?json(result):json({error:result.status===403?'Your account or workspace changed. Reload this page.':'This recovery request could not be checked.'},result.status);
});
