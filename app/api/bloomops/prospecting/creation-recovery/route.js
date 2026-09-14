import {json} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {readProspectCreation} from '@/lib/bloomops/prospect-creation-recovery.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const result=await readProspectCreation(access.db,access.actor,await readStructuredBody(req,{maxBytes:3000}));
 return result.status===200?json(result):json({error:result.status===400?'Reload this form and try again.':result.status===409?'This copy does not match your original creation request. Keep your input or choose another recovery copy.':'Your account or workspace access changed. Reload to continue.'},result.status);
});
