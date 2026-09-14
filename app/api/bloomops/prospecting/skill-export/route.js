import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {exportProspectSkill} from '@/lib/bloomops/prospect-skill-export.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.view');if(response)return response;
 const result=await exportProspectSkill(access.db,access.actor,await readStructuredBody(req));
 return result===null?notFound():json(result,result.invalid?400:result.conflict?409:200);
});
