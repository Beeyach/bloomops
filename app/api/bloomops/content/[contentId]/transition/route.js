import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { contentAccess, contentResponse } from '@/lib/bloomops/content-api.mjs';
import { readBody } from '@/app/api/bloomops/clients/_shared.mjs';
import { transitionContent } from '@/lib/bloomops/content-pipeline.mjs';
export const dynamic = 'force-dynamic';
export const POST = withApiErrors(async (req,context) => {
  const {contentId}=await context.params;
  const {access,response}=await contentAccess(req,contentId,'content.transition'); if(response)return response;
  const input=await readBody(req);
  return contentResponse(await transitionContent(access.db,{actor:access.actor,contentId,input}));
});
