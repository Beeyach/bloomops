import {requireAccess,getActor,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {reportPublicationReview,listPublishedReports,changeReportPublication} from '@/lib/bloomops/client-report-publications.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{
 const {access,response}=await requireAccess(req);if(response)return response;const actor=await getActor(access),{id,reportId}=await params;if(new URL(req.url).search)return json({error:'Invalid query.'},400);
 const review=await reportPublicationReview(access.db,actor,id,reportId);if(!review)return notFound();
 return json({review,history:await listPublishedReports(access.db,actor,{clientId:id,reportId}),scope:{userId:actor.userId,workspaceId:actor.workspaceId}});
});
export const POST=withApiErrors(async(req,{params})=>{
 const {access,response}=await requireAccess(req);if(response)return response;const actor=await getActor(access),{id,reportId}=await params;
 const result=await changeReportPublication(access.db,actor,id,reportId,await readStructuredBody(req,{maxBytes:4096}));return result.reason==='not_found'?notFound():json(result,result.ok?200:result.reason==='conflict'?409:400);
});
