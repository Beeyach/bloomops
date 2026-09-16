import {requireAccess,getActor,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {financeParents} from '@/lib/bloomops/finance.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{const {access,response}=await requireAccess(req);if(response)return response;const actor=await getActor(access),q=new URL(req.url).searchParams;if([...q.keys()].some(k=>!['page','search'].includes(k)||q.getAll(k).length!==1))return json({error:'Invalid choices query.'},400);const result=await financeParents(access.db,actor,{page:Number(q.get('page')||1),search:q.get('search')||''});return result?json({...result,scope:{workspaceId:actor.workspaceId,userId:actor.userId}}):notFound();});
