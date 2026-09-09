import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { approvalAccess } from '@/lib/bloomops/content-approval-api.mjs';
import { contentResponse } from '@/lib/bloomops/content-api.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { readBody } from '@/app/api/bloomops/clients/_shared.mjs';
import { getPortalApproval, respondContentApproval } from '@/lib/bloomops/content-approvals.mjs';
export const dynamic='force-dynamic';
export const GET=withApiErrors(async(req,context)=>{
  const {roundId}=await context.params;
  const {access,response}=await approvalAccess(req,roundId,{portal:true});if(response)return response;
  const item=await getPortalApproval(access.db,access.actor,roundId);
  return item?json({item}):json({error:'Not found.'},404);
});
export const POST=withApiErrors(async(req,context)=>{
  const {roundId}=await context.params;
  const {access,response}=await approvalAccess(req,roundId,{portal:true,respond:true});if(response)return response;
  return contentResponse(await respondContentApproval(access.db,{actor:access.actor,roundId,input:await readBody(req)}));
});
