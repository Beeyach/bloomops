import { withApiErrors } from '@/lib/bloomops/api-handler.mjs';
import { contentAccess, contentResponse } from '@/lib/bloomops/content-api.mjs';
import { readBody } from '@/app/api/bloomops/clients/_shared.mjs';
import { setContentPlatforms } from '@/lib/bloomops/content-platforms.mjs';
export const dynamic='force-dynamic';
export const PUT=withApiErrors(async(req,context)=>{
  const {contentId}=await context.params;
  const {access,response}=await contentAccess(req,contentId,'content.platforms');if(response)return response;
  return contentResponse(await setContentPlatforms(access.db,{actor:access.actor,contentId,input:await readBody(req)}));
});
