import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { json } from '@/lib/bloomops/access.mjs';
import { contentAccess, contentBody, contentResponse } from '@/lib/bloomops/content-api.mjs';
import { getContent, updateContent } from '@/lib/bloomops/content.mjs';
export const dynamic = 'force-dynamic';
export const GET = withApiErrors(async (req,context) => {
  const {contentId}=await context.params;
  const {access,response}=await contentAccess(req,contentId); if(response)return response;
  const item=await getContent(access.db,access.actor,contentId);
  return item?json({item}):json({error:'Not found.'},404);
});
export const PATCH = withApiErrors(async (req,context) => {
  const {contentId}=await context.params;
  const {access,response}=await contentAccess(req,contentId,'content.manage'); if(response)return response;
  const parsed=await contentBody(req); if(parsed.response)return parsed.response;
  const {expectedRevision,...input}=parsed.body;
  return contentResponse(await updateContent(access.db,{actor:access.actor,contentId,input,expectedRevision}));
});
