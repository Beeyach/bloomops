import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { contentParentAccess, contentBody, contentResponse } from '@/lib/bloomops/content-api.mjs';
import { createContent } from '@/lib/bloomops/content.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req,context) => {
  const {id,serviceId}=await context.params;
  const {access,response}=await contentParentAccess(req,id,serviceId); if(response)return response;
  const parsed=await contentBody(req,true); if(parsed.response)return parsed.response;
  const {requestId,...input}=parsed.body;
  return contentResponse(await createContent(access.db,{actor:access.actor,clientId:id,serviceEngagementId:serviceId,input,requestId}),201);
});
