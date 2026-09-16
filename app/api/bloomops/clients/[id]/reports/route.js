import {requireAccess,getActor,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {listClientReports,reportServices,saveClientReport} from '@/lib/bloomops/client-reports.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{
 const {access,response}=await requireAccess(req);if(response)return response;const actor=await getActor(access),{id}=await params,q=new URL(req.url).searchParams;
 if([...q.keys()].some(k=>!['page','services','search','archived'].includes(k)||q.getAll(k).length!==1)||q.has('services')&&q.get('services')!=='true'||q.has('search')&&!q.has('services')||q.has('archived')&&(q.get('archived')!=='true'||q.has('services')))return json({error:'Invalid report query.'},400);
 const options={archived:q.get('archived')==='true',page:Number(q.get('page')||1),search:q.get('search')||''};
 const result=q.has('services')?await reportServices(access.db,actor,id,options):await listClientReports(access.db,actor,id,options);
 return result?json({...result,scope:{userId:actor.userId,workspaceId:actor.workspaceId}}):notFound();
});
export const POST=withApiErrors(async(req,{params})=>{
 const {access,response}=await requireAccess(req);if(response)return response;
 const result=await saveClientReport(access.db,await getActor(access),(await params).id,null,await readStructuredBody(req,{maxBytes:65536}));
 return result.reason==='not_found'?notFound():json(result,result.ok?201:result.reason==='conflict'?409:400);
});
