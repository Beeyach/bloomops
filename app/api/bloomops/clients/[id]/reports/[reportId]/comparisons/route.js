import {requireAccess,getActor,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {getClientReport} from '@/lib/bloomops/client-reports.mjs';
import {comparisonOptions} from '@/lib/bloomops/client-report-comparisons.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{
 const {access,response}=await requireAccess(req);if(response)return response;const actor=await getActor(access),{id,reportId}=await params,q=new URL(req.url).searchParams;
 if([...q.keys()].some(k=>k!=='page'||q.getAll(k).length!==1))return json({error:'Invalid comparison query.'},400);
 const report=await getClientReport(access.db,actor,id,reportId);if(!report?.canEdit)return notFound();
 const result=await comparisonOptions(access.db,actor,report,Number(q.get('page')||1));return result?json({...result,scope:{workspaceId:actor.workspaceId,userId:actor.userId}}):json({error:'Invalid comparison page.'},400);
});
