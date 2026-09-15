import {requireAccess,getActor,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getClientReport,saveClientReport} from '@/lib/bloomops/client-reports.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{
 const {access,response}=await requireAccess(req);if(response)return response;const actor=await getActor(access),{id,reportId}=await params;
 if(new URL(req.url).search)return json({error:'Invalid report query.'},400);
 const report=await getClientReport(access.db,actor,id,reportId);return report?json({report,scope:{userId:actor.userId,workspaceId:actor.workspaceId}}):notFound();
});
export const PUT=withApiErrors(async(req,{params})=>{
 const {access,response}=await requireAccess(req);if(response)return response;const {id,reportId}=await params;
 const result=await saveClientReport(access.db,await getActor(access),id,reportId,await readStructuredBody(req,{maxBytes:65536}));
 return result.reason==='not_found'?notFound():json(result,result.ok?200:result.reason==='conflict'?409:400);
});
