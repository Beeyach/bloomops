import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { approvalAccess } from '@/lib/bloomops/content-approval-api.mjs';
import { contentResponse } from '@/lib/bloomops/content-api.mjs';
import { readBody } from '@/app/api/bloomops/clients/_shared.mjs';
import { withdrawContentApproval } from '@/lib/bloomops/content-approvals.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async(req,context)=>{
  const {roundId}=await context.params;
  const {access,response}=await approvalAccess(req,roundId);if(response)return response;
  return contentResponse(await withdrawContentApproval(access.db,{actor:access.actor,roundId,input:await readBody(req)}));
});
