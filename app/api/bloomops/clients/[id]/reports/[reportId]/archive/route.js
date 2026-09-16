import {requireAccess,getActor,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {changeReportArchive} from '@/lib/bloomops/client-reports.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async(req,{params})=>{
 const {access,response}=await requireAccess(req);if(response)return response;
 const {id,reportId}=await params,result=await changeReportArchive(access.db,await getActor(access),id,reportId,await readStructuredBody(req,{maxBytes:4096}));
 return result.reason==='not_found'?notFound():json(result,result.ok?200:result.reason==='conflict'?409:400);
});
