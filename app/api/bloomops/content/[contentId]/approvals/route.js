import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { contentAccess, contentResponse } from '@/lib/bloomops/content-api.mjs';
import { readBody } from '@/app/api/bloomops/clients/_shared.mjs';
import { requestContentApproval } from '@/lib/bloomops/content-approvals.mjs';
export const dynamic='force-dynamic';
export const POST=withApiErrors(async(req,context)=>{
  const {contentId}=await context.params;
  const {access,response}=await contentAccess(req,contentId,'content.approval.request');if(response)return response;
  return contentResponse(await requestContentApproval(access.db,{actor:access.actor,contentId,input:await readBody(req)}),201);
});
