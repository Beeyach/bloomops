import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {checkProspectGoogle} from '@/lib/bloomops/prospect-google.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {prospectAccess} from '../../_shared.mjs';
export const POST=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const result=await checkProspectGoogle(access.db,access.actor,access.env,access.session.id,await readStructuredBody(req,{maxBytes:4096}));
 return result===null?notFound():json(result,result.unavailable?503:result.conflict?409:200);
});
