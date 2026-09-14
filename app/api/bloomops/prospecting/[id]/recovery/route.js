import {json} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {readProfileRecovery} from '@/lib/bloomops/profile-recovery.mjs';
import {prospectAccess} from '../../_shared.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async(req,{params})=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const {id}=await params,result=await readProfileRecovery(access.db,access.actor,id,await readStructuredBody(req,{maxBytes:3000}));
 return result.status===200?json(result):json({error:result.status===400?'Reload this profile and try again.':'Your account, workspace or prospect access changed. Reload to continue.'},result.status);
});
