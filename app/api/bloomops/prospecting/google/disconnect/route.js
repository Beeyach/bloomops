import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {disconnectProspectGoogle} from '@/lib/bloomops/prospect-google.mjs';
import {prospectAccess} from '../../_shared.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const result=await disconnectProspectGoogle(access.db,access.actor,await readStructuredBody(req,{maxBytes:4096}));return result===null?notFound():json(result,result.conflict?409:200);
});
