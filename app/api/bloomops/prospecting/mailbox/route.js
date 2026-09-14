import {json,notFound} from '@/lib/bloomops/access.mjs';
import {withApiErrors} from '@/lib/bloomops/api-handler.mjs';
import {readStructuredBody} from '@/lib/bloomops/structured-body.mjs';
import {getProspectMailboxReview} from '@/lib/bloomops/prospect-mailbox-review.mjs';
import {recoverProspectMailbox} from '@/lib/bloomops/prospect-mailbox.mjs';
import {prospectAccess} from '../_shared.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const result=await getProspectMailboxReview(access.db,access.actor,access.env);return result===null?notFound():json(result);
});
export const POST=withApiErrors(async req=>{
 const {access,response}=await prospectAccess(req,'prospecting.manage');if(response)return response;
 const input=await readStructuredBody(req,{maxBytes:4096});
 const result=await recoverProspectMailbox(access.db,access.actor,access.env,access.session.id,input);
 return result===null?notFound():json(result,result.unavailable?503:result.conflict?409:200);
});
