import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {applySkillResult,SKILL_RESULT_LIMIT} from '@/lib/bloomops/prospect-skill-results.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const result=await applySkillResult(access.db,access.actor,await readStructuredBody(req,{maxBytes:SKILL_RESULT_LIMIT}));
 return result===null?notFound():json(result,result.invalid?400:result.conflict?409:result.unavailable?503:200);
});
