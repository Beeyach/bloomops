import {requireAccess,getActor,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getFinanceRecord,saveFinanceRecord} from '@/lib/bloomops/finance.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,{params})=>{const {access,response}=await requireAccess(req);if(response)return response;const actor=await getActor(access),record=await getFinanceRecord(access.db,actor,(await params).id);return record?json({record,scope:{workspaceId:actor.workspaceId,userId:actor.userId}}):notFound();});
export const PATCH=withApiErrors(async(req,{params})=>{const {access,response}=await requireAccess(req);if(response)return response;const result=await saveFinanceRecord(access.db,await getActor(access),(await params).id,await readStructuredBody(req));return result.reason==='not_found'?notFound():json(result,result.ok?200:result.reason==='conflict'?409:400);});
