import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {exportProspectSource} from '@/lib/bloomops/prospect-source-preview.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.view');if(response)return response;
 const result=await exportProspectSource(access.db,access.actor,await readStructuredBody(req));
 if(result===null)return notFound();
 if(result.invalid||result.unavailable||result.conflict)return json(result,result.invalid?400:result.unavailable?503:409);
 return new Response(JSON.stringify(result,null,2)+'\n',{headers:{'content-type':'application/json; charset=utf-8','content-disposition':'attachment; filename="bloomops-raw-prospects.json"','cache-control':'no-store','x-content-type-options':'nosniff'}});
});
