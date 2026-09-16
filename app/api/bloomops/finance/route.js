import {requireAccess,getActor,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {listFinanceRecords,saveFinanceRecord} from '@/lib/bloomops/finance.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{const {access,response}=await requireAccess(req);if(response)return response;const actor=await getActor(access),q=new URL(req.url).searchParams;if([...q.keys()].some(k=>q.getAll(k).length!==1))return json({error:'Invalid filters.'},400);const result=await listFinanceRecords(access.db,actor,Object.fromEntries(q));return result.reason==='not_found'?notFound():json({...result,scope:{workspaceId:actor.workspaceId,userId:actor.userId}},result.ok?200:400);});
export const POST=withApiErrors(async req=>{const {access,response}=await requireAccess(req);if(response)return response;const result=await saveFinanceRecord(access.db,await getActor(access),null,await readStructuredBody(req));return result.reason==='not_found'?notFound():json(result,result.ok?201:result.reason==='conflict'?409:400);});
