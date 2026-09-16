import {requireAccess,getActor,json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {setFinanceAccess} from '@/lib/bloomops/finance.mjs';
export const dynamic='force-dynamic';
export const PUT=withApiErrors(async(req,{params})=>{const {access,response}=await requireAccess(req);if(response)return response;const result=await setFinanceAccess(access.db,await getActor(access),(await params).id,await readStructuredBody(req,{maxBytes:4096}));return result.ok?json(result):notFound();});
